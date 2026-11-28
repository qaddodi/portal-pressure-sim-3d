// Keeps each vessel's shape where the 2D figure has it: a collateral coils as it opens and its strands fan out as far as their varix is big (stage-tubes.js), a
// fan of tributaries thins and thickens as its rule comes on. The positions are rewritten in place (VesselObject.reshape), and only while a shape moves.
import { reportShape } from './live-shape.ts';
import { type NetVessel, type PresenceFrame, collateralOpen, feederLive, recruitFrac } from './network.ts';
import { CoilState, LOOK_SITE, type Pin, varixGrowth, varixSize, varixSpreadK } from './coil.ts';
/** The least beading of the esophageal varices (share of a strand's radius), at their full size; the 2D figure's own (varix-bead.js BEAD_MAX 0.35) takes over once it is larger. */
export const VARIX_BEAD_FLOOR = 0.16;
import { REST, type ShapeState, coursesOf, seamState, tubularOf, varixPressRamp } from './shape.ts';
import { type BuiltTubes, buildTubesSteps } from './tubes.ts';
import { BEAD_SITE, varixBead } from './varix-bead.copied.js';
import { bandsStep } from './band-ease.copied.js';
import { slicesFor } from '../circuit/geometry.ts';
import { sewOnMap } from '../circuit/map-sewn.ts';
import { type LerpPlan, RESHAPE_ATTRIBUTES, type ReshapeFrame, type VesselObject } from './vessel-object.ts';

import { clock } from '../../clock/frame.ts';
const VARIX_CHANNELS: Record<string, 'VAR' | 'GV'> = { C1a: 'VAR', C1b: 'VAR', C2: 'GV' };
const VARIX_MEAN_MS = 2000, VARIX_JUMP_MM = 1.5, VARIX_JUMP_MMHG = 4;
/** The pressure ramp is kept to steps of 1 / PRESS_STEPS of the thickening (a step is under a pixel of a strand's width; each one is a build of the shape, as the bead's steps are). */
const PRESS_STEPS = 40;

export interface ShapeFrame extends PresenceFrame { metrics?: { varix?: { d?: number; ptm?: number; present?: boolean }; gastricVarix?: { d?: number; present?: boolean } }; bands?: number }

/** The two key frames of one coil bracket: `lo` and `hi` rung (the coil strength is rung * COIL_STEP), built for the shape's other parts `base`; a frame is built when it is first needed. */
interface KeyFrames { base: string; lo: number; a: ReshapeFrame | null; b: ReshapeFrame | null; /** the key frame being built a strand at a time: `rung` is which (0 the lower, 1 the upper) */ job: Job<ReshapeFrame> | null; rung: 0 | 1; /** the pair's blend plan, being worked out (vessel-object.ts lerpPlanSteps) */ plan: Job<LerpPlan> | null }
/** A build that stops between strands (`tubes.ts buildTubesSteps`) and is resumed by the next frame's budget; it carries the shape it was started for, so a shape that moved meanwhile does not change it. */
interface Job<T> { steps: Generator<void, T, void> }
interface Item { v: NetVessel; obj: VesselObject; coil: CoilState; state: ShapeState; tubular: number[]; shown: number; spread: number; /** the pressure's ramp, 0 to 1 (shape.ts varixPressRamp), the strands' thickening target */ press: number; live: number; strandsOn: boolean; bead: number; built: string; seam: string; /** the key frames the coil blends between (null: none built yet) */ kf: KeyFrames | null; /** a flat (not coiling) vessel's tubes, half built (null: none) and the shape key it was started for */ job: (Job<BuiltTubes> & { key: string }) | null; /** the tick of its last rebuild (the one waiting longest goes first) */ at: number }

const keyOf = (s: ShapeState) => `${s.wig.toFixed(2)}|${s.spr.toFixed(3)}|${s.prs.toFixed(3)}|${s.rec.toFixed(2)}|${s.bead.toFixed(2)}|${s.bands.toFixed(2)}|${s.strandsOn ? 1 : 0}|${s.live.toFixed(2)}|${s.pin ? s.pin.map((x) => x.toFixed(3)).join(',') : ''}`;
/** What of a shape reaches the seam of a skin standing on the vessel's end: everything but the coil (wig, spr), which the pin holds off the seam (coil.ts pinCourse). A vessel with no pin moves its seam with the coil too. */
const seamKeyOf = (s: ShapeState) => keyOf(seamState(s));
/** The coil strengths a coiling vessel's shape is built at, and between which it is blended (the centres and radii are linear in the coil: 0.08 radii off at most from 0 to 5, 0.006 across one step). The target is 1.5 + 3.5 of its opening, so 5 is the most. */
export const COIL_STEP = 1.25;
const COIL_RUNGS = 4;
/** The bead is kept to steps of 1 / BEAD_STEPS (0.05 of a strand's radius: under a fifth of a pixel at the figure's widest): each step is one build of the shape, so the easing of the varix's size costs 7 builds a strand, not 35. */
export const BEAD_STEPS = 20;
/** The most CPU time (ms) one frame spends rebuilding tubes for shapes that move: the work is cut into strands (tubes.ts buildTubesSteps, 1 to 8 ms each) and a frame runs strands until this is spent, so a preset that opens a dozen collaterals at once spreads over frames and no frame is longer than one strand past the budget. At least one strand is always built. */
export const SHAPE_BUDGET_MS = 4;

export class ShapeTracks {
  private items: Item[] = [];
  private tick = 0;
  /** Told whenever a vessel's course was rewritten (the junction skins stand on its ends and are rebuilt: vessels/skin/skin-set.ts markDirty). */
  onReshaped: ((id: string) => void) | null = null;
  /** the bands the model counts, and the count drawn (it follows in a moment, band-ease.js: a strand a band closes fades out rather than vanishing in a frame) */
  private bandsGoal = 0;
  private bandsShown: number | null = null;
  /** the running mean of each varix's diameter (a pulse of the beat averages out; a real change is followed within two seconds) */
  private mean: Record<'VAR' | 'GV', { m: number | null; at: number }> = { VAR: { m: null, at: 0 }, GV: { m: null, at: 0 } };
  /** the running mean of the varices' wall pressure (mmHg), the same average as the diameter's: the beat's pulse averages out and a real change is followed within two seconds */
  private pmean: { m: number | null; at: number } = { m: null, at: 0 };

  constructor(vessels: readonly NetVessel[], objects: ReadonlyMap<string, VesselObject>) {
    for (const v of vessels) {
      const obj = objects.get(v.id), p = v.plan;
      if (!obj || !p) continue;
      if (p.kind === 'coil' && !p.coils && !LOOK_SITE[v.id] && !p.strands) continue;
      if (p.kind === 'coil' && !p.coils && !p.strands) continue;
      this.items.push({ v, obj, coil: new CoilState(), state: { ...REST }, tubular: tubularOf(v, slicesFor(v.id)), shown: 0, spread: 1, press: 0, live: 1, strandsOn: false, bead: 0, built: keyOf(REST), seam: seamKeyOf(REST), kf: null, job: null, at: 0 });
    }
  }

  /** The shape a vessel is drawn in now, or undefined for a vessel with none to keep (the scene rebuilds the rest at rest). */
  stateOf(id: string): ShapeState | undefined { return this.items.find((it) => it.v.id === id)?.state; }

  /** The vessels that have a shape to keep (for the first build). */
  get count(): number { return this.items.length; }

  /** A new frame of the model: where each shape is heading. `now` in ms; `instant` settles at once (a new patient, the first frame). */
  onFrame(f: ShapeFrame, now: number, healthyQ: ArrayLike<number> | undefined, instant: boolean): void {
    const d: Record<'VAR' | 'GV', number | undefined> = { VAR: f.metrics?.varix?.d, GV: f.metrics?.gastricVarix?.d };
    const pres: Record<'VAR' | 'GV', boolean> = { VAR: !!f.metrics?.varix?.present, GV: !!f.metrics?.gastricVarix?.present };
    for (const site of ['VAR', 'GV'] as const) {
      const h = this.mean[site], x = d[site];
      if (x == null || !Number.isFinite(x)) continue;
      const dt = now - h.at;
      h.m = instant || h.m == null || dt > 3000 || dt < 0 || Math.abs(x - h.m) > VARIX_JUMP_MM ? x : h.m + (x - h.m) * (1 - Math.exp(-dt / VARIX_MEAN_MS));
      h.at = now;
    }
    const px = f.metrics?.varix?.ptm;
    if (px != null && Number.isFinite(px)) {
      const h = this.pmean, dt = now - h.at;
      h.m = instant || h.m == null || dt > 3000 || dt < 0 || Math.abs(px - h.m) > VARIX_JUMP_MMHG ? px : h.m + (px - h.m) * (1 - Math.exp(-dt / VARIX_MEAN_MS));
      h.at = now;
    }
    this.bandsGoal = f.bands || 0;
    if (instant) this.bandsShown = this.bandsGoal;
    for (const it of this.items) {
      const id = it.v.id, p = it.v.plan!;
      const bs = (BEAD_SITE as Record<string, string>)[id];
      it.bead = bs ? Math.round((varixBead(this.mean[bs === 'varix' ? 'VAR' : 'GV'].m ?? undefined) as number) * 100) / 100 : 0;
      // the esophageal varices are always a little beaded, more so the bigger they are (Mohammad, 20 Nov: "make them beaded a little bit"): a floor under the 2D figure's beading, which stays smooth below 6 mm
      if (bs === 'varix') it.bead = Math.max(it.bead, Math.round(VARIX_BEAD_FLOOR * varixSize('VAR', this.mean.VAR.m ?? undefined) * 100) / 100);
      if (p.kind === 'feeder') { it.live = feederLive(it.v.feeder!, f, healthyQ); continue; }
      const site = VARIX_CHANNELS[id], rf = recruitFrac(id, f);
      it.shown = site ? Math.max(rf, varixGrowth(pres[site], this.mean[site].m ?? undefined)) : rf;
      const lookSite = LOOK_SITE[id];
      it.spread = lookSite ? varixSpreadK(varixSize(lookSite, this.mean[lookSite].m ?? undefined)) : 1;
      it.press = lookSite === 'VAR' ? varixPressRamp(this.pmean.m ?? undefined) : 0;
      it.strandsOn = p.coils ? collateralOpen(id, f) : true;
    }
    if (instant) for (const it of this.items) { this.settle(it, 0, true); this.rebuild(it, true); }
  }

  private settle(it: Item, dtMs: number, instant: boolean): boolean {
    const p = it.v.plan!;
    let moving = false;
    if (p.kind === 'coil') {
      const strandsChanged = it.state.strandsOn !== it.strandsOn;
      moving = it.coil.step(it.shown, it.spread, dtMs, instant, it.press) || strandsChanged;
      it.state.wig = it.coil.wig; it.state.spr = it.coil.spr; it.state.prs = Math.round(it.coil.prs * PRESS_STEPS) / PRESS_STEPS; it.state.strandsOn = it.strandsOn;
      const bead = Math.round(it.bead * BEAD_STEPS) / BEAD_STEPS;   // (a beaded strand is built again at each new bead: 0.01 steps while the varix size eased were a rebuild of every beaded strand nearly every frame for seconds)
      if (it.state.bead !== bead) { it.state.bead = bead; moving = true; }
      if (it.v.id === 'C1a' || it.v.id === 'C1b') { const b = Math.round((this.bandsShown ?? this.bandsGoal) * 20) / 20; if (b !== it.state.bands) { it.state.bands = b; moving = true; } }
      if (it.v.id === 'C8') { const r = Math.round(it.shown * 20) / 20; moving = moving || r !== it.state.rec; it.state.rec = r; }
    } else {
      const q = Math.round(it.live * 20) / 20;
      moving = q !== it.state.live;
      it.state.live = q;
    }
    return moving;
  }

  /** Rebuilds a vessel's tubes at its present shape when the shape changed since they were built. True when it did. */
  /** How many shapes were built (a tube geometry made), how many were blended from key frames, and how many slices (one strand's worth of tube building) the builds were cut into: the tests read these, and ?perf can. */
  readonly stats = { builds: 0, blends: 0, slices: 0 };

  /** A vessel's tubes at a shape, as the scene first built them, a strand at a time (see `buildTubesSteps`): the map's sunk and flared ends are laid on the rings' map radius (`rkc`) here too. The scene lays them when it builds a tube (scene.ts addVessel), and `reshape` copies `rkc` from what is built, so a
   *  rebuild that left them out put every collateral's and shunt's map end back to the full width the moment its shape first changed (Mohammad, 22 Nov: the paraumbilical vein, wide, stepping down to the node's width at its skin's seam). */
  private *tubesSteps(it: Item, state: ShapeState): Generator<void, BuiltTubes, void> {
    const b = yield* buildTubesSteps(coursesOf(it.v, state), it.tubular, it.v.radius);
    sewOnMap(it.v.id, b.geometry, b.runs);
    return b;
  }

  private *frameSteps(it: Item, state: ShapeState): Generator<void, ReshapeFrame, void> {
    const { geometry, length } = yield* this.tubesSteps(it, state);
    const arrays = new Map<string, Float32Array>();
    for (const name of RESHAPE_ATTRIBUTES) { const a = geometry.getAttribute(name); if (a) arrays.set(name, (a.array as Float32Array).slice()); }
    geometry.dispose();
    this.stats.builds++;
    return { arrays, length };
  }

  /** True once a step of tube work has run in the frame being stepped (reset by `step`): the frame's first step always runs, every later one only inside the budget. */
  private sliced = false;
  /**
   * Runs a job's steps (a strand, the merge, a plan pass) until `deadline` (page time). The frame's first step always runs, so the work always moves on; after that a step runs only while the budget lasts. Its result when the job
   * finished, else undefined (the next frame carries on). This is what keeps a frame short: the unit of work is a strand (3 to 8 ms), not a vessel's whole build (20 to 40 ms). A deadline of Infinity runs it to the end.
   */
  private pump<T>(job: Job<T>, deadline: number): T | undefined {
    for (;;) {
      if (this.sliced && clock.now() >= deadline) return undefined;
      const r = job.steps.next();
      this.stats.slices++; this.sliced = true;
      if (r.done) return r.value;
    }
  }

  /** A coiling vessel is drawn by blending two key frames of its shape, built at the coil strengths on either side of the present one: the coil easing for a second moves 1 or 2 brackets, so it costs 1 to 4 builds, not one a frame (a build is 3 to 6 ms). False while a key frame is still being built. */
  private blend(it: Item, whole: boolean, until: number): boolean {
    const w = it.state.wig, base = keyOf({ ...it.state, wig: 0 });
    const lo = Math.min(COIL_RUNGS - 1, Math.max(0, Math.floor(w / COIL_STEP + 1e-9))), t = Math.min(1, Math.max(0, (w - lo * COIL_STEP) / COIL_STEP));
    let kf = it.kf;
    // (a new bracket or base drops a key frame half built for the old one)
    if (!kf || kf.base !== base) kf = it.kf = { base, lo, a: null, b: null, job: null, rung: 0, plan: null };
    else if (kf.lo !== lo) {
      const up = lo === kf.lo + 1, down = lo === kf.lo - 1;
      kf = it.kf = { base, lo, a: up ? kf.b : null, b: down ? kf.a : null, job: null, rung: 0, plan: null };
    }
    const deadline = whole ? Infinity : until;
    /** The key frame at rung `rung` (0 the lower, 1 the upper), built on as far as the frame's budget goes: null while it is not done. */
    const keyFrame = (rung: 0 | 1): ReshapeFrame | null => {
      if (kf.job && kf.rung !== rung) kf.job = null;
      if (!kf.job) { kf.rung = rung; kf.job = { steps: this.frameSteps(it, { ...it.state, wig: (lo + rung) * COIL_STEP }) }; }
      const done = this.pump(kf.job, deadline);
      if (done) kf.job = null;
      return done ?? null;
    };
    // (one key frame a frame while the shape eases: each is 4 to 50 ms of tube building and two in one frame doubled the stall; the vessel keeps the shape it has for the frame it waits. `whole` (a new patient, the first
    //  frame) builds both now.)
    const needA = t < 1 - 1e-9, needB = t > 1e-9;
    if (needA && !kf.a) { kf.a = keyFrame(0); if (!kf.a) return false; if (needB && !kf.b && !whole) return false; }
    if (needB && !kf.b) { kf.b = keyFrame(1); if (!kf.b) return false; }
    // (at a key itself only that frame is needed: the other is the same one)
    const a = kf.a ?? kf.b!, b = kf.b ?? kf.a!;
    // the pair's first blend scans every vertex of both frames (20 ms for a vessel of four strands): worked out within the budget too, the vessel holds its shape the frame it waits
    if (!it.obj.hasLerpPlan(a, b)) {
      kf.plan ??= { steps: it.obj.lerpPlanSteps(a, b) };
      const plan = this.pump(kf.plan, deadline);
      if (!plan) return false;
      kf.plan = null; it.obj.holdLerpPlan(plan);
    }
    it.obj.reshapeLerp(a, b, kf.a && kf.b ? t : 0);
    this.stats.blends++;
    return true;
  }

  /** Rebuilds a vessel's tubes at its present shape when the shape changed since they were built, as far as `until` (page time) allows; true when it did any work (it is `stale` still while a build is half done). */
  private rebuild(it: Item, whole = false, until = Infinity): boolean {
    const key = keyOf(it.state);
    if (key === it.built) return false;
    if (it.v.plan!.kind === 'coil') { if (!this.blend(it, whole, until)) return true; }   // (half built: still stale, the next frame carries on)
    else {
      // (a flat vessel's tubes half built for an older shape are dropped: the shape moved on)
      if (!it.job || it.job.key !== key) { const state = { ...it.state }; it.job = { key, steps: this.tubesSteps(it, state) }; }
      const built = this.pump(it.job, whole ? Infinity : until);
      if (!built) return true;
      it.job = null;
      it.obj.reshape(built.geometry, built.length);
      built.geometry.dispose();
      this.stats.builds++;
    }
    it.built = key;
    reportShape(it.v.id, it.state);
    // the skin standing on this vessel's end is rebuilt only when its seam moved: a coil is held off the seam by the pin, so the growth of a collateral costs it nothing (a rebuild is 0.1 to 2 s of CPU)
    const seam = seamKeyOf(it.state);
    if (seam !== it.seam) { it.seam = seam; this.onReshaped?.(it.v.id); }
    return true;
  }

  private stale(it: Item): boolean { return keyOf(it.state) !== it.built; }

  /** The stretch of each vessel's course that must not move because a junction skin stands on it (SkinSet.pins). Installed once the skins are built: at rest the tubes come out the same, so nothing is rebuilt; a vessel that is not at rest is rebuilt at once, and its skin with it. */
  setPins(pins: ReadonlyMap<string, Pin>): void {
    for (const it of this.items) {
      const pin = pins.get(it.v.id);
      const same = (a?: Pin, b?: Pin) => (a?.[0] ?? 0) === (b?.[0] ?? 0) && (a?.[1] ?? 0) === (b?.[1] ?? 0);
      if (same(it.state.pin, pin)) continue;
      const atRest = it.state.wig === 0 && it.state.spr === 1 && it.state.bead === 0 && !this.stale(it);
      it.state.pin = pin && (pin[0] > 0 || pin[1] > 0) ? pin : undefined;
      if (atRest) { it.built = keyOf(it.state); it.seam = seamKeyOf(it.state); }   // (the same tubes: the pin holds a course at rest where it is already at rest)
      else { this.rebuild(it, true); }
    }
  }

  /** Eases the shapes one frame; true while any is still moving or waits for its tubes. The tubes are rebuilt within SHAPE_BUDGET_MS a frame (a strand at a time, so a frame is never longer than one strand), the longest-waiting first. */
  step(dtMs: number): boolean {
    let moving = false;
    const was = this.bandsShown;
    this.bandsShown = bandsStep(this.bandsShown, this.bandsGoal, dtMs / 1000) as number;
    if (this.bandsShown !== this.bandsGoal || was !== this.bandsShown) moving = true;
    for (const it of this.items) if (this.settle(it, dtMs, false)) moving = true;
    const due = this.items.filter((it) => this.stale(it)), deadline = clock.now() + SHAPE_BUDGET_MS;
    due.sort((a, b) => a.at - b.at);
    this.sliced = false;
    for (const it of due) {
      if (this.sliced && clock.now() >= deadline) { moving = true; continue; }
      it.at = ++this.tick; this.rebuild(it, false, deadline);
    }
    if (due.some((it) => this.stale(it))) moving = true;
    return moving;
  }
}

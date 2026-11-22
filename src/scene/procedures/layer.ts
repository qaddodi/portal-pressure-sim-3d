// The procedure layer: every device the Treat verbs and the decks put on the figure that is not a vessel (catheters, wires, balloons, the stent, the tamponade tube, bands). It owns their
// objects, plays the 2D app's own choreography on the clock (`procFrame(kind, t)`, proc-anim.js: the same times, the same steps), and draws what that says. Nothing here is a loop of its own:
// `update(now)` is called from the scene's frame and answers whether it needs another.
import { Group, type Vector3 } from 'three';
import type { VesselObject } from '../vessels/vessel-object.ts';
import { inVesselPass } from '../layers.ts';
import type { CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import { ProcCatheter, type CatheterState, type RingName } from '../devices/catheters/proc-catheter.ts';
import { route3d, stopsOf } from './route3d.ts';
import { StentDevice } from '../devices/stent/stent-device.ts';
import { VeinStent, canStent } from '../devices/stent/vein-stent.ts';
import { OSTIUM_U } from './ostium.ts';
import { Tamponade } from '../devices/balloons/tamponade.ts';
import { tamponadeAt } from '../devices/balloons/tamponade-shape.ts';
import { Bands } from '../devices/bands.ts';
import { GlueCast } from '../devices/glue-cast.ts';
import type { ScopeDrive } from '../devices/probes/scope.ts';
import { procFrame as procFrameJs, specOf } from './copied/proc-anim.js';
import { setDrawnDiameter } from '../../engine/tract-override.ts';
import { TRACT_EDGE, TRACT_RELEASE_MS, TRACT_STENT_MM, tractDiameter, tractTimes } from './tract.ts';
import './instrument-specs.ts';   // (registers EVL, tamponade, DIPS, DSRS and paracentesis in the procedure table)
import { CATH_END } from './copied/cath-arrival.js';
import { type StepClock, makeStepClock, aim as aimClock, stepClock, landed } from './step-clock.ts';

const procFrame = procFrameJs as (kind: string, t: number, stops?: Record<string, [number, number]> | null, into?: object | null, from?: number) => Rec;
/** How far the bypass drops from the 'over' tier so it sits below the 'front' tier the splenic and coronary veins are on (frame2d.ts TIER_Z: over .54, front .46, net .38). */
export const REX_LOWER = -0.12;
/** How a procedure's devices leave when the slide is left (2D presenter-lapse.js cathOut): the balloon and the column to nothing in 400 ms, the whole device's opacity in 650 ms, in place. */
export const LEAVE_BALLOON_MS = 400, LEAVE_MS = 650;
const smooth = (k: number): number => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };
interface Leaving { t: number; from: CatheterState | null; glue: GlueLast | null }
interface GlueLast { coil: number; column: number; flash: number; opacity: number }
type Rec = { u: number; balloon: number; column: number; opacity: number; step: number; shot: string; needle: number; wire: number; flash: number; coil?: number; read?: number; [k: string]: unknown };
/** One move of a procedure on the clock. */
interface Run { kind: string; t: number; t0: number; from: number; to: number; speed: number; rec: Rec; onEnd?: () => void; onStop?: () => void; onFrame?: (r: Readonly<Rec>) => void; keep: boolean }

/** A procedure driven one step at a time (a presentation: Next plays the next step and holds at its stop, Back runs it backwards). */
interface StepRun { kind: string; clk: StepClock; rec: Rec; arrived: boolean; rewind: boolean; pauseUntil: number; moved: boolean; keep: boolean; onFrame?: (r: Readonly<Rec>) => void; onArrive?: (t: number) => void; onEnd?: (e: { done: boolean; rewound: boolean }) => void; onStop?: () => void }

export interface DriveOptions {
  /** where the sequence starts standing, ms of its own time (default 0) */
  from?: number;
  onFrame?: (r: Readonly<Rec>) => void;
  /** the move landed on its goal (a step's stop) */
  onArrive?: (t: number) => void;
  /** it ran out the end (done) or back to before its start (rewound) */
  onEnd?: (e: { done: boolean; rewound: boolean }) => void;
  /** leave the last frame up when it ends */
  keep?: boolean;
  /** stopped before its end (`stop()`, or another run replacing it): the caller gives back what it claimed. Not called after `onEnd`. */
  onStop?: () => void;
}

export interface PlayOptions {
  /** start and stop, ms of the procedure's own time (default: the whole of it) */
  from?: number; to?: number;
  /** playback speed, 1 = the 2D app's pace */
  speed?: number;
  onFrame?: (r: Readonly<Rec>) => void;
  onEnd?: () => void;
  /** the run was stopped before its end (`stop()`: the card closed, a new patient, another control): the runner gives back what it claimed (the camera, the readings, the owner). Not called after `onEnd`. */
  onStop?: () => void;
  /** leave the last frame up when it ends (a step's end), instead of clearing */
  keep?: boolean;
}

/** The colour of the reading ripples a `read` value names, by procedure (the 2D specs' ring1 and ring2). */
export function ringOf(kind: string, read: number): RingName | null {
  if (!read) return null;
  if (kind === 'hvpgcath') return read === 1 ? 'free' : 'wedge';
  if (kind === 'tipsgrad') return read === 1 ? 'pv' : 'ivc';
  const spec = specOf(kind) as { readAs?: number } | null;
  return (spec?.readAs ?? read) === 1 ? 'pv' : 'ivc';
}

export class ProcedureLayer {
  readonly group = new Group();
  private readonly caths = new Map<string, ProcCatheter>();
  private shown: ProcCatheter | null = null;
  private run: Run | null = null;
  private step: StepRun | null = null;
  /** The devices easing out where they stand (stop/clear with a fade), or null. */
  private leaving: Leaving | null = null;
  private glueLast: GlueLast | null = null;
  /** The HVPG catheter as the deck last put it (showHvpgState): while it stands in a reading's ring, the layer redraws it each frame with the clock moving on so the ring goes on pulsing (2D cathFrame ran for as long as the catheter was on). */
  private held: { advance: number; balloon: number; column: number; ring: RingName | null } | null = null;
  private palette: Palette | null = null;
  private phone = false;
  private dirty = true;
  /** kind → the catheter it drew last (so a stop can clear it) */
  private lastKind: string | null = null;
  /** the shape of the last frame the layer drew, for tests and tags */
  readonly frame: Rec = { u: 0, balloon: 0, column: 0, opacity: 0, step: -1, shot: '', needle: 0, wire: 0, flash: 0, coil: 0, read: 0 };

  private readonly shared: CelShared;
  /** The TIPS's and the DIPS's stents, each on its own shunt vessel. */
  readonly stents = new Map<'TIPS' | 'DIPS', StentDevice>();
  private lastTick = -1;
  /** The stents a slide shows in veins the model has no device for (`stented`), by edge id; kept once made and eased in and out. */
  private readonly veinStents = new Map<string, VeinStent>();
  private lastFrame: { D: ArrayLike<number> } | null = null;
  /** The ring the HVPG catheter reads in when its state is set without one (a deck slide's catheter: free, wedge, blocked). */
  keptRing: RingName | null = null;
  /** The tamponade tube and its two balloons, driven by params.balloonGas and params.balloonEso. */
  readonly tamponade: Tamponade;
  /** The ligation bands on the esophageal varices, as many as the engine counts. */
  readonly bands: Bands;
  /** The coil and the cyanoacrylate cast the EUS-guided glue leaves in the fundal varix (the scope itself is the probes' layer's: it takes `glueDrive`). */
  readonly glue: GlueCast;
  /** What the glue slide's procedure asks of the scope this frame (null with no glue procedure on the figure). */
  glueDrive: ScopeDrive | null = null;
  constructor(shared: CelShared) { this.shared = shared; this.group.name = 'procedures'; this.tamponade = new Tamponade(shared); this.group.add(this.tamponade.group); this.bands = new Bands(shared); this.group.add(this.bands.group); this.glue = new GlueCast(shared); this.group.add(this.glue.group); }

  /** Every object the layer draws, for the scene's look and phone switches and for disposal. */
  get objects() { return [...this.caths.values()].flatMap((c) => c.objects); }

  /** Put a stent on its shunt's vessel (the vessel carries the lumen's narrowing). */
  addStent(id: 'TIPS' | 'DIPS', vessel: VesselObject): StentDevice {
    const s = new StentDevice(id, this.shared);
    s.bindVessel(vessel);
    if (this.palette) s.applyPalette(this.palette);
    s.setPhone(this.phone);
    this.group.add(inVesselPass(s.group));
    this.stents.set(id, s);
    return s;
  }
  private stentMm = TRACT_STENT_MM;
  /** The tract the run is drawing (mm) and whether this frame's draw drove it (a frame that did not is a run that has ended: it lets go, eased). */
  private tractMm = 0; private tractDriven = false;
  /** TIPS runs only: the tract is the run's clock's (needle hit, dilation); see tract.ts. */
  private driveTract(kind: string, t: number): void {
    const T = tractTimes((specOf(kind) as { T?: unknown } | null)?.T);
    if (!T) return;
    this.tractDriven = true; this.tractMm = tractDiameter(T, t, this.stentMm);
    setDrawnDiameter(TRACT_EDGE, this.tractMm);
  }
  /** A tract no run drives lets go over TRACT_RELEASE_MS (a slide left, a run replayed or taken off): the larger of it and the engine's own diameter is what is drawn, so a stent that is in never shrinks. True while it eases. */
  private releaseTract(dt: number): boolean {
    if (this.tractDriven) { this.tractDriven = false; return false; }
    if (this.tractMm <= 0) return false;
    if (this.run || this.step) return false;
    this.tractMm = Math.max(0, this.tractMm - (this.stentMm * dt) / TRACT_RELEASE_MS);
    setDrawnDiameter(TRACT_EDGE, this.tractMm);
    return true;
  }
  private fadeNow = 1;
  /** The devices dissolve as the figure turns into the Circuit (1 whole, 0 gone): nothing of a procedure stands on the map. */
  setFade(f: number): void {
    if (f === this.fadeNow) return;
    this.fadeNow = f;
    const all = [...this.objects, ...[...this.stents.values()].flatMap((s) => s.objects), ...[...this.veinStents.values()].flatMap((s) => s.objects), ...this.tamponade.objects, ...this.bands.objects, ...this.glue.objects];
    for (const o of all) o.setFade(f);
    this.group.visible = f > 0.001;
    this.dirty = true;
  }
  /** The model's band count (engine frame `bands`). */
  syncBands(count: number, instant = false): void { this.bands.want(count, instant); this.dirty = true; }
  /** The patient's tube: which balloons are up. `instant` puts it there at once (a new patient). */
  syncTamponade(params: { balloonGas?: boolean; balloonEso?: boolean } | null, instant = false): void {
    this.tamponade.want(!!params?.balloonGas, !!params?.balloonEso);
    if (instant) this.tamponade.snap();
    this.dirty = true;
  }
  /** The engine's newest frame and params: each stent follows its shunt's diameter and shape. */
  syncStents(frame: { D: ArrayLike<number> } | null, params: unknown, instant = false): boolean {
    let moved = false;
    this.lastFrame = frame;
    const sd = Number((params as { tips?: { d?: number } } | null)?.tips?.d);
    this.stentMm = sd > 0 ? sd : TRACT_STENT_MM;
    for (const s of this.stents.values()) moved = s.sync(frame, params as never, instant) || moved;
    for (const s of this.veinStents.values()) moved = s.sync(frame) || moved;
    this.glue.sync(frame);
    if (moved) this.dirty = true;
    return moved;
  }

  /** The veins a slide shows stented (edge ids): the stent comes in over each, and goes out of those the list leaves. An id the scene has no vein for is ignored. Returns the ids shown. */
  setStented(ids: readonly string[], instant = false): string[] {
    const want = new Set(ids.filter(canStent));
    for (const id of want) {
      let v = this.veinStents.get(id);
      if (!v) {
        v = new VeinStent(id, this.shared);
        if (this.palette) v.applyPalette(this.palette);
        v.setPhone(this.phone);
        v.setFade(this.fadeNow);
        this.group.add(inVesselPass(v.group));
        this.veinStents.set(id, v);
      }
      v.want(true, instant);
      v.sync(this.lastFrame);
    }
    for (const [id, v] of this.veinStents) if (!want.has(id)) v.want(false, instant);
    this.dirty = true;
    return [...want];
  }
  /** The veins whose stent is in or coming in. */
  get stentedIds(): string[] { return [...this.veinStents].filter(([, v]) => v.goal > 0).map(([id]) => id); }

  applyPalette(p: Palette): void { this.palette = p; for (const c of this.caths.values()) c.applyPalette(p); for (const s of this.stents.values()) s.applyPalette(p); for (const s of this.veinStents.values()) s.applyPalette(p); this.tamponade.applyPalette(p); this.bands.applyPalette(p); this.glue.applyPalette(p); this.dirty = true; }
  setPhone(phone: boolean): void { this.phone = phone; for (const c of this.caths.values()) c.setPhone(phone); for (const s of this.stents.values()) s.setPhone(phone); for (const s of this.veinStents.values()) s.setPhone(phone); this.tamponade.setPhone(phone); this.bands.setPhone(phone); this.glue.setPhone(phone); this.dirty = true; }

  /** The engine's diameters (per edge, mm): every catheter's veins are drawn at their live width, so each follows (ProcCatheter.setLive). True when one moved. */
  setLive(D: ArrayLike<number> | null | undefined): boolean {
    let moved = false;
    for (const c of this.caths.values()) if (c.setLive(D)) moved = true;
    this.liveD = D ?? null;
    return moved;
  }
  private liveD: ArrayLike<number> | null = null;

  /** The route a procedure's catheter travels (its spec's `route`, else the kind itself), or null for one with no catheter (a graft, a scope). */
  routeKindOf(kind: string): string | null {
    const spec = specOf(kind) as { route?: string; graft?: boolean } | null;
    if (!spec || spec.graft) return null;
    const k = spec.route || kind;
    return route3d(k) ? k : null;
  }

  private catheterFor(kind: string): ProcCatheter | null {
    const rk = this.routeKindOf(kind);
    if (!rk) return null;
    const key = `${rk}|${(specOf(kind) as { balloonSpan?: string } | null)?.balloonSpan ?? ''}`;
    let c = this.caths.get(key);
    if (!c) {
      const r3 = route3d(rk)!;
      c = new ProcCatheter(r3, this.shared, (specOf(kind) as { balloonSpan?: string } | null)?.balloonSpan ?? null);
      c.setLive(this.liveD);
      if (this.palette) c.applyPalette(this.palette);
      c.setPhone(this.phone);
      this.group.add(inVesselPass(c.group));
      this.caths.set(key, c);
    }
    return c;
  }

  /** The procedure's stretches for `procFrame` (the TIPS tract and the right portal vein as u on this route). */
  stopsFor(kind: string): Record<string, [number, number]> | null {
    const rk = this.routeKindOf(kind);
    const r3 = rk ? route3d(rk) : null;
    return r3 ? stopsOf(r3) : null;
  }

  private draw(kind: string, rec: Rec, clock: number): void {
    const c = this.catheterFor(kind);
    if (this.shown && this.shown !== c) this.shown.set({ ...this.shown.current, u: 0, opacity: 0 });
    this.shown = c; this.lastKind = kind; this.held = null; this.leaving = null;
    Object.assign(this.frame, rec);
    this.driveTract(kind, clock);
    if (kind === 'eusglue') {
      this.glueLast = { coil: rec.coil ?? 0, column: rec.column, flash: rec.flash, opacity: rec.opacity };
      // the glue's scope is the probes' (it follows glueDrive); what it leaves in the varix is drawn here
      this.glue.set({ coil: rec.coil ?? 0, column: rec.column, flash: rec.flash, opacity: rec.opacity });
      this.glueDrive = { u: rec.u, aim: Number(rec.aim ?? 0), fan: Number(rec.fan ?? 0), needle: rec.needle, flash: rec.flash };
    }
    if (c) {
      const st: CatheterState = { u: rec.u, balloon: rec.balloon, column: rec.column, opacity: rec.opacity, needle: rec.needle, wire: rec.wire, flash: rec.flash, coil: rec.coil ?? 0,
        ring: ringOf(kind, rec.read ?? 0), columnTone: kind === 'brto' || kind === 'brtoC6' || kind === 'bato' ? 'trScler' : 'trWedge', clock };
      c.set(st);
    }
    this.dirty = true;
  }

  /** Put a procedure at time t (ms of its own), at once. */
  seek(kind: string, t: number, clock = t): void { this.draw(kind, procFrame(kind, t, this.stopsFor(kind), { ...this.frame }), clock); }

  /** The HVPG catheter as the deck holds it: how far in (0..1), the balloon (0..1, and the wedged blood with it), and the ring it reads in, at once. */
  showHvpgState(advance: number, balloon: number, ring: RingName | null = null, clock = 0, column = balloon): void {
    const rec = { ...this.frame, u: advance, balloon, column, opacity: advance > 0.001 ? 1 : 0, step: -1, shot: '', needle: 0, wire: 0, flash: 0, coil: 0, read: 0 } as Rec;
    const c = this.catheterFor('hvpgcath');
    if (this.shown && this.shown !== c) this.shown.set({ ...this.shown.current, u: 0, opacity: 0 });
    this.shown = c; this.lastKind = 'hvpgcath'; this.leaving = null;
    this.held = advance > 0.001 ? { advance, balloon, column, ring } : null;
    Object.assign(this.frame, rec);
    c?.set({ u: advance, balloon, column, opacity: rec.opacity, needle: 0, wire: 0, flash: 0, coil: 0, ring: ring ?? this.keptRing, columnTone: 'trWedge', clock });
    this.dirty = true;
  }

  /** Where a catheter step ends, the HVPG's route, free, wedge, result and blocked (cath-arrival.js CATH_END), at once; `advance` is how far in the tip is (0..1). */
  showHvpg(mode: keyof typeof CATH_END, advance = 1, clock = 0): void {
    const e = CATH_END[mode];
    // a blocked hepatic vein: the tip only reaches the ostium (2D stage-cath.js `ostium`), however far in the caller says
    this.showHvpgState(mode === 'blocked' ? advance * OSTIUM_U : advance, e.balloon, e.ring as RingName | null, clock);
  }

  /** Play a procedure from `from` to `to` (default the whole of it) on the scene's frames. */
  play(kind: string, now: number, o: PlayOptions = {}): void {
    const spec = specOf(kind) as { T: { end: number } } | null;
    if (!spec) throw new Error(`no procedure ${kind}`);
    const from = o.from ?? 0, to = o.to ?? spec.T.end;
    this.endReplaced();   // (one run on the figure: whatever stood there is stopped first, so its runner gives back the camera, the owner and the marks)
    this.run = { kind, t: from, t0: now, from, to, speed: o.speed ?? 1, rec: { ...this.frame } as Rec, onEnd: o.onEnd, onStop: o.onStop, onFrame: o.onFrame, keep: !!o.keep };
    this.dirty = true;
  }

  /** A procedure is on the figure: a run or a driven step is going, or a catheter stands out (the deck's HVPG states, a held last frame). The flow marks are quiet while it is. */
  get busy(): boolean { return !!this.run || !!this.step || !!this.held || (!!this.shown && this.frame.u > 0.001); }
  get playing(): { kind: string; t: number } | null { return this.run ? { kind: this.run.kind, t: this.run.t } : this.step ? { kind: this.step.kind, t: this.step.clk.t } : null; }

  /** Start a procedure that goes where it is told, a stop at a time (aimAt): it stands at `from` until then. Replaces a run on the figure. */
  drive(kind: string, now: number, o: DriveOptions = {}): void {
    if (!specOf(kind)) throw new Error(`no procedure ${kind}`);
    this.endReplaced();
    const from = o.from ?? 0;
    this.step = { kind, clk: makeStepClock(from), rec: { ...this.frame } as Rec, arrived: true, rewind: false, pauseUntil: 0, moved: true, keep: !!o.keep, onFrame: o.onFrame, onArrive: o.onArrive, onEnd: o.onEnd, onStop: o.onStop };
    this.dirty = true;
  }
  /** Run the driven procedure to a stop (forward at the sequence's pace, back a little faster; `rush` plays the rest out fast). A goal behind turns it round over FLIP_MS. */
  aimAt(goal: number, rush = false): boolean {
    const s = this.step;
    if (!s) return false;
    aimClock(s.clk, goal, rush);
    s.rewind = goal <= 0; s.arrived = landed(s.clk) && !s.rewind; this.dirty = true;
    return true;
  }
  /** Hold the driven procedure still until `until` (ms on the scene's clock): the camera is on its way to the step's shot, and no step starts with the camera moving (2D `still`). */
  pauseUntil(until: number): void { if (this.step) { this.step.pauseUntil = Math.max(this.step.pauseUntil, until); this.dirty = true; } }
  /** The driven procedure's time now and the stop it runs to, or null. */
  get driven(): { kind: string; t: number; goal: number; moving: boolean } | null { const s = this.step; return s ? { kind: s.kind, t: s.clk.t, goal: s.clk.goal, moving: !landed(s.clk) } : null; }

  /** End the move: clear the devices (or leave the last frame up with `keep`). */
  stop(keep = false): void {
    const r = this.run, d = this.step;
    this.run = null; this.step = null;
    if (!keep) this.clear(LEAVE_MS);
    r?.onStop?.(); d?.onStop?.();   // (after the run is gone, so a runner that stops again from here finds nothing to stop)
  }
  /** A new run replaces the one on the figure (integration review I3, 22 Nov): the old one is STOPPED, its onStop called, never silently dropped (an IR run replaced by a slide's procedure left its owner claim
   *  "IR is running" and its marks behind). The devices are not cleared: the new run takes them over from where they stand. */
  private endReplaced(): void {
    const r = this.run, d = this.step;
    if (!r && !d) return;
    this.run = null; this.step = null;
    r?.onStop?.(); d?.onStop?.();
  }

  /** Take the devices off the figure: at once, or (`fadeMs`) easing out in place as 2D's cathOut does when a slide is left, so nothing pops (the device a leaving slide's step left standing, the glue's coil and cast). */
  clear(fadeMs = 0): void {
    const c0 = this.shown, g0 = this.glueLast;
    if (fadeMs > 0 && ((c0 && c0.current.opacity > 0.02) || (g0 && g0.opacity > 0.02))) {
      this.leaving = { t: 0, from: c0 && c0.current.opacity > 0.02 ? { ...c0.current } : null, glue: g0 && g0.opacity > 0.02 ? { ...g0 } : null };
      this.held = null; this.glueDrive = null; this.dirty = true;
      return;
    }
    this.leaving = null; this.glueLast = null;
    for (const c of this.caths.values()) c.set({ ...c.current, u: 0, opacity: 0, balloon: 0, column: 0, needle: 0, wire: 0, flash: 0, coil: 0, ring: null });
    this.glue.clear(); this.glueDrive = null;
    this.shown = null; this.held = null; this.dirty = true;
  }

  private rexUnder = false;
  /** While the Meso-Rex bypass is shown it runs UNDER the splenic and coronary veins and the portocaval shunt (anatomy.js REX_UNDER: they draw a tier above it), so the crossings read as crossings and not as joins:
   *  the bypass is lowered below the portal tree's tier and those three stay where they are. */
  setRexUnder(on: boolean, vessel: (id: string) => VesselObject | undefined): void {
    this.rexUnder = on;
    const rex = vessel('REX');
    if (rex) rex.group.position.z = on ? REX_LOWER : 0;
    this.dirty = true;
  }
  get isRexUnder(): boolean { return this.rexUnder; }

  /** The tip's scene position now, for tags and the camera (null with no catheter out). */
  /** The wedge's amber tint on the vessels (ProcCatheter.wedgeTint), or null. */
  wedgeTint() { return this.shown ? this.shown.wedgeTint() : null; }
  tipPosition(out: Vector3): Vector3 | null { return this.shown && this.frame.u > 0.001 ? this.shown.tipAt(this.frame.u, out) : null; }

  /** The point a little ahead of the tip along the route (where a wedged reading's card points), null with no catheter out. */
  aheadPosition(out: Vector3, share = 0.04): Vector3 | null { return this.shown && this.frame.u > 0.001 ? this.shown.aheadAt(this.frame.u, out, share) : null; }

  /** Steps the move on the clock. True while it plays, or draws once more. */
  update(now: number): boolean {
    const dt = this.lastTick < 0 ? 16 : Math.min(100, now - this.lastTick); this.lastTick = now;
    let stentMoving = this.releaseTract(dt);
    for (const s of this.stents.values()) stentMoving = s.update(dt) || stentMoving;
    for (const s of this.veinStents.values()) stentMoving = s.update(dt) || stentMoving;
    // (the tube follows the PROCEDURE's clock while its run is on the figure, the model's balloon afterwards: the model changes only at the run's T.apply)
    { const on = this.step ?? this.run, t = this.step ? this.step.clk.t : this.run?.t ?? 0; this.tamponade.follow(on?.kind === 'tamponade' ? tamponadeAt(t) : null); }
    stentMoving = this.tamponade.update(dt) || stentMoving;
    stentMoving = this.bands.update(dt) || stentMoving;
    const sr = this.step;
    if (sr) {
      if (now < sr.pauseUntil) return true;   // (the camera is landing: nothing moves yet)
      const t0 = sr.clk.t, v0 = sr.clk.v;
      const t = stepClock(sr.clk, dt);
      if (t !== t0 || v0 !== 0 || sr.moved) {
        sr.moved = false;
        this.draw(sr.kind, procFrame(sr.kind, t, this.stopsFor(sr.kind), sr.rec), t);
        sr.onFrame?.(this.frame);
      }
      const end = (specOf(sr.kind) as { T: { end: number } }).T.end;
      if (landed(sr.clk)) {
        const g = sr.clk.goal;
        if (g >= end) { this.step = null; if (!sr.keep) this.clear(); sr.onEnd?.({ done: true, rewound: false }); return true; }
        if (sr.rewind && g <= 0) { this.step = null; if (!sr.keep) this.clear(); sr.onEnd?.({ done: false, rewound: true }); return true; }
        if (!sr.arrived) { sr.arrived = true; sr.onArrive?.(t); }
        const d = this.dirty || t !== t0; this.dirty = false;
        return d || stentMoving;   // (standing at its stop: no more frames until Next, Back or a camera asks)
      }
      return true;
    }
    const r = this.run;
    if (r) {
      const t = Math.min(r.to, r.from + (now - r.t0) * r.speed);
      r.t = t;
      this.draw(r.kind, procFrame(r.kind, t, this.stopsFor(r.kind), r.rec), t);
      r.onFrame?.(this.frame);
      if (t >= r.to) { const end = r.onEnd; const keep = r.keep; this.run = null; if (!keep) this.clear(); end?.(); }
      return true;
    }
    const lv = this.leaving;
    if (lv) {
      lv.t += dt;
      const k = smooth(lv.t / LEAVE_MS), kb = smooth(lv.t / LEAVE_BALLOON_MS);
      if (lv.t >= LEAVE_MS) { this.leaving = null; this.clear(); return true; }
      if (lv.from && this.shown) this.shown.set({ ...lv.from, opacity: lv.from.opacity * (1 - k), balloon: lv.from.balloon * (1 - kb), column: lv.from.column * (1 - kb), flash: 0, clock: lv.from.clock + lv.t });
      if (lv.glue) this.glue.set({ coil: lv.glue.coil, column: lv.glue.column * (1 - kb), flash: 0, opacity: lv.glue.opacity * (1 - k) });
      this.dirty = true;
      return true;
    }
    const h = this.held;
    if (h && (h.ring ?? this.keptRing)) { this.showHvpgState(h.advance, h.balloon, h.ring, now, h.column); this.dirty = false; return true; }   // (a ring pulses on the clock for as long as it is on)
    const d = this.dirty; this.dirty = false;
    return d || stentMoving;
  }

  dispose(): void { this.tractMm = 0; this.tractDriven = false; setDrawnDiameter(TRACT_EDGE, 0); for (const o of this.objects) o.dispose(); for (const s of this.stents.values()) s.dispose(); for (const s of this.veinStents.values()) s.dispose(); this.tamponade.dispose(); this.bands.dispose(); this.glue.dispose(); }
}

// The balloon tamponade tube (Sengstaken-Blakemore style, the 2D app's balloon-gas.js and balloon-eso.js, copied): a tube slides down the esophagus into the stomach, its gastric
// balloon fills and the tube
// is drawn up so the balloon seats against the cardia, and only then the esophageal balloon fills. Let down, the reverse. The tube follows the 2D path (`tubePath`) with its turn at the
// cardia rounded to the tube's minimum bend radius (the one path builder, bend-path.ts; tamponade-path.ts `tubeLine`); both balloons are bodies of
// revolution about the tube: rings centred ON the tube's line, round about it. The gastric one is a flattened sphere held in by the stomach's wall on both sides alike, drawn up so its
// face lies against the GE junction (`gasRings`), the esophageal one the long balloon that follows the esophagus's own walls (`balloonShape`). Both balloons are glass (translucent, the
// tube seen through them). While a procedure run is on the figure (`follow`) the tube and the gastric balloon follow the PROCEDURE's clock (`tamponadeAt`), because the params change
// only at the run's T.apply. Driven by params.balloonGas and
// params.balloonEso (the esophageal balloon is filled only on a tube whose gastric balloon is up: scenario.js gastricUp), eased on the clock, rebuilt in place (no allocation of
// buffers) while it moves.
import { Group, Vector3 } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { DeviceObject } from '../device-object.ts';
import { DEVICE_SIDES, WIRE_SIDES, allocTube, makeRings, type Ring, writeRings } from '../tube-rings.ts';
import { BALLOON, BALLOON_MS, balloonShape, esoAt } from '../../procedures/copied/balloon-eso.js';
import { GAS, arcAtY, pathAt, pullArrow, sheathArcs, tubePath, tubeTip } from '../../procedures/copied/balloon-gas.js';
import { gasRings, gasSeat, lineScene, scenePoint, tubeLine } from './tamponade-path.ts';
import { easeMove } from '../../procedures/copied/ease.js';

const U = 300;
const PULL_N = 5;
const TUBE_N = 120, ESO_N = 64, GAS_N = 64, RADIAL = DEVICE_SIDES, MARK_N = 3, HEAD_N = 6;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export interface TamponadeState { adv: number; gas: number; eso: number }

/** A balloon is glass (as the HVPG and the dilation balloons are): its body at this alpha when whole, firmer toward the rim (`setGlass`), its outline the rim only and firmer. The tube
  * is seen through it. */
const GLASS_FILL = 0.42, GLASS_FILL_RIM = 1.4, GLASS_RIM = 0.4;
const inkOf = (k: number): number => 0.45 + 0.5 * k;
/** The tube's fine centimetre marks (as the catheters': a thin ring every 22 figure units back from the tip, a heavier one every fifth), none on the balloon's stretch. */
const MARK_UNITS = 22, MARK_HALF = 0.26, MARK_HEX = '#7E889A';
/** A balloon grows from nothing: its alpha rises with its size (`k`, the eased fill), so it is invisible at zero and whole by a tenth of the way up. (The radius cannot go below the
  * tube it sits on; the alpha is what takes it to a true zero.) */
const GROW_FULL = 0.1;
const grow = (k: number): number => Math.min(1, Math.max(0, k / GROW_FULL));

export class Tamponade {
  readonly group = new Group();
  readonly tube: DeviceObject; readonly gas: DeviceObject; readonly eso: DeviceObject;
  /** The two platinum marker bands on the tube at the esophageal balloon's ends (stage-balloon.js `balloon-marker`). */
  readonly marks: readonly [DeviceObject, DeviceObject];
  /** The traction arrow up the esophagus's side, easing in as the tube is drawn up: its shaft and its head (`balloon-pull-line`, `balloon-pull-head`, the look's accent). */
  readonly pullLine: DeviceObject; readonly pullHead: DeviceObject;
  /** how far the traction arrow is shown now (0 to 1), for tests and tags */
  pull = 0;
  readonly objects: DeviceObject[];
  /** how far the tube is in, how full each balloon is (0 to 1, eased) */
  readonly state: TamponadeState = { adv: 0, gas: 0, eso: 0 };
  private wantGas = false; private wantEso = false;
  /** The procedure's clock's say on the tube and the gastric balloon (0..1 each), or null when no run is on and the params say. */
  private followed: { adv: number; gas: number } | null = null;
  private readonly tubeRings = makeRings(TUBE_N); private readonly gasRings = makeRings(GAS_N); private readonly esoRings = makeRings(ESO_N);
  private readonly markRings = [makeRings(MARK_N), makeRings(MARK_N)] as const;
  private pullBuilt = false;
  private dirty = true;
  private readonly v = new Vector3();

  constructor(shared: CelShared) {
    // (the tube is slim, pale and lit like the catheters' shaft: three bands, no flat rod, fine marks)
    this.tube = new DeviceObject(allocTube(TUBE_N, DEVICE_SIDES), 'poly', shared, { px: 0.8, order: 0, bands: 3, tubeTones: false, fat: 0.7, shadow: BALLOON.shaftR / U }, 'polyEdge');
    this.gas = new DeviceObject(allocTube(GAS_N, RADIAL), 'latex', shared, { px: 1, order: 1 }, 'latexEdge');
    this.eso = new DeviceObject(allocTube(ESO_N, RADIAL), 'latex', shared, { px: 1, order: 2 }, 'latexEdge');
    for (const b of [this.gas, this.eso]) b.setGlass(GLASS_FILL_RIM, GLASS_RIM);
    this.marks = [0, 1].map(() => new DeviceObject(allocTube(MARK_N, DEVICE_SIDES), 'platinum', shared, { px: 0.8, order: 3 }, 'ink')) as unknown as [DeviceObject, DeviceObject];
    this.pullLine = new DeviceObject(allocTube(PULL_N, WIRE_SIDES), 'accent', shared, { px: 0.8, order: 4 }, 'ink');
    this.pullHead = new DeviceObject(allocTube(HEAD_N, DEVICE_SIDES), 'accent', shared, { px: 0.8, order: 4 }, 'ink');
    this.objects = [this.tube, this.gas, this.eso, ...this.marks, this.pullLine, this.pullHead];
    for (const o of this.objects) { this.group.add(o.group); o.park(); }
  }

  applyPalette(p: Palette): void { for (const o of this.objects) o.applyPalette(p); }
  setPhone(phone: boolean): void { for (const o of this.objects) o.setPhone(phone); }

  /** What the patient has: the gastric balloon up (the first step), the esophageal one up (the second, only on top of the first). */
  want(gas: boolean, eso: boolean): void {
    const g = gas || eso, e = eso;
    if (g !== this.wantGas || e !== this.wantEso) { this.wantGas = g; this.wantEso = e; this.dirty = true; }
  }
  /** A procedure run is on the figure: the tube goes in and the gastric balloon fills as the run's own clock says (null: the run is over or none is on, the params say). The esophageal
    * balloon stays the params'. */
  follow(p: { adv: number; gas: number } | null): void {
    if (!p && !this.followed) return;
    if (p && this.followed && p.adv === this.followed.adv && p.gas === this.followed.gas) return;
    this.followed = p ? { adv: p.adv, gas: p.gas } : null; this.dirty = true;
  }
  get following(): boolean { return !!this.followed; }
  /** How far the balloon is drawn up against the cardia now (0 not at all, 1 seated): what the bleed's jet is stopped by. */
  get seat(): number { return this.state.adv > 0.001 ? easeMove(clamp01((this.state.gas - 0.45) / 0.55)) * clamp01(this.state.adv * 4) : 0; }
  /** Put it at once in the state the patient has (a new patient, the first frame). */
  snap(): void { this.state.adv = this.wantGas ? 1 : 0; this.state.gas = this.wantGas ? 1 : 0; this.state.eso = this.wantEso ? 1 : 0; this.dirty = true; this.draw(); }

  /** The tube goes in, then the gastric balloon fills (the traction in its second half), then the esophageal one; let down, the reverse (stage-balloon.js). True while it moves. */
  update(dtMs: number): boolean {
    const s = this.state, a = dtMs / BALLOON_MS.adv, i = dtMs / BALLOON_MS.inflate, e = dtMs / BALLOON_MS.eso;
    const before = s.adv + s.gas + s.eso, f = this.followed;
    // stage-balloon.js balloonStep: the esophageal balloon fills only on a full gastric one; let down it is quicker than it fills (x2.5) and goes in the reverse order
    const out = 2.5;
    const fall = (): void => { s.eso = Math.max(0, s.eso - e * out); };
    if (this.wantEso) { if ((f ? f.gas : s.gas) >= 1) s.eso = Math.min(1, s.eso + e); else if (f) fall(); } else fall();   // (a run that has the gastric balloon down lets the esophageal one down too)
    if (f) { s.adv = f.adv; s.gas = f.gas; }   // (a run on the figure: the procedure's clock says; the model's balloon changes only at its T.apply)
    else {
      if (this.wantGas) { if (s.adv >= 1) s.gas = Math.min(1, s.gas + i); } else if (s.eso <= 0) s.gas = Math.max(0, s.gas - i * out);
      if (this.wantGas) s.adv = Math.min(1, s.adv + a); else if (s.gas <= 0) s.adv = Math.max(0, s.adv - a * out);
    }
    const moved = s.adv + s.gas + s.eso !== before || this.dirty;
    if (moved) { this.draw(); this.dirty = false; }
    return moved;
  }

  get isIn(): boolean { return this.state.adv > 0.001; }

  // (the tube and its balloons are carried, with the scope's way, onto the oesophagus and stomach the stomach mesh has (probes/eso-axis.ts), at their middle in depth: tamponade-path.ts `scenePoint`)
  private pt(x: number, y: number, out: Vector3): Vector3 { return scenePoint(x, y, out); }

  private draw(): void {
    const { adv, gas, eso } = this.state;
    const show = adv > 0.001;
    // (every part is asked to show or go and fades by itself: DeviceObject.show; the container stays drawn until the last of them is gone)
    this.tube.show(show);
    if (!show) { for (const o of [this.gas, this.eso, ...this.marks, this.pullLine, this.pullHead]) o.show(false); this.pull = 0; return; }
    const k = easeMove(gas), ke = easeMove(eso);
    const q = easeMove(clamp01((gas - 0.45) / 0.55));   // the traction runs in the second half of the gastric balloon's filling (stage-balloon.js `pull`)
    const path = tubePath(), line = tubeLine(path);
    const tip = tubeTip(easeMove(adv), q, path);
    const tubeR = BALLOON.shaftR / U;
    // the tube: the path from the figure's top to the tip
    for (let i = 0; i < TUBE_N; i++) {
      const r = this.tubeRings[i]!;
      lineScene(line, (tip * i) / (TUBE_N - 1), r.c, r.t); r.r = tubeR;
    }
    writeRings(this.tube.toonMesh.geometry, this.tubeRings, DEVICE_SIDES);
    // fine marks counted back from the tip, none on the balloon's stretch (the tube's uv runs 0 at the figure's top to 1 at the tip, so they ride the tube as it goes in)
    const bare = path.total - gasSeat(line).top;
    this.tube.setStripes(MARK_UNITS / tip, 1, MARK_HALF / tip, bare / tip, MARK_HEX, 1.7);
    // the gastric balloon: a body of revolution about the tube (tamponade-path.ts gasRings): every ring centred on the tube's line, round about it, the same radius both sides
    const showGas = gas > 0.001;
    this.gas.show(showGas);
    if (showGas) {
      const sec = gasRings(line, k, q, GAS_N);
      for (let i = 0; i < GAS_N; i++) {
        const sc = sec[i]!, r = this.gasRings[i]!;
        r.c.set(sc.c[0], sc.c[1], sc.c[2]); r.t.set(sc.t[0], sc.t[1], sc.t[2]); r.r = Math.max(tubeR, sc.r);
      }
      writeRings(this.gas.toonMesh.geometry, this.gasRings, RADIAL);
      this.gas.setAlphas(GLASS_FILL * grow(k), inkOf(k) * grow(k));
    }
    // the esophageal balloon: the long balloon on the tube, its centre and half width at each height from balloonShape's outline
    const showEso = eso > 0.001;
    this.eso.show(showEso);
    if (showEso) {
      // (centred ON the tube's line, as the gastric one is: the long balloon's half width at each height, held to the oesophagus's wall)
      const { outline, half } = balloonShape(ke, ESO_N - 1) as unknown as { outline: [number, number][]; half: (y: number) => number };
      const n = ESO_N, Lft = outline.slice(0, n);
      for (let i = 0; i < n; i++) {
        const y = Lft[i]![1], r = this.esoRings[i]!, s = arcAtY(y, path) as number, e = esoAt(y) as { c: number; h: number };
        lineScene(line, s, r.c, r.t);
        r.r = Math.max(tubeR, Math.min(half(y), e.h - BALLOON.wall) / U);
      }
      writeRings(this.eso.toonMesh.geometry, this.esoRings, RADIAL);
      this.eso.setAlphas(GLASS_FILL * grow(ke), inkOf(ke) * grow(ke));
    }
    // the two marker bands, on the tube at the esophageal balloon's ends (3 units in from each end of its length): a short ring a unit long, a hair wider than the tube
    const arcs = sheathArcs(tip, path), per = (arcs.eso[1] - arcs.eso[0]) / (BALLOON.bottom - BALLOON.top);
    const markR = (BALLOON.shaftR + 0.3) / U;
    [3, BALLOON.bottom - BALLOON.top - 3].forEach((o, k) => {
      const sb = arcs.eso[0] + o * per, mark = this.marks[k]!, rings = this.markRings[k]!;
      const on = sb >= 0 && sb <= path.total;
      mark.show(on);
      if (!on) return;
      for (let i = 0; i < MARK_N; i++) {
        const r = rings[i]!;
        lineScene(line, Math.max(0, sb + (i - 1) * 0.5), r.c, r.t); r.r = markR;
      }
      writeRings(mark.toonMesh.geometry, rings, DEVICE_SIDES);
    });
    // the traction: an arrow up the esophagus's side as the tube is drawn up, easing in with it
    this.pull = q;
    const showPull = q > 0.01;
    this.pullLine.show(showPull); this.pullHead.show(showPull);
    if (showPull) {
      if (!this.pullBuilt) this.buildPull();
      this.pullLine.setAlpha(q * 0.55); this.pullHead.setAlpha(q * 0.55);   // (subtle: the balloon drawn up against the cardia shows the traction itself)
    }
    void esoAt; void GAS;
  }

  /** The arrow is fixed to the esophagus (balloon-gas.js `pullArrow`), so it is built once: a round shaft of the 2D stroke's width (1.5) and a cone for the head's triangle. */
  private buildPull(): void {
    this.pullBuilt = true;
    const { line, head } = pullArrow() as { line: [number, number][]; head: [number, number][] };
    const along = (pts: [number, number][], rings: Ring[], radius: (i: number) => number): void => {
      pts.forEach((q, i) => {
        const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!, r = rings[i]!;
        this.pt(q[0], q[1], r.c); r.t.set(b[0] - a[0], -(b[1] - a[1]), 0); r.r = radius(i);
      });
    };
    const lr = makeRings(PULL_N), pts = line.length === PULL_N ? line : Array.from({ length: PULL_N }, (_, i) => line[Math.min(line.length - 1, Math.round((i / (PULL_N - 1)) * (line.length - 1)))]!);
    along(pts, lr, () => 0.75 / U);
    writeRings(this.pullLine.toonMesh.geometry, lr, WIRE_SIDES);
    // the head: its base (midway of the triangle's two base corners) to its tip, a cone as wide as the triangle (spread each side)
    const tip = head[0]!, base: [number, number] = [(head[1]![0] + head[2]![0]) / 2, (head[1]![1] + head[2]![1]) / 2], half = Math.abs(head[2]![0] - head[1]![0]) / 2;
    const hp = Array.from({ length: HEAD_N }, (_, i): [number, number] => { const f = i / (HEAD_N - 1); return [base[0] + (tip[0] - base[0]) * f, base[1] + (tip[1] - base[1]) * f]; });
    const hr = makeRings(HEAD_N);
    along(hp, hr, (i) => (half * (1 - i / (HEAD_N - 1)) + 0.3) / U);
    writeRings(this.pullHead.toonMesh.geometry, hr, DEVICE_SIDES);
  }

  dispose(): void { for (const o of this.objects) o.dispose(); }
}

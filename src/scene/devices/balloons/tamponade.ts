// The balloon tamponade tube (Sengstaken-Blakemore style, the 2D app's balloon-gas.js and balloon-eso.js, copied): a tube slides down the esophagus into the stomach, its gastric balloon fills and the tube
// is drawn up so the balloon seats against the cardia, and only then the esophageal balloon fills. Let down, the reverse. The tube follows the 2D path (`tubePath`), the gastric balloon is the pear fitted to the stomach as
// drawn (`gasShape`), the esophageal one the long balloon that follows the esophagus's own walls (`balloonShape`); here they are bodies of revolution about the tube's line. Driven by params.balloonGas and
// params.balloonEso (the esophageal balloon is filled only on a tube whose gastric balloon is up: scenario.js gastricUp), eased on the clock, rebuilt in place (no allocation of buffers) while it moves.
import { Group, Vector3 } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { TIER_Z, x3, y3 } from '../../frame2d.ts';
import { DeviceObject } from '../device-object.ts';
import { allocTube, makeRings, type Ring, writeRings } from '../tube-rings.ts';
import { BALLOON, BALLOON_MS, balloonShape, esoAt } from '../../procedures/copied/balloon-eso.js';
import { GAS, gasShape, pathAt, pullArrow, sheathArcs, tubePath, tubeTip } from '../../procedures/copied/balloon-gas.js';
import { easeMove } from '../../procedures/copied/ease.js';

const U = 300;
const Z = TIER_Z.mid;
const PULL_N = 5;
const TUBE_N = 120, ESO_N = 64, GAS_N = 48, RADIAL = 16, MARK_N = 3, HEAD_N = 6;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export interface TamponadeState { adv: number; gas: number; eso: number }

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
  private readonly tubeRings = makeRings(TUBE_N); private readonly gasRings = makeRings(GAS_N); private readonly esoRings = makeRings(ESO_N);
  private readonly markRings = [makeRings(MARK_N), makeRings(MARK_N)] as const;
  private pullBuilt = false;
  private dirty = true;
  private readonly v = new Vector3();

  constructor(shared: CelShared) {
    this.tube = new DeviceObject(allocTube(TUBE_N, 8), 'poly', shared, { px: 0.8, order: 0 }, 'polyEdge');
    this.gas = new DeviceObject(allocTube(GAS_N, RADIAL), 'latex', shared, { px: 1, order: 1 }, 'latexEdge');
    this.eso = new DeviceObject(allocTube(ESO_N, RADIAL), 'latex', shared, { px: 1, order: 2 }, 'latexEdge');
    this.marks = [0, 1].map(() => new DeviceObject(allocTube(MARK_N, 12), 'platinum', shared, { px: 0.8, order: 3 }, 'ink')) as unknown as [DeviceObject, DeviceObject];
    this.pullLine = new DeviceObject(allocTube(PULL_N, 8), 'accent', shared, { px: 0.8, order: 4 }, 'ink');
    this.pullHead = new DeviceObject(allocTube(HEAD_N, 12), 'accent', shared, { px: 0.8, order: 4 }, 'ink');
    this.objects = [this.tube, this.gas, this.eso, ...this.marks, this.pullLine, this.pullHead];
    for (const o of this.objects) { this.group.add(o.group); o.group.visible = false; }
    this.group.visible = false;
  }

  applyPalette(p: Palette): void { for (const o of this.objects) o.applyPalette(p); }
  setPhone(phone: boolean): void { for (const o of this.objects) o.setPhone(phone); }

  /** What the patient has: the gastric balloon up (the first step), the esophageal one up (the second, only on top of the first). */
  want(gas: boolean, eso: boolean): void {
    const g = gas || eso, e = eso;
    if (g !== this.wantGas || e !== this.wantEso) { this.wantGas = g; this.wantEso = e; this.dirty = true; }
  }
  /** Put it at once in the state the patient has (a new patient, the first frame). */
  snap(): void { this.state.adv = this.wantGas ? 1 : 0; this.state.gas = this.wantGas ? 1 : 0; this.state.eso = this.wantEso ? 1 : 0; this.dirty = true; this.draw(); }

  /** The tube goes in, then the gastric balloon fills (the traction in its second half), then the esophageal one; let down, the reverse (stage-balloon.js). True while it moves. */
  update(dtMs: number): boolean {
    const s = this.state, a = dtMs / BALLOON_MS.adv, i = dtMs / BALLOON_MS.inflate, e = dtMs / BALLOON_MS.eso;
    const before = s.adv + s.gas + s.eso;
    // stage-balloon.js balloonStep: the esophageal balloon fills only on a full gastric one; let down it is quicker than it fills (x2.5) and goes in the reverse order
    const out = 2.5;
    if (this.wantEso) { if (s.gas >= 1) s.eso = Math.min(1, s.eso + e); } else s.eso = Math.max(0, s.eso - e * out);
    if (this.wantGas) { if (s.adv >= 1) s.gas = Math.min(1, s.gas + i); } else if (s.eso <= 0) s.gas = Math.max(0, s.gas - i * out);
    if (this.wantGas) s.adv = Math.min(1, s.adv + a); else if (s.gas <= 0) s.adv = Math.max(0, s.adv - a * out);
    const moved = s.adv + s.gas + s.eso !== before || this.dirty;
    if (moved) { this.draw(); this.dirty = false; }
    return moved;
  }

  get isIn(): boolean { return this.state.adv > 0.001; }

  private pt(x: number, y: number, out: Vector3): Vector3 { return out.set(x3(x), y3(y), Z); }

  private draw(): void {
    const { adv, gas, eso } = this.state;
    const show = adv > 0.001;
    this.group.visible = show;
    this.tube.group.visible = show;
    if (!show) { for (const o of [this.gas, this.eso, ...this.marks, this.pullLine, this.pullHead]) o.group.visible = false; this.pull = 0; return; }
    const k = easeMove(gas), ke = easeMove(eso);
    const q = easeMove(clamp01((gas - 0.45) / 0.55));   // the traction runs in the second half of the gastric balloon's filling (stage-balloon.js `pull`)
    const path = tubePath();
    const tip = tubeTip(easeMove(adv), q, path);
    const tubeR = BALLOON.shaftR / U;
    // the tube: the path from the figure's top to the tip
    for (let i = 0; i < TUBE_N; i++) {
      const sA = (tip * i) / (TUBE_N - 1), { p, t } = pathAt(sA, path), r = this.tubeRings[i]!;
      this.pt(p[0], p[1], r.c); r.t.set(t[0], -t[1], 0); r.r = tubeR;
    }
    writeRings(this.tube.toonMesh.geometry, this.tubeRings, 8);
    // the gastric balloon: the pear along its axis (gasShape's p0, dir, L and half width u along it)
    const showGas = gas > 0.001;
    this.gas.group.visible = showGas;
    if (showGas) {
      const g = gasShape(k, q, 40) as unknown as { p0: [number, number]; dir: [number, number]; L: number; half: (u: number) => number };
      for (let i = 0; i < GAS_N; i++) {
        const u = i / (GAS_N - 1), r = this.gasRings[i]!;
        this.pt(g.p0[0] + g.dir[0] * g.L * u, g.p0[1] + g.dir[1] * g.L * u, r.c); r.t.set(g.dir[0], -g.dir[1], 0); r.r = Math.max(tubeR, g.half(u) / U);
      }
      writeRings(this.gas.toonMesh.geometry, this.gasRings, RADIAL);
      this.gas.setAlpha(0.92);
    }
    // the esophageal balloon: the long balloon on the tube, its centre and half width at each height from balloonShape's outline
    const showEso = eso > 0.001;
    this.eso.group.visible = showEso;
    if (showEso) {
      const { outline } = balloonShape(ke, ESO_N - 1) as unknown as { outline: [number, number][] };
      const n = ESO_N, Lft = outline.slice(0, n), Rgt = outline.slice(n).reverse();
      for (let i = 0; i < n; i++) {
        const l = Lft[i]!, rr = Rgt[i]!, r = this.esoRings[i]!;
        this.pt((l[0] + rr[0]) / 2, l[1], r.c); r.t.set(0, -1, 0); r.r = Math.max(tubeR, (rr[0] - l[0]) / 2 / U);
      }
      writeRings(this.eso.toonMesh.geometry, this.esoRings, RADIAL);
      this.eso.setAlpha(0.92);
    }
    // the two marker bands, on the tube at the esophageal balloon's ends (3 units in from each end of its length): a short ring a unit long, a hair wider than the tube
    const arcs = sheathArcs(tip, path), per = (arcs.eso[1] - arcs.eso[0]) / (BALLOON.bottom - BALLOON.top);
    const markR = (BALLOON.shaftR + 0.3) / U;
    [3, BALLOON.bottom - BALLOON.top - 3].forEach((o, k) => {
      const sb = arcs.eso[0] + o * per, mark = this.marks[k]!, rings = this.markRings[k]!;
      mark.group.visible = sb >= 0 && sb <= path.total;
      if (!mark.group.visible) return;
      for (let i = 0; i < MARK_N; i++) {
        const { p, t } = pathAt(Math.max(0, sb + (i - 1) * 0.5), path), r = rings[i]!;
        this.pt(p[0], p[1], r.c); r.t.set(t[0], -t[1], 0); r.r = markR;
      }
      writeRings(mark.toonMesh.geometry, rings, 12);
    });
    // the traction: an arrow up the esophagus's side as the tube is drawn up, easing in with it
    this.pull = q;
    const showPull = q > 0.01;
    this.pullLine.group.visible = this.pullHead.group.visible = showPull;
    if (showPull) {
      if (!this.pullBuilt) this.buildPull();
      this.pullLine.setAlpha(q); this.pullHead.setAlpha(q);
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
    writeRings(this.pullLine.toonMesh.geometry, lr, 8);
    // the head: its base (midway of the triangle's two base corners) to its tip, a cone as wide as the triangle (spread each side)
    const tip = head[0]!, base: [number, number] = [(head[1]![0] + head[2]![0]) / 2, (head[1]![1] + head[2]![1]) / 2], half = Math.abs(head[2]![0] - head[1]![0]) / 2;
    const hp = Array.from({ length: HEAD_N }, (_, i): [number, number] => { const f = i / (HEAD_N - 1); return [base[0] + (tip[0] - base[0]) * f, base[1] + (tip[1] - base[1]) * f]; });
    const hr = makeRings(HEAD_N);
    along(hp, hr, (i) => (half * (1 - i / (HEAD_N - 1)) + 0.3) / U);
    writeRings(this.pullHead.toonMesh.geometry, hr, 12);
  }

  dispose(): void { for (const o of this.objects) o.dispose(); }
}

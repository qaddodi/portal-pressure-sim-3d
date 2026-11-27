// The dive's anchor for the eye (owner, 27 Nov: "zoom from anatomy to lobule to sinusoid ... every zoom out should feel like one continuous zoom; now the lobule disappears
// and the sinusoid view appears").
// While the camera dives between the lobule and the sinusoid (Lobule <-> Sinusoid, and Anatomy <-> Sinusoid, which goes through the lobule), the lobule's target sinusoid
// carries the sinusoid view's OWN red
// cells: the same cells (the sinusoid's list, its traffic run, its hematocrit, its colours: sinusoid3d.ts rbcSpot is the one rule for where a cell is), drawn in the
// lobule's frame along that course. The eye
// locks on them as they come up to size and follows them through the handoff, where they ARE the sinusoid's cells (same place, size and colour) and the sinusoid's own take over as they fade.
//   - the target is DERIVED from the station (SIN_LOCAL: the nearest blood-sinusoid course of the lobule), never a course number;
//   - along the sinusoid's own span a cell is exactly where the sinusoid draws it (the sinusoid's frame); further out it follows the course's curve (a smooth blend from straight to curved);
//   - a cell shows once it is about 2 px wide on the screen (a function of the camera's distance only: in and out are one picture run both ways, and reversing mid-move never jumps);
//   - it hands over to the sinusoid's own red cells over the size where those fade in (`sinusoidRbcFade`, one function for both sides);
//   - the target tube's tone lifts a little toward lighter as the dive starts and eases out as the sinusoid lands (`tubeLift`, a function of the dive's share);
//   - only while the camera is really flying with the sinusoid at one end: at rest in the lobule and on Anatomy <-> Lobule nothing is drawn (the owner removed general blood
// streaks in d15be7a1; this is not that).
// Instanced (one MicroMany, a few dozen cells), no allocation per frame, nothing drawn (and nothing written) when not diving.
import { arrival } from './sinusoid-arrival.ts';
import { type Color, Group, Matrix4, type Object3D, type PerspectiveCamera } from 'three';
import type { CelShared } from '../materials/cel.ts';
import { CEL_STYLE } from '../cel-style.ts';
import { MicroMany, microMaterials, placeAt } from './cel3d.ts';
import { FOCUS, RBC_R, RIM_FULL_PX, UM_LOBULE, rbcSpot, rbcWanted, type RbcSpot, type Sinusoid3D } from './sinusoid3d.ts';
import type { SinusoidView } from '../sinusoid/view.ts';
import { U } from '../sinusoid/view.ts';
import { LOBULE_R } from '../lobule/sizes.ts';
import { SIN_LOCAL, SIN_POINT, SIN_SCALE } from '../lobule/frames.ts';
import type { Course, LobuleNet } from '../lobule/geometry.ts';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** A red cell's width on screen (CSS px) over which the dive's cells come in: nothing below the first, whole at the second (about 2 px, owner: "as a cell reaches about 2 px wide"). */
export const BLOOD_APPEAR_PX: readonly [number, number] = [1.5, 2.5];
/** Micrometres along the sinusoid from its middle: out to the first a cell is exactly where the sinusoid draws it, from the second it follows the course's curve whole (a smooth blend between). */
export const SPAN_STRAIGHT_UM = 60, SPAN_CURVED_UM = 110;
/** How much lighter (0 to 1 of the way to white) the target tube's tone gets at most: about a tenth (owner's brief: 8 to 12 %). */
export const TUBE_LIFT_MAX = 0.1;
/** The ease of the dive's gate (ms): the cells and the tone stand down this long after the camera stops flying with the sinusoid at one end (a move halted half way never pops them). */
const GATE_MS = 220;

/** A red cell's width on screen (CSS px) with the camera's `pxPerUm` on the sinusoid's plane. */
export const bloodWidthPx = (pxPerUm: number): number => 2 * RBC_R * pxPerUm;
/** CSS px per micrometre of the sinusoid's plane for a camera `distance` (scene units) from it: `projY` the projection's focal term (projectionMatrix[5]), `stageH` the picture's height in CSS px. */
export const pxPerUmAt = (distance: number, projY: number, stageH: number): number => (distance > 0 ? ((stageH / 2) * projY * SIN_SCALE * U) / distance : 0);
/** How much of the blood is seen at all, dive's cells and the sinusoid's together, by the cell's width on screen: a smooth ramp, 0 below about 2 px. It only grows with the
   size (so, only with nearness). */
export const bloodVisible = (pxPerUm: number): number => smooth(BLOOD_APPEAR_PX[0], BLOOD_APPEAR_PX[1], bloodWidthPx(pxPerUm));
/** THE SINUSOID'S RED CELLS' OWN FADE (0 to 1) at dive share `share`: how much of them the sinusoid draws. It IS the sinusoid's red-cell tier (sinusoid-arrival.ts
 *  arrival('cells')), one function for both sides, so the dive's cells hand over exactly as the sinusoid's come in. Null (at rest): whole. */
export const sinusoidRbcFade = (share: number | null): number => arrival('cells', share);
/** How much of the blood the dive's cells draw (0 to 1): what is seen by its size on screen, less what the sinusoid's own have taken over by the dive's share. */
export const diveBloodShown = (pxPerUm: number, share: number | null): number => bloodVisible(pxPerUm) * (1 - sinusoidRbcFade(share));
/** The target tube's tone lift (0 to TUBE_LIFT_MAX of the way to white) at dive share `share` (sinusoid/view.ts diveShare: 0 leaving the lobule, 1 landed): up over the
   dive's first fifth, eased out as the sinusoid's own
 *  dissolve completes (FOCUS), nothing after it. A function of the camera's distance, so the way in and the way out are one picture run both ways. */
export const tubeLift = (share: number): number => TUBE_LIFT_MAX * smooth(0, 0.2, share) * (1 - smooth(FOCUS[1], FOCUS[2], share));

/** The course the sinusoid stands on, in the sinusoid's own micrometres relative to its station (x along the flow, y up): the polyline, its arc lengths, the station's place
   on it and which way the blood runs on it. */
export interface DiveTarget {
  /** `${kind}${id}`, the key the lobule's parts know a course by. */
  key: string;
  course: Course;
  /** The course's points in µm from the station, x along the sinusoid's axis, y up (the lobule's own local y). */
  px: Float64Array; py: Float64Array;
  /** The tangent's angle at each point (radians from +x, along the flow). */
  ang: Float64Array;
  /** Arc length (µm) at each point, and the station's arc length. */
  arc: Float64Array; arc0: number;
  /** +1 when the blood runs along +x of the sinusoid's frame, -1 against it. */
  dir: 1 | -1;
}

/** The target course: the blood-sinusoid course (s0, s1, s2) nearest the station (SIN_LOCAL, lobule local units: lobule/frames.ts), found by name of the place, never by
   number. Null when the net has none. */
export function diveTarget(net: LobuleNet, station: readonly number[] = SIN_LOCAL): DiveTarget | null {
  let best: { c: Course; d: number; seg: number; t: number } | null = null;
  const lx = (p: readonly number[]) => p[0]! * LOBULE_R, ly = (p: readonly number[]) => -p[1]! * LOBULE_R;
  for (const c of net.courses) {
    if (c.kind !== 's0' && c.kind !== 's1' && c.kind !== 's2') continue;
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const ax = lx(c.pts[i]!), ay = ly(c.pts[i]!), bx = lx(c.pts[i + 1]!), by = ly(c.pts[i + 1]!), dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-12;
      const t = clamp(((station[0]! - ax) * dx + (station[1]! - ay) * dy) / l2, 0, 1), d = Math.hypot(ax + dx * t - station[0]!, ay + dy * t - station[1]!);
      if (!best || d < best.d) best = { c, d, seg: i, t };
    }
  }
  if (!best) return null;
  const c = best.c, n = c.pts.length, px = new Float64Array(n), py = new Float64Array(n), ang = new Float64Array(n), arc = new Float64Array(n);
  for (let i = 0; i < n; i++) { px[i] = (lx(c.pts[i]!) - station[0]!) / UM_LOBULE; py[i] = (ly(c.pts[i]!) - station[1]!) / UM_LOBULE; }
  for (let i = 1; i < n; i++) arc[i] = arc[i - 1]! + Math.hypot(px[i]! - px[i - 1]!, py[i]! - py[i - 1]!);
  const seg = Math.hypot(px[best.seg + 1]! - px[best.seg]!, py[best.seg + 1]! - py[best.seg]!), arc0 = arc[best.seg]! + seg * best.t;
  // (the tangent at a point: the chord of its neighbours, so the angle runs smoothly along the course)
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); ang[i] = Math.atan2(py[b]! - py[a]!, px[b]! - px[a]!); }
  const t0 = best.seg, dir = Math.cos(ang[t0]!) + Math.cos(ang[t0 + 1]!) >= 0 ? 1 : -1;
  if (dir < 0) for (let i = 0; i < n; i++) ang[i] = ang[i]! + Math.PI;
  return { key: `${c.kind}${c.id}`, course: c, px, py, ang, arc, arc0, dir };
}

/** A point of the course at `x` µm along the flow from the station: where it is (µm, relative to the station) and which way it runs (radians from +x). Past an end it goes on straight. */
export function courseAt(t: DiveTarget, x: number, out: { x: number; y: number; ang: number }): { x: number; y: number; ang: number } {
  const n = t.arc.length, s = t.arc0 + t.dir * x;
  let i = 0;
  while (i < n - 2 && t.arc[i + 1]! < s) i++;
  const a0 = t.arc[i]!, a1 = t.arc[i + 1]!, k = (s - a0) / (a1 - a0 || 1e-9);
  // (past the first or the last point the segment's line goes on: k below 0 or above 1)
  out.x = t.px[i]! + (t.px[i + 1]! - t.px[i]!) * k; out.y = t.py[i]! + (t.py[i + 1]! - t.py[i]!) * k;
  const aa = t.ang[i]!, ab = t.ang[i + 1]!, d = Math.atan2(Math.sin(ab - aa), Math.cos(ab - aa));
  out.ang = aa + d * clamp(k, 0, 1);
  return out;
}

/** Where a cell at `x` µm along the sinusoid's axis and `yd` µm across (down, as 2D has it) stands in the sinusoid's frame for the dive: exactly the sinusoid's own place
   within SPAN_STRAIGHT_UM, on the course's curve
 *  from SPAN_CURVED_UM out, and a smooth blend between. Writes the place (x, y) and the turn of its axes (`rot`, radians) into `out`. */
export function bloodPlace(
  t: DiveTarget, x: number, yd: number, out: { x: number; y: number; rot: number }, tmp: { x: number; y: number; ang: number } = { x: 0, y: 0, ang: 0 },
): { x: number; y: number; rot: number } {
  const m = smooth(SPAN_STRAIGHT_UM, SPAN_CURVED_UM, Math.abs(x)), c = courseAt(t, x, tmp), rot = m * c.ang;
  // (the cell's across offset (the plane's y is up: -yd) turns with the course by the same share)
  const ox = Math.sin(rot) * yd, oy = -Math.cos(rot) * yd;
  out.x = x + m * (c.x - x) + ox; out.y = m * c.y + oy; out.rot = rot;
  return out;
}

export interface DiveBloodFeed {
  /** The camera, the picture's height (CSS px) and the frame's time step (ms). */
  camera: PerspectiveCamera; stageH: number; dtMs: number;
  /** The dive's share (sinusoid/view.ts diveShare) while the camera is really flying with the sinusoid at one end, else null: the gate. */
  share: number | null;
}

/** What the dive's cells need of the lobule's 3D view: its tube's tone (lobule3d.ts setTubeLift). */
export interface TubeTone { setTubeLift(key: string, amount: number): void }

export class DiveBlood {
  readonly group = new Group();
  private readonly many: MicroMany;
  private readonly fade = { value: 0 };
  private readonly rimK = { value: 0 };
  private readonly m4 = new Matrix4();
  private readonly spot: RbcSpot = { x: 0, yd: 0, z: 0, r: 0, fold: 1, rot: 0 };
  private readonly place = { x: 0, y: 0, rot: 0 };
  private readonly tmp = { x: 0, y: 0, ang: 0 };
  private readonly col: [number, number, number] = [0, 0, 0];
  private readonly sinus3d: Sinusoid3D;
  private readonly host: SinusoidView;
  private readonly tone: TubeTone;
  private readonly chain: Object3D[];
  private readonly stationW: readonly [number, number, number] = SIN_POINT;
  private target: DiveTarget | null = null;
  /** How much the dive's gate is open (0 to 1): eased, so a halted move lets the cells go gently. */
  gate = 0;
  /** What was drawn at the last frame: how many cells, their opacity, the width of one on the screen and the tone lift. */
  stats = { cells: 0, shown: 0, widthPx: 0, lift: 0 };

  /** `chain`: the objects whose transforms carry the sinusoid's frame into the lobule's, outermost first (the sinusoid's frame, its host group, the 3D scene's own group): the
     cells are laid in the last one's units,
   *  so along the span they are exactly where the sinusoid's own cells stand, with the same lift and scale it has while the two cross. */
  constructor(shared: CelShared, sinus3d: Sinusoid3D, host: SinusoidView, tone: TubeTone, net: LobuleNet, chain: Object3D[]) {
    this.sinus3d = sinus3d; this.host = host; this.tone = tone;
    this.chain = chain;
    const src = sinus3d.rbcMesh;
    // (the same look as the sinusoid's red cells, the same shape and program: its colour is each cell's own, written in update, its line the sinusoid's)
    this.many = new MicroMany(src.geometry, microMaterials(shared.res, this.fade, { ink: null, rim: CEL_STYLE.MICRO.LINE, rimK: this.rimK }), src.capacity, 'dive-blood/red-cells', true);
    this.many.setTint([1, 1, 1]);
    this.group.add(this.many.group);
    this.group.name = 'dive-blood';
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
    this.target = diveTarget(net);
  }
  /** The dive's red cells' mesh (tests read where each stands). */
  get mesh(): MicroMany { return this.many; }
  get courseKey(): string | null { return this.target?.key ?? null; }
  get courseTarget(): DiveTarget | null { return this.target; }

  /** One frame, after the sinusoid's own (its red cells' places, its group's lift and scale are this frame's). True while something here is still moving (a tone or the gate easing, cells running). */
  update(f: DiveBloodFeed): boolean {
    const tg = this.target;
    const diving = f.share != null && tg != null;
    const goal = diving ? 1 : 0, ease = 1 - Math.exp(-Math.max(0, f.dtMs) / GATE_MS);
    this.gate += (goal - this.gate) * ease;
    if (Math.abs(goal - this.gate) < 1e-3) this.gate = goal;
    const st = this.stats;
    if (!tg || this.gate <= 0) {
      if (st.cells > 0 || this.group.visible) { this.many.commit(0); this.group.visible = false; st.cells = 0; st.shown = 0; st.lift = 0; }
      if (tg) this.tone.setTubeLift(tg.key, 0);
      return false;
    }
    // (the tone: a function of the dive's share; the gate carries it away when the dive ends)
    const share = f.share ?? 1;
    st.lift = tubeLift(share) * this.gate;
    this.tone.setTubeLift(tg.key, st.lift);
    // (the size on the screen: the camera's distance to the sinusoid's place, nothing else)
    const cam = f.camera, e = cam.position, s = this.stationW;
    const k = pxPerUmAt(Math.hypot(e.x - s[0], e.y - s[1], e.z - s[2]), cam.projectionMatrix.elements[5]!, f.stageH);
    st.widthPx = bloodWidthPx(k);
    st.shown = diveBloodShown(k, share) * this.gate;
    this.rimK.value = smooth(RIM_FULL_PX / 3, RIM_FULL_PX, k);
    this.fade.value = st.shown;
    if (st.shown <= 1e-3) { this.many.commit(0); this.group.visible = false; st.cells = 0; return this.gate !== goal; }
    this.stepCells(tg);
    return true;
  }

  private stepCells(tg: DiveTarget): void {
    const host = this.host, flow = host.flowRun, list = this.sinus3d.rbcList, start = this.sinus3d.rbcLaneStart, want = rbcWanted(host.cur.hct).main, spot = this.spot, pl = this.place;
    // (the frame the cells are laid in: the sinusoid's own, composed from the lobule's frame down to the 3D scene's group, as the renderer will compose it)
    const g = this.group.matrix.identity();
    for (const o of this.chain) { o.updateMatrix(); g.multiply(o.matrix); }
    this.group.matrixWorldNeedsUpdate = true;
    // (the sinusoid's red cells' own tint and line: the cells are the same ones)
    const src = this.sinus3d.rbcMesh.mats.toon.uniforms;
    (this.many.mats.toon.uniforms.uRimCol!.value as Color).copy(src.uRimCol!.value as Color);
    const lift = this.sinus3d.group.position.z / U, n0 = start[1]! - start[0]!;
    let n = 0;
    for (let k = 0; k < n0; k++) {
      const have = clamp(want - k, 0, 1);
      if (have <= 0) break;
      const c = list[start[0]! + k]!;
      rbcSpot(c, flow, host.g, have, spot);
      bloodPlace(tg, spot.x, spot.yd, pl, this.tmp);
      const m = smooth(SPAN_STRAIGHT_UM, SPAN_CURVED_UM, Math.abs(spot.x));
      // (along the span the cell is the sinusoid's own, lift and all; out on the course it settles to the plate, the sinusoid's lift taken off: the lobule's own tube is not lifted)
      placeAt(this.m4, 0, 0, 0, spot.r, spot.r * spot.fold, spot.r, spot.rot, c.tilt);
      if (pl.rot !== 0) this.m4.premultiply(this.rotZ(pl.rot));
      const e = this.m4.elements;
      e[12] = pl.x; e[13] = pl.y; e[14] = spot.z - m * lift;
      this.many.setAt(n++, this.m4, this.sinus3d.rbcColourAt(start[0]! + k, this.col));
    }
    this.many.commit(n);
    this.group.visible = n > 0;
    this.stats.cells = n;
  }
  private readonly rz = new Matrix4();
  private rotZ(a: number): Matrix4 { return this.rz.makeRotationZ(a); }

  dispose(): void { this.many.mats.toon.dispose(); this.many.toon.dispose(); }
}

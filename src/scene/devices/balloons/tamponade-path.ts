// The tamponade tube's line and the gastric balloon built on it, as pure numbers (no clock), so tests can walk them in node with the real organ file.
//
// - THE LINE IS LAID FROM THE REAL 3D GE JUNCTION (owner, 26 Nov 2026: "the direction the gastric balloon is being tugged is not right; anterior and posterior views, you can clearly
// see it's missing the GE
//   junction"). The oesophagus above the opening is the 2D app's way carried onto the stomach mesh's oesophagus (which it follows to within a hair); from the opening on, the line is a
//   fillet: it runs straight
//   through the opening's centre along the oesophagus's own direction and turns, on the tube's minimum bend radius (the one path builder, bend-path.ts), into the direction that has
//   room in the lumen (organs/ge-junction.ts,
//   read from the mesh in all three axes). It used to leave the oesophagus's wall before the opening and run on at the 2D app's angle, so from any view but the front it missed the junction.
// - THE GASTRIC BALLOON IS A BODY OF REVOLUTION ABOUT THE TUBE (owner, 26 Nov: "the balloon needs to look symmetrical as it's tugged against the GE junction"): a flattened sphere,
// every ring centred ON the tube's line and round
//   about it, its radius held in by the real stomach wall (the mesh's signed distance, all round the ring, so the same on every side). Drawn up, its upper face is seated over the
//   opening from below: the highest place on
//   the tube where it lies inside the lumen, so its rim is on the cardia and it cannot go further up.
import { Vector3 } from 'three';
import { UNITS_PER_SCENE, x3, y3 } from '../../frame2d.ts';
import { BALLOON } from '../../procedures/copied/balloon-eso.js';
import { GAS, tubePath } from '../../procedures/copied/balloon-gas.js';
import { DEVICE_BEND_RADII, arcOf, filletPath, limitBend, pointAtArc, type V3 } from '../bend-path.ts';
import { ringSides } from '../tube-rings.ts';
import { scopeZ, wayShift } from '../probes/scope.ts';
import { ORGAN_MESHES } from '../../organs/meshes.ts';
import { type GeJunction, geJunction, liftJunction } from '../../organs/ge-junction.ts';
import { ORGAN_Z } from '../../organs/z.ts';

const U = UNITS_PER_SCENE;

/** The tamponade tube's shaft radius (figure units) and the least radius its line may bend with (figure units): the device's own number of radii (bend-path.ts). */
export const TUBE_R = BALLOON.shaftR;
export const TUBE_MIN_BEND = DEVICE_BEND_RADII.tamponade * TUBE_R;
/** The turn is laid a little rounder than the limit, so the line as the scene draws it is still over it. */
const TURN_MARGIN = 1.15;
/** How far from the opening, in figure units, the line is sampled, and how far above the opening the 2D way is trusted (it is the mesh's oesophagus to within a hair, but not at its last stretch). */
const STEP = 2, ABOVE_OPENING = 6;
/** How far above the opening (scene units) the tube is eased over to the point it passes through. */
const ENTRY_LEAD = 0.2;
/** How far the line runs on past the opening (figure units): the tube's draw and the balloon at its deepest are laid on it, with room to spare. */
const LINE_BELOW = 150;

interface Tube2D {
  pts: [number, number][]; arc: number[]; total: number; final: number; p0Arc: number;
  f: { b: number; mouth: [number, number]; poly: [number, number][]; deg: number; dir: [number, number] };
}
export interface TubeLine {
  /** the 2D app's path: what the tube's length, its marks and its balloons' places are counted on (figure units) */
  path: Tube2D;
  /** the line in the scene, top to bottom, and the length along it each sample is at: the 2D path's own down the oesophagus, then figure units along the fillet */
  pts: V3[]; cum: number[];
  /** the junction the line is laid through (the stomach mesh's), or null while the organ file is not in yet (the line is then the 2D way in the scene, and is not kept) */
  junction: GeJunction | null;
  /** the length along the line at the opening's centre */
  opening: number;
  /** the balloon the way was chosen for: its widest half width (scene units) and how far its face is below the opening (figure units) */
  way?: { b: number; drop: number };
}
/** What a balloon is tried on: a line's samples, their lengths (figure units) and the opening's length. */
type TrialLine = Pick<TubeLine, 'pts' | 'cum' | 'opening'>;

/** A figure point as the scene has it: the 2D way carried onto the oesophagus the stomach mesh has (sideways shift) and at the middle of it in depth, as the scope is (probes/scope.ts). */
export function scenePoint(x: number, y: number, out: Vector3): Vector3 {
  const Y = y3(y), X = x3(x) + wayShift(Y);
  return out.set(X, Y, scopeZ(X, Y));
}
const V = new Vector3();
const scene3 = (p: readonly number[]): V3 => { scenePoint(p[0]!, p[1]!, V); return [V.x, V.y, V.z]; };

const kept = new WeakMap<object, TubeLine>();
/** The tube's line. Worked out once per path, once the stomach mesh is in; before that the 2D way, unkept (the device is asked again at the next draw). */
export function tubeLine(path: Tube2D = tubePath() as Tube2D): TubeLine {
  const hit = kept.get(path);
  if (hit) return hit;
  let junction: GeJunction | null = null;
  try { junction = liftJunction(geJunction(ORGAN_MESHES.stomach!()), ORGAN_Z.stomach ?? 0); } catch { junction = null; }
  if (!junction) return { path, pts: path.pts.map(scene3), cum: path.arc.slice(), junction: null, opening: path.p0Arc };
  const line = layLine(path, junction);
  kept.set(path, line);
  return line;
}

/**
 * THE WAY ON IS CHOSEN FOR THE BALLOON (owner, 26 Nov 2026: "the catheter should be middle of the spherical balloon then tugs against GE junction from stomach side and deforms slightly
 * on the GEJ side", and "it has to be contained within the lumen of the stomach/GEJ/esophagus"). The balloon is round about the tube, so where it can sit, and how big it can be, is set
 * by where the tube goes once it is through the opening. Of the turns from the oesophagus's direction (WAY_TURN degrees at most, every azimuth), laid on the tube's own bend radius, the
 * way is the one on which the largest balloon fits wholly inside the lumen, seated (its face SEAT_DROP figure units at most below the opening) and filled deep (the draw further down):
 * a coarse search, then a fine one about the best. A way must hold a balloon a hair bigger than the best so far to win (so the smaller turn wins a tie), and the face is the nearest the
 * opening that holds it.
 */
const WAY_TURN = 60, SEAT_DROP = [2, 5, 8, 11, 14] as const, SIZE_TOLERANCE = 0.3;
interface Way { d: V3; b: number; drop: number }
function seatWay(j: GeJunction, C: V3, R: number, bMax: number): Way {
  const N = j.normal, a: V3 = (() => { const t: V3 = Math.abs(N[0]) < 0.9 ? [0, -N[2], N[1]] : [N[2], 0, -N[0]]; const l = Math.hypot(...t); return [t[0] / l, t[1] / l, t[2] / l]; })();
  const b: V3 = [N[1] * a[2] - N[2] * a[1], N[2] * a[0] - N[0] * a[2], N[0] * a[1] - N[1] * a[0]];
  // (the best so far: a way is only worked on if it holds a balloon a hair bigger, so most are turned down by one try)
  let best: Way = { d: N, b: 0, drop: SEAT_DROP[0] };
  const tryWay = (deg: number, az: number, drops: readonly number[]): void => {
    const th = (Math.max(0, deg) * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th), u = Math.cos(az) * sn, w = Math.sin(az) * sn;
    const d: V3 = [c * N[0] + u * a[0] + w * b[0], c * N[1] + u * a[1] + w * b[1], c * N[2] + u * a[2] + w * b[2]];
    const T = th > 1e-3 ? R * Math.tan(th / 2) : 0, corner: V3 = [C[0] + N[0] * T, C[1] + N[1] * T, C[2] + N[2] * T], far = LINE_BELOW / U;
    const pts = filletPath([C, corner, [corner[0] + d[0] * far, corner[1] + d[1] * far, corner[2] + d[2] * far]], R, STEP / U);
    // (a trial line: the fillet alone, its lengths in figure units from the opening)
    const line: TrialLine = { pts, cum: Array.from(arcOf(pts), (x) => x * U), opening: 0 };
    const holds = (size: number): number => { for (const drop of drops) if (size <= bMax && seated(j, line, drop, size)) return Math.max(0, drop); return -1; };
    let lo = best.b + SIZE_TOLERANCE / U, drop = holds(lo);
    if (drop < 0) return;
    let hi = bMax;
    if (holds(hi) >= 0) lo = hi;
    for (let i = 0; i < 8 && hi - lo > SIZE_TOLERANCE / U / 2; i++) { const m = (lo + hi) / 2; if (holds(m) >= 0) lo = m; else hi = m; }
    drop = holds(lo);
    best = { d, b: lo, drop };
  };
  for (let deg = 0; deg <= WAY_TURN; deg += 10) for (let k = 0; k < (deg ? 12 : 1); k++) tryWay(deg, (k / 12) * Math.PI * 2, SEAT_DROP);
  // (the fine search: about the best of the coarse one, a step either side in turn and azimuth, and the drops either side)
  const coarse = best, cd = coarse.d, cdeg = (Math.acos(Math.min(1, cd[0] * N[0] + cd[1] * N[1] + cd[2] * N[2])) * 180) / Math.PI;
  const caz = Math.atan2(cd[0] * b[0] + cd[1] * b[1] + cd[2] * b[2], cd[0] * a[0] + cd[1] * a[1] + cd[2] * a[2]);
  for (const dd of [-5, 0, 5]) for (const da of [-1, 0, 1]) tryWay(Math.min(WAY_TURN, cdeg + dd), caz + (da * Math.PI) / 12, [coarse.drop - 1.5, coarse.drop, coarse.drop + 1.5]);
  return best;
}

function layLine(path: Tube2D, j: GeJunction): TubeLine {
  const C = j.entry, R = (TUBE_MIN_BEND * TURN_MARGIN) / U, base = j.centre;
  // the oesophagus above the opening: the 2D way's samples that are clear above it, in the scene, with the 2D arc lengths, eased over to the point of the opening the tube passes
  // through (`entry`, the side with the most lumen below)
  const pts: V3[] = [], cum: number[] = [];
  for (let i = 0; i < path.pts.length; i++) {
    const p = scene3(path.pts[i]!);
    if (p[1] < base[1] + ABOVE_OPENING / U) break;
    const h = Math.min(1, (p[1] - base[1]) / ENTRY_LEAD), w = 1 - h * h * (3 - 2 * h);
    pts.push([p[0] + (C[0] - base[0]) * w, p[1] + (C[1] - base[1]) * w, p[2] + (C[2] - base[2]) * w]); cum.push(path.arc[i]!);
  }
  const last = pts[pts.length - 1]!, opening = cum[cum.length - 1]! + Math.hypot(C[0] - last[0], C[1] - last[1], C[2] - last[2]) * U;
  // from the opening: straight on along the oesophagus's direction, then one arc into the lumen. The corner is placed so the arc begins AT the opening (its tangent length is the leg in).
  const N = j.normal, way = seatWay(j, C, R, (path.f.b * GAS_FILL) / U), D = way.d, cos = N[0] * D[0] + N[1] * D[1] + N[2] * D[2], turn = Math.acos(Math.min(1, Math.max(-1, cos)));
  const T = turn > 1e-3 ? R * Math.tan(turn / 2) : 0, remain = LINE_BELOW / U;
  const corner: V3 = [C[0] + N[0] * T, C[1] + N[1] * T, C[2] + N[2] * T], end: V3 = [corner[0] + D[0] * remain, corner[1] + D[1] * remain, corner[2] + D[2] * remain];
  const lay = filletPath([C, corner, end], R, STEP / U);
  // (its length: along the line from the opening, in figure units)
  const tail = arcOf(lay), body: V3[] = [], at: number[] = [];
  for (let i = 0; i < lay.length; i++) { body.push(lay[i]!); at.push(opening + tail[i]! * U); }
  const all = [...pts, ...body], allCum = [...cum, ...at];
  // the one rule for every device path: the line is relaxed to the tube's bend radius wherever the laying left it tighter (the join of the 2D way to the fillet; none, normally)
  const smooth = limitBend(all, { minR: R / TURN_MARGIN, pinEnds: true });
  return { path, pts: smooth, cum: allCum, junction: j, opening, way: { b: way.b, drop: way.drop } };
}

/** The point and the unit direction in the scene at length `s` along the line (the direction across a short stretch either side, so a ring's frame follows the turn and the depth). */
export function lineScene(line: TrialLine, s: number, c: Vector3, t: Vector3): void {
  const a = pointAtArc(line.pts, line.cum, s), e = 2.5, lo = pointAtArc(line.pts, line.cum, Math.max(0, s - e)), hi = pointAtArc(line.pts, line.cum, Math.min(line.cum[line.cum.length - 1]!, s + e));
  c.set(a[0], a[1], a[2]);
  t.set(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  if (t.lengthSq() < 1e-14) t.set(0, -1, 0); else t.normalize();
}
/** The whole line in the scene, one point a sample (what the bend test walks). */
export function lineSceneSamples(line: TubeLine): V3[] { return line.pts.map((p) => [p[0], p[1], p[2]] as V3); }

/**
 * How far the tube is drawn back from where the gastric balloon is filled to where it is seated against the junction (figure units). The balloon is opened with the tube deep in the
 * stomach, in the roomy lumen
 * well below the junction, and only then is the tube withdrawn and the balloon tugged up against the cardia from the stomach side (owner, 26 Nov 2026).
 */
export const PULL = 60;
/** How far the tube is drawn back, for this line: the full draw with the stomach's junction known, the 2D app's small slack before that. */
export const pullOf = (line: TubeLine): number => (line.junction ? PULL : GAS.slack);
/** The share of the gastric balloon's filling (the gas state, 0 to 1) taken up by opening the balloon deep in the stomach; the rest is the withdrawal. */
export const INFLATE_SHARE = 0.5;
const unit01 = (x: number): number => Math.min(1, Math.max(0, x));
/** The balloon's fill `k` and the traction `q` (both raw, 0 to 1) at gas state `gas`: opened first, with no traction, and then withdrawn with the balloon full. */
export function tamponadePhase(gas: number): { k: number; q: number } {
  return { k: unit01(gas / INFLATE_SHARE), q: unit01((gas - INFLATE_SHARE) / (1 - INFLATE_SHARE)) };
}
/** The side of the junction a point is on: its distance past the opening's plane toward the stomach along the oesophagus's direction (scene units; negative is on the oesophagus's side,
  * above the junction). */
export function pastJunction(j: GeJunction, x: number, y: number, z: number): number {
  return (x - j.centre[0]) * j.normal[0] + (y - j.centre[1]) * j.normal[1] + (z - j.centre[2]) * j.normal[2];
}

// ── The gastric balloon ───────────────────────────────
/**
 * A ROUND BALLOON ON THE TUBE, PRESSED A LITTLE FLAT ON THE JUNCTION'S SIDE, AND WHOLLY INSIDE THE LUMEN (owner, 26 Nov 2026, choosing between mocks: "the catheter should be middle of
 * the spherical balloon then tugs against GE junction from stomach size and deforms slightly on the GEJ side", then "it has to be contained within the lumen of the stomach/GEJ/esophagus").
 * Root cause of the two balloons before it: each was made to fit by bending its SHAPE to the wall (a ball clipped ring by ring, a cup; then an oval squashed in depth and pushed off the
 * tube, an acorn), because the tube's way into the stomach was chosen for the lumen's average room and not for the balloon. Here the shape never bends: it is a sphere about the tube
 * (every ring a circle centred on the line), its junction side GAS_FACE of its radius deep (a slightly flattened cap). What the wall decides is only how big it is and where the tube
 * goes (`seatWay`): the way on through the opening is the one on which the largest such balloon fits wholly inside the lumen, both seated and filled deep, never touching the wall.
 */
/** The balloon's junction side, as a share of its radius: 1 would be a sphere, under 1 the cap the cardia presses a little flat. */
export const GAS_FACE = 0.8;
/** The balloon's length over its widest half width: the radius below the equator and GAS_FACE of it above. */
export const GAS_LENGTH_RATIO = 1 + GAS_FACE;
/** How square the junction side's cap is (2 is an ellipse; above it the cap flattens a little more, as a balloon pressed on a wall does). */
export const GAS_TOP_POWER = 2.4;
/** The share of the 2D app's full size (GAS.bMax) the balloon may fill to: the most the search tries. */
export const GAS_FILL = 0.8;
/** How far inside the wall every point of the balloon is held (scene units): the mesh's distance field is good to under a figure unit, so a point read elsewhere is still inside. */
export const WALL_HOLD = 0.5 / U;
/** The points round a ring, and the rings along the balloon, when a balloon is tried against the wall. */
const AROUND = 20, TRIAL_RINGS = 13;
export interface GasRing {
  /** the length along the line */
  s: number;
  /** the centre, in the scene: on the tube's line */
  c: V3;
  /** the unit direction of the tube there */
  t: V3;
  /** the half width, scene units (the ring is a circle, so the same toward the viewer: `rd`) */
  r: number;
  rd: number;
  want: number;
}

/** Where the widest ring is, as a share of the length from the junction side's pole. */
const EQUATOR = GAS_FACE / GAS_LENGTH_RATIO;
/** The shape's half width at u (0 the junction side's pole, 1 the far one) for a balloon of widest half width b (scene units): the slightly flattened cap above the equator, a
  * hemisphere below, a sheath of the collapsed balloon's width at each pole. Smooth: no step anywhere. */
export function gasProfile(u: number, b: number): number {
  const top = u < EQUATOR, x = top ? (EQUATOR - u) / EQUATOR : (u - EQUATOR) / (1 - EQUATOR), p = top ? GAS_TOP_POWER : 2, neck = GAS.neck / U;
  return neck + Math.max(0, b - neck) * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, x), p)), 1 / p);
}
/** The balloon's length (scene units) for its widest half width b. */
export const gasLength = (b: number): number => GAS_LENGTH_RATIO * b;

const tmpC = new Vector3(), tmpT = new Vector3(), sideA = new Vector3(), sideB = new Vector3();
/** The rings of a balloon of widest half width b (scene units) with its junction side's pole at length `top` along the line, n of them, closest together at the two poles. */
function rings(line: TrialLine, top: number, b: number, n: number): GasRing[] {
  const length = gasLength(b) * U, out: GasRing[] = [], total = line.cum[line.cum.length - 1]!;
  for (let i = 0; i < n; i++) {
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1)), s = Math.min(total, top + length * u);
    lineScene(line, s, tmpC, tmpT);
    const r = Math.max(TUBE_R / U, gasProfile(u, b));
    out.push({ s, c: [tmpC.x, tmpC.y, tmpC.z], t: [tmpT.x, tmpT.y, tmpT.z], r, rd: r, want: r });
  }
  return out;
}
/** Whether every point of a balloon of widest half width b with its pole at `top` is inside the lumen (WALL_HOLD inside the wall) and on the stomach's side of the junction. */
function fits(j: GeJunction, line: TrialLine, top: number, b: number): boolean {
  const rs = rings(line, top, b, TRIAL_RINGS);
  // (the widest rings first: they are the ones that fail)
  for (const g of rs.slice().sort((p, q) => q.r - p.r)) {
    ringSides(tmpT.set(g.t[0], g.t[1], g.t[2]), sideA, sideB);
    for (let k = 0; k < AROUND; k++) {
      const th = (k / AROUND) * Math.PI * 2, ca = Math.cos(th) * g.r, cb = Math.sin(th) * g.r;
      const x = g.c[0] + sideA.x * ca + sideB.x * cb, y = g.c[1] + sideA.y * ca + sideB.y * cb, z = g.c[2] + sideA.z * ca + sideB.z * cb;
      if (j.clearance(x, y, z) < WALL_HOLD || pastJunction(j, x, y, z) < 0) return false;
    }
  }
  return true;
}
/** The largest balloon (widest half width, scene units, bMax at most; 0 if not even a small one) that fits with its pole `drop` figure units below the opening, seated and filled deep. */
function seated(j: GeJunction, line: TrialLine, drop: number, b: number): boolean {
  const top = line.opening + Math.max(0, drop);
  return fits(j, line, top, b) && fits(j, line, top + PULL, b);
}
function largestFit(j: GeJunction, line: TrialLine, drop: number, bMax: number): number {
  const both = (b: number): boolean => seated(j, line, drop, b);
  let lo = (2 * GAS.neck) / U, hi = bMax;
  if (!both(lo)) return 0;
  if (both(hi)) return hi;
  for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (both(m)) lo = m; else hi = m; }
  return lo;
}

interface Seat {
  /** the widest half width of the full balloon (scene units): the same at every traction */
  b: number;
  /** its junction side's pole's length along the line when it is drawn up */
  top: number;
}
const seats = new WeakMap<TubeLine, Seat>();
/** The seat for this line: the balloon the way was chosen for, checked on the line as laid (and made smaller if the laying moved it onto the wall); the full balloon on the opening
  * where the junction is not known yet (it is not kept). */
export function gasSeat(line: TubeLine): Seat {
  const hit = seats.get(line);
  if (hit) return hit;
  const j = line.junction, bMax = (line.path.f.b * GAS_FILL) / U;
  if (!j || !line.way) return { b: bMax, top: line.opening };
  const top = line.opening + line.way.drop;
  const b = seated(j, line, line.way.drop, line.way.b) ? line.way.b : largestFit(j, line, line.way.drop, line.way.b);
  const seat = { b: Math.max((2 * GAS.neck) / U, b), top };
  seats.set(line, seat);
  return seat;
}
/** Where the balloon's junction side is along the line for the traction at q (0 let go: it sits the whole draw further down the tube; 1 drawn up, seated). */
export function gasTop(line: TubeLine, q: number): number {
  return gasSeat(line).top + pullOf(line) * (1 - unit01(q));
}

/** The tube's length with its tip at rest, drawn up (balloon seated, then the tail of the tube past it), and with the tip as deep as it goes (the balloon filled deep in the stomach):
  * lengths along the line, figure units. */
export function tubeEnds(line: TubeLine): { final: number; total: number } {
  if (!line.junction) return { final: line.path.final, total: line.path.total };
  const seat = gasSeat(line), final = seat.top + gasLength(seat.b) * U + GAS.tail;
  return { final, total: final + PULL };
}
/** Where the tube's tip is, as a length along the line, for how far it is in (adv, 0 to 1) and the traction (q, 0 to 1): in to its deepest, then withdrawn by the draw. */
export function lineTip(line: TubeLine, adv: number, q: number): number {
  const g = unit01(adv);
  return g * tubeEnds(line).total - pullOf(line) * unit01(q) * g;
}

/** The gastric balloon at inflation `k` (0 collapsed on the tube … 1 full) and traction `q` (0 let go … 1 drawn up, seated against the cardia) as `n` round rings on the line. */
export function gasRings(line: TubeLine, k: number, q: number, n: number): GasRing[] {
  const seat = gasSeat(line), neck = GAS.neck / U, b = neck + (seat.b - neck) * unit01(k);
  return rings(line, gasTop(line, q), b, n);
}

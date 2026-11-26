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
import { scopeZ, wayShift } from '../probes/scope.ts';
import { ORGAN_MESHES } from '../../organs/meshes.ts';
import { type GeJunction, geJunction } from '../../organs/ge-junction.ts';

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
/** Where the balloon is filled deep, measured down the line from the opening (figure units): the stretch whose room steers the tube's way on, and the least room it must have (figure
  * units) within which a smaller turn is as good. */
const BALLOON_ZONE = [50, 95] as const, ROOM_TOLERANCE = 1.5;

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
}

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
  try { junction = geJunction(ORGAN_MESHES.stomach!()); } catch { junction = null; }
  if (!junction) return { path, pts: path.pts.map(scene3), cum: path.arc.slice(), junction: null, opening: path.p0Arc };
  const line = layLine(path, junction);
  kept.set(path, line);
  return line;
}

/**
 * The direction the tube goes on in once through the opening: of the turns from the oesophagus's direction (70 degrees at most) the one whose rounded line, as it will be laid on the
 * tube's own bend radius, has the most
 * room (on average) all round where the balloon is filled deep (BALLOON_ZONE, figure units from the opening); of those with room within a hair of the best, the smallest turn. The tube
 * runs along the stomach's wall at the cardia,
 * which is thin there, so the line is steered by how soon it reaches the roomy lumen, not by a straight ray.
 */
function wayOn(j: GeJunction, C: V3, R: number): V3 {
  const N = j.normal, a: V3 = (() => { const t: V3 = Math.abs(N[0]) < 0.9 ? [0, -N[2], N[1]] : [N[2], 0, -N[0]]; const l = Math.hypot(...t); return [t[0] / l, t[1] / l, t[2] / l]; })();
  const b: V3 = [N[1] * a[2] - N[2] * a[1], N[2] * a[0] - N[0] * a[2], N[0] * a[1] - N[1] * a[0]];
  const tries: { d: V3; deg: number; room: number }[] = [];
  for (let deg = 0; deg <= 70; deg += 5) {
    const th = (deg * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th), T = deg ? R * Math.tan(th / 2) : 0;
    for (let k = 0; k < (deg ? 24 : 1); k++) {
      const ph = (k / 24) * Math.PI * 2, u = Math.cos(ph) * sn, w = Math.sin(ph) * sn;
      const d: V3 = [c * N[0] + u * a[0] + w * b[0], c * N[1] + u * a[1] + w * b[1], c * N[2] + u * a[2] + w * b[2]];
      const corner: V3 = [C[0] + N[0] * T, C[1] + N[1] * T, C[2] + N[2] * T], far = BALLOON_ZONE[1] / U + T;
      const lay = filletPath([C, corner, [corner[0] + d[0] * far, corner[1] + d[1] * far, corner[2] + d[2] * far]], R, STEP / U), at = arcOf(lay);
      let sum = 0, n = 0;
      for (let i = 0; i < lay.length; i++) if (at[i]! * U >= BALLOON_ZONE[0] && at[i]! * U <= BALLOON_ZONE[1]) { sum += j.clearance(lay[i]![0], lay[i]![1], lay[i]![2]); n++; }
      tries.push({ d, deg, room: n ? sum / n : -1 });
    }
  }
  const best = Math.max(...tries.map((x) => x.room));
  return tries.filter((x) => x.room >= best - ROOM_TOLERANCE / U).reduce((m, x) => (x.deg < m.deg ? x : m)).d;
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
  const N = j.normal, D = wayOn(j, C, R), cos = N[0] * D[0] + N[1] * D[1] + N[2] * D[2], turn = Math.acos(Math.min(1, Math.max(-1, cos)));
  const T = turn > 1e-3 ? R * Math.tan(turn / 2) : 0, remain = LINE_BELOW / U;
  const corner: V3 = [C[0] + N[0] * T, C[1] + N[1] * T, C[2] + N[2] * T], end: V3 = [corner[0] + D[0] * remain, corner[1] + D[1] * remain, corner[2] + D[2] * remain];
  const lay = filletPath([C, corner, end], R, STEP / U);
  // (its length: along the line from the opening, in figure units)
  const tail = arcOf(lay), body: V3[] = [], at: number[] = [];
  for (let i = 0; i < lay.length; i++) { body.push(lay[i]!); at.push(opening + tail[i]! * U); }
  const all = [...pts, ...body], allCum = [...cum, ...at];
  // the one rule for every device path: the line is relaxed to the tube's bend radius wherever the laying left it tighter (the join of the 2D way to the fillet; none, normally)
  const smooth = limitBend(all, { minR: R / TURN_MARGIN, pinEnds: true });
  return { path, pts: smooth, cum: allCum, junction: j, opening };
}

/** The point and the unit direction in the scene at length `s` along the line (the direction across a short stretch either side, so a ring's frame follows the turn and the depth). */
export function lineScene(line: TubeLine, s: number, c: Vector3, t: Vector3): void {
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
/** The balloon's length over its widest half width: under 2 is a flattened sphere (the 2D app's pear was 2.9, a long pear). */
export const GAS_LENGTH_RATIO = 1.5;
/** How square its two faces are (2 is an ellipse; above it the faces flatten, the upper one lying flat against the cardia). */
export const GAS_FACE_POWER = 2.2;
/** The share of the 2D app's full size (GAS.bMax) the balloon is filled to when the stomach has room for it. */
export const GAS_FILL = 0.8;
/** How far the balloon's skin may press into the wall (scene units, a negative standoff): the soft wall gives one figure unit, so a ring held in by the wall touches it. */
export const SKIN = -1 / U;
/** What the mesh's distance field may be out by (scene units, under a figure unit): the rings are held this far inside the skin's limit, so a ring read at other points still lies within it. */
const FIELD_ERROR = 0.6 / U;
/** The ring's samples round it when the wall is read. */
const AROUND = 32;
export interface GasRing {
  /** the length along the line */
  s: number;
  /** the centre, in the scene */
  c: V3;
  /** the unit direction of the tube there */
  t: V3;
  /** the radius, scene units */
  r: number;
  /** the shape's radius before the wall held it in */
  want: number;
}

/** The shape's half width at u (0 the upper face, 1 the lower) for a balloon of widest half width b (scene units): a flattened sphere, a sheath of the tube's width at each pole. */
export function gasProfile(u: number, b: number): number {
  const x = Math.abs(2 * u - 1), p = GAS_FACE_POWER, neck = GAS.neck / U;
  return neck + (b - neck) * Math.pow(Math.max(0, 1 - Math.pow(x, p)), 1 / p);
}
/** The balloon's length (scene units) for its widest half width b. */
export const gasLength = (b: number): number => GAS_LENGTH_RATIO * b;

const tmpC = new Vector3(), tmpT = new Vector3();
/** The ring of radius r about the centre c, perpendicular to t: the samples of its circle (scene units). */
function ringPoints(c: V3, t: V3, r: number, out: V3[]): V3[] {
  const tx = t[0], ty = t[1], tz = t[2];
  // a side direction that is not along t
  let sx = 0, sy = 0, sz = 1;
  if (Math.abs(tz) > 0.9) { sx = 1; sy = 0; sz = 0; }
  let ax = ty * sz - tz * sy, ay = tz * sx - tx * sz, az = tx * sy - ty * sx;
  const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
  const bx = ty * az - tz * ay, by = tz * ax - tx * az, bz = tx * ay - ty * ax;
  for (let k = 0; k < AROUND; k++) {
    const th = (k / AROUND) * Math.PI * 2, ct = Math.cos(th) * r, st = Math.sin(th) * r;
    out[k] = [c[0] + ax * ct + bx * st, c[1] + ay * ct + by * st, c[2] + az * ct + bz * st];
  }
  return out;
}
const around: V3[] = new Array(AROUND);
/** How far past the junction's plane a point of the balloon must be (scene units): none of it may be on the oesophagus's side, whatever the wall says (half a figure unit, for the rim
  * of a tilted ring). */
const PLANE = -0.5 / U;
/** The widest radius at most `cap` that a ring centred at c (axis t) can have with every point of it at least SKIN inside the lumen and on the stomach side of the junction (the same
  * all the way round). */
function roomAt(j: GeJunction, c: V3, t: V3, cap: number): number {
  const hold = SKIN + FIELD_ERROR;
  if (j.clearance(c[0], c[1], c[2]) < hold || pastJunction(j, c[0], c[1], c[2]) < PLANE) return 0;
  const fits = (r: number): boolean => { ringPoints(c, t, r, around); return around.every((p) => j.clearance(p[0], p[1], p[2]) >= hold && pastJunction(j, p[0], p[1], p[2]) >= PLANE); };
  if (fits(cap)) return cap;
  let lo = 0, hi = cap;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
  return lo;
}

/** The rings of a balloon of widest half width b (scene units) with its upper face at length `top` along the line, n of them, closest together at the two faces, before the wall holds them in. */
function shapeRings(line: TubeLine, top: number, b: number, n: number): GasRing[] {
  const length = gasLength(b) * U, out: GasRing[] = [], total = line.cum[line.cum.length - 1]!;
  for (let i = 0; i < n; i++) {
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1)), s = Math.min(total, top + length * u);
    lineScene(line, s, tmpC, tmpT);
    out.push({ s, c: [tmpC.x, tmpC.y, tmpC.z], t: [tmpT.x, tmpT.y, tmpT.z], r: gasProfile(u, b), want: gasProfile(u, b) });
  }
  return out;
}
interface Seat { /** the widest half width of the full balloon (scene units) */ b: number; /** its upper face's length along the line when it is drawn up */ top: number }
const seats = new WeakMap<TubeLine, Seat>();
/**
 * The full balloon drawn up against the junction: the 2D app's size (GAS_FILL of it), its upper face at the opening's plane, as high as the tube can draw it and stay on the stomach's
 * side. Opened deep in the roomy
 * lumen it is the full round shape; drawn up, the wall round the cardia holds each ring in (`gasRings`), so the cone of its face is pressed into the junction and the body swells below it.
 */
export function gasSeat(line: TubeLine): Seat {
  const hit = seats.get(line);
  if (hit) return hit;
  const seat = { b: (line.path.f.b * GAS_FILL) / U, top: line.opening };
  if (line.junction) seats.set(line, seat);
  return seat;
}
/** Where the balloon's upper face is along the line for the traction at q (0 let go: it sits GAS.slack down the tube; 1 drawn up, seated). */
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

/**
 * The gastric balloon at inflation `k` (0 collapsed on the tube … 1 full) and traction `q` (0 let go … 1 drawn up, seated over the opening) as `n` rings along the line. Each ring is
 * centred on the line and a circle about it,
 * its radius the shape's held in by the real wall all round it (so the same on every side).
 */
export function gasRings(line: TubeLine, k: number, q: number, n: number): GasRing[] {
  const seat = gasSeat(line), neck = GAS.neck / U, b = neck + (seat.b - neck) * k, j = line.junction;
  return shapeRings(line, gasTop(line, q), b, n).map((r) => ({ ...r, r: Math.max(TUBE_R / U, j ? Math.min(r.want, roomAt(j, r.c, r.t, r.want)) : r.want) }));
}

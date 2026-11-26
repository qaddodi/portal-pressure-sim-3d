// The tamponade tube's line and the gastric balloon built on it, as pure numbers in the figure's units (no scene, no clock), so tests can walk them in node.
//
// - THE TUBE'S LINE (owner, 26 Nov 2026: "the Blakemore gastric balloon going down into the stomach is an acute KINK ... they don't kink like that"). The 2D app's path (balloon-gas.js
// `tubePath`, copied, never edited) turns
// from the oesophagus into the stomach on a circle of 16 figure units, 20 tube radii: an elbow on screen. The path goes through the one path builder (bend-path.ts `limitBend`) with the
// tamponade tube's minimum bend
// radius, so it takes the turn at the GE junction over about the oesophagus's own width; the samples keep their order, so a length along the 2D path (the marks, the balloons' places, the
// tip) still names the same place.
// - THE GASTRIC BALLOON IS A BODY OF REVOLUTION ABOUT THE TUBE (owner, 26 Nov: "the balloon itself also needs to look symmetrical as it's tugged against the GE junction"). It was cut from
// the 2D pear pressed on the wall,
// each ring the span of the outline across the axis, so a wall on one side thinned it on that side only and it hung off the tube. Now every ring is centred ON the tube's line and round
// about it, and its radius is the
// shape's (a flattened sphere, the flat face up at the cardia) held in by the wall on BOTH sides alike (the nearer wall's room: the stomach as drawn, the standoff at the junction), so it
// can only be symmetric.
import { Vector3 } from 'three';
import { UNITS_PER_SCENE, x3, y3 } from '../../frame2d.ts';
import { BALLOON, esoAt } from '../../procedures/copied/balloon-eso.js';
import { GAS, clearance, standoffAt, tubePath } from '../../procedures/copied/balloon-gas.js';
import { DEVICE_BEND_RADII, arcOf, limitBend, pointAtArc, type V3 } from '../bend-path.ts';
import { scopeZ, wayShift } from '../probes/scope.ts';

const U = UNITS_PER_SCENE;

/** The tamponade tube's shaft radius (figure units) and the least radius its line may bend with (figure units): the device's own number of radii (bend-path.ts). */
export const TUBE_R = BALLOON.shaftR;
export const TUBE_MIN_BEND = DEVICE_BEND_RADII.tamponade * TUBE_R;
/** How far from the 2D line the tube may go to take its turn (figure units): the oesophagus is about 40 wide, so the line stays well inside it. */
const TURN_ROOM = 14;
/** The turn is worked out a little rounder than the limit, so the same turn carried into the scene (the oesophagus's sideways shift and the depth of the middle) is still over it. */
const TURN_MARGIN = 1.15;

interface Tube2D {
  pts: [number, number][]; arc: number[]; total: number; final: number; p0Arc: number;
  f: { b: number; mouth: [number, number]; poly: [number, number][]; deg: number; dir: [number, number] };
}
export interface TubeLine {
  /** the 2D app's path (its length along it is the parameter everything on the tube uses) */
  path: Tube2D;
  /** the path's samples after the turn is rounded: the same samples, in the same order, as `path.pts` */
  pts: V3[];
}
const kept = new WeakMap<object, TubeLine>();
/** The tube's line: the 2D path with its turn at the cardia rounded to the tube's minimum bend radius. Worked out once per path. */
export function tubeLine(path: Tube2D = tubePath() as Tube2D): TubeLine {
  const hit = kept.get(path);
  if (hit) return hit;
  const flat: V3[] = path.pts.map((p) => [p[0], p[1], 0] as V3);
  const out: TubeLine = { path, pts: limitBend(flat, { minR: TUBE_MIN_BEND * TURN_MARGIN, room: TURN_ROOM }) };
  kept.set(path, out);
  return out;
}

/** The point and the unit direction (figure units, y down as the 2D app has it) at length `s` along the 2D path, on the rounded line. */
export function lineAt(line: TubeLine, s: number): { p: [number, number]; t: [number, number] } {
  const a = pointAtArc(line.pts, line.path.arc, s), e = 1.5;
  const lo = pointAtArc(line.pts, line.path.arc, Math.max(0, s - e)), hi = pointAtArc(line.pts, line.path.arc, Math.min(line.path.total, s + e));
  const dx = hi[0] - lo[0], dy = hi[1] - lo[1], l = Math.hypot(dx, dy) || 1;
  return { p: [a[0], a[1]], t: [dx / l, dy / l] };
}

/** A figure point as the scene has it: the 2D way carried onto the oesophagus the stomach mesh has (sideways shift) and at the middle of it in depth, as the scope is (probes/scope.ts). */
export function scenePoint(x: number, y: number, out: Vector3): Vector3 {
  const Y = y3(y), X = x3(x) + wayShift(Y);
  return out.set(X, Y, scopeZ(X, Y));
}
const A = new Vector3(), B = new Vector3();
/** The tube's line at length `s` in the scene: the point, and the unit direction across a short stretch either side (3D, so a ring's frame follows the turn and the depth). */
export function lineScene(line: TubeLine, s: number, c: Vector3, t: Vector3): void {
  const e = 2.5, p = lineAt(line, s).p, lo = lineAt(line, Math.max(0, s - e)).p, hi = lineAt(line, Math.min(line.path.total, s + e)).p;
  scenePoint(p[0], p[1], c);
  scenePoint(lo[0], lo[1], A); scenePoint(hi[0], hi[1], B);
  t.subVectors(B, A);
  if (t.lengthSq() < 1e-14) t.set(0, -1, 0); else t.normalize();
}
/** The whole line in the scene, one point a sample (what the bend test walks). */
export function lineSceneSamples(line: TubeLine): V3[] {
  return line.pts.map((p) => { const v = scenePoint(p[0], p[1], new Vector3()); return [v.x, v.y, v.z] as V3; });
}

// ── The gastric balloon ───────────────────────────────
/** The balloon's length over its widest half width: under 2 is a flattened sphere (the 2D app's pear was 2.9, a long pear). */
export const GAS_LENGTH_RATIO = 1.5;
/** How square its two faces are (2 is an ellipse; above it the faces flatten, the upper one lying flat against the cardia). */
export const GAS_FACE_POWER = 2.2;
/** The share of the 2D app's full size (GAS.bMax, as the stomach's fit has it) the balloon is filled to: the room under the roof at the cardia is what a body round the tube has, and
    it is the same on both sides. */
export const GAS_FILL = 0.8;
/** How far from the stomach's wall the balloon's skin stops (the wall's own standoff, `standoffAt`, less a hair): its rim lies against the junction without going through it. */
const SKIN_SLACK = 0.15;
export interface GasRing { s: number; c: [number, number]; t: [number, number]; r: number; /** the shape's radius before the wall held it in */ want: number }

/** The shape's half width at u (0 the upper face, 1 the lower) for a balloon of widest half width b: a flattened sphere, a sheath of half width `neck` at each pole. */
export function gasProfile(u: number, b: number): number {
  const x = Math.abs(2 * u - 1), p = GAS_FACE_POWER;
  return GAS.neck + (b - GAS.neck) * Math.pow(Math.max(0, 1 - Math.pow(x, p)), 1 / p);
}
/** The balloon's length (figure units): fixed by the full size, as the 2D pear's is, so a balloon filling widens on the length it has. */
export const gasLength = (bFull: number): number => GAS_LENGTH_RATIO * bFull;

/** Whether a balloon of widest half width `b` with its upper face at length `top` along the tube lies inside the stomach as drawn, the same on both sides of the tube. */
export function fitsAt(line: TubeLine, top: number, b: number, n = 40): boolean {
  const { poly, mouth } = line.path.f, length = gasLength(b);
  for (let i = 0; i < n; i++) {
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1)), { p, t } = lineAt(line, top + length * u), r = gasProfile(u, b);
    if (clearance(p, poly) < standoffAt(p, mouth)) return false;
    for (const sg of [1, -1]) {
      const q: [number, number] = [p[0] - t[1] * r * sg, p[1] + t[0] * r * sg];
      if (clearance(q, poly) < standoffAt(q, mouth) - SKIN_SLACK) return false;
    }
  }
  return true;
}
interface Seat { /** the widest half width of the full balloon */ b: number; /** its upper face's length along the tube when it is drawn up */ top: number }
const seats = new WeakMap<TubeLine, Seat>();
/**
 * The full balloon drawn up against the junction: the highest place along the tube where a balloon of the full size (GAS_FILL of the 2D app's) lies inside the stomach on both sides
 * alike. Above it the oesophagus
 * and the roof round the opening are in the way; at it the rim is on the wall, which is what drawn up against the cardia is. Worked out once per line (a stomach too small for the
 * size has the largest that fits).
 */
export function gasSeat(line: TubeLine): Seat {
  const hit = seats.get(line);
  if (hit) return hit;
  const { p0Arc, total, f } = line.path;
  let seat: Seat | null = null;
  for (let b = f.b * GAS_FILL; !seat && b > GAS.neck * 2; b *= 0.85) {
    for (let top = p0Arc - 12; top < total - gasLength(b) - 8; top += 0.5) if (fitsAt(line, top, b)) { seat = { b, top }; break; }
  }
  seat ||= { b: GAS.neck * 2, top: p0Arc };
  seats.set(line, seat);
  return seat;
}
/** Where the balloon's upper face is along the tube for the traction at q (0 let go: it sits GAS.slack down the tube; 1 drawn up, its face at the junction). */
export function gasTop(line: TubeLine, q: number): number {
  return gasSeat(line).top + GAS.slack * (1 - Math.min(1, Math.max(0, q)));
}

/** The widest half width the stomach leaves a ring centred at `c` with its axis `t`, at most `cap`: held to the standoff of the wall on both sides alike. */
function roomAt(c: [number, number], t: [number, number], cap: number, poly: [number, number][], mouth: [number, number]): number {
  const nx = -t[1], ny = t[0];
  const fits = (r: number): boolean => [1, -1].every((sg) => {
    const q: [number, number] = [c[0] + nx * r * sg, c[1] + ny * r * sg];
    return clearance(q, poly) >= standoffAt(q, mouth) - SKIN_SLACK;
  });
  if (clearance(c, poly) < standoffAt(c, mouth)) return 0;
  if (fits(cap)) return cap;
  let lo = 0, hi = cap;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
  return lo;
}

/**
 * The gastric balloon at inflation `k` (0 collapsed on the tube … 1 full) and traction `q` (0 let go … 1 drawn up against the junction) as `n` rings along the tube's line, closest
 * together at the two faces. Each ring is
 * centred on the line and round about it: the body of revolution about the tube. Its radius is the shape's, held in by the wall on both sides alike (at the seat the shape fits, so
 * the wall takes nothing off it).
 */
export function gasRings(line: TubeLine, k: number, q: number, n: number): GasRing[] {
  const { f, total } = line.path, seat = gasSeat(line), b = GAS.neck + (seat.b - GAS.neck) * k, length = gasLength(seat.b);
  const top = gasTop(line, q), out: GasRing[] = [];
  for (let i = 0; i < n; i++) {
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1)), s = Math.min(total, top + length * u), { p, t } = lineAt(line, s);
    const want = gasProfile(u, b), room = roomAt(p, t, want, f.poly, f.mouth);
    // (never narrower than the tube, and never through the wall)
    out.push({ s, c: p, t, r: Math.max(TUBE_R, Math.min(want, room)), want });
  }
  return out;
}
void esoAt; void U;

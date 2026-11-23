// A BEND FLOOR for every drawn course (23 Nov, Mohammad: the shunts' elbows are "blocky", the renal vein's hairpin, the notch at the SMV). ROOT CAUSE: a tube swept round a bend whose radius is under about twice its own radius folds its inner wall, and the cel bands and the ink draw the fold as a corner.
// The 2D art's courses bend as a thin ribbon can, with hooks into their hosts (copied verbatim, paths.copied.ts), and the depth ease (shape.ts to3) bounded only the SLOPE of a dive, never its curvature: the shunts (the 'over' tier) drop 21 units to the cava or the renal tier over a quarter of their length.
// Measured on the 3D courses, tightest bend radius over the tube's radius: S_PC 0.7, S_MC 0.8, S_DSR 0.9 to 1.0, LHV_IVC 0.9, RHV_IVC 0.9, C5 0.9, and a few more under 2. The cure is at the course (never in a shader). It was first tried at the depth ease too (a longer smoothstep, 6 dz / S^2 peak curvature); that moved the seam rings of the cava wall skin and the planner refused it (6 seam loops for 4 arms), and the fairing alone clears every course by a move of under a quarter of a tube radius, so only this remains:
//   - `fairBends` (in 3D, so the depth dives too) relaxes the points of any stretch that still bends under the floor (the ends held where they are, so the end stays on its host) until every vertex clears it. A course that clears it is returned as it was, bit for bit, so its skins and its baked digest do not move.
// Pure: points and numbers. Only with smooth joins on (shape.ts): the 2D rule's own courses (the Circuit's map, the ring counts) keep the art's path.
import { CatmullRomCurve3, Vector3 } from 'three';
import type { Vec3 } from '../anatomy/vessels.ts';

/** The tightest bend a course may have, in its tube's radii: a tube bent tighter shows a corner. */
export const BEND_MIN_R = 2;
/** The fairing aims a little above the floor, so the tube's own spline (which rounds a kink a little differently from the polyline) still clears it. */
export const BEND_AIM_R = 2.3;
/** Relaxation: the share of the way to the neighbours' midpoint a point of a failing stretch moves each round, how far (in points) the stretch reaches past a failing vertex, how that reach grows each hundred rounds, and the most rounds. */
const RELAX = 0.5, REACH0 = 3, ROUNDS = 400;

const sub = (a: Vec3, b: Vec3): number[] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: readonly number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);

/** The radius of the circle through three points (Infinity for a straight run). */
export function circumradius(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a), bc = sub(c, b), ac = sub(c, a);
  const cx = ab[1]! * bc[2]! - ab[2]! * bc[1]!, cy = ab[2]! * bc[0]! - ab[0]! * bc[2]!, cz = ab[0]! * bc[1]! - ab[1]! * bc[0]!, cr = Math.hypot(cx, cy, cz);
  return cr > 1e-14 ? (len(ab) * len(bc) * len(ac)) / (2 * cr) : Infinity;
}

/** How far apart (in radii) the samples of a course's curvature stand: the rings of a tube are about that far apart (shape.ts tubularFor), so a bend finer than that is not drawn. */
const SAMPLE_R = 0.5;

/** The radius of curvature along the tube's own spline (the CatmullRom the tube is swept on), sampled every `SAMPLE_R` radii of arc: `u` the share of the course's length, `rho` the circle through three neighbouring samples. */
export function bendSamples(pts: readonly Vec3[], R: number): { u: number; rho: number }[] {
  if (pts.length < 3 || !(R > 0)) return [];
  const curve = new CatmullRomCurve3(pts.map((q) => new Vector3(q[0], q[1], q[2]))), L = curve.getLength(), n = Math.max(4, Math.ceil(L / (SAMPLE_R * R)));
  const P: Vec3[] = [];
  for (let i = 0; i <= n; i++) { const q = curve.getPointAt(i / n); P.push([q.x, q.y, q.z]); }
  const out: { u: number; rho: number }[] = [];
  for (let i = 1; i < n; i++) out.push({ u: i / n, rho: circumradius(P[i - 1]!, P[i]!, P[i + 1]!) });
  return out;
}

/** The tightest bend of a course in its tube's radii (Infinity for a straight one), and where it is (a share of the course's length). */
export function tightestBend(pts: readonly Vec3[], R: number): { ratio: number; u: number } {
  let ratio = Infinity, u = 0;
  for (const s of bendSamples(pts, R)) if (s.rho / R < ratio) { ratio = s.rho / R; u = s.u; }
  return { ratio, u };
}

/**
 * The course with every bend at least `BEND_MIN_R` radii of its tube (`R`): the same array when it already is. The first and last point never move. `ends`: only the first and last `ends` scene units of the course are faired (a coiling vessel's middle is the coil, which bends as it likes);
 * with none the whole course is. The points within `REACH` of a place that bends under the floor relax toward their neighbours' midpoints round after round, the reach growing as the rounds go on, until every sample of the spline clears the floor (or the rounds run out: the least bent version is returned).
 */
export function fairBends(pts: readonly Vec3[], R: number, ends?: number): Vec3[] {
  const n = pts.length;
  if (!(R > 0) || n < 3) return pts as Vec3[];
  const aim = BEND_AIM_R * R, floor = BEND_MIN_R * R;
  // each vertex's share of the polyline's length (a sample of the spline at the same share lies at the vertex, near enough to say which vertices to relax)
  const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + len(sub(pts[i]!, pts[i - 1]!)));
  const total = cum[n - 1]! || 1;
  let free: boolean[] = pts.map(() => true);
  if (ends !== undefined) free = pts.map((_, i) => cum[i]! <= ends || total - cum[i]! <= ends);
  const worstFree = (p: readonly Vec3[]): { rho: number; u: number }[] => bendSamples(p, R).filter((q) => free[Math.min(n - 1, Math.max(0, Math.round(q.u * (n - 1))))]);
  const start = worstFree(pts);
  if (!start.some((q) => q.rho < floor)) return pts as Vec3[];
  let p: Vec3[] = pts.map((q) => [q[0], q[1], q[2]] as Vec3), best = p, bestWorst = Infinity;
  for (let round = 0; round < ROUNDS; round++) {
    const bs = worstFree(p), worst = bs.reduce((m, q) => Math.min(m, q.rho), Infinity);
    if (worst < bestWorst) { bestWorst = worst; best = p; }
    if (worst >= aim) return p;
    const reach = REACH0 + Math.floor(round / 40), move = new Array<boolean>(n).fill(false);
    for (const q of bs) if (q.rho < aim) { const c = Math.round(q.u * (n - 1)); for (let j = Math.max(1, c - reach); j <= Math.min(n - 2, c + reach); j++) if (free[j]) move[j] = true; }
    const next = p.map((q) => [q[0], q[1], q[2]] as Vec3);
    for (let j = 1; j < n - 1; j++) if (move[j]) for (let d = 0; d < 3; d++) next[j]![d] = p[j]![d]! + RELAX * ((p[j - 1]![d]! + p[j + 1]![d]!) / 2 - p[j]![d]!);
    p = next;
  }
  return best;
}

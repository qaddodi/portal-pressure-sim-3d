// The junction skin's shape (spec section 4.3): each arm is a tapered capsule along its own axis, out from the junction centre J, and the fillet is the polynomial
// smooth union of the arms, the same blend 2D draws its forks with (fork-joins.copied.js). Plain number arrays and one scratch buffer: nothing here allocates
// inside a loop, because mesh.ts calls these a few hundred thousand times for one junction.
import type { SkinArm, Vec3 } from './types.ts';

/** The smooth-min blend width as a share of the narrowest arm's radius (spec 4.3): a thin branch on a fat trunk gets a small fillet and never a bulb. */
export const SKIN_K = 0.8;
/** How far out from J an arm's capsule runs, in its own rest radii (spec 4.3). */
export const ARM_REACH = 6;
/** The capsule's axis is resampled to this many segments however densely the caller gave it (a tube's ring centres can be a hundred points): enough for a gentle bend, cheap to evaluate. */
export const CAPSULE_SEGS = 6;

/** One arm's capsule: its axis polyline from J outward (`n` points, xyz packed) and the radius the tube really has at each point. */
export interface Capsule { readonly n: number; readonly pts: Float64Array; readonly r: Float64Array; /** the index of the arm this one runs THROUGH the node with (through.ts): the two are united by a plain minimum, and blend with the others as one */ readonly mate?: number }

/**
 * The capsule of `arm` (spec 4.3).
 * - `coursePts` is the arm's axis in the vessel's own order (`coursesOf(def, state)[0].pts`, or better the tube's ring centres so the axis sits exactly on the built tube);
 *   it is reversed when the node is the vessel's end 1, so the capsule always runs from J outward.
 * - `len` is how far out it runs along the axis (default `ARM_REACH * restR`); a shorter axis is carried straight on past its last point.
 * - `radiusAt(d)` is the tube's radius at distance `d` along the axis from J (`radiusAtU` of the course, so tapers count); the default is the arm's rest radius, and then the axis keeps its own bends only.
 * - `J`, when given and not already the first point, is put in front, so every capsule begins at the junction centre.
 */
export function armCapsule(arm: SkinArm, coursePts: readonly Vec3[], len = ARM_REACH * arm.restR, radiusAt?: (d: number) => number, J?: Vec3): Capsule {
  const src: Vec3[] = arm.end === 1 ? [...coursePts].reverse() : [...coursePts];
  if (J && (!src.length || Math.hypot(src[0]![0] - J[0], src[0]![1] - J[1], src[0]![2] - J[2]) > 1e-9)) src.unshift(J);
  if (src.length < 2) throw new Error(`skin: arm ${arm.vesselId} needs an axis of at least two points`);
  // cumulative arc length of the source axis; a shorter axis is carried straight on past its last point by extending the last segment
  const cum = [0];
  for (let i = 1; i < src.length; i++) cum.push(cum[i - 1]! + Math.hypot(src[i]![0] - src[i - 1]![0], src[i]![1] - src[i - 1]![1], src[i]![2] - src[i - 1]![2]));
  const at = (d: number): Vec3 => {
    let seg = 0;
    while (seg < src.length - 2 && cum[seg + 1]! < d) seg++;
    const a = src[seg]!, b = src[seg + 1]!, sl = cum[seg + 1]! - cum[seg]!, t = sl > 0 ? (d - cum[seg]!) / sl : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  // where along the axis to put capsule points: with no radius profile the source's own bends (so a straight arm is one segment), with one an even spacing that follows the taper
  let ds: number[];
  if (radiusAt || src.length > CAPSULE_SEGS + 1) ds = Array.from({ length: CAPSULE_SEGS + 1 }, (_, i) => (len * i) / CAPSULE_SEGS);
  else { ds = [0]; for (let i = 1; i < src.length - 1; i++) if (cum[i]! < len - 1e-9) ds.push(cum[i]!); ds.push(len); }
  const n = ds.length, pts = new Float64Array(3 * n), r = new Float64Array(n);
  ds.forEach((d, i) => { const p = at(d); pts[3 * i] = p[0]; pts[3 * i + 1] = p[1]; pts[3 * i + 2] = p[2]; r[i] = radiusAt ? radiusAt(d) : arm.restR; });
  return { n, pts, r };
}

/** The closest point of `c`'s axis to (x, y, z): writes [px, py, pz, radius there, distance, segment, t] into `out` (7 numbers) and returns the distance. */
export function closestOnArm(c: Capsule, x: number, y: number, z: number, out: Float64Array): number {
  const P = c.pts, R = c.r;
  let best = Infinity, bt = 0, bi = 0;
  for (let i = 0; i < c.n - 1; i++) {
    const ax = P[3 * i]!, ay = P[3 * i + 1]!, az = P[3 * i + 2]!;
    const bx = P[3 * i + 3]! - ax, by = P[3 * i + 4]! - ay, bz = P[3 * i + 5]! - az;
    const px = x - ax, py = y - ay, pz = z - az;
    const bb = bx * bx + by * by + bz * bz;
    let t = bb > 0 ? (px * bx + py * by + pz * bz) / bb : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - t * bx, dy = py - t * by, dz = pz - t * bz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) { best = d2; bt = t; bi = i; }
  }
  const ax = P[3 * bi]!, ay = P[3 * bi + 1]!, az = P[3 * bi + 2]!;
  out[0] = ax + (P[3 * bi + 3]! - ax) * bt; out[1] = ay + (P[3 * bi + 4]! - ay) * bt; out[2] = az + (P[3 * bi + 5]! - az) * bt;
  out[3] = R[bi]! + (R[bi + 1]! - R[bi]!) * bt;
  out[4] = Math.sqrt(best); out[5] = bi; out[6] = bt;
  return out[4];
}

const scratch = new Float64Array(7);
/** One arm's signed distance: the distance to its axis minus the radius interpolated at the closest point (negative inside the lumen). */
export function sdArm(c: Capsule, x: number, y: number, z: number): number {
  closestOnArm(c, x, y, z, scratch);
  return scratch[4]! - scratch[3]!;
}

/** `sdArm` and its exact gradient (written into `g`): the unit vector away from the axis, less the radius's change along a tapered segment. */
export function sdArmGrad(c: Capsule, x: number, y: number, z: number, g: Float64Array | number[]): number {
  closestOnArm(c, x, y, z, scratch);
  const d = scratch[4]!, i = scratch[5]!, t = scratch[6]!, inv = d > 1e-12 ? 1 / d : 0;
  g[0] = (x - scratch[0]!) * inv; g[1] = (y - scratch[1]!) * inv; g[2] = (z - scratch[2]!) * inv;
  if (t > 0 && t < 1) {
    const P = c.pts, bx = P[3 * i + 3]! - P[3 * i]!, by = P[3 * i + 4]! - P[3 * i + 1]!, bz = P[3 * i + 5]! - P[3 * i + 2]!, bb = bx * bx + by * by + bz * bz;
    if (bb > 0) { const dr = (c.r[i + 1]! - c.r[i]!) / bb; g[0] = g[0]! - dr * bx; g[1] = g[1]! - dr * by; g[2] = g[2]! - dr * bz; }
  }
  return d - scratch[3]!;
}

/** The most arms a skin blends (spec 10.1): the weights are two attributes, `weight` (arms 0 to 3) and `weight2` (arms 4 and 5). */
export const MAX_SKIN_ARMS = 6;

/** The blend width of a junction: `SKIN_K` times the narrowest arm's rest radius (spec 4.3). */
export const skinKOf = (arms: readonly Pick<SkinArm, 'restR'>[]): number => SKIN_K * Math.min(...arms.map((a) => a.restR));

/** The polynomial smooth-min (spec 4.3): `h = clamp(0.5 + 0.5 (b - a) / k, 0, 1); mix(b, a, h) - k h (1 - h)`. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

/** The smooth union of the arms, applied pairwise in arm order (spec 4.3); zero on the skin's surface, negative inside. Two arms that run THROUGH the node (`Capsule.mate`, through.ts) are united by a plain minimum first and then count as one arm: a blend between two halves of one trunk only adds a bulge. */
export function sdUnion(caps: readonly Capsule[], k: number, x: number, y: number, z: number): number {
  let acc = 0, first = true;
  for (let i = 0; i < caps.length; i++) {
    const m = caps[i]!.mate ?? -1;
    if (m >= 0 && m < i) continue;   // (the second half of a run: taken with the first)
    let d = sdArm(caps[i]!, x, y, z);
    if (m > i) d = Math.min(d, sdArm(caps[m]!, x, y, z));
    acc = first ? d : smin(acc, d, k);
    first = false;
  }
  return acc;
}

/**
 * How much the point belongs to each arm (spec 4.3): a softmax of `-sdArm / k`, then sharpened `w^4 / sum(w^4)` so an arm's own stretch is weight 1.
 * Writes `MAX_SKIN_ARMS` (6) numbers into `out` in arm order (an unused arm gets 0).
 */
export function weights(caps: readonly Capsule[], k: number, x: number, y: number, z: number, out: Float64Array | number[]): void {
  let lo = Infinity;
  for (let i = 0; i < MAX_SKIN_ARMS; i++) { out[i] = i < caps.length ? sdArm(caps[i]!, x, y, z) : Infinity; if (out[i]! < lo) lo = out[i]!; }
  let sum = 0;
  for (let i = 0; i < MAX_SKIN_ARMS; i++) {
    const w = i < caps.length ? Math.exp(-(out[i]! - lo) / k) : 0;
    const s = w * w, q = s * s;   // w^4
    out[i] = q; sum += q;
  }
  for (let i = 0; i < MAX_SKIN_ARMS; i++) out[i] = out[i]! / sum;
}

/** The central-difference gradient of `sdUnion` with step `h` (spec 4.5 uses 0.05 k), written into `out` (3 numbers, not normalised). */
export function gradient(caps: readonly Capsule[], k: number, x: number, y: number, z: number, h: number, out: Float64Array | number[]): void {
  out[0] = sdUnion(caps, k, x + h, y, z) - sdUnion(caps, k, x - h, y, z);
  out[1] = sdUnion(caps, k, x, y + h, z) - sdUnion(caps, k, x, y - h, z);
  out[2] = sdUnion(caps, k, x, y, z + h) - sdUnion(caps, k, x, y, z - h);
  const s = 1 / (2 * h);
  out[0] = out[0]! * s; out[1] = out[1]! * s; out[2] = out[2]! * s;
}

const ag = new Float64Array(3), ug = new Float64Array(3), mg = new Float64Array(3);
/** `sdUnion` and its exact gradient in one pass (the chain rule through the pairwise smooth-min): returns the distance, writes the gradient into `g`. */
export function sdUnionGrad(caps: readonly Capsule[], k: number, x: number, y: number, z: number, g: Float64Array | number[]): number {
  let acc = 0, first = true;
  for (let i = 0; i < caps.length; i++) {
    const m = caps[i]!.mate ?? -1;
    if (m >= 0 && m < i) continue;
    // this term: one arm, or the plain minimum of the two halves of a run (the gradient of the nearer)
    let b = sdArmGrad(caps[i]!, x, y, z, ug);
    if (m > i) { const o = sdArmGrad(caps[m]!, x, y, z, mg); if (o < b) { b = o; ug[0] = mg[0]!; ug[1] = mg[1]!; ug[2] = mg[2]!; } }
    if (first) { acc = b; g[0] = ug[0]!; g[1] = ug[1]!; g[2] = ug[2]!; first = false; continue; }
    const a = acc;
    ag[0] = g[0]!; ag[1] = g[1]!; ag[2] = g[2]!;
    const raw = 0.5 + (0.5 * (b - a)) / k, inside = raw > 0 && raw < 1, h = Math.min(1, Math.max(0, raw));
    // f = b + (a - b) h - k h (1 - h); df/dh = (a - b) - k + 2 k h; dh/da = -0.5/k, dh/db = +0.5/k inside the blend, 0 outside
    const dfdh = a - b - k + 2 * k * h, dha = inside ? -0.5 / k : 0, dhb = inside ? 0.5 / k : 0;
    const fa = h + dfdh * dha, fb = 1 - h + dfdh * dhb;
    g[0] = fa * ag[0]! + fb * ug[0]!; g[1] = fa * ag[1]! + fb * ug[1]!; g[2] = fa * ag[2]! + fb * ug[2]!;
    acc = b + (a - b) * h - k * h * (1 - h);
  }
  return acc;
}

/** The radius of the arm nearest the point (the one with the smallest signed distance): the local tube size the mesh refines to. */
export function localRadius(caps: readonly Capsule[], x: number, y: number, z: number): number {
  let best = Infinity, r = 0;
  for (let i = 0; i < caps.length; i++) { closestOnArm(caps[i]!, x, y, z, scratch); const sd = scratch[4]! - scratch[3]!; if (sd < best) { best = sd; r = scratch[3]!; } }
  return r;
}

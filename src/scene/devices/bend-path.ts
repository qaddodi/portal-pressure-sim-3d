// THE ONE PATH BUILDER FOR EVERY CATHETER, TUBE, WIRE AND SCOPE (owner, 26 Nov 2026: the Blakemore tube turned into the stomach at the GE junction in an acute kink; "real catheters bend
// smoothly, they don't kink like that").
// Root cause: each device laid its own path from its anatomy waypoints (the tamponade tube from the 2D app's bend of 16 figure units, the catheters from a Gaussian over the route, the
// scope from a Gaussian over
// the 2D way) and none of them had to answer for how sharply it turned, so a corner in the anatomy became a corner in the tube. Here is the one rule: a device has a MINIMUM BEND RADIUS,
// and a path that is
// built for it is relaxed until no stretch of it turns more tightly than that. Every device path goes through `limitBend`; `tests/device-bends.test.ts` samples every device's path with
// `minBendRadius` and fails
// if any turns more tightly than its device's radius (`DEVICE_BEND_RADII`).
//
// The unit of a radius is the device's own shaft radius ("radii"): a stiff 18 Fr tamponade tube turns far more gently than a soft 5 Fr catheter, so each device states its own number. A
// bend is measured over a
// window of arc length (`h`) either side of a sample, as the angle between the two chords, so the noise of a few samples never reads as a kink and a kink never hides in the samples' spacing.

export type V3 = readonly [number, number, number];

/** The least radius (shaft radii) a device's centreline may bend with, by device. A device that has no entry may not build a path. */
export const DEVICE_BEND_RADII = {
  /** the IR catheters and their sheaths, wires and needles (HVPG, TIPS, DIPS, BRTO, BATO, PPG): a soft shaft in a vein, which the lumen's room can round only so far */
  catheter: 5,
  /** the endoscope's insertion tube (the oesophagus, the cardia and the stomach): its way was already round (about 9.5 radii at the tightest, the glue slide's turn under the fundus),
      and this holds it */
  scope: 9,
  /** the Sengstaken-Blakemore / Minnesota tube: stiff, turning from the oesophagus into the stomach over about the oesophagus's own width, never an elbow (the scope's tube is the next stiffest) */
  tamponade: 75,
} as const;
export type DeviceKind = keyof typeof DEVICE_BEND_RADII;

const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: ArrayLike<number>): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const angle = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  const la = len(a), lb = len(b);
  if (la < 1e-12 || lb < 1e-12) return 0;
  return Math.acos(Math.min(1, Math.max(-1, (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (la * lb))));
};

/** The cumulative arc length at each sample. */
export function arcOf(pts: readonly V3[]): Float64Array {
  const c = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) c[i] = c[i - 1]! + len(sub(pts[i]!, pts[i - 1]!));
  return c;
}

/** The point at arc length `s` along a path whose samples are at arc lengths `cum` (clamped to its ends). */
export function pointAtArc(pts: readonly V3[], cum: ArrayLike<number>, s: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const n = pts.length, g = Math.min(cum[n - 1]!, Math.max(0, s));
  let i = 1, hi = n - 1;
  while (i < hi) { const m = (i + hi) >> 1; if (cum[m]! < g) i = m + 1; else hi = m; }
  const s0 = cum[i - 1]!, s1 = cum[i]!, u = s1 > s0 ? (g - s0) / (s1 - s0) : 0, p = pts[i - 1]!, q = pts[i]!;
  out[0] = p[0] + (q[0] - p[0]) * u; out[1] = p[1] + (q[1] - p[1]) * u; out[2] = p[2] + (q[2] - p[2]) * u;
  return out;
}

/** The two ends of a sample's window: the points `h` of arc length behind and ahead of it on the path itself (not the nearest samples, so the window moves smoothly along the path
    whatever the samples' spacing); near an end the window is cut short on both sides alike. */
function windowOf(pts: readonly V3[], cum: Float64Array, i: number, h: number): { a: [number, number, number]; b: [number, number, number]; half: number } {
  const total = cum[pts.length - 1]!, hh = Math.min(h, cum[i]!, total - cum[i]!);
  return { a: pointAtArc(pts, cum, cum[i]! - hh), b: pointAtArc(pts, cum, cum[i]! + hh), half: hh };
}

/**
 * The radius of the path's bend at every sample over a window `h` of arc length (the path's own units): the angle between the chord that ends at the sample and the chord that starts
 * at it, each about `h` long, and
 * the radius of the circle that turns that far in that length. Infinity where the path is straight, and within half a window of an end, where there is no chord to read a bend from.
 */
export function bendRadii(pts: readonly V3[], h: number, cum: Float64Array = arcOf(pts)): Float64Array {
  const n = pts.length, out = new Float64Array(n).fill(Infinity);
  for (let i = 1; i < n - 1; i++) {
    const { a, b, half } = windowOf(pts, cum, i, h), u = sub(pts[i]!, a), v = sub(b, pts[i]!), th = angle(u, v);
    if (half >= 0.5 * h && th > 1e-9) out[i] = (0.5 * (len(u) + len(v))) / th;
  }
  return out;
}

/** The window a bend is measured over for a path and a radius: a third of the radius, never under three samples (what `limitBend` uses, so a test measures a path as the builder did). */
export function bendWindow(pts: readonly V3[], minR: number): number {
  return Math.max(minR / 3, (3 * (arcOf(pts)[pts.length - 1] ?? 0)) / Math.max(1, pts.length - 1));
}

/** The tightest bend of the path over window `h`, and where (the sample), over the samples `from` to `to` (exclusive). Infinity for a straight path. */
export function minBendRadius(pts: readonly V3[], h: number, from = 0, to = pts.length): { radius: number; at: number } {
  const r = bendRadii(pts, h);
  let radius = Infinity, at = -1;
  for (let i = Math.max(0, from); i < Math.min(pts.length, to); i++) if (r[i]! < radius) { radius = r[i]!; at = i; }
  return { radius, at };
}

export interface BendLimit {
  /** the least radius the path may bend with, in the path's units */
  minR: number;
  /** how far a sample may move from where it was (the path's units): a number for all, or one per sample (the room the lumen leaves beyond the shaft). Default: unbounded. */
  room?: number | ArrayLike<number>;
  /** where each sample's room is measured from (default: where the sample began): the vessel's own centreline, when the path has already been rounded off it once */
  anchor?: readonly V3[];
  /** a move the path must not make (it would leave the lumen, the wall): called with the sample and where it would go; a move that is not allowed is shortened until it is, or dropped */
  allow?: (i: number, p: V3) => boolean;
  /** the first and last samples stay where they are (default true: the entry and the tip's goal are the anatomy's) */
  pinEnds?: boolean;
  /** the window the bend is measured over (default `bendWindow`: a third of the radius, but never under three samples) */
  window?: number;
  /** the most passes (default 3000) */
  passes?: number;
  /** how near the limit is near enough: 0.97 of it (default) */
  tolerance?: number;
}

/**
 * Relaxes a path until no stretch of it bends tighter than `minR`: every sample whose bend (over the window) is too tight moves toward the middle of its window's two ends, by no more
 * than its room and only where
 * `allow` says it may, and the passes go on until none is too tight (or a pass moves nothing: the room is spent, and what is left is the least the room can give). Returns a new path
 * of the same samples (an index
 * still names the same place along it, so a caller that tracks lengths by index keeps its lengths); the input is not changed.
 */
export function limitBend(pts: readonly V3[], o: BendLimit): V3[] {
  const n = pts.length;
  const P = pts.map((p) => [p[0], p[1], p[2]] as [number, number, number]);
  if (n < 3) return P;
  const pin = o.pinEnds !== false, tol = o.tolerance ?? 0.97, passes = o.passes ?? 3000;
  const h = o.window ?? bendWindow(pts, o.minR);
  const room = (i: number): number => (o.room == null ? Infinity : typeof o.room === 'number' ? o.room : o.room[i] ?? Infinity);
  const lo = pin ? 1 : 0, hi = pin ? n - 1 : n;
  for (let pass = 0; pass < passes; pass++) {
    const cum = arcOf(P), r = bendRadii(P, h, cum);
    let worst = Infinity;
    for (let i = lo; i < hi; i++) worst = Math.min(worst, r[i]!);
    if (worst >= o.minR * tol) break;
    const next: [number, number, number][] = P.map((p) => [p[0], p[1], p[2]]);
    let moved = 0;
    // How much each sample is asked to move: the tighter its own bend, the more (half the way when it is a fraction too tight, all the way at an elbow), and the ask falls off smoothly with
    // the arc length from a
    // sample that is too tight (a Gaussian a window wide), so the stretch that moves has no end where the path begins to turn: the corner would only be handed on to where the move stops.
    const ask = new Float64Array(n);
    for (let i = lo; i < hi; i++) if (r[i]! < o.minR * tol) ask[i] = Math.min(1, 0.5 + 0.5 * (1 - r[i]! / o.minR));
    const weight = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let w = 0;
      for (let j = i; j < n && cum[j]! - cum[i]! <= 2.5 * h; j++) if (ask[j]) w = Math.max(w, ask[j]! * Math.exp(-((cum[j]! - cum[i]!) ** 2) / (2 * h * h)));
      for (let j = i - 1; j >= 0 && cum[i]! - cum[j]! <= 2.5 * h; j--) if (ask[j]) w = Math.max(w, ask[j]! * Math.exp(-((cum[i]! - cum[j]!) ** 2) / (2 * h * h)));
      weight[i] = w;
    }
    for (let i = 1; i < n - 1; i++) {
      // (never more than half the way to the middle of the window: a move of the whole way, made by every sample at once, overshoots and the path rings)
      const f = 0.5 * weight[i]!;
      if (i < lo || i >= hi || f < 1e-4) continue;
      const { a, b } = windowOf(P, cum, i, h), goal: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      let d: [number, number, number] = [(goal[0] - P[i]![0]) * f, (goal[1] - P[i]![1]) * f, (goal[2] - P[i]![2]) * f];
      // (and never further from where the sample began than its room)
      const o0 = o.anchor?.[i] ?? pts[i]!, rm = room(i);
      for (let k = 0; k < 8; k++) {
        const q: [number, number, number] = [P[i]![0] + d[0], P[i]![1] + d[1], P[i]![2] + d[2]];
        const off = len(sub(q, o0));
        if (off > rm) { const g = Math.max(0, (rm - len(sub(P[i]!, o0))) / Math.max(len(d), 1e-12)); d = [d[0] * g, d[1] * g, d[2] * g]; continue; }
        if (o.allow && !o.allow(i, q)) { d = [d[0] * 0.6, d[1] * 0.6, d[2] * 0.6]; continue; }
        break;
      }
      const q: V3 = [P[i]![0] + d[0], P[i]![1] + d[1], P[i]![2] + d[2]];
      if (len(sub(q, o0)) > rm + 1e-12 || (o.allow && !o.allow(i, q)) || len(d) < 1e-14) continue;
      next[i] = [q[0], q[1], q[2]]; moved += len(d);
    }
    if (moved < 1e-13) break;
    for (let i = 0; i < n; i++) P[i] = next[i]!;
  }
  return P;
}

/** The unit direction of the path at arc length `s`: across a window of `half` either side, so a ring's frame follows the bend and not the samples' noise. */
export function tangentAtArc(pts: readonly V3[], cum: ArrayLike<number>, s: number, half: number, out: [number, number, number] = [1, 0, 0]): [number, number, number] {
  const total = cum[pts.length - 1]!, a = pointAtArc(pts, cum, Math.max(0, s - half)), b = pointAtArc(pts, cum, Math.min(total, s + half));
  const d = sub(b, a), l = len(d);
  if (l < 1e-12) { out[0] = 1; out[1] = 0; out[2] = 0; return out; }
  out[0] = d[0] / l; out[1] = d[1] / l; out[2] = d[2] / l;
  return out;
}

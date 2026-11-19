// The flow peel and the chord frame of the change between the Anatomy and the Circuit, ported from the 2D app (flow-peel.js; Mohammad, 6 Nov 2026: "I love M5").
// Each point moves on its own share of the change, which starts later the further downstream it lies: the gut and the spleen leave first, then the portal vein,
// the liver, the hepatic veins and the heart. The same functions are written in GLSL in shader.ts; tests/circuit-shader.test.ts holds the two together.
import { PEEL_DL, VB_CIRC } from './data.copied.ts';

export { PEEL_DL };
const X0 = VB_CIRC[0] + 30, X1 = VB_CIRC[0] + VB_CIRC[2] - 30;   // (the splanchnic beds' left edge, 60, to the heart's right, 1360)
/** The width of the flow the rank runs over, map units (1300). */
export const PEEL_SPAN = X1 - X0;

/** A point's place in the flow, 0 (gut, spleen) to 1 (heart), from its x in the wide circuit (map units). */
export function peelRank(cx: number): number {
  const r = (cx - X0) / (X1 - X0);
  return r < 0 ? 0 : r > 1 ? 1 : r;
}
/** A point's share of the change at t (the change's eased share, 0 the anatomy, 1 the circuit) for rank r: exactly 0 and 1 at the ends. */
export function peelAt(t: number, r: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x = (t - PEEL_DL * r) / (1 - PEEL_DL);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

/** How fast a point's share of the change moves with its rank at t: d peelAt / d r (0 where the share rests at 0 or 1). The tangent of a vessel mid-change needs it: the centreline's
 *  derivative along the vessel is (1 - w) A' + w C' + w' (C - A), and w' is this times the rank's own slope along the vessel (the 2D app's gradient term). */
export function peelSlope(t: number, r: number): number {
  if (t <= 0 || t >= 1) return 0;
  const x = (t - PEEL_DL * r) / (1 - PEEL_DL);
  if (x <= 0 || x >= 1) return 0;
  return 6 * x * (1 - x) * (-PEEL_DL / (1 - PEEL_DL));
}

// ── A vessel that reverses between the views (13 Nov 2026) ──
// Lerped point by point, a vessel whose course runs the other way in the circuit (the portal chain from the spleen to the liver, the left renal vein, the hepatic
// artery) crosses itself on the way. Its ends move with their stations and its shape is carried in the frame of its chord: each point's place along the chord and off
// it, eased from the anatomy's to the circuit's on the point's own share of the change. It turns and stretches with its two ends and never folds.
export const FLIP_COS = Math.cos((120 * Math.PI) / 180);

/** A course's points in the frame of its own chord (xy of the map's plane): for each point, its share along the chord and off it, [u, v, ...]. */
export function chordShape(P: readonly { x: number; y: number }[]): Float64Array {
  const n = P.length, s = new Float64Array(2 * n);
  if (n < 2) return s;
  const x0 = P[0]!.x, y0 = P[0]!.y, dx = P[n - 1]!.x - x0, dy = P[n - 1]!.y - y0, L2 = dx * dx + dy * dy || 1;
  for (let i = 0; i < n; i++) { const px = P[i]!.x - x0, py = P[i]!.y - y0; s[2 * i] = (px * dx + py * dy) / L2; s[2 * i + 1] = (py * dx - px * dy) / L2; }
  return s;
}
/** Whether the course turns more than 120 degrees between the views: A the anatomy's course, and (cdx, cdy) the circuit's chord as it is laid out now. */
export function reverses(A: readonly { x: number; y: number }[], cdx: number, cdy: number): boolean {
  const n = A.length, ax = A[n - 1]!.x - A[0]!.x, ay = A[n - 1]!.y - A[0]!.y, la = Math.hypot(ax, ay), lc = Math.hypot(cdx, cdy);
  return la > 1e-6 && lc > 1e-6 && (ax * cdx + ay * cdy) / (la * lc) < FLIP_COS;
}
/** Point i of a reversing vessel at its share w, between its ends as they stand (x0, y0) and (x1, y1): sA, sC its chordShape in each view. Writes [x, y] into out. */
export function chordPointInto(out: number[], sA: Float64Array, sC: Float64Array, i: number, w: number, x0: number, y0: number, x1: number, y1: number): number[] {
  const u = sA[2 * i]! + (sC[2 * i]! - sA[2 * i]!) * w, v = sA[2 * i + 1]! + (sC[2 * i + 1]! - sA[2 * i + 1]!) * w, dx = x1 - x0, dy = y1 - y0;
  out[0] = x0 + u * dx - v * dy; out[1] = y0 + u * dy + v * dx;
  return out;
}

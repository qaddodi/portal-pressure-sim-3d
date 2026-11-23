// Zone 3's dead hepatocytes in congestion (SOS, Budd-Chiari, heart failure), as a CONTINUOUS amount, never a coin toss per cell (Mohammad, 23 Nov 2026, the SOS slide: the ghost tiles mottled zone 3).
// Root cause: 2D's rule (lobule-paint.js) is dead = q < 0.4 && cu > 0.12 && drop < cu x (1.25 - 1.6 q), with `drop` an independent random number per cell, so at SOS (cu 0.73) 73 % of the cells at q 0.1-0.2 were
// ghosts (a different colour, 70 % of the size, no nucleus, alpha 0.6) and the rest were live, side by side: salt and pepper with a hard edge at q 0.4 (37 % of neighbouring zone-3 pairs were one dead beside one live).
// Confluent perivenular necrosis is graded from the vein, so the amount is a smooth function of q (the distance from the vein) and cu, with an organic edge (a few lobes round the vein). Fill, alpha, size and nucleus
// all interpolate by it; the vertex count never changes, so the tiles' existing tween eases every change.
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (e0: number, e1: number, x: number): number => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** The necrosis front's radius round the vein, in q, at angle theta: 0.34 with two soft lobes (seeded, never random, so it never flickers). */
export const deadEdge = (theta: number): number => 0.34 + 0.03 * Math.sin(3 * theta + 1.1) + 0.02 * Math.sin(5 * theta + 0.4);
/** How dead a cell is, 0 (live) to 1 (a ghost): cu the congestion (0..1), q the cell's place from the vein (0) to the portal tract (1), theta its angle round the vein. 0 with no congestion, 0 from q 0.45 out. */
export function deadAmount(cu: number, q: number, theta: number): number {
  const e = deadEdge(theta);
  return Math.min(1, 1.25 * cu) * smooth(0.08, 0.16, cu) * (1 - smooth(e - 0.26, e + 0.06, q));
}

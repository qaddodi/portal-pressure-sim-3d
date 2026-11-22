// SOS's scar inside the central vein: ONE collagen with the bands outside it (Plan 24, Mohammad 22 Nov: "why doesn't the fibrous bands inside the central vein look like the fibrous bands outside it").
// The ring's shape lives here once: the mesh (micro3d/lobule3d.ts buildCvScar) takes its vertices from `cvInner`, and the plate painter (`paintIntima`) clips the 2D app's own collagen painter
// (fibrousCuff, the same strands, tones and fill as the perivenular cuff outside the wall) to the very same curve, so the mesh shows exactly what the plate painted.
import { fibrousCuff, scarGrowth } from './from2d/lobule-paint.generated.js';

/** 2D's CV_FILL: the share of the lumen the scar takes at most. */
export const CV_FILL = 0.55;
/** The scar's inner edge never comes nearer the centre than this share of the wall's radius, whatever the lobes: the middle of the lumen (and the node dot) stays clear. */
export const CV_OPEN_MIN = 0.38;
/** The ring's vertices around (mesh and painter alike). */
export const CV_RING_N = 96;
/** The ring's outer edge, and the inner edge's limit, as shares of the wall's radius. */
export const CV_WALL = 0.98, CV_INNER_MAX = 0.97;

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
/** 2D's growth curve (lobule-paint.js scarGrowth), of the host's eased fibPost. */
export const cvScarGrowth = (fibPost: number): number => clamp(fibPost, 0, 1) ** 1.1;
/** The lobes of the inner edge: soft, seeded, never jagged. */
export const cvRag = (t: number): number => 1 + 0.045 * Math.sin(t * 3 + 1.3) + 0.03 * Math.sin(t * 5 + 0.4) + 0.015 * Math.sin(t * 8 + 2.1);
/** The inner edge's radius at angle t, for a wall of radius rw and growth `grow`. */
export const cvInner = (rw: number, grow: number, t: number): number => clamp(rw * (1 - CV_FILL * grow) * cvRag(t), rw * CV_OPEN_MIN, rw * CV_INNER_MAX);

/** What the painter reads of a plate's input (plate.ts plateInput). */
interface IntimaInput { m: { fibPost: number }; G: { cx: number; cy: number }; rgb: { col: ArrayLike<number> }; cvIn: number }

/** The intimal collagen, into the context of the plate's painter (world units, its transform set): the wall's disc from the wall in to the lobed edge, drawn by the 2D app's perivenular cuff painter,
 *  the same strands, the same tone, the same fill, clipped to the ring. Drawn when the outer cuff is (fibPost over 0.05). */
export function paintIntima(c: CanvasRenderingContext2D, P: IntimaInput): void {
  if (!(P.m.fibPost > 0.05) || !(P.cvIn > 0)) return;
  const rw = P.cvIn, { cx, cy } = P.G, growth = scarGrowth(P.m.fibPost);
  c.save();
  c.beginPath();
  c.arc(cx, cy, rw * CV_WALL, 0, Math.PI * 2);
  c.moveTo(cx + cvInner(rw, growth, 0), cy);
  for (let i = 1; i < CV_RING_N; i++) { const t = (i / CV_RING_N) * Math.PI * 2, r = cvInner(rw, growth, t); c.lineTo(cx + r * Math.cos(t), cy + r * Math.sin(t)); }
  c.closePath();
  c.clip('evenodd');
  fibrousCuff(c, cx, cy, rw * CV_OPEN_MIN, rw * CV_WALL, P.rgb.col, growth);
  c.restore();
}

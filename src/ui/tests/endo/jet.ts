// The jet the scope sees leaving the tear (the 3D figure's has the same shape: src/scene/disease/jet.ts): a stream that leaves the varix column toward the axis with a narrow
// mouth, widens, arcs down under gravity, necks into beads and sheds a spray from its tip, cel-drawn: an ink outline that thins toward the tip, the blood's flat colour, and the lamp's lit
// band along its upper edge. Steady, never a beat (blood.js BLEED_STEADY); the strength is the model's bleeding rate (the 2D's smooth(25, 70, rate)). It grows out of the tear as the bleed eases
// in and shortens as it eases out.
import { withAlpha, type Rgba } from '../../charts/colour.ts';
import type { Shape } from '../../charts/scene.ts';
import { ribbon } from './bleed.ts';

export const JET_SEG = 18;
export const TIP_DROPS = 7;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smooth = (e0: number, e1: number, x: number) => { const u = clamp((x - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u); };
const frac = (x: number) => x - Math.floor(x);
const hash = (i: number) => frac(Math.sin(i * 12.9898 + 4.1) * 43758.5453);

export interface JetPath { pts: Float64Array; width: Float64Array; ink: Float64Array; n: number }
export const makeJetPath = (): JetPath => ({ pts: new Float64Array(2 * (JET_SEG + 1)), width: new Float64Array(JET_SEG + 1), ink: new Float64Array(JET_SEG + 1), n: JET_SEG + 1 });

export interface JetIn { jx: number; jy: number; cx: number; cy: number; R: number; t: number; a: number; spurt: number; k: number }

/** The reach of the jet while the bleed eases (0 nothing, 1 whole). */
export const jetReach = (a: number, spurt = 1): number => smooth(0, 0.85, a) * smooth(0, 0.3, spurt);   // (an ooze, below the 2D's spurt, has no jet: it comes in with the rate, not at a step)

/** The stream's centreline and widths (px): it leaves the tear toward the axis and falls in an arc. Fills `out` and returns the tip's direction angle. */
export function jetPath(o: JetIn, out: JetPath): number {
  const { jx, jy, cx, cy, R, t, a, spurt, k } = o;
  const into = Math.atan2(cy - jy, cx - jx);
  const reach = jetReach(a, spurt), L = R * (0.22 + 0.2 * spurt) * clamp(k, 0.7, 1.4) * reach;
  const dx = Math.cos(into), dy = Math.sin(into), sag = R * (0.12 + 0.12 * spurt) * reach;
  const brk = 0.5 + 0.5 * (1 - spurt);   // an ooze is mostly beads, a fast bleed stays whole longer
  for (let i = 0; i <= JET_SEG; i++) {
    const s = i / JET_SEG;
    out.pts[2 * i] = jx + dx * L * s;
    out.pts[2 * i + 1] = jy + dy * L * s + sag * s * s;
    const core = 0.55 + 0.75 * smooth(0, 0.35, s);   // a narrow mouth that widens
    const taper = 1 - 0.4 * smooth(0.4, 1, s);
    const b = brk * smooth(0.45, 0.95, s);
    const ph = s * 3.4 - t * (1 + 0.8 * spurt), cell = Math.floor(ph), bead = Math.pow(Math.max(Math.sin(Math.PI * (ph - cell)), 0), 0.55);
    const beaded = 0.2 + (0.9 + 0.5 * hash(cell)) * bead;
    const flow = 1 + 0.07 * Math.sin(i * 1.3 - t * 8) * (1 - b);
    out.width[i] = R * (0.02 + 0.014 * spurt) * core * taper * (1 + (beaded - 1) * b) * flow * smooth(0, 0.4, a) * smooth(0, 0.3, spurt) * clamp(k, 0.7, 1.4);
    out.ink[i] = 1 - 0.72 * smooth(0.25, 1, s);
  }
  return Math.atan2(out.pts[2 * JET_SEG + 1]! - out.pts[2 * JET_SEG - 1]!, out.pts[2 * JET_SEG]! - out.pts[2 * JET_SEG - 2]!);
}

const OUT_A = [0.85, 0.55, 0.28];
const CH = [[0, 7], [6, 12], [11, 18]];   // the outline in three runs, each a little fainter than the last (it fades toward the tip)
const LIT = new Float64Array(2 * (JET_SEG + 1)), LW = new Float64Array(JET_SEG + 1), OW = new Float64Array(JET_SEG + 1);
const PATH = makeJetPath();

/** The jet and its spray, as flat shapes (the colours are the scope's own tokens). `inside(x, y)` says whether a point is in the picture and out of the pool. */
export function jetShapes(o: JetIn, c: { jet: Rgba; fresh: Rgba; ink: Rgba }, out: Shape[], inside: (x: number, y: number) => boolean): void {
  const { R, t, a, spurt } = o;
  const A = (col: Rgba, k: number): Rgba => withAlpha(col, k * a);
  const P = jetPath(o, PATH), pts = PATH.pts, W = PATH.width, n = PATH.n;
  if (W[1]! < 0.05 && W[n - 2]! < 0.05) return;
  const ow = Math.max(1.3, R * 0.009);
  for (let i = 0; i < n; i++) OW[i] = W[i]! + 2 * ow * (0.35 + 0.65 * PATH.ink[i]!);
  // the ink, round the stream: its line gets fainter toward the tip
  for (let q = 0; q < CH.length; q++) {
    const [s0, s1] = CH[q]!;
    out.push({ k: 'path', pts: ribbon(pts.subarray(2 * s0!, 2 * (s1! + 1)), OW.subarray(s0!, s1! + 1), s1! - s0! + 1), closed: true, fill: A(c.ink, OUT_A[q]!) });
  }
  out.push({ k: 'path', pts: ribbon(pts, W, n), closed: true, fill: A(c.jet, 1) });
  // the lamp's lit band along the upper edge of the stream
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), dx = pts[2 * i1]! - pts[2 * i0]!, dy = pts[2 * i1 + 1]! - pts[2 * i0 + 1]!, d = Math.hypot(dx, dy) || 1;
    let nx = dy / d, ny = -dx / d;
    if (ny > 0) { nx = -nx; ny = -ny; }   // (toward the top of the picture, where the lamp's light comes from)
    LIT[2 * i] = pts[2 * i]! + nx * W[i]! * 0.22; LIT[2 * i + 1] = pts[2 * i + 1]! + ny * W[i]! * 0.22; LW[i] = W[i]! * 0.34;
  }
  out.push({ k: 'path', pts: ribbon(LIT, LW, n), closed: true, fill: A(c.fresh, 0.8) });
  // the spray off the tip: drops thrown on along the stream and falling, each cel-drawn (ink ring, flat blood, a lit fleck)
  const tx = pts[2 * (n - 1)]!, ty = pts[2 * (n - 1) + 1]!, dx = Math.cos(P), dy = Math.sin(P), full = smooth(0.7, 1, jetReach(a, spurt));
  for (let j = 0; j < TIP_DROPS; j++) {
    const h = hash(j + 1), h2 = hash(j + 33), ph = frac(t * (1.1 + 0.5 * spurt) + j / TIP_DROPS), tau = ph * 0.5;
    const sp = R * (0.28 + 0.34 * spurt) * (0.55 + 0.9 * h), ang = (h2 - 0.5) * 0.9;
    const ca = Math.cos(ang), sa = Math.sin(ang), vx = (dx * ca - dy * sa) * sp, vy = (dx * sa + dy * ca) * sp;
    const x = tx + vx * tau, y = ty + vy * tau + 0.5 * R * 1.3 * tau * tau;
    const r = R * (0.005 + 0.006 * h) * (0.7 + 0.5 * spurt) * smooth(0, 0.15, ph) * (1 - smooth(0.7, 1, ph)) * full;
    if (r < 0.2 || !inside(x, y)) continue;
    const rr = Math.max(1.1, r);
    out.push({ k: 'line', x1: x - vx * 0.035, y1: y - vy * 0.035, x2: x, y2: y, pen: { color: A(c.jet, 0.55), w: rr * 1.4, cap: 'round' } });
    out.push({ k: 'circle', cx: x, cy: y, r: rr, fill: A(c.jet, 1), pen: { color: A(c.ink, 0.8), w: Math.max(0.9, R * 0.004) } });
    if (rr > 2) out.push({ k: 'circle', cx: x - rr * 0.3, cy: y - rr * 0.32, r: rr * 0.32, fill: A(c.fresh, 0.9) });
  }
}

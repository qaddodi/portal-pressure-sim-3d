// The pool of blood in the stomach, as the organ shader draws it per pixel (organ-shader.ts poolA / poolLand / poolDelta). The level used to be painted per vertex
// (VertexPaint.fillStomach): on a mesh a vertex every few units the waterline was jagged and smeared, and the pool had no surface. Now the CPU only works out where the level is
// (the jet's own landing level: lumenSurface of POOL_FULL of the eased poolFill) in the stomach's box, and the pixels do the rest. Pure arithmetic: tests read it.
import { SITES } from '../disease/copied/anatomy-b4.ts';
import { bleedShapesInto, makeBleedRows } from '../disease/copied/bleed-shapes.js';
import { lumenSurface } from '../disease/copied/stomach-lumen.js';
import { UNITS_PER_SCENE, x3, y3 } from '../frame2d.ts';

/** An organ's box as the shader has it: (min x, max y, width, height) in scene units (`box`). */
export type PoolBox = readonly [number, number, number, number];
export interface PoolUniforms {
  /** the surface's place down the box (0 top, 1 bottom: the shader's vBox.y) */
  level: number;
  /** the figure's units in one box height */
  unitsPerBox: number;
  /** where the jet lands along the box (vBox.x) and the half width of the lighter patch there, in box widths */
  landX: number; landHalf: number;
  /** how strongly the jet lands (0.35 an ooze, 1 a fast bleed) */
  flow: number;
}

/** The share of the lumen the 3D pool fills at most: all of it. The 2D figure leaves a fifth (POOL_SHARE, gas and fundus) but the 3D stomach reads as not filling, so it fills (Mohammad, 25 Nov). */
export const POOL_FULL = 1;
/** The surface of the pool (2D y, down the page) for how full it stands (0..1): the ONE level the pool's shader and the jet's landing both stand on. */
export const poolSurfaceY = (fill: number): number => lumenSurface(POOL_FULL * fill);

/** Where the pool's level and the jet's landing are in `box`, for `fill` (poolFill, eased) and the bleed that feeds it. */
export function poolUniforms(box: PoolBox, fill: number, bleed: { site: 'VAR' | 'GV'; rate: number; total: number }): PoolUniforms {
  const surf = poolSurfaceY(fill);
  // (row 0 is [surface, .5, landing x, flow, ...]; only its landing x and flow are read, the surface is the eased one above)
  const row = bleedShapesInto(makeBleedRows(), bleed, bleed.rate, SITES)[0] as number[];
  const top = box[1], h = Math.max(box[3], 1e-5), w = Math.max(box[2], 1e-5);
  return { level: (top - y3(surf)) / h, unitsPerBox: h * UNITS_PER_SCENE, landX: (x3(row[2]!) - box[0]) / w, landHalf: 16 / (w * UNITS_PER_SCENE), flow: row[3]! };
}

/** The ripples' wavelength along the surface, in figure units (organ-shader.ts: 24), and how fast they run out (cycles a second). */
export const RIPPLE_LAMBDA = 24, RIPPLE_HZ = 0.9;
/** How much darker the deepest blood is than its surface (organ-shader.ts, the same number): a little, so the pool reads as the jet's own colour, not a maroon. */
export const DEPTH_DARK = 0.12;
/** The cel bands the blood is lit in, below the surface: the bleeding jet's own (bleed.ts: `bands: 3`), so the pool and the stream are one material. */
export const POOL_BANDS = 3;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** The pool's part of the organ fragment shader (organ-shader.ts, the `poolA.z > 0.004` block), in JS, line for line: the node render (scripts/pool-render.mjs) and the tests run this, so what is judged
 *  without a GPU is the shader's own arithmetic. `fill` the wash so far, `layer` the organ layer's opacity; `dU` figure units below the surface (negative above), `lobe` the jet's landing (0..1),
 *  `aa` the edge's width floor (1.5). Returns the colour and the opacity it lies on the page at (blood is nearly opaque below the surface). */
export function poolShade(fill: readonly number[], layer: number, p: { dU: number; dxU?: number; ripple?: number; phase?: number; lobe: number; amount: number; flow: number; delta: readonly number[]; light: readonly number[]; dark?: readonly number[]; aa?: number;
  /** the blood as the jet is drawn: its colour, its shade and the lit share (0..1) of the world light's bands at the pixel; absent, the pool is the wash moved by `delta` */
  cel?: { blood: readonly number[]; shade: readonly number[]; b: number } }): { fill: number[]; layer: number } {
  const aa = Math.max(p.aa ?? 1.5, 1.5), dx = p.dxU ?? 0, ad = Math.abs(dx);
  const env = (1 - Math.exp(-ad / 4)) * Math.exp(-ad / 70), th = 2 * Math.PI * ad / RIPPLE_LAMBDA - (p.phase ?? 0), amp = (p.ripple ?? 0) * (0.5 + 0.5 * p.flow) * 1.6;
  const slope = amp * env * Math.cos(th) * (2 * Math.PI / RIPPLE_LAMBDA) * Math.sign(dx), dU = p.dU - amp * env * Math.sin(th);
  const body = smoothstep(-aa, aa, dU);
  const wet = smoothstep(-3.5, -aa, dU) * (1 - body);
  const out = fill.map((v, i) => v + p.delta[i]! * (body + 0.25 * wet));
  const dark = 1 - DEPTH_DARK * smoothstep(0, 90, dU) * body * p.amount;
  const skin = (1 - smoothstep(0, 6, dU)) * smoothstep(-0.5, 2, dU);
  const k = clamp01((0.07 + p.flow * p.lobe * 0.12) * skin * p.amount);
  const lit = out.map((v, i) => v * dark + (p.light[i]! - v * dark) * k);
  const band = (1 - smoothstep(0, 9, dU)) * smoothstep(-1.5, 1, dU), rk = Math.min(0.2, Math.abs(slope) * 0.5) * band * p.amount, tone = slope > 0 ? p.light : (p.dark ?? p.light.map(() => 0));
  const lay = layer + (1 - layer) * body * p.amount, washed = lit.map((v, i) => v + (tone[i]! - v) * rk);
  if (!p.cel) return { fill: washed, layer: lay };
  // (the shader's end: below the surface the blood replaces the wash, a cel of shade to colour, deepened, with the surface's light skin and the ripples' crests laid on it)
  const c = p.cel, deep = 1 - DEPTH_DARK * smoothstep(0, 90, dU) * body * p.amount;
  const cel = c.shade.map((s, i) => (s + (c.blood[i]! - s) * c.b) * deep).map((v, i) => v + (p.light[i]! - v) * k).map((v, i) => v + (tone[i]! - v) * rk);
  const mine = body * p.amount;
  return { fill: washed.map((v, i) => v + (cel[i]! - v) * mine), layer: lay };
}

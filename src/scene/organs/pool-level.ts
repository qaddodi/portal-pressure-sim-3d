// The pool of blood in the stomach, as the organ shader draws it per pixel (organ-shader.ts poolA / poolLand / poolDelta). The level used to be painted per vertex
// (VertexPaint.fillStomach): on a mesh a vertex every few units the waterline was jagged and smeared, and the pool had no surface. Now the CPU only works out where the level is
// (the same 2D surface as the bleed's own: lumenSurface of POOL_SHARE of poolFill) in the stomach's box, and the pixels do the rest. Pure arithmetic: tests read it.
import { SITES } from '../disease/copied/anatomy-b4.ts';
import { POOL_SHARE, bleedShapesInto, makeBleedRows } from '../disease/copied/bleed-shapes.js';
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

/** The surface of the pool (2D y, down the page) for how full it stands (0..1). */
export const poolSurfaceY = (fill: number): number => lumenSurface(POOL_SHARE * fill);

/** Where the pool's level and the jet's landing are in `box`, for `fill` (poolFill, eased) and the bleed that feeds it. */
export function poolUniforms(box: PoolBox, fill: number, bleed: { site: 'VAR' | 'GV'; rate: number; total: number }): PoolUniforms {
  const surf = poolSurfaceY(fill);
  const row = bleedShapesInto(makeBleedRows(), bleed, bleed.rate, SITES)[0] as number[];   // [surface, .5, landing x, flow, ...]
  const top = box[1], h = Math.max(box[3], 1e-5), w = Math.max(box[2], 1e-5);
  return { level: (top - y3(surf)) / h, unitsPerBox: h * UNITS_PER_SCENE, landX: (x3(row[2]!) - box[0]) / w, landHalf: 16 / (w * UNITS_PER_SCENE), flow: row[3]! };
}

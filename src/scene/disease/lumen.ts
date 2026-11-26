// How far a point of the figure is from the edge of the stomach-and-esophagus (as the mesh covers the screen: lumen-raster.ts, lumen-mask.generated.ts).
// One distance map, made the first time it is asked for
// (a two-pass chamfer over the mask's cells, about 25 thousand), read by the bleeding stream (stream-fit.ts) so it can never leave the organs it is drawn in. Pure; figure units (x right, y down).
import { FRONT_Z_ROWS, LUMEN_MASK_ROWS } from './lumen-mask.generated.ts';
import { FRONT_CELL, FRONT_H, FRONT_NONE, FRONT_W, MASK_CELL, MASK_H, MASK_W, MASK_X0, MASK_Y0, frontZOf } from './lumen-raster.ts';

let dist: Float32Array | null = null;
const BIG = 1e6;

/** The distance map, in cells: 0 outside, and for a covered cell about how many cells to the nearest uncovered one (the chamfer 3-4 metric, so within a tenth of the true distance). */
function build(): Float32Array {
  const d = new Float32Array(MASK_W * MASK_H).fill(BIG);
  for (let r = 0; r < MASK_H; r++) for (const [a, b] of LUMEN_MASK_ROWS[r] ?? []) for (let c = a; c <= b; c++) d[r * MASK_W + c] = BIG;
  // (cells outside any run, and the grid's border, are the edge: 0)
  const covered = new Uint8Array(MASK_W * MASK_H);
  for (let r = 0; r < MASK_H; r++) for (const [a, b] of LUMEN_MASK_ROWS[r] ?? []) for (let c = a; c <= b; c++) covered[r * MASK_W + c] = 1;
  for (let i = 0; i < d.length; i++) if (!covered[i]) d[i] = 0;
  const at = (r: number, c: number): number => (r < 0 || c < 0 || r >= MASK_H || c >= MASK_W ? 0 : d[r * MASK_W + c]!);
  for (let r = 0; r < MASK_H; r++) for (let c = 0; c < MASK_W; c++) {
    const i = r * MASK_W + c;
    if (!covered[i]) continue;
    d[i] = Math.min(d[i]!, at(r, c - 1) + 3, at(r - 1, c - 1) + 4, at(r - 1, c) + 3, at(r - 1, c + 1) + 4);
  }
  for (let r = MASK_H - 1; r >= 0; r--) for (let c = MASK_W - 1; c >= 0; c--) {
    const i = r * MASK_W + c;
    if (!covered[i]) continue;
    d[i] = Math.min(d[i]!, at(r, c + 1) + 3, at(r + 1, c + 1) + 4, at(r + 1, c) + 3, at(r + 1, c - 1) + 4);
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i]! / 3;
  return d;
}

/**
 * A cell's signed depth (figure units): a covered cell's distance to the edge, measured from its middle (the edge lies half a cell short of the nearest
 * uncovered one), and minus that half cell outside.
 */
function depthAt(d: Float32Array, r: number, c: number): number {
  if (c < 0 || r < 0 || c >= MASK_W || r >= MASK_H) return -0.5 * MASK_CELL;
  const v = d[r * MASK_W + c]!;
  return v > 0 ? (v - 0.5) * MASK_CELL : -0.5 * MASK_CELL;
}

/**
 * The distance (figure units) from (x, y) to the edge of the stomach and esophagus: negative outside, larger the deeper in. Read bilinearly between the
 * cells' middles, so it changes smoothly, not in steps of a cell.
 */
export function lumenClearance(x: number, y: number): number {
  const d = dist ?? (dist = build());
  const fc = (x - MASK_X0) / MASK_CELL - 0.5, fr = (y - MASK_Y0) / MASK_CELL - 0.5;
  const c = Math.floor(fc), r = Math.floor(fr), u = fc - c, v = fr - r;
  const top = depthAt(d, r, c) * (1 - u) + depthAt(d, r, c + 1) * u, bottom = depthAt(d, r + 1, c) * (1 - u) + depthAt(d, r + 1, c + 1) * u;
  return top * (1 - v) + bottom * v;
}

/** Is (x, y) inside the stomach and esophagus, `margin` figure units clear of their wall? */
export const insideLumen = (x: number, y: number, margin = 0): boolean => { const c = lumenClearance(x, y); return c >= margin && c > 0; };

/** How far in front of the front wall the stream rides (scene units): a little more than its own thickest radius (about 6 figure units = 0.02), so it is never sunk into the wall. */
export const STREAM_STANDOFF = 0.03;
/**
 * The front wall's depth (scene z) over the figure's point (x, y): the largest of the cell and its eight neighbours (the wall is smooth, and a long lens
 * must not let the stream sink at a rim), then, off the mesh, the nearest cell that has one.
 */
export function frontZ(x: number, y: number): number {
  const c = Math.floor((x - MASK_X0) / FRONT_CELL), r = Math.floor((y - MASK_Y0) / FRONT_CELL);
  for (let reach = 1; reach <= 8; reach++) {
    let best = -Infinity;
    for (let dr = -reach; dr <= reach; dr++) for (let dc = -reach; dc <= reach; dc++) {
      if (reach > 1 && Math.max(Math.abs(dr), Math.abs(dc)) < reach) continue;
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= FRONT_H || cc >= FRONT_W) continue;
      const code = FRONT_Z_ROWS[rr]!.slice(cc * 2, cc * 2 + 2);
      if (code !== FRONT_NONE) best = Math.max(best, frontZOf(code));
    }
    if (best > -Infinity) return best;
  }
  return 0;
}
/**
 * The depth the stream is drawn at over (x, y): just in front of the organ's own wall there, so the stream and the splash stay on the organ for any
 * camera (the old fixed depth of 0.36 slid them off it when the view was turned or tilted).
 */
export const streamZ = (x: number, y: number): number => frontZ(x, y) + STREAM_STANDOFF;

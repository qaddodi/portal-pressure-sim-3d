// Overlap hints for the anatomy editor (audit 14): does an edit push an organ into another organ or a vessel into an organ? Pure arithmetic on position arrays (no three, no DOM), for the panel to show.
// Organs are pillows that lie one over another in depth by design (organs/z.ts), so "overlap" is judged against the reference: an edit is flagged only where it makes the depth of one organ's surface inside another's
// column deeper than it already was by more than `tol`. An organ is read as a height field: for each cell of the figure's plane the lowest and highest z of its surface (a pillow is one interval per cell).
import type { V3 } from './types.ts';

export interface Columns { lo: [number, number]; cell: number; nx: number; ny: number; zmin: Float32Array; zmax: Float32Array }
const CELLS = 48;

/** The organ's height field from its vertices (3 numbers each) and, when given, its triangles (their middles add samples where the mesh is coarse). */
export function columnsOf(pos: ArrayLike<number>, index?: ArrayLike<number>): Columns {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]!); x1 = Math.max(x1, pos[i]!); y0 = Math.min(y0, pos[i + 1]!); y1 = Math.max(y1, pos[i + 1]!); }
  const cell = Math.max(1e-6, Math.max(x1 - x0, y1 - y0) / CELLS), nx = Math.floor((x1 - x0) / cell) + 1, ny = Math.floor((y1 - y0) / cell) + 1;
  const zmin = new Float32Array(nx * ny).fill(Infinity), zmax = new Float32Array(nx * ny).fill(-Infinity);
  const put = (x: number, y: number, z: number): void => {
    const c = Math.floor((x - x0) / cell) + nx * Math.floor((y - y0) / cell);
    if (z < zmin[c]!) zmin[c] = z;
    if (z > zmax[c]!) zmax[c] = z;
  };
  for (let i = 0; i < pos.length; i += 3) put(pos[i]!, pos[i + 1]!, pos[i + 2]!);
  if (index) for (let t = 0; t + 2 < index.length; t += 3) {
    const a = 3 * index[t]!, b = 3 * index[t + 1]!, c = 3 * index[t + 2]!;
    put((pos[a]! + pos[b]! + pos[c]!) / 3, (pos[a + 1]! + pos[b + 1]! + pos[c + 1]!) / 3, (pos[a + 2]! + pos[b + 2]! + pos[c + 2]!) / 3);
  }
  return { lo: [x0, y0], cell, nx, ny, zmin, zmax };
}
/** The organ's interval at a point of the plane, or null outside it. */
export function intervalAt(c: Columns, x: number, y: number): [number, number] | null {
  const ix = Math.floor((x - c.lo[0]) / c.cell), iy = Math.floor((y - c.lo[1]) / c.cell);
  if (ix < 0 || iy < 0 || ix >= c.nx || iy >= c.ny) return null;
  const k = ix + c.nx * iy, a = c.zmin[k]!;
  return a === Infinity ? null : [a, c.zmax[k]!];
}
/** How deep a point (radius `r`: a vessel's) lies inside the organ's column: positive inside (the distance to the nearer face, plus the radius), 0 when clear. */
export function depthIn(c: Columns, x: number, y: number, z: number, r = 0): number {
  const iv = intervalAt(c, x, y);
  if (!iv) return 0;
  return Math.max(0, Math.min(z + r - iv[0], iv[1] - (z - r)));
}
/** The deepest of `pos`'s vertices inside the organ's columns, where, and how many are inside. */
export function penetration(pos: ArrayLike<number>, c: Columns): { depth: number; count: number; at: V3 } {
  let depth = 0, count = 0, at: V3 = [0, 0, 0];
  for (let i = 0; i < pos.length; i += 3) {
    const d = depthIn(c, pos[i]!, pos[i + 1]!, pos[i + 2]!);
    if (d > 0) { count++; if (d > depth) { depth = d; at = [pos[i]!, pos[i + 1]!, pos[i + 2]!]; } }
  }
  return { depth, count, at };
}
export interface Hint { a: string; b: string; depth: number; was: number; at: V3 }
/** Organs (edited and reference vertices, `index` optional) whose edit pushes one into another by more than `tol` beyond what the reference already had. Every ordered pair is judged; the worst of each unordered pair is kept. */
export function organHints(organs: Record<string, { edited: ArrayLike<number>; reference: ArrayLike<number>; index?: ArrayLike<number> }>, tol = 0.01): Hint[] {
  const ids = Object.keys(organs), cols = new Map<string, Columns>(), ref = new Map<string, Columns>();
  for (const id of ids) { cols.set(id, columnsOf(organs[id]!.edited, organs[id]!.index)); ref.set(id, columnsOf(organs[id]!.reference, organs[id]!.index)); }
  const out: Hint[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i]!, b = ids[j]!;
    const ab = penetration(organs[a]!.edited, cols.get(b)!), ba = penetration(organs[b]!.edited, cols.get(a)!);
    const wab = penetration(organs[a]!.reference, ref.get(b)!).depth, wba = penetration(organs[b]!.reference, ref.get(a)!).depth;
    const worse = ab.depth - wab >= ba.depth - wba ? { p: ab, was: wab, x: a, y: b } : { p: ba, was: wba, x: b, y: a };
    if (worse.p.depth - worse.was > tol) out.push({ a: worse.x, b: worse.y, depth: worse.p.depth, was: worse.was, at: worse.p.at });
  }
  return out.sort((p, q) => q.depth - q.was - (p.depth - p.was));
}
/** A vessel (its centreline points, scene units, and its radius) against an organ: how deep it lies in the organ's column now, and how deep it did on the reference organ. A vessel that runs through its own organ (a hepatic vein) is judged against the reference too. */
export function vesselHint(centreline: readonly V3[], radius: number, edited: Columns, reference: Columns, tol = 0.01): { depth: number; was: number; at: V3; flagged: boolean } {
  let depth = 0, was = 0, at: V3 = [0, 0, 0];
  for (const p of centreline) {
    const d = depthIn(edited, p[0], p[1], p[2], radius), w = depthIn(reference, p[0], p[1], p[2], radius);
    if (d > depth) { depth = d; at = p; }
    if (w > was) was = w;
  }
  return { depth, was, at, flagged: depth - was > tol };
}

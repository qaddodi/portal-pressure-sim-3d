// The place the bleeding stream may be: the stomach and the esophagus as the 3D mesh covers them on the screen (x right, y down, the figure's 2D units). The stream is drawn in front of the organs,
// so "inside the esophagus and stomach" can only be judged against what the mesh covers on the screen; the 2D app's outline (copied/stomach-lumen.js) is not that, it is wider on the right and
// has no notch where the esophagus enters (the gap beside it that the stream used to cross). Pure arithmetic on a mesh's positions: scripts/gen-lumen-mask.mjs writes the table that
// lumen-mask.generated.ts holds, and tests/bleed-in-lumen.test.ts rasterises the real mesh again and requires the table to equal it, so a re-placed organ cannot leave the stream outside.

/** The grid: the cell's side in figure units, the first column's left edge and the first row's top edge, and how many of each. */
export const MASK_CELL = 2, MASK_X0 = 760, MASK_Y0 = 200, MASK_W = 130, MASK_H = 190;
/** One row's covered runs, as [first cell, last cell] pairs (inclusive), left to right. */
export type MaskRow = readonly (readonly [number, number])[];

interface Positions { count: number; getX(i: number): number; getY(i: number): number }
interface Indices { count: number; getX(i: number): number }

/** The rows of cells that the mesh's triangles cover when seen from the front. `x2d` and `y2d` take scene units to the figure's. */
export function rasterMask(pos: Positions, idx: Indices | null, x2d: (x: number) => number, y2d: (y: number) => number): MaskRow[] {
  const on = new Uint8Array(MASK_W * MASK_H);
  const xs = new Float64Array(pos.count), ys = new Float64Array(pos.count);
  for (let i = 0; i < pos.count; i++) { xs[i] = x2d(pos.getX(i)); ys[i] = y2d(pos.getY(i)); }
  const tris = idx ? idx.count / 3 : pos.count / 3;
  const cut: number[] = [];
  for (let t = 0; t < tris; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    const tx = [xs[a]!, xs[b]!, xs[c]!], ty = [ys[a]!, ys[b]!, ys[c]!];
    const r0 = Math.max(0, Math.floor((Math.min(ty[0]!, ty[1]!, ty[2]!) - MASK_Y0) / MASK_CELL)), r1 = Math.min(MASK_H - 1, Math.ceil((Math.max(ty[0]!, ty[1]!, ty[2]!) - MASK_Y0) / MASK_CELL));
    for (let r = r0; r <= r1; r++) {
      const y = MASK_Y0 + (r + 0.5) * MASK_CELL;
      cut.length = 0;
      for (let k = 0; k < 3; k++) {
        const k2 = (k + 1) % 3;
        if ((ty[k]! <= y) !== (ty[k2]! <= y)) cut.push(tx[k]! + ((y - ty[k]!) / (ty[k2]! - ty[k]!)) * (tx[k2]! - tx[k]!));
      }
      if (cut.length < 2) continue;
      const lo = Math.min(...cut), hi = Math.max(...cut);
      const c0 = Math.max(0, Math.ceil((lo - MASK_X0) / MASK_CELL - 0.5)), c1 = Math.min(MASK_W - 1, Math.floor((hi - MASK_X0) / MASK_CELL - 0.5));
      for (let col = c0; col <= c1; col++) on[r * MASK_W + col] = 1;
    }
  }
  const rows: MaskRow[] = [];
  for (let r = 0; r < MASK_H; r++) {
    const runs: [number, number][] = [];
    for (let c = 0; c < MASK_W; c++) {
      if (!on[r * MASK_W + c]) continue;
      const last = runs[runs.length - 1];
      if (last && last[1] === c - 1) last[1] = c; else runs.push([c, c]);
    }
    rows.push(runs);
  }
  return rows;
}

/** The depth grid: coarser than the mask (the front wall is smooth), `FRONT_CELL` figure units a side, from the same corner. */
export const FRONT_CELL = 4, FRONT_W = MASK_W / 2, FRONT_H = MASK_H / 2;
/** A depth is kept as two hex digits: round(z * 100) + 50 (z in scene units, so -0.50 to 1.05 in steps of 0.01); `..` where the mesh does not cover the cell. */
export const FRONT_NONE = '..';
export const frontCode = (z: number): string => Math.max(0, Math.min(255, Math.round(z * 100) + 50)).toString(16).padStart(2, '0');
export const frontZOf = (code: string): number => (parseInt(code, 16) - 50) / 100;

/** The front wall's depth at each coarse cell: the largest z any triangle has there (the one nearest a viewer in front), as rows of FRONT_W two-digit codes. */
export function rasterFront(pos: Positions & { getZ(i: number): number }, idx: Indices | null, x2d: (x: number) => number, y2d: (y: number) => number): string[] {
  const best = new Float64Array(FRONT_W * FRONT_H).fill(-Infinity);
  const tris = idx ? idx.count / 3 : pos.count / 3;
  for (let t = 0; t < tris; t++) {
    const v = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
    const X = v.map((i) => x2d(pos.getX(i))), Y = v.map((i) => y2d(pos.getY(i))), Z = v.map((i) => pos.getZ(i));
    const den = (Y[1]! - Y[2]!) * (X[0]! - X[2]!) + (X[2]! - X[1]!) * (Y[0]! - Y[2]!);
    if (Math.abs(den) < 1e-9) continue;
    const c0 = Math.max(0, Math.floor((Math.min(X[0]!, X[1]!, X[2]!) - MASK_X0) / FRONT_CELL)), c1 = Math.min(FRONT_W - 1, Math.floor((Math.max(X[0]!, X[1]!, X[2]!) - MASK_X0) / FRONT_CELL));
    const r0 = Math.max(0, Math.floor((Math.min(Y[0]!, Y[1]!, Y[2]!) - MASK_Y0) / FRONT_CELL)), r1 = Math.min(FRONT_H - 1, Math.floor((Math.max(Y[0]!, Y[1]!, Y[2]!) - MASK_Y0) / FRONT_CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const px = MASK_X0 + (c + 0.5) * FRONT_CELL, py = MASK_Y0 + (r + 0.5) * FRONT_CELL;
      const a = ((Y[1]! - Y[2]!) * (px - X[2]!) + (X[2]! - X[1]!) * (py - Y[2]!)) / den, b = ((Y[2]! - Y[0]!) * (px - X[2]!) + (X[0]! - X[2]!) * (py - Y[2]!)) / den, g = 1 - a - b;
      if (a < 0 || b < 0 || g < 0) continue;
      const z = a * Z[0]! + b * Z[1]! + g * Z[2]!;
      if (z > best[r * FRONT_W + c]!) best[r * FRONT_W + c] = z;
    }
  }
  const rows: string[] = [];
  for (let r = 0; r < FRONT_H; r++) { let s = ''; for (let c = 0; c < FRONT_W; c++) { const z = best[r * FRONT_W + c]!; s += z === -Infinity ? FRONT_NONE : frontCode(z); } rows.push(s); }
  return rows;
}

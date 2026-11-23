// The GPU path of the collagen atlas, literally, for a test that must judge the plate AT THE SCREEN'S SCALE (tests/collagen-screen.test.ts). ROOT CAUSE of the potato banding that every earlier test missed (23 Nov 2026):
// they judged one dimensional profiles at plate scale through an ideal float box blur, but on the iPad one plate pixel is 1.4 to 2.1 device px, and the GPU's mip chain is lattice aligned 2 x 2 boxes stored at 8 bits per
// level and read with BILINEAR weights (itself stored at 1/256). So here: the chain (8 bit at every level), bilinear fetches with texel centres at (i + 0.5) 2^k and clamp to edge, the shader's own 12 taps built from the
// EXPORTED collFieldTaps (so the value and the slope come out exactly as the fragment computes them), and the old rule (mip 6 bilinear soft copy, sharp mip 3 central difference) as the twin the test must catch.
// A layer is one plate's alpha, n x n with n = 2048 (PLATE_PX), row j is plate v (j + 0.5) / n.
import { COLL_LOD, collFieldTaps } from '../../src/scene/lobule/collagen-field.ts';

export const q8 = (v: number): number => Math.round(v * 255) / 255;

/** The mip chain of one alpha layer: level k is (n >> k) square, each level a 2 x 2 box of the stored one above, rounded to 8 bits. */
export interface Mips { n: number; lv: Float32Array[] }
export function mipChain(a: Float32Array, n: number, top = 6): Mips {
  const lv: Float32Array[] = [Float32Array.from(a, q8)];
  for (let k = 1; k <= top; k++) {
    const p = lv[k - 1]!, pn = n >> (k - 1), m = n >> k, o = new Float32Array(m * m);
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) o[y * m + x] = q8((p[2 * y * pn + 2 * x]! + p[2 * y * pn + 2 * x + 1]! + p[(2 * y + 1) * pn + 2 * x]! + p[(2 * y + 1) * pn + 2 * x + 1]!) / 4);
    lv.push(o);
  }
  return { n, lv };
}
const texel = (m: Mips, k: number, i: number, j: number): number => { const s = m.n >> k; return m.lv[k]![Math.min(s - 1, Math.max(0, j)) * s + Math.min(s - 1, Math.max(0, i))]!; };
/** A bilinear fetch at level k, at plate px (x, y) (continuous, 0..n): texel centres at (i + 0.5) 2^k, the fraction taken at 1/256 as a GPU does. */
export function bilinear(m: Mips, k: number, x: number, y: number, quant = true): number {
  const s = 2 ** k, u = x / s - 0.5, v = y / s - 0.5, i = Math.floor(u), j = Math.floor(v), q = (f: number): number => (quant ? Math.round(f * 256) / 256 : f), fu = q(u - i), fv = q(v - j);
  return (texel(m, k, i, j) * (1 - fu) + texel(m, k, i + 1, j) * fu) * (1 - fv) + (texel(m, k, i, j + 1) * (1 - fu) + texel(m, k, i + 1, j + 1) * fu) * fv;
}

/** What the plate shader reads at plate px (x, y): the soft value, the sharp painted alpha and the slope (alpha per plate px, x right, y along the rows). */
export interface Field { soft: number; sharp: number; gx: number; gy: number }
/** The shader's collField: the 12 taps of collFieldTaps, each one bilinear fetch of level COLL_LOD. */
export function fieldAt(m: Mips, x: number, y: number, quant = true): Field {
  const t = collFieldTaps(x / m.n, y / m.n, m.n >> COLL_LOD);
  const at = (k: { u: number; v: number; w: number }): number => k.w * bilinear(m, COLL_LOD, k.u * m.n, k.v * m.n, quant);
  let soft = 0, gx = 0, gy = 0;
  for (const k of t.val) soft += at(k);
  for (const k of t.dx) gx += at(k);
  for (const k of t.dy) gy += at(k);
  return { soft, sharp: bilinear(m, 0, x, y, quant), gx, gy };
}
/** The rule of c0fd5543, which this test must catch: one bilinear tap of mip 6 for the soft copy, and the sharp layer's mip 3 (an 8 px box) read 4 px either side for the slope. */
export function legacyAt(m: Mips, x: number, y: number, quant = true): Field {
  const b = (k: number, X: number, Y: number): number => bilinear(m, k, X, Y, quant);
  return { soft: b(6, x, y), sharp: b(0, x, y), gx: (b(3, x + 4, y) - b(3, x - 4, y)) / 8, gy: (b(3, x, y + 4) - b(3, x, y - 4)) / 8 };
}

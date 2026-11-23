// The fibrosis bands as ONE smooth collagen field (Mohammad, 23 Nov 2026: "why is it potato quality banded"). ROOT CAUSES of the washboard, the blocks and the halo on c0fd5543 (judged at the iPad's screen scale, where a plate
// pixel is 1.4 to 2.1 device px, tests/collagen-screen.test.ts): (1) the relief's height was the SHARP painted layer at mip 3 with a gain that saturates at 0.01 alpha per plate px, so every painted tier edge and fibre became a
// fully lit plus fully shaded ridge pair (22 to 25 reversals across one septum); (2) the soft copy was ONE bilinear tap of mip 6, 32 x 32 texels for the whole plate, which is only C0 on a 64 px lattice (110 device px: blocks,
// and a staircase on every diagonal band); (3) the arrival times were padded 32 px, but that copy reaches 76 to 80 px past the painted edge, so a 14 % beige rim was cut off round the tracts and the vein's cuff.
// Here the soft edge and the rope's height are the SAME field: a cubic B-spline of the atlas at ONE absolute level (COLL_LOD 5, 32 plate px a texel: the three painted tiers merge into one flank and the fibres drop out),
// read with the four-tap bilinear trick (Sigg and Hadwiger, GPU Gems 2 ch. 20) and its ANALYTIC gradient (the same trick with the derivative weights, 12 fetches a layer). The rope is lit exactly where the band visibly
// rises: one lit flank, one shade flank, nothing inside. The JS twin below (weights, taps) is what the shader places, so a test judges the field through an emulated GPU mip chain (tests/helpers/gpu-mips.ts).
import { glslNum as F } from '../cel-glsl.ts';

/** The plate's size the pad and the texel are in (plate.ts PLATE_PX: a test holds the two equal; not imported here so the arrival times stay free of three). */
export const SOFT_PLATE_PX = 2048;
/** The ONE mip level (absolute, so it is the same at every zoom) the soft edge and the relief's height are read at: 2^5 = 32 plate px a texel. */
export const COLL_LOD = 5;
/** Texels of that level across one plate (the atlas is two plates wide), and plate px in one texel. */
export const COLL_N = SOFT_PLATE_PX / 2 ** COLL_LOD;
export const COLL_PX = 2 ** COLL_LOD;
/** How far (plate px) the field spreads past the painted edge, as a bound: the B-spline reads 2 texels either side of its sample, and a texel holds alpha only if a painted pixel lies in it (half a texel more): 2.5 texels
 *  = 80 px. (Measured on the real layers, 64 px already leaves alpha under 1e-4.) The arrival times (collagen-tau.ts) reach this far, so front() never cuts the field's edge. */
export const SOFT_PAD_PX = 2.5 * COLL_PX;
/** The pad in world units for a layer spanning [-box, box] (the field's spread, as the plate sees it at any n). */
export const softPadWorld = (box: number): number => SOFT_PAD_PX * (2 * box) / SOFT_PLATE_PX;

/** The cubic B-spline's four weights at the fraction f of a texel interval (they sum to 1), for the texels i - 1, i, i + 1, i + 2. */
export function bsplineW(f: number): [number, number, number, number] {
  const f2 = f * f, f3 = f2 * f;
  return [(1 - f) ** 3 / 6, (3 * f3 - 6 * f2 + 4) / 6, (-3 * f3 + 3 * f2 + 3 * f + 1) / 6, f3 / 6];
}
/** Their derivatives with respect to f (they sum to 0): the first two are never above 0 and the last two never below 0 on [0, 1], and d0 + d1 = -(d2 + d3) is never 0, which is what lets one bilinear tap stand for a pair. */
export function bsplineD(f: number): [number, number, number, number] {
  const f2 = f * f;
  return [-((1 - f) ** 2) / 2, (3 * f2 - 4 * f) / 2, (-3 * f2 + 2 * f + 1) / 2, f2 / 2];
}

/** One bilinear fetch: where (plate uv, already clamped to the plate's own texel centres) and its weight. */
export interface CollTap { u: number; v: number; w: number }
/** The 12 fetches of a layer at plate uv (u, v): 4 for the value (premultiplied rgba), 4 for the x slope, 4 for the y slope (alpha per plate px, x right, v up), exactly as the GLSL places them. `size`: texels across a plate. */
export function collFieldTaps(u: number, v: number, size: number = COLL_N): { val: CollTap[]; dx: CollTap[]; dy: CollTap[] } {
  const cx = u * size - 0.5, cy = v * size - 0.5, ix = Math.floor(cx), iy = Math.floor(cy), fx = cx - ix, fy = cy - iy;
  const wx = bsplineW(fx), wy = bsplineW(fy), dx = bsplineD(fx), dy = bsplineD(fy);
  const gx: [number, number] = [wx[0] + wx[1], wx[2] + wx[3]], gy: [number, number] = [wy[0] + wy[1], wy[2] + wy[3]];
  const Gx = dx[2] + dx[3], Gy = dy[2] + dy[3];
  // tap positions in texel-centre coordinates (texel i is at i), then clamped to the plate's own first and last centre: clamp-to-edge PER PLATE, no tap reads the other plate across the atlas seam
  const px = (t: number): number => (Math.min(size - 1, Math.max(0, t)) + 0.5) / size;
  const tx: [number, number] = [ix - 1 + wx[1] / gx[0], ix + 1 + wx[3] / gx[1]], ty: [number, number] = [iy - 1 + wy[1] / gy[0], iy + 1 + wy[3] / gy[1]];
  const ux: [number, number] = [ix - 1 + dx[1] / (dx[0] + dx[1]), ix + 1 + dx[3] / Gx], uy: [number, number] = [iy - 1 + dy[1] / (dy[0] + dy[1]), iy + 1 + dy[3] / Gy];
  const val: CollTap[] = [], sx: CollTap[] = [], sy: CollTap[] = [];
  for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
    val.push({ u: px(tx[a]), v: px(ty[b]), w: gx[a]! * gy[b]! });
    sx.push({ u: px(ux[a]), v: px(ty[b]), w: (a ? 1 : -1) * Gx * gy[b]! / COLL_PX });
    sy.push({ u: px(tx[a]), v: px(uy[b]), w: (b ? 1 : -1) * Gy * gx[a]! / COLL_PX });
  }
  return { val, dx: sx, dy: sy };
}

/** GLSL twin. `collField(uv, plate0)`: the field of ONE layer at a plate uv (plate0 0: the tracts and the vein on the atlas's left plate, 0.5: the septa on its right), as `.v` (premultiplied rgba) and `.g` (alpha per plate px,
 *  x right, y up). Needs `mapC`, `mapCB` and `mixB` declared before it (a crossfade mixes each fetch with the twin atlas's at the same place, so the field of the mix is whole at every step). Explicit levels only: no derivative. */
export const COLL_FIELD_GLSL = /* glsl */ `
const float COLL_LOD = ${F(COLL_LOD)};
const float COLL_N = ${F(COLL_N)};
const float COLL_PX = ${F(COLL_PX)};
struct CollF { vec4 v; vec2 g; };
vec4 collW(float f) { float f2 = f * f, f3 = f2 * f; return vec4((1.0 - f) * (1.0 - f) * (1.0 - f), 3.0 * f3 - 6.0 * f2 + 4.0, -3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0, f3) / 6.0; }
vec4 collD(float f) { float f2 = f * f; return vec4(-(1.0 - f) * (1.0 - f), 3.0 * f2 - 4.0 * f, -3.0 * f2 + 2.0 * f + 1.0, f2) * 0.5; }
// a tap position (texel-centre coordinates) kept on its plate's own texel centres, as a plate uv
float collU(float t) { return (clamp(t, 0.0, COLL_N - 1.0) + 0.5) / COLL_N; }
vec4 collTap(float tu, float tv, float plate0) {
  vec2 a = vec2(plate0 + collU(tu) * 0.5, collU(tv));
  vec4 s = textureLod(mapC, a, COLL_LOD);
  return mixB > 0.0 ? mix(s, textureLod(mapCB, a, COLL_LOD), mixB) : s;
}
CollF collField(vec2 uv, float plate0) {
  vec2 c = uv * COLL_N - 0.5, i = floor(c), f = c - i;
  vec4 wx = collW(f.x), wy = collW(f.y), dx = collD(f.x), dy = collD(f.y);
  float gx0 = wx.x + wx.y, gx1 = wx.z + wx.w, gy0 = wy.x + wy.y, gy1 = wy.z + wy.w;
  float Gx = dx.z + dx.w, Gy = dy.z + dy.w;   // (= -(dx.x + dx.y): never 0)
  vec2 tx = vec2(i.x - 1.0 + wx.y / gx0, i.x + 1.0 + wx.w / gx1), ty = vec2(i.y - 1.0 + wy.y / gy0, i.y + 1.0 + wy.w / gy1);
  vec2 ux = vec2(i.x - 1.0 + dx.y / (dx.x + dx.y), i.x + 1.0 + dx.w / Gx), uy = vec2(i.y - 1.0 + dy.y / (dy.x + dy.y), i.y + 1.0 + dy.w / Gy);
  CollF r;
  r.v = gy0 * (gx0 * collTap(tx.x, ty.x, plate0) + gx1 * collTap(tx.y, ty.x, plate0)) + gy1 * (gx0 * collTap(tx.x, ty.y, plate0) + gx1 * collTap(tx.y, ty.y, plate0));
  float sx = gy0 * (collTap(ux.y, ty.x, plate0).a - collTap(ux.x, ty.x, plate0).a) + gy1 * (collTap(ux.y, ty.y, plate0).a - collTap(ux.x, ty.y, plate0).a);
  float sy = gx0 * (collTap(tx.x, uy.y, plate0).a - collTap(tx.x, uy.x, plate0).a) + gx1 * (collTap(tx.y, uy.y, plate0).a - collTap(tx.y, uy.x, plate0).a);
  r.g = vec2(Gx * sx, Gy * sy) / COLL_PX;
  return r;
}
`;

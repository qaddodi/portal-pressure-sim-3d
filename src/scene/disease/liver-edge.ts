// The liver's lower edge, for the ascites' liver cut. The 2D keeps the straw off a congested liver ("over the dusky liver its straw turned the lower lobe into a brown blotch",
// organ picks, round 26): stage-organs.js morphLiver sets `liverFluidCut = smooth01(congestion / 0.5)`, builds `liverFloor = lowerEdge(outline)` (the liver's lower edge in its own frame,
// one number per column across the fluid's rectangle, stage-organs.js lowerEdge) and veins-gl.js fluidAt multiplies the fluid by 1 - cut * (1 - smoothstep(-px, px, lu.y - edge)), `lu`
// being the point in the liver's frame (undone from its shrink about 560, 350). This file is that edge (the same outline, the same morph, the same columns: copied/liver-outline.js,
// copied/liver-morph.js) and the same sum, once; ascites.ts hands the table to the pool's program as a texture.
import { LIVER_OUTLINE, FLUID_COLS, FLUID_R } from './copied/liver-outline.js';
import { contourNodules, liverShrink, morphOutline, outlineNormals, smooth01 } from './copied/liver-morph.js';
import { ORGAN_MESHES } from '../organs/meshes.ts';
import { ORIGIN_2D, UNITS_PER_SCENE, x2d, y2d } from '../frame2d.ts';

export { FLUID_COLS, FLUID_R };
/** The liver's pivot (stage-diaphragm.js: its shrink is about this point) in 2D units. */
export const LIVER_AT = [560, 350] as const;
/** A column with no liver in it: the edge is far above everything, so nothing is cut there. */
export const NO_LIVER = -1e4;
/** stage-organs.js morphLiver quantises the morph's two numbers (40 steps, 200 on the fine path) before it reshapes the outline: the 3D keeps the fine step, so the edge glides. */
export const EDGE_STEPS = 200;

const N = LIVER_OUTLINE.pts.length / 2;
let base: { pts: [number, number][]; nm: number[][]; nod: number[][] } | null = null;
const baseLiver = () => base ?? (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) pts.push([LIVER_OUTLINE.pts[i * 2]!, LIVER_OUTLINE.pts[i * 2 + 1]!]);
  return (base = { pts, nm: outlineNormals(pts), nod: contourNodules(LIVER_OUTLINE.L, N) });
})();

/** stage-organs.js lowerEdge: the lowest y (2D, y down) of the outline `P` in each of FLUID_COLS columns across FLUID_R, NO_LIVER where it has none. Written into `out`. */
export function lowerEdge(P: ArrayLike<ArrayLike<number>>, out: Float32Array): Float32Array {
  out.fill(NO_LIVER);
  return lowerEdgeInto(P, out);
}
/** lowerEdge without clearing `out` first: the polygon's lower edge laid into what `out` already holds (the deepest wins), so many pieces fill one table. */
function lowerEdgeInto(P: ArrayLike<ArrayLike<number>>, out: Float32Array): Float32Array {
  const k = (FLUID_COLS - 1) / FLUID_R[2]!;
  for (let i = 0; i < P.length; i++) {
    const a = P[i]!, b = P[(i + 1) % P.length]!, ax = a[0]!, ay = a[1]!, bx = b[0]!, by = b[1]!;
    const u0 = Math.ceil((Math.min(ax, bx) - FLUID_R[0]!) * k), u1 = Math.floor((Math.max(ax, bx) - FLUID_R[0]!) * k);
    for (let u = Math.max(0, u0); u <= Math.min(FLUID_COLS - 1, u1); u++) {
      const x = FLUID_R[0]! + u / k, y = bx === ax ? Math.max(ay, by) : ay + (by - ay) * (x - ax) / (bx - ax);
      if (y > out[u]!) out[u] = y;
    }
  }
  return out;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** The liver's lower edge for the shown cirrhosis `c` and congestion `g` (0..1), written into `out` (FLUID_COLS floats): the outline as the 2D reshapes it (morphOutline, in the liver's own frame, before its shrink). */
export function liverEdgeTable(c: number, g: number, out: Float32Array = new Float32Array(FLUID_COLS)): Float32Array {
  // (the lower edge of the liver mesh as it is built, once the organ file is in; until then the 2D outline's)
  const m = meshEdge();
  if (m) { out.set(m); return out; }
  const q = EDGE_STEPS, cc = Math.round(clamp01(c) * q) / q, gg = Math.round(clamp01(g) * q) / q, b = baseLiver();
  return lowerEdge(cc + gg > 0 ? morphOutline(b, cc, gg).out : b.pts, out);
}

/** How far the fluid is kept off the liver (0..1) at a shown congestion: stage-organs.js `smooth01(g / 0.5)`. */
export const liverCut = (congestion: number): number => smooth01(congestion / 0.5);
/** The liver's drawn scale about LIVER_AT (stage-diaphragm.js: liverShrink of the shown cirrhosis and congestion). */
export const liverScaleOf = (c: number, g: number): number => liverShrink(c, g);

/** veins-gl.js fluidAt's liver term: the share of the fluid kept at the 2D point (wx, wy), for the liver edge `table`, its drawn `scale`, the cut `cut` (0..1) and `px` (one screen pixel in 2D units). 0 inside the liver's cut, 1 below its lower edge, a one-pixel smoothstep between. The pool's fragment program (LIVER_CUT_FS) is this sum. */
export function liverKeep(table: ArrayLike<number>, wx: number, wy: number, scale: number, cut: number, px: number): number {
  if (!(cut > 0)) return 1;
  const lx = (wx - LIVER_AT[0]) / scale + LIVER_AT[0], ly = (wy - LIVER_AT[1]) / scale + LIVER_AT[1];
  const f = clamp01((lx - FLUID_R[0]!) / FLUID_R[2]!) * (FLUID_COLS - 1), i = Math.min(Math.floor(f), FLUID_COLS - 2);
  const lb = table[i]! + (table[i + 1]! - table[i]!) * (f - i);
  const t = clamp01((ly - lb + px) / (2 * px));
  return 1 - cut * (1 - t * t * (3 - 2 * t));
}

/** The vertex program's half: the pool's 2D position (x, y down) from its vertex, written before the lift (frame2d.ts: the scene's units to the figure's). */
export const LIVER_CUT_VS_DECL = 'varying vec2 vW2d;';
export const LIVER_CUT_VS_MAIN = `vW2d = vec2(position.x * ${UNITS_PER_SCENE.toFixed(1)} + ${ORIGIN_2D.x.toFixed(1)}, ${ORIGIN_2D.y.toFixed(1)} - position.y * ${UNITS_PER_SCENE.toFixed(1)});`;
/** The fragment program's half: `liverKeep(vW2d, px)` is the share of the fluid kept at this fragment, the sum of `liverKeep` above (veins-gl.js fluidAt: lu is the point in the liver's frame, lx the column across the rectangle, lb its lower edge, linearly between two columns). */
export const LIVER_CUT_FS = /* glsl */ `
uniform highp sampler2D uLiverEdge;
uniform float uLiverCut;
uniform float uLiverScale;
varying vec2 vW2d;
float liverKeep(vec2 w, float px) {
  if (uLiverCut <= 0.0) return 1.0;
  vec2 lu = (w - vec2(560.0, 350.0)) / uLiverScale + vec2(560.0, 350.0);
  float lx = clamp((lu.x - ${FLUID_R[0]!.toFixed(1)}) / ${FLUID_R[2]!.toFixed(1)}, 0.0, 1.0) * ${(FLUID_COLS - 1).toFixed(1)};
  int l0 = int(min(floor(lx), ${(FLUID_COLS - 2).toFixed(1)}));
  float lb = mix(texelFetch(uLiverEdge, ivec2(l0, 0), 0).r, texelFetch(uLiverEdge, ivec2(l0 + 1, 0), 0).r, lx - float(l0));
  return 1.0 - uLiverCut * (1.0 - smoothstep(-px, px, lu.y - lb));
}`;

let meshKept: Float32Array | null = null;
/** The liver mesh's lower edge (lowerEdge over every edge of its triangles, in the figure's units): the lowest point of the drawn liver in each column, the same table the 2D outline gives. Null until the organ file is in.
 *  The mesh is the organ file's, made once, so the table is made once: ORGAN_MESHES hands out a fresh geometry on every ask, so a cache keyed by the geometry never held and every ask walked the whole liver again,
 *  1201 columns cleared and read for each of its triangles (on the placed liver, 100 000 of them). x and y only: ORGAN_Z moves the mesh in depth alone. */
function meshEdge(): Float32Array | null {
  if (meshKept) return meshKept;
  let geo;
  try { geo = ORGAN_MESHES.liver!(); } catch { return null; }
  const pos = geo.getAttribute('position'), idx = geo.index, edge = new Float32Array(FLUID_COLS).fill(NO_LIVER);
  const P = (i: number): [number, number] => [x2d(pos.getX(i)), y2d(pos.getY(i))];
  const n = idx ? idx.count : pos.count;
  for (let t = 0; t + 2 < n; t += 3) lowerEdgeInto([P(idx ? idx.getX(t) : t), P(idx ? idx.getX(t + 1) : t + 1), P(idx ? idx.getX(t + 2) : t + 2)], edge);
  meshKept = edge;
  return edge;
}

// The raised-relief colours (Mohammad, 23 Nov 2026, mock C): the slope form reliefS and reliefColour, lit from the ONE world light. Only the central vein's band (cv-band.ts, with its own analytic height) uses them now: the septa and the tracts are cords (collagen-cords.ts), flat cel colours with
// no relief at all (Plan 49b: "this looks 3D"). The JS twin below and the GLSL are written from the same numbers, so a test can judge the colours without a GPU.
import { glslNum as F } from '../cel-glsl.ts';

/** The slope's gain per unit of height slope (the vein's analytic band height, cv-band.ts): the steepest flank peaks at |s| about 0.8 and never clamps, its flat middle stays 0. */
export const RELIEF_G = 100;
/** The collagen's height is read this many plate pixels either side of the pixel (mip 3 is an 8 px blur: the slope over 2 x this), and at this mip level (absolute, so the relief is the same at every zoom). */
export const RELIEF_D_PX = 8, RELIEF_LOD = 4;
/** The collagen's own gain (the septa and tracts, fitted to mock C by tests/helpers and the node twin: mean 3 of 255 against render.mts), a plain clamp. */
export const COLL_RELIEF_G = 40;
/** The relief is linear up to this |s| and then eases into 1 (a smooth knee, never a clamp): a thin band's steep flank (a spur, a third as wide as a hex septum) would otherwise sit flat at |s| = 1 and its edge would be a crease
 *  in a smooth gradient (tests/collagen-screen.test.ts). The hex and bridge septa peak below it, so their relief is exactly the linear one. */
export const RELIEF_KNEE = 0.7;
/** The warm lift toward white at s = 1 (per channel): fitted to the mock's OKLab lit offset (dL +0.09) on the septum and the tract colours. */
export const RELIEF_LIT: readonly [number, number, number] = [0.52, 0.38, 0.26];
/** The warm deepening at s = -1 (per channel): the mock's shade offset (dL -0.12). */
export const RELIEF_SHADE: readonly [number, number, number] = [0.18, 0.21, 0.36];

/** The relief of a pixel, -1 (shade) to 1 (lit; reached only asymptotically): d the height's slope per plate pixel (x right, y up, in the plate's own axes), L the world light in the same two axes. 0 on flat ground. */
export function reliefS(dhx: number, dhy: number, Lx: number, Ly: number): number {
  const x = -RELIEF_G * (dhx * Lx + dhy * Ly), a = Math.abs(x), k = RELIEF_KNEE;
  return Math.sign(x) * (Math.min(a, k) + (1 - k) * Math.tanh(Math.max(a - k, 0) / (1 - k))) + 0;   // (+ 0: never -0)
}

/** The colour of collagen with relief s: s > 0 lifts toward white by RELIEF_LIT x s, s < 0 deepens by RELIEF_SHADE x -s. Smooth through s = 0 (no step); `reliefColour(c, 0)` is c. */
export function reliefColour(c: readonly number[], s: number): [number, number, number] {
  const o: [number, number, number] = [c[0]!, c[1]!, c[2]!];
  for (let i = 0; i < 3; i++) o[i] = s > 0 ? c[i]! + (1 - c[i]!) * RELIEF_LIT[i]! * s : c[i]! * (1 - RELIEF_SHADE[i]! * -s);
  return o;
}

const V3 = (v: readonly number[]): string => `vec3(${v.map(F).join(', ')})`;
/** GLSL twin of reliefS and reliefColour (fragment and vertex safe: no derivative). */
export const RELIEF_GLSL = /* glsl */ `
const float RELIEF_G = ${F(RELIEF_G)};
const float COLL_RELIEF_G = ${F(COLL_RELIEF_G)};
const vec3 RELIEF_LIT = ${V3(RELIEF_LIT)};
const vec3 RELIEF_SHADE = ${V3(RELIEF_SHADE)};
const float RELIEF_KNEE = ${F(RELIEF_KNEE)};
float reliefS(vec2 dh, vec2 L) { float x = -RELIEF_G * dot(dh, L), a = abs(x); return sign(x) * (min(a, RELIEF_KNEE) + (1.0 - RELIEF_KNEE) * tanh(max(a - RELIEF_KNEE, 0.0) / (1.0 - RELIEF_KNEE))); }
vec3 reliefColour(vec3 c, float s) { return mix(c * (1.0 - RELIEF_SHADE * -min(s, 0.0)), c + (1.0 - c) * RELIEF_LIT * max(s, 0.0), step(0.0, s)); }
`;

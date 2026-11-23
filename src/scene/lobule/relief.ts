// The lobule's collagen as raised ropes (Mohammad, 23 Nov 2026, picked mock C "Raised relief"; Plan 47: crisp, never glowing; Plan 48: varied and roped across the whole fade, not a thin rim). A rope's height rises smoothly from its edge (t 0) to its core (t 1, collagen-edge.ts
// fadeT): the slope of that rise, against the ONE world light, is the relief: one lit flank, one shade flank, a flat crown at the core, nothing outside the edge. The lift never takes the colour more than ROPE_LIFT_MAX of lightness above the collagen's own.
// The vein's band (cv-band.ts) keeps reliefS, the slope form, with its own analytic height.
// The JS twin below and the GLSL are written from the same numbers, so a test can judge the colours without a GPU (tests/collagen-crisp.test.ts).
import { glslNum as F } from '../cel-glsl.ts';

/** The slope's gain per unit of height slope (the vein's analytic band height, cv-band.ts): the steepest flank peaks at |s| about 0.8 and never clamps, its flat middle stays 0. */
export const RELIEF_G = 100;
/** The relief is linear up to this |s| and then eases into 1 (a smooth knee, never a clamp): a thin band's steep flank (a spur, a third as wide as a hex septum) would otherwise sit flat at |s| = 1 and its edge would be a crease
 *  in a smooth gradient (tests/collagen-screen.test.ts). The hex and bridge septa peak below it, so their relief is exactly the linear one. */
export const RELIEF_KNEE = 0.7;
/** The warm lift toward white at s = 1 (per channel): fitted to the mock's OKLab lit offset (dL +0.09) on the septum and the tract colours. */
export const RELIEF_LIT: readonly [number, number, number] = [0.52, 0.38, 0.26];
/** The warm deepening at s = -1 (per channel): the mock's shade offset (dL -0.12). */
export const RELIEF_SHADE: readonly [number, number, number] = [0.18, 0.21, 0.36];

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

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

/** A lit flank never takes the collagen's lightness more than this above its own (the mock's lit offset): a sheen on the rope, never brighter than the collagen can be. */
export const ROPE_LIFT_MAX = 0.09;
const luma = (c: readonly number[]): number => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;

/** The rope's relief at fade depth t (0 the outer edge, 1 the core's edge and beyond), for an outward edge normal (nx, ny) and the world light (Lx, Ly), both in the plate's x (right) and y (up): the height is the smoothstep of t, its slope (6 t (1 - t), normalised to 1 at the
 *  middle of the fade: 4 t (1 - t)) times how squarely the flank faces the light: + on the lit flank, - on the shade flank, 0 at the rim and on the crown. */
export function ropeS(t: number, nx: number, ny: number, Lx: number, Ly: number): number {
  const x = clamp(t, 0, 1), tilt = 4 * x * (1 - x), ln = Math.hypot(Lx, Ly), nn = Math.hypot(nx, ny);
  if (ln < 1e-3 || nn < 1e-3) return 0;
  return tilt * ((nx * Lx + ny * Ly) / (nn * ln)) + 0;   // (+ 0: never -0)
}
/** The colour of a rope with relief s: reliefColour, but the lit lift is scaled so it never exceeds ROPE_LIFT_MAX of lightness. */
export function ropeColour(c: readonly number[], s: number): [number, number, number] {
  if (s <= 0) return reliefColour(c, s);
  const lit = [0, 1, 2].map((i) => (1 - c[i]!) * RELIEF_LIT[i]!), k = Math.min(1, ROPE_LIFT_MAX / Math.max(luma(lit), 1e-4));
  return [c[0]! + lit[0]! * k * s, c[1]! + lit[1]! * k * s, c[2]! + lit[2]! * k * s];
}

const V3 = (v: readonly number[]): string => `vec3(${v.map(F).join(', ')})`;
/** GLSL twin of reliefS, ropeS, reliefColour and ropeColour (fragment and vertex safe: no derivative). */
export const RELIEF_GLSL = /* glsl */ `
const float RELIEF_G = ${F(RELIEF_G)};
const vec3 RELIEF_LIT = ${V3(RELIEF_LIT)};
const vec3 RELIEF_SHADE = ${V3(RELIEF_SHADE)};
const float RELIEF_KNEE = ${F(RELIEF_KNEE)};
float reliefS(vec2 dh, vec2 L) { float x = -RELIEF_G * dot(dh, L), a = abs(x); return sign(x) * (min(a, RELIEF_KNEE) + (1.0 - RELIEF_KNEE) * tanh(max(a - RELIEF_KNEE, 0.0) / (1.0 - RELIEF_KNEE))); }
const float ROPE_LIFT_MAX = ${F(ROPE_LIFT_MAX)};
float ropeS(float t, vec2 n, vec2 L) {
  float x = clamp(t, 0.0, 1.0), tilt = 4.0 * x * (1.0 - x), ln = length(L), nn = length(n);
  return (ln < 1e-3 || nn < 1e-3) ? 0.0 : tilt * dot(n, L) / (nn * ln);
}
vec3 reliefColour(vec3 c, float s) { return mix(c * (1.0 - RELIEF_SHADE * -min(s, 0.0)), c + (1.0 - c) * RELIEF_LIT * max(s, 0.0), step(0.0, s)); }
vec3 ropeColour(vec3 c, float s) {
  vec3 lit = (1.0 - c) * RELIEF_LIT;
  float k = min(1.0, ROPE_LIFT_MAX / max(dot(lit, vec3(0.299, 0.587, 0.114)), 1e-4));
  return mix(c * (1.0 - RELIEF_SHADE * -min(s, 0.0)), c + lit * k * max(s, 0.0), step(0.0, s));
}
`;

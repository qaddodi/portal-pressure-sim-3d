// The fibrosis bands' crisp edge (Plan 47, Mohammad 23 Nov 2026: "why is the fibrosis looking like a soft glow ... fibrosis should not be glowing"). ROOT CAUSE of the glow (e1b0d34c made it the design): every septum and tract was drawn twice, a crisp core and a
// BLURRED COPY of itself (a cubic B-spline of mip 5, 32 plate px a texel, reaching 80 plate px past the painted edge), and the copy was what showed everywhere the field's alpha was under 0.7, with the rope's lit flank taken from the copy's slope. A blurred
// copy laid round a shape is a glow by construction. Here a band is a SHAPE with a one device pixel edge computed from its DISTANCE to that edge, never from a blur:
//   septa   the arrival times' texture (collagen-tau.ts) carries, per pixel, the signed distance e (plate px, + inside) to the band's body (the painter's middle pass, CORE_K x the width) in B and the edge's outward normal in G and A
//   tracts  the disc is round about each hexagon corner, so its radius is computed in the shader from the corner (no texture): the front's radius now, TRACT_RT_PX x (0.8 + 0.9 tau), minus the pixel's
// and the plate shader takes coverage = smoothstep(-a, a, e), a one device pixel (half of it each side), and the rope's relief from e (relief.ts ropeS). Pure numbers, no three: the arrival times (node) and the shader read the same ones.
import { glslNum as F } from '../cel-glsl.ts';
import { GROW_H, TAU_LO, TAU_MAX, TAU_SPAN } from './growth.ts';

/** The plate's side in pixels and its half side in lobule radii (plate.ts PLATE_PX and PLATE_BOX: tests/collagen-crisp.test.ts holds them equal; not imported here so the arrival times stay free of three). */
export const EDGE_PLATE_PX = 2048, EDGE_BOX = 1.22;
/** The painter's passes (PASS_K) are 2.1, 1.45 and 1 x a band's width ACROSS (bandHalf: Wd k / 2 each side); the visible body is the middle one (the outer pass is its faint halo, the inner its dense core). */
export const CORE_K = 1.45;
/** The edge distance is stored in a byte: E_LO plate px (outside, enough for the one pixel of anti-aliasing and a texel of linear filtering) to E_LO + E_SPAN (deep inside: the rope's shoulder, ROPE_W, is 16). */
export const E_LO = -3, E_SPAN = 27;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
export const edgeToByte = (e: number): number => Math.round(clamp((e - E_LO) / E_SPAN, 0, 1) * 255);
export const byteToEdge = (b: number): number => (b / 255) * E_SPAN + E_LO;
/** A unit vector's component (-1 .. 1) as a byte, and back. */
export const unitToByte = (v: number): number => Math.round((clamp(v, -1, 1) * 0.5 + 0.5) * 255);
export const byteToUnit = (b: number): number => (b / 255) * 2 - 1;

/** The tract's radius in lobule radii (geometry.ts rt) and in plate px. */
export const TRACT_RT = 0.1;
export const TRACT_RT_PX = (TRACT_RT * EDGE_PLATE_PX) / (2 * EDGE_BOX);
/** The painted collagen's strength where it is whole (the middle pass twice: 1 - (1 - 0.66)^2). */
export const COLL_A = 0.89;

/** The tract's front radius in plate px at growth p: the inverse of the arrival times' old rule (the tract of radius rt (0.8 + 0.9 g) is whole at g), so the disc grows as it always did, from 0.8 rt at the first arrival to the cuff's edge at full growth. */
export const tractFrontPx = (p: number): number => TRACT_RT_PX * (0.8 + 0.9 * ((p - TAU_LO) * TAU_MAX) / TAU_SPAN);
/** The earliest arrival's ease: 0 before the first tract collagen, 1 once it is whole (growth.ts: TAU_LO +- GROW_H), so the disc never pops in at its first radius. */
export function tractRamp(p: number): number {
  const t = clamp((p - (TAU_LO - GROW_H)) / (2 * GROW_H), 0, 1);
  return t * t * (3 - 2 * t);
}
/** The tract's signed edge distance (plate px, + inside) of a pixel r plate px from the tract's centre. */
export const tractEdge = (p: number, r: number): number => tractFrontPx(p) - r;

/** GLSL twin of the numbers the plate shader reads. */
export const COLL_EDGE_GLSL = /* glsl */ `
const float E_LO = ${F(E_LO)};
const float E_SPAN = ${F(E_SPAN)};
const float COLL_A = ${F(COLL_A)};
const float TRACT_RT_PX = ${F(TRACT_RT_PX)};
const float TRACT_TAU_LO = ${F(TAU_LO)};
const float TRACT_TAU_K = ${F(TAU_MAX / TAU_SPAN)};
const float TRACT_RAMP_H = ${F(GROW_H)};
`;

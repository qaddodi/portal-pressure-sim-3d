// The fibrosis bands as ONE soft gradient, never tiers (Mohammad, 23 Nov 2026: "gradients, never steps"). Root cause of the beige terraces: the 2D painter's band (fibrousBand) is three flat fills by construction
// (widths PASS_K 2.1, 1.45, 1 x w; alphas PASS_A .12, .24, .5), so across a septum the coverage is a staircase 0, .23, .55, .89 whose outer tiers are 55 and 38 plate px wide, and the tracts' disc and cuff and the
// vein's cuff are the same kind of flat fills. A blur of 8 px (mip 3) only rounds each tier's edge, and a switch on the SHARP alpha, itself a staircase, jumps too. Here the plate takes a copy of the layer at an absolute
// level wider than the widest tier (mip 6: 64 plate px), and the dense core alone keeps the painted fibres: the copy is mixed in by ITS OWN alpha, so the switch is as smooth as the copy.
// The JS twin below and the GLSL are written from the same numbers (tests/collagen-terraces.test.ts judges the profile without a GPU).
import { glslNum as F } from '../cel-glsl.ts';

/** The soft copy's mip level (absolute, so it is the same at every zoom): 2^6 = 64 plate px, wider than the widest painted tier (55 px). */
export const SOFT_LOD = 6;
/** The soft copy's own alpha at which the painted layer starts to show, and at which it shows whole: the dense core of a band is soft alpha ~0.89, its tiers 0.2 to 0.6. */
export const SOFT_E0 = 0.7, SOFT_E1 = 1.0;
/** How far (plate px) the soft copy spreads past the painted edge: half a mip-6 texel. The arrival times reach this far too (collagen-tau.ts), and the sample is kept this far inside its plate (the atlas holds two plates side by side). */
export const SOFT_PAD_PX = 32;

/** The plate's size the pad is in (plate.ts PLATE_PX: a test holds the two equal; not imported here so the arrival times stay free of three). */
export const SOFT_PLATE_PX = 2048;
/** The pad in world units for a layer spanning [-box, box] (the soft copy's spread, as the plate sees it at any n). */
export const softPadWorld = (box: number): number => SOFT_PAD_PX * (2 * box) / SOFT_PLATE_PX;

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (e0: number, e1: number, x: number): number => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** The alpha of a layer at a pixel: the soft copy's alpha where it is faint, the painted alpha where the soft copy is dense (the shader's `mix(soft, own, smoothstep(E0, E1, soft.a))`, premultiplied, so alpha mixes the same way). */
export function collagenSoft(sharpA: number, softA: number): number {
  return softA + (sharpA - softA) * smooth(SOFT_E0, SOFT_E1, softA);
}

/** GLSL twin: the constants (the plate's own PLATE_PX turns SOFT_PAD_PX into a uv margin). */
export const collagenSoftGlsl = (platePx: number): string => /* glsl */ `
const float SOFT_LOD = ${F(SOFT_LOD)};
const float SOFT_E0 = ${F(SOFT_E0)};
const float SOFT_E1 = ${F(SOFT_E1)};
const float SOFT_EDGE = ${(SOFT_PAD_PX / platePx).toFixed(6)};
`;

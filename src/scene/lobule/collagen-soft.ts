// The fibrosis bands as ONE soft gradient, never tiers (Mohammad, 23 Nov 2026: "gradients, never steps"). Root cause of the beige terraces: the 2D painter's band (fibrousBand) is three flat fills by construction
// (widths PASS_K 2.1, 1.45, 1 x w; alphas PASS_A .12, .24, .5), so across a septum the coverage is a staircase 0, .23, .55, .89 whose outer tiers are 55 and 38 plate px wide, and the tracts' disc and cuff and the vein's cuff are
// the same kind of flat fills. The plate takes a smooth copy of the layer (the collagen field, collagen-field.ts: a cubic B-spline of one absolute mip level, wider than the widest tier), and the dense core alone keeps the painted
// fibres: the copy is mixed in by ITS OWN alpha, so the switch is as smooth as the copy. The JS twin below and the GLSL are written from the same numbers (tests/collagen-terraces.test.ts judges the profile without a GPU).
import { glslNum as F } from '../cel-glsl.ts';

/** The soft copy's own alpha at which the painted layer starts to show, and at which it shows whole: the dense core of a band is soft alpha ~0.89, its tiers 0.2 to 0.6. */
export const SOFT_E0 = 0.7, SOFT_E1 = 1.0;
// (the level, the pad and the plate's size live with the field that reads them: collagen-field.ts; re-exported so the arrival times and the tests keep their import)
export { SOFT_PAD_PX, SOFT_PLATE_PX, softPadWorld } from './collagen-field.ts';

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (e0: number, e1: number, x: number): number => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** The alpha of a layer at a pixel: the soft copy's alpha where it is faint, the painted alpha where the soft copy is dense (the shader's `mix(soft, own, smoothstep(E0, E1, soft.a))`, premultiplied, so alpha mixes the same way). */
export function collagenSoft(sharpA: number, softA: number): number {
  return softA + (sharpA - softA) * smooth(SOFT_E0, SOFT_E1, softA);
}

/** GLSL twin: the two thresholds of the switch (the field itself is collagen-field.ts's COLL_FIELD_GLSL). */
export const collagenSoftGlsl = (): string => /* glsl */ `
const float SOFT_E0 = ${F(SOFT_E0)};
const float SOFT_E1 = ${F(SOFT_E1)};
`;

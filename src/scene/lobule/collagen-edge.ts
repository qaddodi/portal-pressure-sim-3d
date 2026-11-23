// The fibrosis bands' crisp, faded rope (Plan 47 + Plan 48, Mohammad 23 Nov 2026: "why is the fibrosis looking like a soft glow ... fibrosis should not be glowing", then "not just one color, not the variation roped we agreed on, not that faded and beautiful").
// ROOT CAUSE of the glow (e1b0d34c made it the design): every septum and tract was drawn twice, a crisp core and a BLURRED COPY of itself (a cubic B-spline of mip 5, 32 plate px a texel, reaching 80 plate px past the painted edge): a blurred copy laid round
// a shape is a glow by construction. Plan 47 deleted it; ROOT CAUSE of the flat look that followed (641cc1ea): coverage became one number inside the MIDDLE pass (0.89 flat, the outer tier gone) and the relief a 16 px rim. Plan 48: a band is a SHAPE with a one device
// pixel edge computed from its DISTANCE to the painter's edge, and a coverage that FADES smoothly from a strong edge to the full strength at the core, with no tier. Plan 48b (the glow was back: Plan 48 put the edge at the OUTER pass with a 0.12 rim, 120 device px outside the
// hexagon on his iPhone, a soft cream ramp laid outward round a shape): the edge is the MIDDLE pass, the edge's coverage is the painter's middle tier (0.55), NOTHING lies outside it, and every fade is INSIDE the band:
//   septa   the arrival times' texture (collagen-tau.ts) carries, per pixel: e (plate px, + inside) to the band's edge (the middle pass), square-root mapped, in B; t = e / (the fade's depth), in A; the edge's outward normal as one angle byte in G
//   tracts  the disc is round about each hexagon corner, so its radius is computed in the shader from the corner (no texture): the front's radius now, TRACT_RT_PX x (0.8 + 0.9 tau), minus the pixel's; t = e / (TRACT_FADE x the front's radius)
// the plate shader takes coverage = smoothstep(-a, a, e) (one device pixel, half each side) x coverageAt(t) (faint rim to full core), and the rope's relief from t (relief.ts ropeS). Pure numbers, no three: the arrival times (node) and the shader read the same ones.
import { glslNum as F } from '../cel-glsl.ts';
import { GROW_H, TAU_LO, TAU_MAX, TAU_SPAN } from './growth.ts';

/** The plate's side in pixels and its half side in lobule radii (plate.ts PLATE_PX and PLATE_BOX: tests/collagen-crisp.test.ts holds them equal; not imported here so the arrival times stay free of three). */
export const EDGE_PLATE_PX = 2048, EDGE_BOX = 1.22;
/** The painter's passes (lobule-paint.generated.js PASS_K) are 2.1, 1.45 and 1 x a band's width ACROSS (bandHalf: Wd k / 2 each side): the faint outer tier, the middle one, the dense core. tests/collagen-crisp.test.ts holds these equal to the painter's. */
export const K_OUT = 2.1, K_MID = 1.45, K_IN = 1;
/** Plan 49 (Mohammad, 23 Nov 2026, on ddf888e3: "wide soft wobbly cream band round the hexagon, no rope"): a band's EDGE is the painter's dense CORE (K_IN), not its middle pass. The middle pass's 0.55 tier was a flat plateau 0.29 wide (a hex septum 0.145 R each side, 124 device px at the necks
 *  on his iPhone) with a 14 device px fade at its inner side only, so the whole band read as one cream colour and its outside as a halo. Now the edge is the core's, and the fade (and the rope) runs from the edge across the band's WHOLE half width to its centre line. */
export const K_EDGE = K_IN;
/** The faint pass narrows to the middle one's width at the band's ends (the painter's `Math.min(k, 1.45)`): bandHalf's kEnd for the outer pass. */
export const K_OUT_END = Math.min(K_OUT, K_MID);
/** The edge distance is stored in a byte, square-root mapped so the step is finest at the edge: e = E_LO + E_SPAN (b / 255)^2. E_LO plate px outside (the one pixel of anti-aliasing and a texel of linear filtering) to E_LO + E_SPAN deep inside.
 *  The step at the edge (e about 0) is 0.14 plate px, under half a device pixel at every screen. */
export const E_LO = -3, E_SPAN = 60;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
export const edgeToByte = (e: number): number => Math.round(Math.sqrt(clamp((e - E_LO) / E_SPAN, 0, 1)) * 255);
export const byteToEdge = (b: number): number => E_LO + E_SPAN * (b / 255) ** 2;
/** The edge's outward normal as ONE byte: its angle (-PI .. PI) over 255 steps (1.4 degrees). Read with the nearest texel, never filtered (a filtered angle goes wrong across its seam). */
export const angleToByte = (ang: number): number => Math.round(((ang + Math.PI) / (2 * Math.PI)) * 255);
export const byteToAngle = (b: number): number => (b / 255) * 2 * Math.PI - Math.PI;
/** The fade's depth t (0 at the edge, 1 at and past the core's edge) as a byte. */
export const tToByte = (t: number): number => Math.round(clamp(t, 0, 1) * 255);

/** The tract's radius in lobule radii (geometry.ts rt) and in plate px. */
export const TRACT_RT = 0.1;
export const TRACT_RT_PX = (TRACT_RT * EDGE_PLATE_PX) / (2 * EDGE_BOX);
/** The painted collagen's strength where it is whole (the middle pass twice: 1 - (1 - 0.66)^2). */
export const COLL_A = 0.89;
/** The edge's coverage (Plan 48b): the painter's own middle tier (0.55), so the edge is a clear step of one device pixel and NOTHING lies outside it, no halo, no glow (Plan 48's 0.12 rim at the OUTER pass put a 63 device px soft ramp round the hexagon). */
export const COLL_A0 = 0.55;
/** The fade from the edge (t 0) to the core (t 1): smooth, no tier, INSIDE the band only, so the tissue shows through its inner part and the rope gives the variation. */
export const fadeT = (t: number): number => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
export const coverageAt = (t: number): number => COLL_A0 + (COLL_A - COLL_A0) * fadeT(t);   // 0.55 + 0.34 smoothstep t
/** Plan 49: the fade is INTO THE CELLS. Where tissue lies under the band (ta 1, a smooth share: the plate's alpha at a coarse mip) the band fades from its edge's coverage to the core's; where none does (the dark surround outside the hexagon, ta 0) a fade
 *  would only be a dim cream skirt round the figure (a glow), so the band is whole to its crisp edge (COLL_A) and the rope's relief gives its form. */
export const coverageOver = (t: number, ta: number): number => COLL_A + (coverageAt(t) - COLL_A) * clamp(ta, 0, 1);
/** A tract's edge is this share of its front radius (the painter's disc is faint and its dense bundles lie within about 0.75 of the radius), and its fade (and its rope) runs from that edge across the WHOLE edge radius to the centre, TRACT_FADE of it deep
 *  (a hex septum's runs across its whole half width). */
export const TRACT_EDGE_K = 0.75, TRACT_FADE = 1;
/** The striations' share of the colour (the painted fibres' lightness against their own surroundings, clamped, so no nucleus or fibre can ever make a dark worm: a nucleus darkens at most STRIA_MAX x STRIA_K). */
export const STRIA_MAX = 0.06, STRIA_K = 0.6;

/** The tract's front radius in plate px at growth p: the inverse of the arrival times' old rule (the tract of radius rt (0.8 + 0.9 g) is whole at g), so the disc grows as it always did, from 0.8 rt at the first arrival to the cuff's edge at full growth. */
export const tractFrontPx = (p: number): number => TRACT_RT_PX * (0.8 + 0.9 * ((p - TAU_LO) * TAU_MAX) / TAU_SPAN);
/** The earliest arrival's ease: 0 before the first tract collagen, 1 once it is whole (growth.ts: TAU_LO +- GROW_H), so the disc never pops in at its first radius. */
export function tractRamp(p: number): number {
  const t = clamp((p - (TAU_LO - GROW_H)) / (2 * GROW_H), 0, 1);
  return t * t * (3 - 2 * t);
}
/** The tract's signed edge distance (plate px, + inside) of a pixel r plate px from the tract's centre. */
export const tractEdge = (p: number, r: number): number => TRACT_EDGE_K * tractFrontPx(p) - r;

/** GLSL twin of the numbers the plate shader reads. */
export const COLL_EDGE_GLSL = /* glsl */ `
const float E_LO = ${F(E_LO)};
const float E_SPAN = ${F(E_SPAN)};
const float COLL_A = ${F(COLL_A)};
const float COLL_A0 = ${F(COLL_A0)};
const float TRACT_EDGE_K = ${F(TRACT_EDGE_K)};
const float TRACT_FADE = ${F(TRACT_FADE)};
const float STRIA_MAX = ${F(STRIA_MAX)};
const float STRIA_K = ${F(STRIA_K)};
const float TRACT_RT_PX = ${F(TRACT_RT_PX)};
const float TRACT_TAU_LO = ${F(TAU_LO)};
const float TRACT_TAU_K = ${F(TAU_MAX / TAU_SPAN)};
const float TRACT_RAMP_H = ${F(GROW_H)};
float collFade(float t) { float x = clamp(t, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
float collCoverage(float t, float ta) { return COLL_A + (COLL_A0 + (COLL_A - COLL_A0) * collFade(t) - COLL_A) * clamp(ta, 0.0, 1.0); }
`;

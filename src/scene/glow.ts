// The selection glow (owner, 20 Nov: "instead of an outline, make it a glow"; "even the glow should take the shape of the vessel (and fade at the ends)"; "there is a weird outline, and the glow isn't good"):
// a soft halo in the vessel's own tone round what is picked, strongest at its edge and thinning to nothing a short way out.
//
// ROOT CAUSES of what it looked like before (a picked portal vein): (1) the halo was a ribbon laid on the BUILT course at the BUILT radius, one per piece of the vein, so it ignored the live width, the stenosis waist
// and the junction skin, and every piece ended square; (2) its hull replacement, grown by each tube's and each skin's own vertex stage, still met at every seam as separate pieces that could not blend (a pale patch at a
// junction, a halo on one side only); (3) the pick lifted the tube by `inflate`, which fattened the mesh but not the lumen, so the ink filled the difference: thick dark square-ended bands.
//
// Now the glow is made on the SCREEN, from the picked vessel as it is drawn (glow-fx.ts): the vessels' own programs (tubes and junction skins alike, built with `GLOW`) paint a MASK of the picked vessel into a texture:
// its lumen and line, weighted by the pick's own weight (nothing at the vein's outer ends, full a quarter in), in its colour as drawn. The mask is blurred (two passes of a Gaussian), and the blur is laid over the
// figure outside the mask. The halo therefore hugs whatever silhouette is drawn, runs through every join with no seam (the pieces are one image by the time they blur), thins and fades toward both ends where the
// mask does, and eases in and out with the pick. Nothing about the vessel itself changes: no lift, no widened line, no tint.

/** The blur's sigma, CSS px: how far the halo reaches (about three sigmas). */
export const GLOW_SIGMA = 9;
/** The blurred mask's alpha is scaled by this and held to GLOW_A_MAX: at the edge of a wide vessel a Gaussian of the mask is a half, so the gain brings the rim to GLOW_A. */
export const GLOW_GAIN = 1.25;
/** The halo's alpha at the edge of a wide vessel: a bright rim and a soft tail, as a blur falls. */
export const GLOW_A = 0.62;
/** The most the halo's alpha can be (only a shunt target under the pointer, whose mask is stronger by `glowK`, gets near it). */
export const GLOW_A_MAX = 0.93;
/** On the dark looks the halo is the vessel's tone lifted this far toward white, so it glows on the ground; on the light ones it is the tone itself. */
export const GLOW_LIFT = 0.25;
/** The Circuit's change takes the glow away over its first GLOW_GATE_T (a smoothstep of circT): the map lays the vessels out afresh. (highlight.ts `glowGate` is the JS twin.) */
export const GLOW_GATE_T = 0.15;
import { GLOW_LAYER, ORGAN_GLOW_LAYER } from './layers.ts';
export { GLOW_LAYER, ORGAN_GLOW_LAYER };   // (the camera layers are numbered in layers.ts, one registry: two passes once shared layer 3 and lit the whole figure)

const sm = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The mask's weight at a pixel inside the vessel (the JS twin of `glowWeightGlsl`): the pick's weight `hi` (0 to 1) eased, taken away by the Circuit's change `circT`. */
export const glowWeight = (hi: number, circT = 0): number => sm(0, 1, Math.min(1, Math.max(0, hi))) * (1 - sm(0, GLOW_GATE_T, circT));

/** The halo's alpha where the blurred mask has alpha `blur` (the JS twin of the composite shader): GLOW_GAIN of it, held to GLOW_A_MAX, and nothing under the sharp mask `inside` (the vessel itself is never tinted): inside is COVERAGE, any mask alpha of half a level of 8 bits up (glow-fx.ts LAY_FS), never the alpha's own share. */
export const glowAlpha = (blur: number, inside = 0): number => Math.min(GLOW_A_MAX, Math.max(0, blur * GLOW_GAIN)) * (inside >= 0.5 / 255 ? 0 : 1);

/** Gaussian taps for a blur of `sigmaPx` device px at the blur's own resolution: the tap spacing (texels, 1 up to the sigma over `TAP_SIGMA`) and the sigma in taps. The twin of what glow-fx.ts passes the blur shader; 12 taps each side. */
export const BLUR_TAPS = 12, TAP_SIGMA = 4;
export function blurTaps(sigmaPx: number): { spacing: number; sigma: number } {
  const spacing = Math.max(1, sigmaPx / TAP_SIGMA);
  return { spacing, sigma: sigmaPx / spacing };
}

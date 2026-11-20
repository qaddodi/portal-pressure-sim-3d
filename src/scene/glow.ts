// The selection glow (owner, 20 Nov: "instead of an outline, make it a glow"; and again: "even the glow should take the shape of the vessel (and fade at the ends)"): a soft halo in the vessel's own
// tone round what is picked, strongest at the edge of its line and thinning to nothing a short way out.
//
// ROOT CAUSE of the flat slabs and boxes (a picked portal vein with a stenosis): the halo was a separate ribbon laid on the course the vessel was BUILT with, at the built radius, one ribbon per piece of the
// vein. It knew nothing of what the vessel is drawn as: the live width (the engine's diameter), the stenosis waist, the smooth join, the junction skin. So it stayed a straight-sided strip of one width
// where the vessel pinched, and every piece ended square across.
//
// Now the glow is the vessel's own hull. The vessel's vertex stage grows its mesh by the glow's reach (`GLOW` program: vessels/shaders.ts, and the junction skin's), measured from the lumen's LIVE radius
// at that point, so the halo has the vessel's own silhouette by construction: it narrows at a stenosis, swells with the engine's diameter, runs on over a smooth join and a welded junction skin with no
// seam. The reach and the alpha are weighted by the pick's own weight there (`vHi`: nothing at the vein's outer ends, full a quarter of the vein in), so it thins and fades toward both ends, and it
// eases in and out with the pick. The fragment stage draws only outside the line, from the exact lateral distance to the axis, in the vessel's own colour as drawn (a lens included). No mesh of its own to
// get out of step with the vessel: it is the same geometry, the same widths and the same fades.

/** How far past the line's outer edge the halo reaches, CSS px: GLOW_PX and GLOW_RK of the lumen's radius (so a big vein has a wider halo than a hairline, as the figure grows). */
export const GLOW_PX = 6;
export const GLOW_RK = 0.55;
/** The halo's alpha at the line's edge (it thins from there, squared: a bright rim and a long soft tail, as a blur falls). */
export const GLOW_A = 0.62;
/** On the dark looks the halo is the vessel's tone lifted this far toward white, so it glows on the ground; on the light ones it is the tone itself. */
export const GLOW_LIFT = 0.25;
/** The Circuit's change takes the glow away over its first GLOW_GATE_T (a smoothstep of circT): the map lays the vessels out afresh. (highlight.ts `glowGate` is the JS twin.) */
export const GLOW_GATE_T = 0.15;

/** The glow's reach for a lumen of `rCss` CSS px of radius, CSS px (the JS twin of `glowReachGlsl`). */
export const glowReach = (rCss: number): number => GLOW_PX + GLOW_RK * rCss;

/** The halo's alpha `s` CSS px past the line's outer edge, for a reach of `reach` (already weighted by the pick's weight `hi`, 0 to 1): the JS twin of `glowAlphaGlsl`. 0 inside the line and at the reach, `GLOW_A` at the edge. */
export function glowAlpha(s: number, reach: number, hi: number, dpr = 1): number {
  const sm = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const fall = 1 - sm(0, Math.max(reach, 1e-3), s), h = Math.min(1, Math.max(0, hi));
  return GLOW_A * fall * fall * sm(-0.5, 0.5, s * dpr) * sm(0, 1, h);
}

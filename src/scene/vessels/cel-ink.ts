// The 2D figure's vessel line and shading, in one place (tube-cel-glsl.js CEL and styles/tokens.css --casing-rgb / --casing-a), with the JS twin of the arithmetic the vertex and fragment
// shaders run (shaders.ts), so a test can hold the shader's numbers to the 2D app's: the outline is `LINE_R` of the radius held between 1.5 and 3 device px, in the look's casing
// colour at the look's casing alpha; the fill is exactly three tones lit from the top left of the SCREEN (shadow -17 %, base, lit +15 % toward white), so two pieces of one vein shade the
// same at a join and a vein turned 20 degrees keeps its tones; there is no specular and no world-lit band.
import type { LookId } from '../../looks/looks.ts';

/** tube-cel-glsl.js CEL: the outline's width in device px by caliber (LINE_R of the radius, held between LINE_MIN and LINE_MAX), the tone steps and where they change across the tube. */
export const CEL = { DIR: [-0.70710678, 0.70710678] as const, SHADE_AT: -0.16, LIT_AT: 0.24, SHADE: 0.17, LIT: 0.15, LINE_MIN: 1.5, LINE_MAX: 3.0, LINE_R: 0.14 };
/** The screen direction toward the light in the view's own axes (x right, y UP): the top left. (2D's is y down: (-0.707, -0.707).) */
export const CEL_DIR_VIEW = CEL.DIR;

/** The look's casing (tokens.css): the outline ink and its alpha; `lensA` is the alpha under a colour lens (the dark looks' --casing-a: .38 on .stage-wrap.cmap). */
export const CASING: Readonly<Record<LookId, { rgb: readonly [number, number, number]; a: number; lensA: number }>> = {
  light: { rgb: [59, 44, 34], a: 0.64, lensA: 0.64 },
  soft: { rgb: [51, 37, 26], a: 0.66, lensA: 0.66 },
  dark: { rgb: [14, 11, 9], a: 0.3, lensA: 0.38 },
  navy: { rgb: [6, 10, 20], a: 0.34, lensA: 0.38 },
  black: { rgb: [0, 0, 0], a: 0.38, lensA: 0.38 },
};
/** A dark lumen's light rim on the dark looks (tokens.css --vessel-rim-a: .3 there, 0 on the light looks): its alpha. */
export const RIM_A: Readonly<Record<LookId, number>> = { light: 0, soft: 0, dark: 0.3, navy: 0.3, black: 0.3 };

const clamp = (x: number, a: number, b: number): number => Math.min(Math.max(x, a), b);
const smoothstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The outline's width in device px for a tube of screen radius `rDev` device px. */
export const inkWidthDev = (rDev: number): number => clamp(CEL.LINE_R * rDev, CEL.LINE_MIN, CEL.LINE_MAX);

/** The tones at a pixel: `across` -1..1 across the tube, `side` the unit screen direction (view axes, y up) of the tube's cross axis, `rDev` its radius in device px. Returns the
 *  multiplier on the fill (1 - 0.17 shadow) and the share lifted toward white (0.15 lit); both are 0 on a hairline. */
export function celTones(across: number, side: readonly [number, number], rDev: number): { mul: number; lift: number } {
  const s = across * (side[0] * CEL.DIR[0] + side[1] * CEL.DIR[1]);
  const et = 0.5 / Math.max(rDev, 1e-3), hw = smoothstep(1.5, 3.5, rDev);
  const shadow = 1 - smoothstep(CEL.SHADE_AT - et, CEL.SHADE_AT + et, s), lit = smoothstep(CEL.LIT_AT - et, CEL.LIT_AT + et, s);
  return { mul: 1 - hw * CEL.SHADE * shadow, lift: CEL.LIT * hw * lit };
}

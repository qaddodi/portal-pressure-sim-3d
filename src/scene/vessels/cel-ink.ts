// The 2D figure's vessel line and shading, in one place (tube-cel-glsl.js CEL and styles/tokens.css --casing-rgb / --casing-a), with the JS twin of the arithmetic the vertex and fragment
// shaders run (shaders.ts), so a test can hold the shader's numbers to the 2D app's: the outline is `LINE_R` of the radius held between LINE_MIN and LINE_MAX device px, in the look's casing
// colour at the look's casing alpha; the fill is exactly three tones lit from the top left of the SCREEN (shade, base, lit toward white, the strengths in cel-style.ts), so two pieces of one vein shade the
// same at a join and a vein turned 20 degrees keeps its tones; there is no world-lit band; the one highlight is a small hard streak (celSpec).
import type { LookId } from '../../looks/looks.ts';
import { CEL_STYLE } from '../cel-style.ts';   // (the figure's one cel style: every surface reads its bands and its line from there)

/** tube-cel-glsl.js CEL: the outline's width in device px by caliber (LINE_R of the radius, held between LINE_MIN and LINE_MAX), the tone steps and where they change across the tube. */
export const CEL = { DIR: CEL_STYLE.DIR, SHADE_AT: CEL_STYLE.SHADE_AT, LIT_AT: CEL_STYLE.LIT_AT, SHADE: CEL_STYLE.SHADE, LIT: CEL_STYLE.LIT, LINE_MIN: CEL_STYLE.LINE_MIN, LINE_MAX: CEL_STYLE.LINE_MAX, LINE_R: CEL_STYLE.LINE_R };
/** The screen direction toward the light in the view's own axes (x right, y UP): the top left. (2D's is y down: (-0.707, -0.707).) */
export const CEL_DIR_VIEW = CEL.DIR;

/** The look's casing (tokens.css --casing-rgb / --casing-a) in the Anatomy, and `circ` its casing in the Circuit (`.stage-wrap.cmap`, which is the Circuit view and not a colour lens: stage-frame.js 250): only the
 *  dark look changes there (ink 0 0 0, alpha .38); Navy and Black keep theirs, Light and Soft are unchanged. The shader mixes the two by the Circuit's share (`circT`). */
export const CASING_2D: Readonly<Record<LookId, { rgb: readonly [number, number, number]; a: number; circ: { rgb: readonly [number, number, number]; a: number } }>> = {
  light: { rgb: [59, 44, 34], a: 0.64, circ: { rgb: [59, 44, 34], a: 0.64 } },
  soft: { rgb: [51, 37, 26], a: 0.66, circ: { rgb: [51, 37, 26], a: 0.66 } },
  dark: { rgb: [14, 11, 9], a: 0.3, circ: { rgb: [0, 0, 0], a: 0.38 } },
  navy: { rgb: [6, 10, 20], a: 0.34, circ: { rgb: [6, 10, 20], a: 0.34 } },
  black: { rgb: [0, 0, 0], a: 0.38, circ: { rgb: [0, 0, 0], a: 0.38 } },
};
/** The casing the shaders wear: 2D's, with the alpha held at the figure's least (cel-style INK_ALPHA_MIN), so the line reads as ink on every look. */
const floorA = (a: number) => Math.max(a, CEL_STYLE.INK_ALPHA_MIN);
export const CASING: typeof CASING_2D = Object.fromEntries(Object.entries(CASING_2D).map(([k, v]) => [k, { rgb: v.rgb, a: floorA(v.a), circ: { rgb: v.circ.rgb, a: floorA(v.circ.a) } }])) as unknown as typeof CASING_2D;
/** A dark lumen's light rim on the dark looks (tokens.css --vessel-rim-a: .3 there, 0 on the light looks): its alpha. */
export const RIM_A: Readonly<Record<LookId, number>> = { light: 0, soft: 0, dark: 0.3, navy: 0.3, black: 0.3 };
/** The rim's colour: 2D's --light-ink, white (stage-vessels.js: `rim: toRGB('var(--light-ink)')`), on every look. It was the look's text colour, a warm grey-cream, which lay a dirty halo inside the ink. */
export const RIM_INK = '#FFFFFF';

const clamp = (x: number, a: number, b: number): number => Math.min(Math.max(x, a), b);
const smoothstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The outline's width in device px for a tube of screen radius `rDev` device px. */
export const inkWidthDev = (rDev: number): number => clamp(CEL.LINE_R * rDev, CEL.LINE_MIN, CEL.LINE_MAX) * inkTaper(rDev);
/** The outline's floor (LINE_MIN device px) would swallow a lumen under it. Below `TAPER_TO` (= LINE_MIN, so the line is whole exactly where its floor starts) device px of radius the line
 *  thins with the lumen (from nothing at `TAPER_FROM`), so the smallest branches keep their colour; from `TAPER_TO` up it is the figure's line. A picked vessel's ring is not tapered. */
export const TAPER_FROM = 0.3, TAPER_TO: number = CEL_STYLE.LINE_MIN;
export const inkTaper = (rDev: number): number => smoothstep(TAPER_FROM, TAPER_TO, rDev);

/** The tones at a pixel (the JS twin of cel-glsl.ts celTubeTone): `across` -1..1 across the tube, `side` the unit screen direction (view axes, y up) of the tube's cross axis, `rDev` its radius in device px. Returns the
 *  multiplier on the fill (1 - SHADE in the shade) and the share lifted toward white (LIT in the lit); across the tube there are exactly three tones, the edge between two EDGE_PX device px wide; both are 0 on a hairline. */
export function celTones(across: number, side: readonly [number, number], rDev: number): { mul: number; lift: number } {
  const k = tubeK(side), s = across * k;
  const et = 0.5 * CEL_STYLE.EDGE_PX * Math.max(Math.abs(k), 0.05) / Math.max(rDev, 1e-3), hw = smoothstep(CEL_STYLE.TONES_FROM, CEL_STYLE.TONES_TO, rDev);
  const shadow = 1 - smoothstep(CEL.SHADE_AT - et, CEL.SHADE_AT + et, s), lit = smoothstep(CEL.LIT_AT - et, CEL.LIT_AT + et, s);
  return { mul: 1 - hw * CEL.SHADE * shadow, lift: CEL.LIT * hw * lit };
}
/** The lit-side slope of a tube whose cross axis points `side` on the screen: cos to the light, leaned (TUBE_LEAN) and held to -1..1. */
export const tubeK = (side: readonly [number, number]): number => clamp((side[0] * CEL.DIR[0] + side[1] * CEL.DIR[1]) * CEL_STYLE.TUBE_LEAN, -1, 1);
/** The hard highlight (the twin of celTubeSpec): how far toward white the pixel at `across` is lifted by the streak whose centre is `alongR` radii away along the tube. 0 outside the streak and on a hairline, SPEC.ALPHA inside, an edge EDGE_PX across. */
export function celSpec(across: number, side: readonly [number, number], rDev: number, alongR: number): number {
  const S = CEL_STYLE.SPEC, s = across * tubeK(side), th = Math.max(S.SIZE, S.MIN_THICK_PX / Math.max(rDev, 1e-3));
  const d = (Math.hypot(Math.max(Math.abs(alongR) - S.LEN, 0), s - S.AT) - th) * rDev, e = 0.5 * CEL_STYLE.EDGE_PX;
  return (1 - smoothstep(-e, e, d)) * smoothstep(S.MIN_PX, S.MIN_PX + 1, rDev) * S.ALPHA;
}

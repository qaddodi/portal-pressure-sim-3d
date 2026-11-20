// The 2D figure's vessel line and shading, in one place (tube-cel-glsl.js CEL and styles/tokens.css --casing-rgb / --casing-a), with the JS twin of the arithmetic the vertex and fragment
// shaders run (shaders.ts), so a test can hold the shader's numbers to the 2D app's: the outline is `LINE_R` of the radius held between LINE_MIN and LINE_MAX CSS px (converted with the screen's pixel ratio in the shaders), in the look's casing
// colour at the look's casing alpha; the fill is exactly two tones (shade, base) lit by the one WORLD light (CEL_STYLE.LIGHT, n.L), so two pieces of one vein shade the
// same at a join and a camera that orbits changes no shade; there is no highlight and no rim.
import type { LookId } from '../../looks/looks.ts';
import { CEL_STYLE } from '../cel-style.ts';   // (the figure's one cel style: every surface reads its bands and its line from there)

/** tube-cel-glsl.js CEL: the outline's width in CSS px by caliber (LINE_R of the radius, held between LINE_MIN and LINE_MAX), the tone steps and where they change across the tube. */
export const CEL = { DIR: CEL_STYLE.DIR, SHADE_AT: CEL_STYLE.SHADE_AT, LIT_AT: CEL_STYLE.LIT_AT, SHADE: CEL_STYLE.SHADE, LIT: CEL_STYLE.LIT, LINE_MIN: CEL_STYLE.LINE_MIN, LINE_MAX: CEL_STYLE.LINE_MAX, LINE_R: CEL_STYLE.LINE_R };

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
/** The outline of a vessel on the Circuit's dark looks: a soft near-black grey (2D's pure black on a near-black map is lost; a pale rim was too thick and disruptive: Mohammad, 20 Nov), made to read by the inner fade the shader lays just inside the vessel's edge. */
export const CIRC_RIM_DARK: readonly [number, number, number] = [40, 42, 48];
/** The Circuit's outline is this many times the figure's line. */
export const CIRC_INK_K = 1.1;
/** Just inside a Circuit vessel's edge the outline fades inward: its strength where it starts, and how far in it reaches (CSS px, times the pixel ratio in the shader: a share of the radius held between the two). */
export const CIRC_INNER = { K: 0.55, MIN_PX: 1.0, MAX_PX: 3.5, R: 0.35 } as const;
const DARK_LOOKS: ReadonlySet<string> = new Set(['dark', 'navy', 'black']);
/** The dark looks (Dark, Navy, Black): the vessels' brighter caps (CEL_STYLE.TUBE LCAP_DARK / VCAP_DARK) apply there. */
export const isDarkLook = (look: string): boolean => DARK_LOOKS.has(look);
export const CASING: typeof CASING_2D = Object.fromEntries(Object.entries(CASING_2D).map(([k, v]) => [k, { rgb: v.rgb, a: floorA(v.a), circ: { rgb: DARK_LOOKS.has(k) ? CIRC_RIM_DARK : v.circ.rgb, a: floorA(v.circ.a) } }])) as unknown as typeof CASING_2D;
/** A dark lumen's light rim on the dark looks (tokens.css --vessel-rim-a: .3 there, 0 on the light looks): its alpha. */
export const RIM_A: Readonly<Record<LookId, number>> = { light: 0, soft: 0, dark: 0.3, navy: 0.3, black: 0.3 };
/** The rim's colour: 2D's --light-ink, white (stage-vessels.js: `rim: toRGB('var(--light-ink)')`), on every look. It was the look's text colour, a warm grey-cream, which lay a dirty halo inside the ink. */
export const RIM_INK = '#FFFFFF';

const clamp = (x: number, a: number, b: number): number => Math.min(Math.max(x, a), b);
const smoothstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The outline's width in CSS px for a tube of screen radius `rCss` CSS px: the same on every screen (the shaders take the radius in CSS px, vessels/shaders.ts). */
export const inkWidthCss = (rCss: number): number => clamp(CEL.LINE_R * rCss, CEL.LINE_MIN, CEL.LINE_MAX) * inkTaper(rCss);
/** The same in device px on a screen whose pixel ratio is `dpr`: the CSS width x dpr, so a 1x, a 2x and a 3x screen draw one weight. */
export const inkWidthDev = (rDev: number, dpr: number): number => inkWidthCss(rDev / dpr) * dpr;
/** The outline's floor (LINE_MIN CSS px) would swallow a lumen under it. Below `TAPER_TO` (= LINE_MIN, so the line is whole exactly where its floor starts) CSS px of radius the line
 *  thins with the lumen (from nothing at `TAPER_FROM`), so the smallest branches keep their colour; from `TAPER_TO` up it is the figure's line. A picked vessel's ring is not tapered. */
export const TAPER_FROM = 0.15, TAPER_TO: number = CEL_STYLE.LINE_MIN;
export const inkTaper = (rCss: number): number => smoothstep(TAPER_FROM, TAPER_TO, rCss);

/** The world light as a unit vector (the twin of cel-glsl.ts CEL_LIGHT): the lit-side measure of a tube is n.L, with n and L in the same (world) axes. */
export const lightUnit = (): readonly [number, number, number] => { const [x, y, z] = CEL_STYLE.LIGHT; const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
/** The lit-side measure s = n.L (the JS twin of cel-glsl.ts celLightView's dot): `n` a unit normal in world axes. */
export const litMeasure = (n: readonly [number, number, number]): number => { const L = lightUnit(); return n[0] * L[0] + n[1] * L[1] + n[2] * L[2]; };
/** The tones at a pixel (the JS twin of cel-glsl.ts celTubeTone): `s` the lit-side measure (n.L), `sw` its change per device pixel (fwidth), `rDev` the tube's radius in device px. Returns the multiplier on the fill
 *  (1 - SHADE in the shade, 1 in the lit); there are exactly TWO tones (CEL_STYLE.VESSEL_BANDS), one hard step at VESSEL_STEP_AT, the edge EDGE_PX device px wide; 1 on a hairline. */
export function celTones(s: number, sw: number, rDev: number): { mul: number } {
  const et = Math.max(0.5 * CEL_STYLE.EDGE_PX * sw, 1e-4), hw = smoothstep(CEL_STYLE.TONES_FROM, CEL_STYLE.TONES_TO, rDev);
  const shadow = 1 - smoothstep(CEL_STYLE.VESSEL_STEP_AT - et, CEL_STYLE.VESSEL_STEP_AT + et, s);
  return { mul: 1 - hw * CEL.SHADE * shadow };
}
const lumOf = (c: readonly number[]): number => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
/** The twin of celTubeBase: the lens colour made saturated and deep (chroma x SAT, no lighter than LCAP, hue kept). */
export function celTubeBase(b: readonly [number, number, number], dark = false): [number, number, number] {
  const T = CEL_STYLE.TUBE, l = lumOf(b);
  const c = b.map((v) => clamp(l + (v - l) * T.SAT, 0, 1)) as [number, number, number];
  const k = Math.min(1, (dark ? T.LCAP_DARK : T.LCAP) / Math.max(lumOf(c), 1e-3), (dark ? T.VCAP_DARK : T.VCAP) / Math.max(...c, 1e-3));
  return [c[0] * k, c[1] * k, c[2] * k];
}
/** A lens colour as the FIGURE draws it, `#RRGGBB` in and out: the vessels never wear the raw ramp, the shader makes it saturated and deep first (celTubeBase: chroma x SAT, no lighter than LCAP, no channel above VCAP, brighter caps on the dark looks).
 *  Every key that names a vessel colour (the lens bar, its dots, the lens menu's swatch, the action card's strip) goes through here, so what the key says is what the vessel is (external review, 20 Nov: the caps were applied after the legend was built). */
export function figureHex(hex: string, look: LookId): string {
  const n = parseInt(hex.slice(1), 16);
  const c = celTubeBase([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], DARK_LOOKS.has(look));
  return '#' + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** The twin of celTubeTone: the colour of the tube at lit measure `s`: the saturated base on the lit side, the shade (base x (1 - SHADE), a touch more saturated, hue kept) on the other, never toward white. */
export function celTubeColor(base: readonly [number, number, number], s: number, sw: number, rDev: number): [number, number, number] {
  const T = CEL_STYLE.TUBE, t = celTones(s, sw, rDev), b = celTubeBase(base);
  const shadeAmt = (1 - t.mul) / CEL.SHADE;
  const sh0 = b.map((v) => v * (1 - CEL.SHADE)), ls = lumOf(sh0);
  const sh = sh0.map((v) => clamp(ls + (v - ls) * T.SHADE_SAT, 0, 1));
  return b.map((v, i) => v + (sh[i]! - v) * shadeAmt) as [number, number, number];
}

/** The twin of the outline's colour (shaders.ts inkH): the look's casing taken INK_OWN of the way to a deep tone of the vessel's own base (x INK_TONE, INK_TONE_DARK on the dark looks), in 0..1 sRGB as the shader blends it. */
export function tubeInk(look: LookId, base: readonly [number, number, number]): [number, number, number] {
  const T = CEL_STYLE.TUBE, tone = DARK_LOOKS.has(look) ? T.INK_TONE_DARK : T.INK_TONE, b = celTubeBase(base, DARK_LOOKS.has(look));
  const cas = CASING[look].rgb;
  return [0, 1, 2].map((i) => (cas[i]! / 255) * (1 - T.INK_OWN) + b[i]! * tone * T.INK_OWN) as [number, number, number];
}

// THE cel style, in one place (Mohammad, 20 Nov 2026: "Everything cel shaded in the figures, it should look beautiful"). Every surface of the figure (organs, vessels, the lobule's parts, the
// sinusoid's) reads its band count, where the bands change, how strong each band is and how heavy the ink is from here, so the whole figure is one style: three flat tones (shade, base, lit)
// lit from the top left of the SCREEN, a hard but antialiased edge between them, and a dark line round every shape. A number that decides how any of that looks is changed here and nowhere else;
// tests/cel-style.test.ts fails a second copy. Vessels' numbers are 2D's own (tube-cel-glsl.js CEL), so they do not move; the organ numbers are for the organ painter's solid cel fill.

/** Three tones everywhere: shade, base, lit. */
export const CEL_BANDS = 3;

export const CEL_STYLE = {
  BANDS: CEL_BANDS,
  /** The direction toward the light on the SCREEN (x right, y up): the top left. 2D's is y down: (-0.707, -0.707). */
  DIR: [-0.70710678, 0.70710678] as const,
  /** Where the tones change, in the lit-side measure `s` (-1 away from the light .. 1 toward it): below SHADE_AT is the shade tone, above LIT_AT the lit tone. (A tube's `s` is across the tube; a solid's is n·L.) */
  SHADE_AT: -0.16,
  LIT_AT: 0.24,
  /** How strong each tone is: the shade takes this share off the base (x 1 - SHADE), the lit lifts this share toward white. */
  SHADE: 0.17,
  LIT: 0.15,
  /** The ink line, in device px: LINE_R of the radius held between LINE_MIN and LINE_MAX (2D). */
  LINE_R: 0.14,
  LINE_MIN: 1.5,
  LINE_MAX: 3.0,
  /** A band's edge is this many device px across in each direction: crisp, antialiased by fwidth, never a gradient. */
  EDGE_PX: 0.5,
  /** Solid organs (organ-shader.ts, the cel fill): the band edges in n·L terms (lambert against the screen-space light), the same three tones; a shape too round to reach LIT_AT keeps two. */
  ORGAN: { SHADE_LAM: 0.3, LIT_LAM: 0.7, LIGHT: [-0.5, 0.62, 0.6] as const, /** the baked tuck (organ-depth.ts, 0..1) above which an organ with Organ depth on wears one hard band of the shade tone */ TUCK_AO: 0.45 },
} as const;

/** The band a measure `s` falls in, 0 shade, 1 base, 2 lit, with the hard edge `edge` wide (in the same units as s; 0 is a pure step). The JS twin of the shaders' step, for tests. */
export function celBand(s: number, edge = 0, shadeAt: number = CEL_STYLE.SHADE_AT, litAt: number = CEL_STYLE.LIT_AT): 0 | 1 | 2 {
  const lo = shadeAt - edge, hi = litAt + edge;
  return s < lo ? 0 : s >= hi ? 2 : 1;
}

// THE cel style, in one place (Mohammad, 20 Nov 2026: "Everything cel shaded in the figures, it should look beautiful"). Every surface of the figure (organs, vessels, the lobule's parts, the
// sinusoid's) reads its band count, where the bands change, how strong each band is and how heavy the ink is from here, so the whole figure is one style: three flat tones (shade, base, lit)
// lit from the top left of the SCREEN, a hard but antialiased edge between them, and a dark line round every shape. A number that decides how any of that looks is changed here and nowhere else;
// tests/cel-style.test.ts fails a second copy. 20 Nov 2026, Mohammad: "Still not cel shaded": 2D's own tones (shade -17 %, lit +15 %, a 1.5 px line) read as soft shading, so they are pushed to a true toon look here: wide, flat bands with clearly different tones and a bold, even line (a deliberate step past 2D, one place to change back).

/** Three tones everywhere: shade, base, lit. */
export const CEL_BANDS = 3;

export const CEL_STYLE = {
  BANDS: CEL_BANDS,
  /** The direction toward the light on the SCREEN (x right, y up): the top left. 2D's is y down: (-0.707, -0.707). */
  DIR: [-0.70710678, 0.70710678] as const,
  /** Where the tones change, in the lit-side measure `s` (-1 away from the light .. 1 toward it): below SHADE_AT is the shade tone, above LIT_AT the lit tone. (A tube's `s` is across the tube; a solid's is n·L.) */
  SHADE_AT: -0.05,   // (2D: -0.16; wider bands: the shade side is nearly half the tube)
  LIT_AT: 0.45,   // (2D: 0.24)
  /** How strong each tone is: the shade takes this share off the base (x 1 - SHADE), the lit lifts this share toward white. */
  SHADE: 0.38,   // (2D: 0.17)
  LIT: 0.3,   // (2D: 0.15)
  /** The ink line, in device px: LINE_R of the radius held between LINE_MIN and LINE_MAX (2D). */
  LINE_R: 0.2,   // (2D: 0.14)
  LINE_MIN: 2.0,   // (2D: 1.5)
  LINE_MAX: 3.0,
  /** The ink's least alpha on every look (2D's casing is .64 on Light and .3 on Dark: a line that fades into the page is not a toon line). */
  INK_ALPHA_MIN: 0.85,
  /** A band's edge is this many device px across in each direction: crisp, antialiased by fwidth, never a gradient. */
  EDGE_PX: 0.4,
  /** A tube's three tones fade in with its radius (device px): none under TONES_FROM (a hairline is one tone and its line), whole from TONES_TO. The strength follows the radius, never the position across the tube, so across it stays three flat tones. */
  TONES_FROM: 1.0,
  TONES_TO: 2.0,
  /** A tube's lit-side measure is cos(angle between its cross axis and the light) x TUBE_LEAN, held to -1..1: a tube up to 45 degrees off the light's cross still reaches all three tones (a tube running along the light would otherwise be one tone). */
  TUBE_LEAN: 1.41421356,
  /** The hard specular on a vessel: a flat pale streak on the lit side, no gradient (vessels/cel-ink.ts celSpec is its JS twin).
   *  AT: where it sits across the tube, in the lit-side measure (inside the lit band, which starts at LIT_AT); SIZE: its half thickness and LEN its half length (the ends are round), both as a share of the tube's radius, the thickness never under
   *  MIN_THICK_PX device px; ALPHA: how far toward white; MIN_PX: the radius (device px) under which a vessel is a hairline and has none (it fades in over the next device px); PERIOD: figure units between streaks along a long vessel (every vessel has at least one). */
  SPEC: { AT: 0.62, SIZE: 0.1, LEN: 0.45, ALPHA: 0.6, MIN_PX: 3.0, MIN_THICK_PX: 0.8, PERIOD: 160 },
  /** The painted plates (the lobule's tissue, the sinusoid's) step in their own measures, not the tubes' `s`: a painted colour's lightness against its local lightness, so SHADE_AT / LIT_AT above (made for -1..1) do not apply.
   *  SHADE_AT / LIT_AT: where the relative lightness changes tone (a dead zone of +-0.15 around a flat cell); DETAIL: further than this from the base the pixel is detail (a membrane, a nucleolus) and stays as painted;
   *  EDGE_LO / EDGE_HI: the lightness jump over one device pixel from which a line is inked on the lobule's plate (a membrane is under, a cell's outline over); SIN_EDGE_LO / SIN_EDGE_HI the same as a share of the lightness on the sinusoid.
   *  Those two pairs are the painted lines' own contrast, so they do not move with SHADE (a stronger tone must not unink the cell outlines). */
  TISSUE: { SHADE_AT: -0.15, LIT_AT: 0.15, DETAIL: 0.5, EDGE_LO: 0.05, EDGE_HI: 0.12, SIN_EDGE_LO: 0.34, SIN_EDGE_HI: 0.51 },
  /** Solid organs (organ-shader.ts, the cel fill): the band edges in n·L terms (lambert against the screen-space light), the same three tones; a shape too round to reach LIT_AT keeps two. */
  ORGAN: {
    /** Where an organ's tones change, in n.L plus the box lean below: a flat face-on organ sits at LIGHT.z / |LIGHT| = 0.6, between the two. */
    SHADE_LAM: 0.5,
    LIT_LAM: 0.75,
    LIGHT: [-0.5, 0.62, 0.6] as const,
    /** The baked tuck (organ-depth.ts, 0..1) above which an organ with Organ depth on wears one hard band of the shade tone. */
    TUCK_AO: 0.6,
    /** A flat organ still shows its bands: the measure leans by this much across the organ's own box toward the light (upper left lit, lower right shade), as 2D's og-vol light does. */
    BOX_BIAS: 1.0,
    /** How strong the organ tones are (stronger than the vessels', which stay 2D's): the shade is the base less SHADE of itself, then DEEP of the way to the organ's own darkest tone (og-dark where the third tone is the light edge of a dark look);
     *  the lit tone is LIT_O1 of the way to the organ's own light tone, then LIT of the way to og-light. */
    SHADE: 0.38,
    DEEP: 0.62,
    LIT_O1: 0.9,
    LIT: 0.45,
    /** The cel organ's line: its width grows by LINE_SCALE (figure units, as 2D's .org-line) and its alpha by INK_BOOST of what is left to 1, so an edge and an overlap read as ink. */
    /** What varies over the organ's surface (the liver's nodules and septa, the dead spleen, the stomach's pool) is laid at this share of its wash strength: the wash dilutes it by the layer's opacity, the cel does not. */
    PAINT: 0.5,
    /** A vessel behind an organ (the cava: vessel-object.ts setBehindOrgans) is seen under the 2D wash at (1 - layer); cel organs are opaque, so its veil takes this share of that back: veil = 0.4 + 0.6 x VEIL_SEE x (1 - layer). */
    VEIL_SEE: 1.0,
    LINE_SCALE: 2.0,
    INK_BOOST: 0.9,
  },
} as const;

/** The band a measure `s` falls in, 0 shade, 1 base, 2 lit, with the hard edge `edge` wide (in the same units as s; 0 is a pure step). The JS twin of the shaders' step, for tests. */
export function celBand(s: number, edge = 0, shadeAt: number = CEL_STYLE.SHADE_AT, litAt: number = CEL_STYLE.LIT_AT): 0 | 1 | 2 {
  const lo = shadeAt - edge, hi = litAt + edge;
  return s < lo ? 0 : s >= hi ? 2 : 1;
}

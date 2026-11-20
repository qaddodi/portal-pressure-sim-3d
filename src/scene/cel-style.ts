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
  /** Solid organs (organ-shader.ts, the cel fill): the band edges in n·L terms (lambert against the screen-space light), the same three tones; a shape too round to reach LIT_AT keeps two. */
  ORGAN: {
    /** Where an organ's tones change, in n.L plus the box lean below: a flat face-on organ sits at LIGHT.z / |LIGHT| = 0.6, between the two. */
    SHADE_LAM: 0.5,
    LIT_LAM: 0.72,
    LIGHT: [-0.5, 0.62, 0.6] as const,
    /** The baked tuck (organ-depth.ts, 0..1) above which an organ with Organ depth on wears one hard band of the shade tone. */
    TUCK_AO: 0.6,
    /** A flat organ still shows its bands: the measure leans by BOX_BIAS x (BOX_R0 - r), r the distance in the organ's own box from the light's spot BOX_LIGHT (as 2D's og-vol light), so the lit cap is round, round the light, and the shade is the far lower right,
     *  in curved bands that follow the organ (a straight line across it reads as a cast shadow). */
    BOX_BIAS: 0.5,
    BOX_R0: 0.48,
    BOX_LIGHT: [0.34, 0.26] as const,
    /** Matte and flat (Mohammad, 20 Nov: "like glass ... not too shiny"; "the colors are wrong"): the cel base is the organ's own 2D tone (og-N-2, organs/cel-tones.ts), the shade and the lit are the SAME hue and saturation one flat lightness step away
     *  (HSL: the shade's lightness x (1 - SHADE_L) and at least SHADE_MIN less, the lit LIT_L of the way to white and at least LIT_MIN more), never mixed toward white, black or the grey og-light / og-dark. The line tone, for the art's fine lines, is darker still (LINE_L). */
    TONES: { SHADE_L: 0.3, SHADE_MIN: 0.12, LIT_L: 0.27, LIT_MIN: 0.1, LINE_L: 0.6 },
    /** What varies over the organ's surface (the liver's nodules and septa, the dead spleen, the stomach's pool) is laid at this share of its wash strength: the wash dilutes it by the layer's opacity, the cel does not. */
    PAINT: 0.5,
    /** A vessel behind an organ (the cava: vessel-object.ts setBehindOrgans) is seen under the 2D wash at (1 - layer); cel organs are opaque, so its veil takes this share of that back: veil = 0.4 + 0.6 x VEIL_SEE x (1 - layer). */
    VEIL_SEE: 1.0,
    /** The cel organ's line: 2D's casing ink (the look's `ink`) at an alpha of at least INK_ALPHA_MIN, as wide as LINE_SCALE times 2D's .org-line (figure units; half of it is under the organ's own fill), so an edge and an overlap read as bold ink. */
    LINE_SCALE: 3.0,
  },
} as const;

/** The band a measure `s` falls in, 0 shade, 1 base, 2 lit, with the hard edge `edge` wide (in the same units as s; 0 is a pure step). The JS twin of the shaders' step, for tests. */
export function celBand(s: number, edge = 0, shadeAt: number = CEL_STYLE.SHADE_AT, litAt: number = CEL_STYLE.LIT_AT): 0 | 1 | 2 {
  const lo = shadeAt - edge, hi = litAt + edge;
  return s < lo ? 0 : s >= hi ? 2 : 1;
}

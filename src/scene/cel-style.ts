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
  /** A tube's two tones fade in with its radius (device px): none under TONES_FROM (a hairline is one tone and its line), whole from TONES_TO. The strength follows the radius, never the position across the tube, so across it stays three flat tones. */
  TONES_FROM: 1.0,
  TONES_TO: 2.0,
  /** A tube's lit-side measure is cos(angle between its cross axis and the light) x TUBE_LEAN, held to -1..1: a tube up to 45 degrees off the light's cross still reaches all three tones (a tube running along the light would otherwise be one tone). */
  TUBE_LEAN: 1.41421356,
  /** VESSELS are TWO flat tones, not three (Mohammad, 20 Nov: "Vessels are two gradients is enough for cel shading. Not glassy please."): a lit tone (the saturated base) and a shade tone, one hard step between them at VESSEL_STEP_AT in the
   *  tube's lit-side measure, opaque and matte: no highlight, no rim light, no specular, no fresnel, no translucent wall, no lumen showing through. The organs and the lobule's tissue keep CEL_BANDS. */
  VESSEL_BANDS: 2,
  VESSEL_STEP_AT: 0.1,
  /** A tube's colour (every vessel, strand and the lobule's vessels): the lens colour is made SATURATED and DEEP before it is cut into its two tones, and the shade is a hue-preserving darker step, never a mix toward white.
   *  SAT: chroma x this about the colour's own grey; LCAP: no tube is lighter than this luminance, nor has a channel above VCAP (a pale end of a ramp is darkened, hue kept);
   *  SHADE_SAT: the shade tone's chroma x this (a touch more saturated, as a painter's shade is); VEIL_FLOOR: a vessel behind an organ (the cava) is drawn at no less than this alpha, so it stays a colour and does not go grey;
   *  RIM_SHARE: the share of 2D's light inner rim a vessel keeps (0: no pale halo or white rim, the ink is the only edge);
   *  INK_OWN / INK_TONE: the outline is the look's casing ink mixed INK_OWN of the way to a deep tone (x INK_TONE) of the vessel's own colour, so it is a soft dark of the tube and never black or white, on every look;
   *  END_R: a joined end (smooth joins) draws no ink for this many radii from the end: the cut is buried in the trunk, never outlined. */
  TUBE: { SAT: 1.5, LCAP: 0.62, VCAP: 0.78, SHADE_SAT: 1.2, VEIL_FLOOR: 0.7, RIM_SHARE: 0, INK_OWN: 0.75, INK_TONE: 0.32, END_R: 1.2 },
  /** The painted plates (the lobule's tissue, the sinusoid's) step in their own measures, not the tubes' `s`: a painted colour's lightness against its local lightness, so SHADE_AT / LIT_AT above (made for -1..1) do not apply.
   *  SHADE_AT / LIT_AT: where the relative lightness changes tone (a dead zone of +-0.15 around a flat cell); DETAIL: further than this from the base the pixel is detail (a membrane, a nucleolus) and stays as painted;
   *  EDGE_LO / EDGE_HI: the lightness jump over one device pixel from which a line is inked on the lobule's plate (a membrane is under, a cell's outline over); SIN_EDGE_LO / SIN_EDGE_HI the same as a share of the lightness on the sinusoid.
   *  Those two pairs are the painted lines' own contrast, so they do not move with SHADE (a stronger tone must not unink the cell outlines). */
  TISSUE: { SHADE_AT: -0.15, LIT_AT: 0.15, DETAIL: 0.5, EDGE_LO: 0.05, EDGE_HI: 0.12, SIN_EDGE_LO: 0.34, SIN_EDGE_HI: 0.51 },
  /** The soft light of the figure's 3D parts (Organ depth in organ-shader.ts; the lobule's and the sinusoid's 3D cells, micro3d/cel3d.ts) and where their n.L tones change: the screen's upper left. The organs themselves are the see-through wash (the cel fill was dropped 20 Nov). */
  ORGAN: {
    SHADE_LAM: 0.5,
    LIT_LAM: 0.75,
    LIGHT: [-0.5, 0.62, 0.6] as const,
  },
  /** The true-3D lobule and sinusoid (micro3d/, Settings > Figure depth > 3D lobule and sinusoid): solid shapes lit as the organs are (ORGAN.LIGHT, the same n.L edges),
   *  three flat tones and a bold ink round every shape. The tones are a little stronger than the vessels' so a cell's bevel, a nucleus's dome and the trough of the lumen read as form. */
  MICRO: {
    SHADE: 0.24,
    LIT: 0.16,
    /** The ink, in CSS px: round the big shapes (hepatocytes, the trough, the cells), round the small ones (pores, albumin, microvilli). */
    LINE: 1.25,
    LINE_SMALL: 0.8,
  },
} as const;

/** The band a measure `s` falls in, 0 shade, 1 base, 2 lit, with the hard edge `edge` wide (in the same units as s; 0 is a pure step). The JS twin of the shaders' step, for tests. */
export function celBand(s: number, edge = 0, shadeAt: number = CEL_STYLE.SHADE_AT, litAt: number = CEL_STYLE.LIT_AT): 0 | 1 | 2 {
  const lo = shadeAt - edge, hi = litAt + edge;
  return s < lo ? 0 : s >= hi ? 2 : 1;
}

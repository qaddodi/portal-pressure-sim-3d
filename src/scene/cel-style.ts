// THE cel style, in one place (Mohammad, 20 Nov 2026: "Everything cel shaded in the figures, it should look beautiful"). Every surface of the figure (organs, vessels, the lobule's parts, the
// sinusoid's) reads its band count, where the bands change, how strong each band is and how heavy the ink is from here, so the whole figure is one style: three flat tones (shade, base, lit)
// lit from the top left of the SCREEN, a hard but antialiased edge between them, and a dark line round every shape. A number that decides how any of that looks is changed here and nowhere else;
// tests/cel-style.test.ts fails a second copy. 20 Nov 2026, Mohammad: "Still not cel shaded": 2D's own tones (shade -17 %, lit +15 %, a 1.5 px line) read as soft shading, so they are pushed to a true toon look here: wide, flat bands with clearly different tones and a bold, even line (a deliberate step past 2D, one place to change back).

/** Three tones everywhere: shade, base, lit. */
export const CEL_BANDS = 3;

export const CEL_STYLE = {
  BANDS: CEL_BANDS,
  /** THE light, fixed in WORLD space (x right, y up, z toward the default viewer; not unit, the shaders normalise it): upper left, in front. Every 3D surface (Organ depth, the vessels' and strands' tubes, the lobule's and
   *  sinusoid's solids) is lit by n.L against this, with the normal taken to the world (the model matrix, or the view matrix's inverse), so orbiting, zooming, tilting and parallax of the CAMERA never change a shade; only a model's
   *  own motion does (Mohammad, 20 Nov: "I'm moving the camera NOT the figure"). tests/cel-world-light.test.ts fails a lighting shader that lights in view space. */
  LIGHT: [-0.5, 0.62, 0.6] as const,
  /** The direction toward the light on the SCREEN (x right, y up): the top left. 2D's is y down: (-0.707, -0.707). No 3D shader reads it (they all use LIGHT, in the world); it stays as the 2D figure's pinned number. */
  DIR: [-0.70710678, 0.70710678] as const,
  /** Where the tones change, in the lit-side measure `s` (-1 away from the light .. 1 toward it): below SHADE_AT is the shade tone, above LIT_AT the lit tone. (A tube's `s` is across the tube; a solid's is n·L.) */
  SHADE_AT: -0.05,   // (2D: -0.16; wider bands: the shade side is nearly half the tube)
  LIT_AT: 0.45,   // (2D: 0.24)
  /** How strong each tone is: the shade takes this share off the base (x 1 - SHADE), the lit lifts this share toward white. */
  SHADE: 0.38,   // (2D: 0.17)
  LIT: 0.3,   // (2D: 0.15)
  /** The ink line, in CSS px (never device px): LINE_R of the radius (a radius in CSS px too) held between LINE_MIN and LINE_MAX. A device-px clamp drew the same line 1.17 CSS px wide on a 3x iPhone and 3.5 CSS px on a 1x
   *  screen (external review, 20 Nov), so every shader converts with the renderer's pixel ratio (`dpr`) and the line is the same weight on every screen. 1.6 / 3 CSS px are 3.2 / 6 device px on a 2x Mac, where the 20 Nov figure was
   *  approved ("veins outlines should be thicker in general everywhere"; it was 3.5 / 6 device px). */
  LINE_R: 0.3,   // (2D: 0.14; 0.2 until Mohammad, 20 Nov: "veins outlines should be thicker in general everywhere")
  LINE_MIN: 1.6,   // CSS px (2D: 1.5; a thin vessel's line thins with its lumen under this radius, cel-ink.ts inkTaper, so it never swallows the vessel)
  LINE_MAX: 3.0,   // CSS px (2D: 3)
  /** The ink's least alpha on every look (2D's casing is .64 on Light and .3 on Dark: a line that fades into the page is not a toon line). */
  INK_ALPHA_MIN: 1.0,
  /** A band's edge is this many device px across in each direction: crisp, antialiased by fwidth, never a gradient. */
  EDGE_PX: 0.4,
  /** A tube's two tones fade in with its radius (device px): none under TONES_FROM (a hairline is one tone and its line), whole from TONES_TO. The strength follows the radius, never the position across the tube, so across it stays three flat tones. */
  TONES_FROM: 1.0,
  TONES_TO: 2.0,
  /** VESSELS are TWO flat tones, not three (Mohammad, 20 Nov: "Vessels are two gradients is enough for cel shading. Not glassy please."): a lit tone (the saturated base) and a shade tone, one hard step between them at VESSEL_STEP_AT in the
   *  lit-side measure (a 3D tube's is n.L against LIGHT, in the world), opaque and matte: no highlight, no rim light, no specular, no fresnel, no translucent wall, no lumen showing through. The organs and the lobule's tissue keep CEL_BANDS. */
  VESSEL_BANDS: 2,
  VESSEL_STEP_AT: 0.25,
  /** A tube's colour (every vessel, strand and the lobule's vessels): the lens colour is made SATURATED and DEEP before it is cut into its two tones, and the shade is a hue-preserving darker step, never a mix toward white.
   *  SAT: chroma x this about the colour's own grey; LCAP: no tube is lighter than this luminance, nor has a channel above VCAP (a pale end of a ramp is darkened, hue kept);
   *  LCAP_DARK / VCAP_DARK: the same caps on the dark looks (Dark, Navy, Black), where a vessel must stand BRIGHTER than the organs behind it and the ground (Mohammad, 20 Nov: "the anatomy view should be more contrast, it's very basically dark now");
   *  SHADE_SAT: the shade tone's chroma x this (a touch more saturated, as a painter's shade is); 
   *  RIM_SHARE: the share of 2D's light inner rim a vessel keeps (0: no pale halo or white rim, the ink is the only edge);
   *  INK_OWN / INK_TONE: the outline is the look's casing ink mixed INK_OWN of the way to a deep tone (x INK_TONE) of the vessel's own colour, so it is a soft dark of the tube and never black or white, on every look;
   *  INK_TONE_DARK: the same on the dark looks, where the base is much brighter (LCAP_DARK) so the same share left the ink at the ground's own lightness and the outline vanished (Mohammad, 20 Nov, play-test: "in Dark the vessels show no ink edge"): a clear step lighter than the ground (Black's pure black included) and a clear step darker than the vessel's shade and the organ behind it, 1.6:1 or more each way (tests/dark-ink.test.ts);
   *  (the outline is never faded at a join: it is held back only inside a declared branch's trunk, smooth-joins.ts BURY, vessels/shaders.ts buryK) */
  TUBE: { SAT: 1.5, LCAP: 0.62, VCAP: 0.78, LCAP_DARK: 0.82, VCAP_DARK: 0.96, SHADE_SAT: 1.2,  RIM_SHARE: 0, INK_OWN: 0.75, INK_TONE: 0.32, INK_TONE_DARK: 0.55 },
  /** The painted plates (the lobule's tissue, the sinusoid's) step in their own measures, not the tubes' `s`: a painted colour's lightness against its local lightness, so SHADE_AT / LIT_AT above (made for -1..1) do not apply.
   *  SHADE_AT / LIT_AT: where the relative lightness changes tone (a dead zone of +-0.15 around a flat cell); DETAIL: further than this from the base the pixel is detail (a membrane, a nucleolus) and stays as painted;
   *  EDGE_LO / EDGE_HI: the lightness jump over one device pixel from which a line is inked on the lobule's plate (a membrane is under, a cell's outline over); SIN_EDGE_LO / SIN_EDGE_HI the same as a share of the lightness on the sinusoid.
   *  Those two pairs are the painted lines' own contrast, so they do not move with SHADE (a stronger tone must not unink the cell outlines). */
  TISSUE: { SHADE_AT: -0.15, LIT_AT: 0.15, DETAIL: 0.5, EDGE_LO: 0.05, EDGE_HI: 0.12, SIN_EDGE_LO: 0.34, SIN_EDGE_HI: 0.51 },
  /** The ORGANS: three authored tones (the look's own lit, base and shade tones; palette.ts organs.tones) cut from ONE quantised lighting signal, never a gradient (external review, 20 Nov: "the organ shader starts with continuous colour interpolation, adds radial
   *  light/shade and then overlays further shading"; Mohammad: "let's do the ones that fit my rules"). The signal is n.L against the world LIGHT (organ normals are in world axes, so the camera changes nothing), lowered by TUCK x the baked contact
   *  shade (organ-depth.ts) where two organs meet. Its two edges sit at SHADE_AT and LIT_AT (the same -1..1 measure as above, but a pillow's face-on normal is n.L 0.6, so the base band is wide and the lit and shade ones are the shoulders);
   *  SPREAD widens the lit and shade tones about the base (x the authored distance, so a step reads on every look); each is EDGE_PX device px across, antialiased by the derivative and nowhere else. The fill is OPAQUE (no layer alpha: organs hide each other by depth, the way the figure's solids do) and the outline is its own colour at INK_A
   *  (the right atrium's is fainter because it is part of the heart, the gut's because 2D draws the gut as a quiet background), never premixed against the page. */
  ORGAN: { SHADE_AT: 0.3, LIT_AT: 0.85, TUCK: 0.6, SPREAD: 1.5, INK_A: 1.0, INK_A_GUT: 0.7, INK_A_ATRIUM: 0.35 },
  /** The true-3D lobule and sinusoid (micro3d/, Settings > Figure depth > 3D lobule and sinusoid): solid shapes lit by the one world LIGHT, EXACTLY TWO flat tones (the base and a shade, one hard edge at VESSEL_STEP_AT, no lit tone
   *  toward white, no gloss) and a bold ink round every shape. The shade is a little stronger than the vessels' on the cell's small forms (a bevel, a nucleus's dome, the trough of the lumen) so they read as form. */
  MICRO: {
    SHADE: 0.3,
    /** The ink, in CSS px: round the big shapes (hepatocytes, the trough, the cells), round the small ones (pores, albumin, microvilli). */
    LINE: 1.5,
    LINE_SMALL: 1.0,
    /** Every cell's and particle's ink: its own fill this deep (near black, as the Anatomy's lines read; a mid red round a red cell read as no line at all). */
    INK_K: 0.28,
  },
} as const;

/** The band a measure `s` falls in, 0 shade, 1 base, 2 lit, with the hard edge `edge` wide (in the same units as s; 0 is a pure step). The JS twin of the shaders' step, for tests. */
export function celBand(s: number, edge = 0, shadeAt: number = CEL_STYLE.SHADE_AT, litAt: number = CEL_STYLE.LIT_AT): 0 | 1 | 2 {
  const lo = shadeAt - edge, hi = litAt + edge;
  return s < lo ? 0 : s >= hi ? 2 : 1;
}

// The cel step for the flat micro views (lobule plate, sinusoid): the same hard stepped tone bands the vessels and organs use (materials/shaders.ts: floor(q) + a smoothstep one
// pixel wide, never a gradient), applied to a PAINTED colour (2D's own) instead of a lit surface. The colour keeps its hue and chroma; only its lightness steps. Plain GLSL text
// so the programs that include it compile in tests/glsl-compile.test.ts and can be read without a GPU.
// Its numbers are the figure's one cel style (src/scene/cel-style.ts CEL_STYLE): the band count, the edge width and the tone strengths are read from there, never typed here.
//
//   celLight(c)            the colour's lightness (Rec. 601, as the rest of the app)
//   celQuant(c, bands)     the colour with its lightness cut into `bands` hard steps (the edge between two steps is one device pixel wide: fwidth)
//   celQuantW(c, bands, w) the same with the edge width given (for code where fwidth is not defined: a vertex or a non-uniform branch)
//   celInk(base, ink, d, w) an outline: `ink` laid over `base` where the signed distance d (px, negative inside) is within w of 0, soft by one pixel
import { CEL_BANDS, CEL_STYLE } from '../cel-style.ts';

export const CEL_QUANT_GLSL = /* glsl */ `
const float CEL_EDGE_PX = ${CEL_STYLE.EDGE_PX.toFixed(2)};
const float CEL_EDGE_HALF = ${(CEL_STYLE.EDGE_PX / 2).toFixed(3)};   // (the ramp is smoothstep(0.5 - w, 0.5 + w): w is HALF the edge, so the whole ramp is EDGE_PX device px of the measure's derivative)
const float CEL_SHADE = ${CEL_STYLE.SHADE.toFixed(2)};
const float CEL_LIT = ${CEL_STYLE.LIT.toFixed(2)};
float celLight(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 celQuantW(vec3 c, float bands, float w) {
  float l = celLight(c), q = l * bands, f = fract(q);
  float b = (floor(q) + smoothstep(0.5 - w, 0.5 + w, f)) / bands;
  return c * (b / max(l, 1e-4));
}
vec3 celQuant(vec3 c, float bands) {
  float l = celLight(c), q = l * bands;
  float w = max(fwidth(q) * CEL_EDGE_HALF, 1e-3);
  return celQuantW(c, bands, w);
}
vec3 celInk(vec3 base, vec3 ink, float d, float w) {
  float a = 1.0 - smoothstep(w - 0.5, w + 0.5, abs(d));
  return mix(base, ink, a);
}
`;

/** The number of tone bands the figures use: the vessels' two or three (materials/cel.ts `bands`), three for tissue (light, body, shade), so a painted cell reads as the vessels do. */
export const CEL_TISSUE_BANDS: number = CEL_BANDS;

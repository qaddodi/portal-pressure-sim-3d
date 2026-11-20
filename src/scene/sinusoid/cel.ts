// The sinusoid, cel shaded (owner, 20 Nov 2026: "everything cel shaded in the figures, it should look beautiful"). 2D's tissue shader is copied untouched (gl.copied.ts, held current by
// scripts/copy-sinusoid.mjs --check); the cel step is a wrapper laid over its output, so the copy still proves itself and this is the only thing added:
//   main2d()      2D's own main, renamed (exactly one `void main() {` in the copy; the wrap stops with a clear error if 2D's shader ever has two)
//   main()        runs it, takes the premultiplied pixel back to its colour, then
//                 1. steps the colour's lightness onto hard tone bands: each band is CEL_RATIO wider than the one below (a step in the logarithm of the lightness, so a dark look and a pale
//                    one both show the same number of bands, and no flat fill moves from its 2D colour by more than half a step); hue and chroma are kept (the colour is scaled, never remixed),
//                    and the edge between two bands is one device pixel wide (fwidth), never a gradient. The lumen's smooth shading, the sheen and the streaks come out as clean stepped
//                    tones; the moving streaks still glide, because a band edge moves smoothly with the colour that crosses it.
//                 2. lays a clean ink line, one to two device pixels, where the colour changes sharply from one pixel to the next (a cell's edge, the endothelium's, a nucleus', the stellate and
//                    Kupffer cells' membranes): the colour's own darker shade, at the strength of the change, so the line is the figure's ink and never a new colour.
//                 3. puts the pixel back premultiplied, with 2D's own alpha (the dive's crossfade, `show`) untouched, so nothing shimmers while the tissue comes in.
// The albumin sprites keep their own ring (their shader is not wrapped).
import { CEL_QUANT_GLSL } from '../materials/cel-quant.ts';
import { CEL_STYLE } from '../cel-style.ts';

/** One band is the figure's own shade step wider than the one below: the shade tone is the base times (1 - SHADE) (cel-style.ts), so a step in the logarithm of the lightness of -ln(1 - SHADE) (about 0.186, 17 %)
 *  is exactly one shade step: a flat 2D fill moves at most half a step and a shaded lumen shows the same stepped tones the vessels do. Nothing here is a number of its own. */
export const CEL_STEP = -Math.log(1 - CEL_STYLE.SHADE);
/** An edge is inked where the lightness changes by a whole shade step of itself within one pixel, fully inked at two; the ink is the colour shaded three times over (the vessels' casing is 2D's near-black: three shade steps
 *  read as one tone of the same hue, the figure's ink), at the strength of the edge. The band edge is EDGE_PX device px across on each side. */
export const CEL_EDGE_LO = CEL_STYLE.SHADE, CEL_EDGE_HI = 2 * CEL_STYLE.SHADE, CEL_INK = (1 - CEL_STYLE.SHADE) ** 3;

export const CEL_MAIN_GLSL = /* glsl */ `
${CEL_QUANT_GLSL}
const float CEL_STEP = ${CEL_STEP.toFixed(4)};
void main() {
  main2d();
  float a = o.a;
  vec3 c = o.rgb / max(a, 1e-4);
  float l = max(celLight(c), 0.004);
  // (every derivative before any branch)
  float q = log(l) / CEL_STEP;
  float w = max(fwidth(q) * ${CEL_STYLE.EDGE_PX.toFixed(2)}, 1e-3);
  float edge = smoothstep(${CEL_EDGE_LO.toFixed(3)}, ${CEL_EDGE_HI.toFixed(3)}, fwidth(l) / l);
  float lvl = floor(q) + smoothstep(0.5 - w, 0.5 + w, fract(q));
  vec3 cq = c * (exp(lvl * CEL_STEP) / l);
  cq = mix(cq, cq * ${CEL_INK.toFixed(3)}, edge);
  o = vec4(mix(o.rgb, cq * a, step(0.003, a)), a);
}
`;

/** 2D's tissue shader with the cel step laid over it. */
export function celSinusoidFS(fs: string): string {
  const key = 'void main() {';
  const i = fs.indexOf(key);
  if (i < 0 || fs.indexOf(key, i + 1) >= 0) throw new Error('sinusoid cel: expected exactly one `void main() {` in the 2D shader');
  return fs.slice(0, i) + 'void main2d() {' + fs.slice(i + key.length) + '\n' + CEL_MAIN_GLSL;
}

// ---- the twin: the same step on one pixel in JavaScript (tests/scene-sinusoid-cel.test.ts) ----
const light = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
/** The colour with its lightness stepped onto the bands (`w` the edge's width in band units; 0 for a hard step). Hue and chroma kept: the colour is scaled. */
export function celQuantRel(c: readonly [number, number, number], step = CEL_STEP, w = 0): [number, number, number] {
  const l = Math.max(light(c), 0.004), q = Math.log(l) / step, f = q - Math.floor(q);
  const t = w <= 0 ? (f < 0.5 ? 0 : 1) : Math.min(1, Math.max(0, (f - (0.5 - w)) / (2 * w))) ** 2 * (3 - 2 * Math.min(1, Math.max(0, (f - (0.5 - w)) / (2 * w))));
  const k = Math.exp((Math.floor(q) + t) * step) / l;
  return [c[0] * k, c[1] * k, c[2] * k];
}
/** The ink: how much of an edge a pixel carries from the lightness change across it (`dl`, the pixel's own fwidth) and its lightness. */
export function celEdge(dl: number, l: number): number {
  const t = Math.min(1, Math.max(0, (dl / Math.max(l, 1e-4) - CEL_EDGE_LO) / (CEL_EDGE_HI - CEL_EDGE_LO)));
  return t * t * (3 - 2 * t);
}

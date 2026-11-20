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
/** An edge is inked where the lightness changes by SIN_EDGE_LO of itself within one pixel (a cell's or the wall's outline, not a membrane's soft line or a gradient; the painted lines' own contrast, so it does not move with the tone strength), fully inked at SIN_EDGE_HI; the ink is the colour shaded three times over (the vessels' casing is 2D's near-black: three shade steps
 *  read as one tone of the same hue, the figure's ink), at the strength of the edge. The band edge is EDGE_PX device px across on each side. */
export const CEL_EDGE_LO = CEL_STYLE.TISSUE.SIN_EDGE_LO, CEL_EDGE_HI = CEL_STYLE.TISSUE.SIN_EDGE_HI, CEL_INK = (1 - CEL_STYLE.SHADE) ** 3;
/** The wall and the space of Disse are one flat tone: a colour within this many shade steps of 2D's own Disse colour is that colour (a dead zone of 1.5 steps across, 0.75 each side), so its soft lymph dashes, collagen bands and the wall's blend never slice into stripes; the lumen rounds to the nearest rung (0.5). */
export const CEL_DEAD_DISSE = 0.75, CEL_DEAD_LUMEN = 0.5;

export const CEL_MAIN_GLSL = /* glsl */ `
${CEL_QUANT_GLSL}
const float CEL_STEP = ${CEL_STEP.toFixed(4)};
// The rung of lightness l on a ladder anchored at lb: 0 is lb itself, each rung one band, the first edge at DEAD bands from it; edges are EDGE_PX across (w, in bands).
float celRung(float l, float lb, float dead, float w) {
  float u = log(l / lb) / CEL_STEP, q = abs(u) - dead + 0.5;
  return sign(u) * max(floor(q) + smoothstep(0.5 - w, 0.5 + w, fract(q)), 0.0);
}
void main() {
  main2d();
  float a = o.a;
  vec3 c = o.rgb / max(a, 1e-4);
  float l = max(celLight(c), 0.004);
  // (every derivative before any branch)
  float rel = fwidth(l) / l;
  float w = max(rel / CEL_STEP * ${CEL_STYLE.EDGE_PX.toFixed(2)}, 1e-3);
  float edge = smoothstep(${CEL_EDGE_LO.toFixed(3)}, ${CEL_EDGE_HI.toFixed(3)}, rel);
  // where the pixel is: the lumen, the wall and the space of Disse (pass 0), or the plates and the cells over them
  float ay = abs(vUm.y), hw = halfW(vUm.x), hi = hw + ENDO + disseW(vUm.x);
  float onLumen = uPass == 0 && ay < hw ? 1.0 : 0.0;
  float onDisse = uPass == 0 && ay >= hw && ay < hi ? 1.0 : 0.0;
  // the ladder: on the lumen and on the Disse it stands on 2D's own colour of the place (rung 0 IS that colour, so a region of it is one clean tone); elsewhere it stands on the page's own lightness scale
  float lb = max(celLight(onLumen > 0.5 ? cLumen : cLymph), 0.004);
  float lvAnchored = log(lb) + CEL_STEP * celRung(l, lb, onLumen > 0.5 ? ${CEL_DEAD_LUMEN.toFixed(2)} : ${CEL_DEAD_DISSE.toFixed(2)}, w);
  float q = log(l) / CEL_STEP;
  float lvAbsolute = CEL_STEP * (floor(q) + smoothstep(0.5 - w, 0.5 + w, fract(q)));
  vec3 cq = c * (exp(mix(lvAbsolute, lvAnchored, max(onLumen, onDisse))) / l);
  // no ink inside the Disse (its ticks and dashes are drawn, not outlined); the wall's and the cells' outlines keep it
  float inkOn = 1.0 - onDisse * smoothstep(hw + ENDO + 0.2 - uPx, hw + ENDO + 0.2 + uPx, ay) * (1.0 - smoothstep(hi - 0.2 - uPx, hi - 0.2 + uPx, ay));
  cq = mix(cq, cq * ${CEL_INK.toFixed(3)}, edge * inkOn);
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

/** The twin of the shader's anchored rung: the lightness `l` on a ladder standing on `lb` (rung 0 is lb), first edge `dead` bands out, hard edges (w = 0). Returns the stepped lightness. */
export function celAnchored(l: number, lb: number, dead: number, step = CEL_STEP): number {
  const u = Math.log(l / lb) / step, q = Math.abs(u) - dead + 0.5;
  return lb * Math.exp(Math.sign(u) * Math.max(Math.round(q), 0) * step);
}

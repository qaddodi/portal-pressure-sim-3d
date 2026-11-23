// The lobule's tissue painting: the 2D app's own painter (lobule-paint.js paintLobule, copied by scripts/copy-lobule.mjs) paints the hepatocyte plates, their membranes
// and nuclei, the nutmeg of congestion, the collagen of fibrosis and cirrhosis and the stellate cells into a canvas, once per state ("drawn once into a cached canvas,
// never per frame"); the 3D lobule (micro3d/lobule3d.ts) lays it under its cells with the shader here.
import { CEL_TISSUE_GLSL } from './cel.ts';
import { CEL_LIGHT_GLSL } from '../cel-glsl.ts';
import { RELIEF_GLSL } from './relief.ts';
import { COLL_EDGE_GLSL } from './collagen-edge.ts';
import { FADE_GLSL } from '../materials/shaders.ts';
import { DataTexture } from 'three';
import { paintWorldInto, useTokens } from './from2d/lobule-paint.generated.js';
import type { LobuleNet, Course, P2 } from './geometry.ts';
import { lookColours } from './lz-colours.ts';
import { cvBandGlsl } from './cv-band.ts';
import { GROW_H } from './growth.ts';
import type { LookId } from '../../looks/looks.ts';

/** The painting's world units per lobule radius: the 2D app's lobule is about this many CSS px across on an iPad, so every pixel rule in its painter
 *  (a 0.6 px membrane, a 0.9 px nucleus at least, the fibres' widths) lands as it does in 2D. */
export const PLATE_S = 400;
/** The canvas covers the lobule out to this many radii each way: the hexagon's own fill reaches 1.015, but a portal tract's scar rings its corner whole (out to rt x 1.7 x 1.08 = 0.18 past it at the most), so
 *  the canvas reaches past that: at 1.04 the scar was cut off square just outside the hexagon (Mohammad 20 Nov: "it's clipped like at the hexagon"). */
export const PLATE_BOX = 1.22;
/** The canvas's side in pixels: a whole lobule at twice the fit on an iPad Pro stays sharp; mipmapped for the fit. */
export const PLATE_PX = 2048;
/** The plate's depth under the courses (the vessels lie at 0, their lowest edge about -0.07 when congested zone 3 dilates). */
export const PLATE_Z = -0.1;

/** The tissue values the painting reads (lobule-paint.js P.m), and the layers it draws. */
export interface PlateState { congU: number; septU: number; fibSin: number; act: number; fibPre: number; fibPost: number }

/** A state rounded to the steps the painting is redone at (1/32 of each value: finer than the eye sees on the plates, coarse enough that an easing
 *  model asks for a handful of paintings, not one a frame). */
export function plateKey(s: PlateState, look: LookId): string {
  const q = (x: number) => Math.round(Math.min(1, Math.max(0, x || 0)) * 32);
  return `${look}|${q(s.congU)},${q(s.septU)},${q(s.fibSin)},${q(s.act)},${q(s.fibPre)},${q(s.fibPost)}`;
}
const unkey = (k: string): PlateState => { const v = k.split('|')[1]!.split(',').map((x) => Number(x) / 32); return { congU: v[0]!, septU: v[1]!, fibSin: v[2]!, act: v[3]!, fibPre: v[4]!, fibPost: v[5]! }; };

/** The plate's one quantiser for a live goal: steps of 1/32 with hysteresis, so a value sitting on the line between two steps (a live model's does, every frame) keeps ONE step and so one painting.
 *  A value leaves its step only when it is 0.75 of a step away (more than the half a plain rounding uses), and 0 and 1 are exact. The field's tile has the same rule (field.ts fieldQuantizer, 2D's fsQ). */
export function plateQuantizer(): (s: PlateState) => PlateState {
  const last: Partial<PlateState> = {};
  const q = (k: keyof PlateState, x: number): number => {
    const v = Math.min(1, Math.max(0, x || 0)), o = last[k];
    if (v === 0 || v === 1) return (last[k] = v);
    return o !== undefined && Math.abs(v - o) < 0.75 / 32 ? o : (last[k] = Math.round(v * 32) / 32);
  };
  return (s) => ({ congU: q('congU', s.congU), septU: q('septU', s.septU), fibSin: q('fibSin', s.fibSin), act: q('act', s.act), fibPre: q('fibPre', s.fibPre), fibPost: q('fibPost', s.fibPost) });
}

/** Scene radii of the sinusoids (the view's RAD, in lobule radii): the space of Disse's collagen follows them. */
export interface SinCourse { c: Course; r: number }

/** The lobule's shape in the painter's world units (lobule-zoom.js worldShape), from the 3D network: centre at 0, y down, PLATE_S per radius. */
export function plateShape(net: LobuleNet) {
  const S = PLATE_S, sc = (p: P2): [number, number] => [p[0] * S, p[1] * S];
  return {
    R: S, cx: 0, cy: 0, rt: net.rt * S, rs0: net.rs0 * S, rcv0: net.rcv0 * S,
    lobules: [{ x: 0, y: 0, corners: net.corners.map(sc) }],
    cells: net.cells.map((k) => ({ x: k.x * S, y: k.y * S, a: k.a, l: k.l * S, w: k.w * S, tone: k.tone, nu: k.nu, q: k.q, drop: k.drop, jx: k.jx, jy: k.jy, ja: k.ja })),
    hsc: net.stellate.map((k) => ({ x: k.x * S, y: k.y * S, a: k.a, nx: k.nx, ny: k.ny })),
    septaPC: net.septa.map((pts) => ({ pts: pts.map(sc) })),
  };
}

/** What paintLobule reads for a state and a look (lobule-zoom.js worldInput). */
export function plateInput(G: ReturnType<typeof plateShape>, sins: readonly SinCourse[], cvR: number, s: PlateState, look: LookId) {
  const L = lookColours(look), S = PLATE_S;
  const bg = L.text('--stage-bg') ? L.rgb01('--stage-bg') : L.rgb01('--bg');
  return {
    m: { congU: s.congU, septU: s.septU, fibSin: s.fibSin, act: s.act, fibPre: s.fibPre, fibPost: s.fibPost },
    G, dark: L.dark, zonesOn: false,   // (the Zones layer is its own overlay, so it eases in and out with no new painting: zones.ts)
    rgb: { bg, gap: L.rgb01('--og-liver-2'), cell: L.rgb01('--og-liver-1'), col: L.rgb01('--lz-septum'), dis: L.rgb01('--collagen') },
    sin: s.fibSin > 0.05 ? sins.map(({ c, r }) => ({ pts: c.pts.map((p) => [p[0] * S, p[1] * S]), r: r * S })) : [],
    cvIn: s.fibPost > 0.05 ? cvR * S : 0,
  };
}

/** The one painting of a state (2D's painter): the page, the worker and the tests all paint through here. The central vein's collagen is not painted, cv-band.ts draws it from its radius. */
export function paintPlateWorld(w: CanvasRenderingContext2D, n: number, sc: number, bx: number, by: number, input: ReturnType<typeof plateInput> & { zonesOn?: boolean }): void {
  paintWorldInto(w, n, sc, bx, by, input);
}

/** Paints one state of the tissue into a 2D context the size of the plate's canvas (n × n). */
export function paintPlate(ctx: CanvasRenderingContext2D, n: number, G: ReturnType<typeof plateShape>, sins: readonly SinCourse[], cvR: number, s: PlateState, look: LookId): void {
  const L = lookColours(look);
  useTokens((name: string, a?: number | string) => L.tk(name, a));
  const B = PLATE_BOX * PLATE_S, sc = n / (2 * B);
  paintPlateWorld(ctx, n, sc, -B, -B, plateInput(G, sins, cvR, s, look));
}

/** The ONE world light (cel-glsl.ts CEL_LIGHT) in the plate's own x (right) and y (up) axes, handed to the fragment as `vL`: the relief of the collagen (relief.ts) is lit from the same side as every lit surface, and it
 *  stays put when the camera moves and follows the plate when the lobule turns. */
export const PLATE_LIGHT_GLSL = /* glsl */ `
${CEL_LIGHT_GLSL}
varying vec2 vL;
vec2 plateLight() { return vec2(dot(CEL_LIGHT, normalize((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz)), dot(CEL_LIGHT, normalize((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz))); }
`;

/** The central vein's scar takes its place on the plate by where it lies (its own vertices, before the vein's scale): the plate's plane is `uSide` across, centred. */
export const LOBULE_SCAR_VS = /* glsl */ `
uniform float uSide;
varying vec2 vUv;
${PLATE_LIGHT_GLSL}
void main() { vUv = position.xy / uSide + 0.5; vL = plateLight(); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const LOBULE_PLATE_VS = /* glsl */ `
varying vec2 vUv;
${PLATE_LIGHT_GLSL}
void main() { vUv = uv; vL = plateLight(); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// (The canvas is sent premultiplied, so its transparent edge filters to nothing rather than to a dark fringe; the colours are the canvas's sRGB as they are,
// as the cel shaders write theirs.)
/** The plate's edge line: the tissue's own colour times SHADE, mixed in at K at most (no dark casing on collagen: Mohammad 20 Nov). */
export const PLATE_EDGE_SHADE = 0.8, PLATE_EDGE_K = 0.6;
export const LOBULE_PLATE_FS = /* glsl */ `
${CEL_TISSUE_GLSL}
const float PLATE_EDGE_SHADE = ${PLATE_EDGE_SHADE.toFixed(3)};
const float PLATE_EDGE_K = ${PLATE_EDGE_K.toFixed(3)};
${FADE_GLSL}
varying vec2 vL;   // the world light in the plate's own x and y (PLATE_LIGHT_GLSL)
${RELIEF_GLSL}
${COLL_EDGE_GLSL}
${cvBandGlsl(2 * PLATE_BOX)}
uniform sampler2D map;
uniform sampler2D mapB;   // the plate being crossfaded in, mixB of the way (0: none): one sampling of both, so the mix of two premultiplied plates is whole at every step (alpha (1-e)A + eB, never a gap)
uniform float mixB;
uniform float opacity;
uniform sampler2D mapC;    // the collagen atlas (collagen-paint.ts: the tracts and the vein's wall at their fullest on the left plate, the septa on the right): the fibres' colour only, never an edge
uniform sampler2D mapCB;   // its twin for a crossfade (the same texture when only the tissue changed); sampled in collagenAt, so it must be declared (Plan 28: it was not, and the device refused the program)
uniform sampler2D mapT;    // the septa's arrival times and edge (collagen-tau.ts): R arrival (255 never), G the edge's outward normal as an angle byte, B the signed distance to the edge (the middle pass) in plate px (square-root mapped), A the fade's depth t
uniform vec3 uCollS;       // the collagen's flat colours: the septa's (--lz-septum) and the tracts' deeper tone, and the same two of the look crossfading in (mixB of the way): the atlas gives the fibres' striations only
uniform vec3 uCollSB;
uniform vec3 uCollT;
uniform vec3 uCollTB;
uniform vec3 uP;           // the growth of the three channels now (growth.ts: eased on the clock, so a change of fibrosis shows more or less of the one layer and repaints nothing)
uniform vec3 uBase;     // the tissue the plate lies on (the cells' tone): the scar of the central vein, which lies over a pool and not over cells, takes the band over it
uniform float uBaseK;   // 1: the central vein's scar mesh (cv-band.ts inside the wall, over uBase), 0: the marks plate (the tissue and the collagen layer, then cv-band.ts past the wall)
uniform float uDpr;   // the renderer's pixel ratio (micro3d/cel3d.ts MICRO_DPR): the clean line is LINE_MIN CSS px on every screen
varying vec2 vUv;
const float GROW_H = ${GROW_H.toFixed(3)};   // the front's half width (growth.ts)
const float PLATE_PXF = ${PLATE_PX.toFixed(1)};   // the plate's side in pixels: a uv step of 1 is this many plate px
float front(float t, float p) { return t > 0.995 ? 0.0 : smoothstep(t - GROW_H, t + GROW_H, p); }
// the tissue at a point: the two plates of a crossfade mixed, premultiplied (the collagen is not in it: collagenAt, so no edge, ink or tone step of the tissue's ever lands on a band)
vec4 plateAt(vec2 uv, float bias) {
  if (uBaseK > 0.5) return vec4(0.0);   // (the vein's scar mesh holds no tissue and none of the collagen layer: its band is cv-band.ts, in main)
  vec4 a = texture2D(map, uv, bias);
  if (mixB > 0.0) { a = mix(a, texture2D(mapB, uv, bias), mixB); }
  return a;
}
vec4 plateTex(vec2 uv) { return plateAt(uv, 0.0); }
vec4 plateTexLod(vec2 uv, float bias) { return plateAt(uv, bias); }
// The collagen over the tissue (Plan 47: bands are SHAPES with a one device pixel edge, never a blur laid round them; Plan 48: and they FADE, rim to core, over the painter's own fade width, never one flat number), premultiplied, as much of it as has grown. Every derivative here is
// taken in main before the dissolve's discard. The base colour is the flat token (uCollS: --lz-septum; uCollT: the tracts' deeper tone), never the atlas's colour un-premultiplied (that made nuclei opaque dark worms and the fibres' alpha vanish); the atlas gives only the striations.
//   septa: the edge is the baked distance e (mapT.b) and the fade's depth t (mapT.a); the rope's normal is the baked angle (mapT.g, read at the nearest texel); how much of a septum shows is its arrival time (front), so a band eases in whole, never fades at its sides
//   tracts: the disc is round about each hexagon corner, so its radius is the pixel's distance from the nearest corner against the front's radius at this growth: the edge is one pixel at every growth, and the disc grows as it did; t is that distance over TRACT_FADE of the front's radius
// Each takes the rope's relief (relief.ts): one lit flank, one shade flank, a flat crown, nothing outside the edge.
// the painted fibres, as 606d60f4's raised-relief build had them (Mohammad: "it had already been done before"): the atlas's painted colour at the pixel's own level (the painter's LITE strands, 45% toward white, lie along every band), against the flat token it was painted from:
// the ratio is the strand, kept whole on the lit side (up to STRIA_LIT) and capped on the dark side (STRIA_DARK: a deep fibre or a nucleus never makes a dark worm), weighted by how much collagen the texel holds
float collStria(vec4 f, vec3 flatCol) {
  float s = celLight(f.rgb / max(f.a, 0.04)) / max(celLight(flatCol), 0.05) - 1.0;
  s = s > 0.0 ? min(s, STRIA_LIT) : max(s, -STRIA_DARK);
  return s * smoothstep(0.12, 0.35, f.a);
}
vec4 collagenAt(vec2 uv, float ta) {   // ta: how much tissue lies under the band here (0 over the dark surround: the band is whole to its crisp edge; 1 over cells: it fades into them)
  if (uBaseK > 0.5 || uP.x + uP.y + uP.z <= 0.0) return vec4(0.0);
  vec2 L = vL;
  // (the collagen atlas is two plates wide: the tracts and the vein on the left, the septa on the right)
  vec2 uvT = vec2(uv.x * 0.5, uv.y), uvS = vec2(0.5 + uv.x * 0.5, uv.y);
  vec4 cu = texture2D(mapC, uvT), cs = texture2D(mapC, uvS);
  vec3 baseS = uCollS, baseT = uCollT;
  if (mixB > 0.0) {
    cu = mix(cu, texture2D(mapCB, uvT), mixB); cs = mix(cs, texture2D(mapCB, uvS), mixB);
    baseS = mix(uCollS, uCollSB, mixB); baseT = mix(uCollT, uCollTB, mixB);
  }
  vec4 tm = texture2D(mapT, uv);
  ivec2 tsz = textureSize(mapT, 0);
  float angS = texelFetch(mapT, clamp(ivec2(floor(uv * vec2(tsz))), ivec2(0), tsz - 1), 0).g * 6.28318530718 - 3.14159265359;   // (the normal's angle, the nearest texel: a filtered angle is wrong across its seam)
  // the septa
  float eS = tm.b * tm.b * E_SPAN + E_LO;
  float aS = max(0.5 * length(vec2(dFdx(eS), dFdy(eS))), 0.02);
  float covS = smoothstep(-aS, aS, eS) * collCoverage(tm.a, ta) * front(tm.r * (255.0 / 254.0), uP.x) * (0.75 + 0.25 * uP.x);
  vec3 colS = min(ropeColour(baseS, ropeS(tm.a, vec2(cos(angS), sin(angS)), L)) * (1.0 + collStria(cs, baseS)), vec3(1.0));
  // the tracts: the nearest hexagon corner (the lobule's corners are at cos and sin of k pi/3, in lobule radii; v is up, y is down)
  float rT = 1e9; vec2 dT = vec2(0.0, 1.0);
  for (int i = 0; i < 6; i++) {
    float an = float(i) * 1.0471975512;
    vec2 d = (uv - vec2(0.5 + cos(an) / ${(2 * PLATE_BOX).toFixed(2)}, 0.5 - sin(an) / ${(2 * PLATE_BOX).toFixed(2)})) * PLATE_PXF;
    float r = length(d);
    if (r < rT) { rT = r; dT = d / max(r, 1e-4); }
  }
  float tp = (uP.y - TRACT_TAU_LO) * TRACT_TAU_K;   // (the front's tau in the painter's units: the disc is whole to 0.8 rt + 0.9 tp rt)
  float rF = TRACT_EDGE_K * TRACT_RT_PX * (0.8 + 0.9 * tp), eT = rF - rT;   // (the edge's radius at this growth (the front's, scaled to the dense bundles), and the pixel's distance inside it)
  float aT = max(0.5 * length(vec2(dFdx(eT), dFdy(eT))), 0.02);
  float tT = clamp(eT / max(TRACT_FADE * rF, 1.0), 0.0, 1.0);
  float ramp = smoothstep(TRACT_TAU_LO - TRACT_RAMP_H, TRACT_TAU_LO + TRACT_RAMP_H, uP.y);   // (the first arrival eases in: its disc never pops at its first radius)
  float covT = smoothstep(-aT, aT, eT) * collCoverage(tT, ta) * ramp;
  vec3 colT = min(ropeColour(baseT, ropeS(tT, dT, L)) * (1.0 + collStria(cu, baseT)), vec3(1.0));
  // (the septa first, the tracts over them, as the painter lays them)
  vec4 o = vec4(colS * covS, covS);
  return vec4(colT * covT, covT) + o * (1.0 - covT);
}
// the lightness jump across one device pixel's neighbourhood of the painted tissue: 0 flat, large at a line
float plateEdge(vec2 uv, vec2 uvPerPx, float dpr) {
  vec2 o = uvPerPx * CEL_LINE_MIN * dpr * 0.5;
  float a = celLight(plateTex(uv + vec2(o.x, 0.0)).rgb), b = celLight(plateTex(uv - vec2(o.x, 0.0)).rgb);
  float c = celLight(plateTex(uv + vec2(0.0, o.y)).rgb), d = celLight(plateTex(uv - vec2(0.0, o.y)).rgb);
  return length(vec2(a - b, c - d));
}
void main() {
  // (every derivative first, before the dissolve's discard and the empty-texel return: a quad whose other pixels were dropped gives a garbage fwidth on a device that drops the lane,
  // tests/no-derivative-after-discard.test.ts)
  // the central vein's own band (cv-band.ts): its radius in lobule radii, and one device pixel of it (a derivative, so read here, before any discard)
  float cvR = length(vUv - 0.5) * CV_SPAN * uScarK;
  float cvAA = max(fwidth(cvR), 1e-6);
  vec4 p = plateTex(vUv);
  float tw = smoothstep(0.15, 0.85, plateTexLod(vUv, 5.0).a);   // (the tissue under the band, a smooth share: a coarse mip, so the fade never steps at the hexagon's line)
  vec4 kl = collagenAt(vUv, tw);   // (the collagen over it, premultiplied, rope relief in its colour; the edges' derivatives are taken inside, here, before the discard)
  vec3 c = p.rgb / max(p.a, 1e-4);
  vec4 m = plateTexLod(vUv, 3.0);
  float lb = celLight(m.rgb / max(m.a, 1e-3));
  float dv = (celLight(c) - lb) / max(lb, 0.08);
  float fwDv = fwidth(dv);
  vec2 uvPerPx = vec2(length(vec2(dFdx(vUv.x), dFdy(vUv.x))), length(vec2(dFdx(vUv.y), dFdy(vUv.y))));
  float edge = plateEdge(vUv, uvPerPx, uDpr);   // (it samples the plate with implicit levels: a texture call is a derivative too, so it is read here, before the discard, Plan 41)
  // (the dive's ONE dissolve, the same screen pattern as every tube, tile and mark of the scene: the marks go with the lobule, never before or after it)
  if (fadedOut()) discard;
  if (uBaseK > 0.5) {   // the scar mesh (it holds no tissue: p is clear): the band from the lumen's edge to the wall, opaque over the pool's tone, as much of it as has grown; nothing in the lumen (the pool shows)
    float cvCov = cvEdge(cvR, cvAA) * uCv.w;
    vec3 bc = reliefColour(uCvCol, cvRelief(cvR, (vUv - 0.5) / max(length(vUv - 0.5), 1e-6)));
    gl_FragColor = vec4((uBase * (1.0 - CV_A) + bc * CV_A) * cvCov, cvCov) * opacity;
    return;
  }
  // the vein's band past the wall (and under the pool inside it): the same function the scar mesh draws, over whatever the plate holds
  float cvA = CV_A * cvEdge(cvR, cvAA) * cvWall(cvR) * uCv.w;
  if (p.a < 0.002 && cvA < 0.002 && kl.a < 0.002) { gl_FragColor = vec4(0.0); return; }
  // the tissue in three flat tones about its own local lightness (the painted colour blurred a few mip levels), hard edges one pixel wide
  c = celTissue(c, lb, max(fwDv * CEL_EDGE_HALF, 1e-3));
  // the plate's edges (Mohammad 20 Nov: "fibrosis shouldn't be outlined with black ink"): what it holds is soft tissue (septa, nutmeg, the Zones), so a strong edge takes a
  // faint, deeper shade of the tissue's OWN colour, LINE_MIN CSS px across, never the cells' dark casing; the collagen is not in the tissue that is measured, so it has none
  c = mix(c, c * PLATE_EDGE_SHADE, PLATE_EDGE_K * smoothstep(CEL_EDGE_LO, CEL_EDGE_HI, edge));
  vec4 o = vec4(c * p.a, p.a);
  o = kl + o * (1.0 - kl.a);   // (the collagen over the tissue)
  if (cvA > 0.0) o = vec4(reliefColour(uCvCol, cvRelief(cvR, (vUv - 0.5) / max(length(vUv - 0.5), 1e-6))) * cvA, cvA) + o * (1.0 - cvA);
  gl_FragColor = o * opacity;
}`;

/** A clear 1 × 1 texture, so a sampler always has a value (no canvas: node, or a browser that gave none). */
export const blankTexture = (): DataTexture => { const t = new DataTexture(new Uint8Array(4), 1, 1); t.needsUpdate = true; return t; };

/** A canvas-backed plate (null canvas in node: nothing is painted, the bookkeeping still runs). */
export type MakeCanvas = (n: number) => HTMLCanvasElement | null;
export const defaultCanvas: MakeCanvas = (n) => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = n; return c;
};

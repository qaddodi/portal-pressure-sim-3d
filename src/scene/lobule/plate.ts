// The lobule's tissue painting: the 2D app's own painter (lobule-paint.js paintLobule, copied by scripts/copy-lobule.mjs) paints the hepatocyte plates, their membranes
// and nuclei, the nutmeg of congestion, the collagen of fibrosis and cirrhosis and the stellate cells into a canvas, once per state ("drawn once into a cached canvas,
// never per frame"); the 3D lobule (micro3d/lobule3d.ts) lays it under its cells with the shader here.
import { CEL_TISSUE_GLSL } from './cel.ts';
import { CEL_LIGHT_GLSL } from '../cel-glsl.ts';
import { COLL_EDGE_LO, COLL_LOD_SEPTA, COLL_LOD_TRACT, COLL_EDGE_TOP, COLL_RELIEF_G, RELIEF_D_PX, RELIEF_GLSL, RELIEF_LOD } from './relief.ts';
import { COLL_EDGE_GLSL } from './collagen-edge.ts';
import { FADE_GLSL } from '../materials/shaders.ts';
import { DataTexture } from 'three';
import { paintWorldInto, useTokens } from './from2d/lobule-paint.generated.js';
import type { LobuleNet, Course, P2 } from './geometry.ts';
import { lookColours } from './lz-colours.ts';
import { cvBandGlsl } from './cv-band.ts';
import { DISC_R } from './widths.ts';
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
uniform sampler2D mapC;    // the collagen atlas (collagen-paint.ts: the tracts on the left plate, the septa on the right): the painter's three soft passes and its fibres
uniform sampler2D mapCB;   // its twin for a crossfade (the same texture when only the tissue changed); sampled in collagenAt, so it must be declared (Plan 28: it was not, and the device refused the program)
uniform sampler2D mapT;    // the septa's arrival times (collagen-tau.ts): R arrival (255 never)
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
// The collagen over the tissue, mock C "Raised relief" (Mohammad, 23 Nov 2026: "this is NOT C"; fibrosis-color-mocks/render.mts C and PLAN-C-raised-relief.md, built as 606d60f4): the painter's own soft passes and fibres, premultiplied, as much as has grown; where the layer is faint its edge takes a softer
// copy of itself (three mip levels coarser) so the passes blend into the cells; the collagen's height is its own alpha at mip 3, and its slope against the ONE world light lifts the colour on the lit side and deepens it on the shade side (reliefS, reliefColour: no step). main keeps the collagen out of the
// cel step and the edge line. Every derivative and bias sample here is taken in main before the dissolve's discard.
//   septa: how much of a band shows is its arrival time (front) at the pixel; tracts: the disc is round about each hexagon corner, so its reveal is the pixel's distance from the nearest corner against the front's radius at this growth
float gCov = 0.0;     // what collagenAt found: its coverage here (the layers' alpha as laid over the tissue, 0 with none grown) and the share of each layer that has grown (x septa, y tracts)
vec2 gFr = vec2(0.0);
vec4 collAt(vec2 uvx, float bias) {
  vec4 b = texture2D(mapC, uvx, bias);
  return mixB > 0.0 ? mix(b, texture2D(mapCB, uvx, bias), mixB) : b;
}
// The band's alpha profile, smooth (Mohammad, 23 Nov 2026: "banded, looks like glow ... fibrous bands of varying intensity, fade"): the painter lays a band in three passes, so its alpha steps 0.12, 0.33, 0.67 and its union with a neighbour has corners. The alpha is taken from a coarse copy (two mips: 3 and 4 for the septa, an 8 to 16 px blur, about the pass spacing of a band; 0 and 1 for the tracts, whose bundles are a fifth of that) through one smooth monotone curve
// that drops the faint outer pass (the wide pale apron) and eases up to the dense core; only deep inside a band, where the coarse alpha is dense, is the painter's own alpha (with its fibre streaks) shown, blended in smoothly. The COLOUR stays the painter's own.
float collEdgeA(float a) { return ${COLL_EDGE_TOP.toFixed(3)} * smoothstep(${COLL_EDGE_LO.toFixed(3)}, ${COLL_EDGE_TOP.toFixed(3)}, a); }
vec4 softPass(vec4 sharp, vec2 uvx, float lod) {
  vec4 soft = 0.5 * (collAt(uvx, lod) + collAt(uvx, lod + 1.0));
  float a = mix(collEdgeA(soft.a), sharp.a, smoothstep(0.45, 0.65, soft.a));
  vec3 col = mix(soft.rgb / max(soft.a, 1e-4), sharp.rgb / max(sharp.a, 1e-4), smoothstep(0.0, 0.02, sharp.a));
  return vec4(col * a, a);
}
// The central vein's collagen is painted at the vein's nominal wall radius (collagen-paint.ts paintVein) and lies in the tracts' plate; its place follows the live wall: about the vein's centre the uv is scaled by nominal / live wall radius (only near the vein, where nothing else is painted)
const float CV_NOM = ${DISC_R.cv.toFixed(6)};
vec2 veinUv(vec2 uv) {
  float kz = 1.0 - smoothstep(0.45, 0.55, length(uv - 0.5) * CV_SPAN);
  return 0.5 + (uv - 0.5) * mix(1.0, CV_NOM / max(uCv.y, 1e-4), kz);
}
// how much of the vein's collagen has grown at a point rv lobule radii from its centre: from the lumen's edge out to the collar's, soft at both ends (it frays into the bundles' own ends, never a glow)
float veinFront(float rv) {
  float h = 0.012;
  return smoothstep(uCv.x - h, uCv.x + h, rv) * (1.0 - smoothstep(uCv.y + 0.75 * (uCv.z - uCv.y), uCv.z, rv)) * uCv.w;
}
vec4 collagenAt(vec2 uv) {
  gCov = 0.0; gFr = vec2(0.0);
  if (uP.x + uP.y + uP.z <= 0.0) return vec4(0.0);
  // (the collagen atlas is two plates wide: the tracts on the left, the septa on the right)
  vec2 uvV = veinUv(uv), uvT = vec2(uvV.x * 0.5, uvV.y), uvS = vec2(0.5 + uv.x * 0.5, uv.y);
  vec4 cu = collAt(uvT, 0.0), cs = collAt(uvS, 0.0);
  // (the painter's three passes end in hard terraces: the alpha of a faint pass takes a softer copy of itself (three mip levels coarser) so the passes blend into the cells, the dense core stays as painted; the COLOUR stays the painter's own, fibre streaks and all, as in the mock)
  cs = softPass(cs, uvS, ${COLL_LOD_SEPTA.toFixed(1)});
  cu = softPass(cu, uvT, ${COLL_LOD_TRACT.toFixed(1)});
  float fs = front(texture2D(mapT, uv).r * (255.0 / 254.0), uP.x) * (0.75 + 0.25 * uP.x);
  // the tracts: the nearest hexagon corner (the lobule's corners are at cos and sin of k pi/3, in lobule radii; v is up, y is down)
  float rT = 1e9;
  for (int i = 0; i < 6; i++) {
    float an = float(i) * 1.0471975512;
    rT = min(rT, length((uv - vec2(0.5 + cos(an) / ${(2 * PLATE_BOX).toFixed(2)}, 0.5 - sin(an) / ${(2 * PLATE_BOX).toFixed(2)})) * PLATE_PXF));
  }
  float tp = (uP.y - TRACT_TAU_LO) * TRACT_TAU_K;   // (the front's tau in the painter's units: the disc is whole to 0.8 rt + 0.9 tp rt)
  float fT = TRACT_FRONT_K * TRACT_RT_PX * (0.8 + 0.9 * tp);   // (the front's radius; it fades over TRACT_SOFT of itself either side, so no bundle is cut)
  float eT = fT - rT, hT = TRACT_SOFT * fT;
  float ft = max(smoothstep(-hT, hT, eT) * smoothstep(TRACT_TAU_LO - TRACT_RAMP_H, TRACT_TAU_LO + TRACT_RAMP_H, uP.y), veinFront(length(uv - 0.5) * CV_SPAN));   // (the first arrival eases in: its disc never pops at its first radius)
  gCov = max(cs.a * fs, cu.a * ft); gFr = vec2(fs, ft);
  // (the septa first, the tracts over them, as the painter lays them)
  return cu * ft + cs * fs * (1.0 - cu.a * ft);
}
const float RELIEF_EDGE = ${(RELIEF_D_PX / PLATE_PX).toFixed(6)};
// the collagen's height at a point, as a rope: its layers' alpha at level RELIEF_LOD (a 16 px blur, the band's profile), each as much as has grown (fr, set by collagenAt at the pixel)
float reliefH(vec2 uv, vec2 fr) {
  // (kept half a mip-3 texel inside the plate: the atlas holds the two plates side by side, and a septum's corner band reaches the plate's left and right edge, so a sample across the seam would read the other plate's edge as a cliff)
  uv = clamp(uv, vec2(RELIEF_EDGE), vec2(1.0 - RELIEF_EDGE));
  vec2 uvV = veinUv(uv), uvT = vec2(uvV.x * 0.5, uvV.y), uvS = vec2(0.5 + uv.x * 0.5, uv.y);
  vec4 cu = textureLod(mapC, uvT, ${RELIEF_LOD.toFixed(1)}), cs = textureLod(mapC, uvS, ${RELIEF_LOD.toFixed(1)});
  if (mixB > 0.0) { cu = mix(cu, textureLod(mapCB, uvT, ${RELIEF_LOD.toFixed(1)}), mixB); cs = mix(cs, textureLod(mapCB, uvS, ${RELIEF_LOD.toFixed(1)}), mixB); }
  return collEdgeA(cs.a) * fr.x + collEdgeA(cu.a) * fr.y;
}
// the slope of that height per plate pixel (x right, y up): 8 fetches, once per fragment
vec2 reliefSlope(vec2 uv, vec2 fr) {
  vec2 d = vec2(${RELIEF_D_PX.toFixed(1)} / ${PLATE_PX.toFixed(1)});
  return vec2(reliefH(uv + vec2(d.x, 0.0), fr) - reliefH(uv - vec2(d.x, 0.0), fr), reliefH(uv + vec2(0.0, d.y), fr) - reliefH(uv - vec2(0.0, d.y), fr)) / ${(2 * RELIEF_D_PX).toFixed(1)};
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
  vec4 p = plateTex(vUv);
  vec2 uvC = uBaseK > 0.5 ? 0.5 + (vUv - 0.5) * uScarK : vUv;   // (the scar mesh is scaled by the vein's own scale, its uv is not: the plate's own place of this pixel)
  vec4 kl = collagenAt(uvC);   // (the collagen over the tissue, premultiplied, the painter's soft passes; it also sets gCov and gFr)
  float cov = gCov; vec2 fr = gFr;
  vec3 c = p.rgb / max(p.a, 1e-4);
  vec4 m = plateTexLod(vUv, 3.0);
  float lb = celLight(m.rgb / max(m.a, 1e-3));
  float dv = (celLight(c) - lb) / max(lb, 0.08);
  float fwDv = fwidth(dv);
  vec2 uvPerPx = vec2(length(vec2(dFdx(vUv.x), dFdy(vUv.x))), length(vec2(dFdx(vUv.y), dFdy(vUv.y))));
  float edge = plateEdge(vUv, uvPerPx, uDpr);   // (it samples the plate with implicit levels: a texture call is a derivative too, so it is read here, before the discard, Plan 41)
  // the collagen's relief: the slope of its height against the world light (0 on a flat band and on healthy tissue, where no sample is taken); explicit levels, so no derivative, but read here with the rest, before the discard
  float rs = 0.0;
  if (cov > 0.002) rs = clamp(-COLL_RELIEF_G * dot(reliefSlope(uvC, fr), vL), -1.0, 1.0);
  // (the dive's ONE dissolve, the same screen pattern as every tube, tile and mark of the scene: the marks go with the lobule, never before or after it)
  if (fadedOut()) discard;
  if (uBaseK > 0.5) {   // the scar mesh (it holds no tissue: p is clear): the vein's own collagen over the pool, as much of it as has grown (the pool shows between the bundles); the same collagen as outside the wall, one system
    float kcm = smoothstep(0.0, 0.2, cov);
    gl_FragColor = vec4(mix(kl.rgb / max(kl.a, 1e-4), reliefColour(kl.rgb / max(kl.a, 1e-4), rs), kcm) * kl.a, kl.a) * opacity;
    return;
  }
  if (p.a < 0.002 && kl.a < 0.002) { gl_FragColor = vec4(0.0); return; }
  // the tissue in three flat tones about its own local lightness (the painted colour blurred a few mip levels), hard edges one pixel wide
  vec3 c0 = c;   // (the painted colour: the collagen keeps it, below)
  c = celTissue(c, lb, max(fwDv * CEL_EDGE_HALF, 1e-3));
  // the collagen is out of that step (its terraces and the nodule shade would turn into tone lines) and takes its own smooth relief, as much as it covers; healthy tissue (cov 0) is untouched
  float kc = smoothstep(0.0, 0.2, cov);
  // the plate's edges (Mohammad 20 Nov: "fibrosis shouldn't be outlined with black ink"): what it holds is soft tissue (nutmeg, the Zones), so a strong edge takes a faint, deeper shade of the tissue's OWN colour, LINE_MIN CSS px across,
  // never the cells' dark casing; none on the collagen (the tissue's edge is measured without it, and its weight goes with the collagen's coverage)
  c = mix(c, c * PLATE_EDGE_SHADE, PLATE_EDGE_K * smoothstep(CEL_EDGE_LO, CEL_EDGE_HI, edge) * (1.0 - kc));
  vec4 oc = kl + vec4(c * p.a, p.a) * (1.0 - kl.a);        // (the collagen over the tissue after its cel step)
  vec4 orw = kl + vec4(c0 * p.a, p.a) * (1.0 - kl.a);      // (and over the painted tissue itself, before it: the cells show through the faint passes as painted)
  vec3 cf = mix(oc.rgb / max(oc.a, 1e-4), orw.rgb / max(orw.a, 1e-4), kc);
  cf = mix(cf, reliefColour(cf, rs), kc);
  vec4 o = vec4(cf * oc.a, oc.a);
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

// The lobule's tissue painting: the 2D app's own painter (lobule-paint.js paintLobule, copied by scripts/copy-lobule.mjs) paints the hepatocyte plates, their membranes
// and nuclei, the nutmeg of congestion, the collagen of fibrosis and cirrhosis and the stellate cells into a canvas, once per state ("drawn once into a cached canvas,
// never per frame"); the 3D lobule (micro3d/lobule3d.ts) lays it under its cells with the shader here.
import { CEL_TISSUE_GLSL } from './cel.ts';
import { FADE_GLSL } from '../materials/shaders.ts';
import { DataTexture } from 'three';
import { paintWorldInto, useTokens } from './from2d/lobule-paint.generated.js';
import type { LobuleNet, Course, P2 } from './geometry.ts';
import { lookColours } from './lz-colours.ts';
import { paintIntima } from './cv-intima.ts';
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

/** The one painting of a state (2D's painter, then the intimal collagen inside the central vein's wall, cv-intima.ts): the page, the worker and the tests all paint through here. */
export function paintPlateWorld(w: CanvasRenderingContext2D, n: number, sc: number, bx: number, by: number, input: ReturnType<typeof plateInput> & { zonesOn?: boolean }): void {
  paintWorldInto(w, n, sc, bx, by, input);
  paintIntima(w, input);
}

/** Paints one state of the tissue into a 2D context the size of the plate's canvas (n × n). */
export function paintPlate(ctx: CanvasRenderingContext2D, n: number, G: ReturnType<typeof plateShape>, sins: readonly SinCourse[], cvR: number, s: PlateState, look: LookId): void {
  const L = lookColours(look);
  useTokens((name: string, a?: number | string) => L.tk(name, a));
  const B = PLATE_BOX * PLATE_S, sc = n / (2 * B);
  paintPlateWorld(ctx, n, sc, -B, -B, plateInput(G, sins, cvR, s, look));
}

/** The central vein's scar takes its place on the plate by where it lies (its own vertices, before the vein's scale): the plate's plane is `uSide` across, centred. */
export const LOBULE_SCAR_VS = /* glsl */ `
uniform float uSide;
varying vec2 vUv;
void main() { vUv = position.xy / uSide + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const LOBULE_PLATE_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// (The canvas is sent premultiplied, so its transparent edge filters to nothing rather than to a dark fringe; the colours are the canvas's sRGB as they are,
// as the cel shaders write theirs.)
/** The plate's edge line: the tissue's own colour times SHADE, mixed in at K at most (no dark casing on collagen: Mohammad 20 Nov). */
export const PLATE_EDGE_SHADE = 0.8, PLATE_EDGE_K = 0.6;
export const LOBULE_PLATE_FS = /* glsl */ `
${CEL_TISSUE_GLSL}
const float PLATE_EDGE_SHADE = ${PLATE_EDGE_SHADE.toFixed(3)};
const float PLATE_EDGE_K = ${PLATE_EDGE_K.toFixed(3)};
${FADE_GLSL}
uniform sampler2D map;
uniform sampler2D mapB;   // the plate being crossfaded in, mixB of the way (0: none): one sampling of both, so the mix of two premultiplied plates is whole at every step (alpha (1-e)A + eB, never a gap)
uniform float mixB;
uniform float opacity;
uniform sampler2D mapC;    // the collagen layer (collagen-paint.ts: the septa, the tracts and the vein's wall at their fullest)
uniform sampler2D mapCB;   // its twin for a crossfade (the same texture when only the tissue changed); sampled in plateAt, so it must be declared (Plan 28: it was not, and the device refused the program)
uniform sampler2D mapT;    // its arrival times (collagen-tau.ts): R septa, G tracts, B the vein's cuff and ring; 255 never
uniform vec3 uP;           // the growth of the three channels now (growth.ts: eased on the clock, so a change of fibrosis shows more or less of the one layer and repaints nothing)
uniform vec3 uBase;     // the tissue the plate lies on (the cells' tone): the scar of the central vein, which lies over a pool and not over cells, takes the collagen over it
uniform float uBaseK;   // 1: the plate's pixel is laid over uBase and is whole (the scar), 0: as it is painted (the marks plate)
uniform float uDpr;   // the renderer's pixel ratio (micro3d/cel3d.ts MICRO_DPR): the clean line is LINE_MIN CSS px on every screen
varying vec2 vUv;
const float GROW_H = ${GROW_H.toFixed(3)};   // the front's half width (growth.ts)
float front(float t, float p) { return t > 0.995 ? 0.0 : smoothstep(t - GROW_H, t + GROW_H, p); }
// the plate at a point: the tissue (the two plates of a crossfade mixed, premultiplied) with the collagen layer over it, as much of it as has grown; the vein's scar (uBaseK 1) is that collagen, whole, over the tissue's tone
vec4 plateAt(vec2 uv, float bias) {
  vec4 a = texture2D(map, uv, bias);
  vec4 cu = texture2D(mapC, uv, bias);
  if (mixB > 0.0) { a = mix(a, texture2D(mapB, uv, bias), mixB); cu = mix(cu, texture2D(mapCB, uv, bias), mixB); }
  if (uP.x + uP.y + uP.z <= 0.0) return uBaseK > 0.5 ? vec4(0.0) : a;
  vec3 t = texture2D(mapT, uv).rgb * (255.0 / 254.0);
  float fb = front(t.b, uP.z);
  if (uBaseK > 0.5) { float cov = fb * smoothstep(0.0, 0.08, cu.a); return vec4((uBase * (1.0 - cu.a) + cu.rgb) * cov, cov); }
  float f = max(front(t.r, uP.x) * (0.75 + 0.25 * uP.x), max(front(t.g, uP.y), fb));
  return cu * f + a * (1.0 - cu.a * f);
}
vec4 plateTex(vec2 uv) { return plateAt(uv, 0.0); }
vec4 plateTexLod(vec2 uv, float bias) { return plateAt(uv, bias); }
// the lightness jump across one device pixel's neighbourhood of the painted plate: 0 flat, large at a line
float plateEdge(vec2 uv, vec2 uvPerPx, float dpr) {
  vec2 o = uvPerPx * CEL_LINE_MIN * dpr * 0.5;
  float a = celLight(plateTex(uv + vec2(o.x, 0.0)).rgb), b = celLight(plateTex(uv - vec2(o.x, 0.0)).rgb);
  float c = celLight(plateTex(uv + vec2(0.0, o.y)).rgb), d = celLight(plateTex(uv - vec2(0.0, o.y)).rgb);
  return length(vec2(a - b, c - d));
}
void main() {
  // (every derivative first, before the dissolve's discard and the empty-texel return: a quad whose other pixels were dropped gives a garbage fwidth on a device that drops the lane,
  // tests/no-derivative-after-discard.test.ts)
  vec4 p = plateTex(vUv);
  vec3 c = p.rgb / max(p.a, 1e-4);
  vec4 m = plateTexLod(vUv, 3.0);
  float lb = celLight(m.rgb / max(m.a, 1e-3));
  float dv = (celLight(c) - lb) / max(lb, 0.08);
  float fwDv = fwidth(dv);
  vec2 uvPerPx = vec2(length(vec2(dFdx(vUv.x), dFdy(vUv.x))), length(vec2(dFdx(vUv.y), dFdy(vUv.y))));
  // (the dive's ONE dissolve, the same screen pattern as every tube, tile and mark of the scene: the marks go with the lobule, never before or after it)
  if (fadedOut()) discard;
  if (p.a < 0.002) { gl_FragColor = vec4(0.0); return; }
  // the tissue in three flat tones about its own local lightness (the painted colour blurred a few mip levels), hard edges one pixel wide
  c = celTissue(c, lb, max(fwDv * CEL_EDGE_HALF, 1e-3));
  // the plate's edges (Mohammad 20 Nov: "fibrosis shouldn't be outlined with black ink"): what it holds is soft tissue (collagen, septa, nutmeg, the Zones), so a strong edge takes a
  // faint, deeper shade of the tissue's OWN colour, LINE_MIN CSS px across, never the cells' dark casing; it comes and goes with the mark, as the edge does
  c = mix(c, c * PLATE_EDGE_SHADE, PLATE_EDGE_K * smoothstep(CEL_EDGE_LO, CEL_EDGE_HI, plateEdge(vUv, uvPerPx, uDpr)));
  gl_FragColor = vec4(c * p.a, p.a) * opacity;
}`;

/** A clear 1 × 1 texture, so a sampler always has a value (no canvas: node, or a browser that gave none). */
export const blankTexture = (): DataTexture => { const t = new DataTexture(new Uint8Array(4), 1, 1); t.needsUpdate = true; return t; };

/** A canvas-backed plate (null canvas in node: nothing is painted, the bookkeeping still runs). */
export type MakeCanvas = (n: number) => HTMLCanvasElement | null;
export const defaultCanvas: MakeCanvas = (n) => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = n; return c;
};

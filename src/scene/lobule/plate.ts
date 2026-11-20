// The lobule's tissue painting: the 2D app's own painter (lobule-paint.js paintLobule, copied by scripts/copy-lobule.mjs) paints the hepatocyte plates, their membranes
// and nuclei, the nutmeg of congestion, the collagen of fibrosis and cirrhosis and the stellate cells into a canvas, once per state ("drawn once into a cached canvas,
// never per frame"); the 3D lobule (micro3d/lobule3d.ts) lays it under its cells with the shader here.
import { CEL_TISSUE_GLSL } from './cel.ts';
import { DataTexture } from 'three';
import { paintWorldInto, useTokens } from './from2d/lobule-paint.generated.js';
import type { LobuleNet, Course, P2 } from './geometry.ts';
import { lookColours } from './lz-colours.ts';
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

/** Paints one state of the tissue into a 2D context the size of the plate's canvas (n × n). */
export function paintPlate(ctx: CanvasRenderingContext2D, n: number, G: ReturnType<typeof plateShape>, sins: readonly SinCourse[], cvR: number, s: PlateState, look: LookId): void {
  const L = lookColours(look);
  useTokens((name: string, a?: number | string) => L.tk(name, a));
  const B = PLATE_BOX * PLATE_S, sc = n / (2 * B);
  paintWorldInto(ctx, n, sc, -B, -B, plateInput(G, sins, cvR, s, look));
}

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
uniform sampler2D map;
uniform float opacity;
uniform float uDpr;   // the renderer's pixel ratio (micro3d/cel3d.ts MICRO_DPR): the clean line is LINE_MIN CSS px on every screen
varying vec2 vUv;
void main() {
  vec4 p = texture2D(map, vUv);
  if (p.a < 0.002) { gl_FragColor = vec4(0.0); return; }
  vec3 c = p.rgb / p.a;
  // the tissue in three flat tones about its own local lightness (the painted colour blurred a few mip levels), hard edges one pixel wide
  vec4 m = texture2D(map, vUv, 3.0);
  float lb = celLight(m.rgb / max(m.a, 1e-3));
  float dv = (celLight(c) - lb) / max(lb, 0.08);
  c = celTissue(c, lb, max(fwidth(dv) * CEL_EDGE_PX * 1.5, 1e-3));
  // the plate's edges (Mohammad 20 Nov: "fibrosis shouldn't be outlined with black ink"): what it holds is soft tissue (collagen, septa, nutmeg, the Zones), so a strong edge takes a
  // faint, deeper shade of the tissue's OWN colour, LINE_MIN CSS px across, never the cells' dark casing; it comes and goes with the mark, as the edge does
  vec2 uvPerPx = vec2(length(vec2(dFdx(vUv.x), dFdy(vUv.x))), length(vec2(dFdx(vUv.y), dFdy(vUv.y))));
  c = mix(c, c * PLATE_EDGE_SHADE, PLATE_EDGE_K * smoothstep(CEL_EDGE_LO, CEL_EDGE_HI, celEdge(map, vUv, uvPerPx, uDpr)));
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

// The neighbouring lobules, out of focus as 2D shows them (lobule-zoom-field.js, field-gl.js, tile-gl.js; atlas-look-plan.md §5.2). 2D's own field tile
// (drawTile, copied by scripts/copy-lobule.mjs: a repeat two lobules wide and two high, each lobule warmer toward its central vein, faint sinusoids,
// soft septa, a triad at each corner) is painted once per look and tissue state, blurred as 2D's quiet copy is (blurWrapped, its Gaussian of
// neighbourBlur(R)), and repeated on one flat plane under the lobule. A shader then does what 2D's field pass does at rest in the lobule view:
// drains it (saturation 0.45), lays the page's colour over it (0.42, then NEIGHBOUR_FLAT), fades it into the page from 1.1 R of the lobule in focus
// (FADE_MID halfway, never more than EDGE_FADE at any screen corner) and softens it with distance (fieldDof's mip bias). One draw, no dither of its own: its alpha is scaled by the lobule's ground fade (one-fade.ts).
// The page shows through where it fades (the clear colour is the page's), so on the dive in it never stands as an opaque square inside the liver.
import { CEL_TISSUE_GLSL, FIELD_EDGE_PER_MIP } from './cel.ts';
import { CanvasTexture, Color, Mesh, PlaneGeometry, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter, ShaderMaterial, Vector2 } from 'three';
import { makeDrawTile } from './from2d/field-tile.generated.js';
import { useTokens } from './from2d/lobule-paint.generated.js';
import { EDGE_FADE, FADE_MID, FADE_SPAN, NEIGHBOUR_FLAT, blurWrapped, neighbourBlur, surroundGrade } from './from2d/lobule-look.generated.js';
import { LOBULE_R } from './shots.ts';
import { PLATE_Z, blankTexture } from './plate.ts';
import { GROW_H, TAU_LO } from './growth.ts';
import { PX_PER_R, TRACT_REACH_PX, tractRadiusPx, tractSoftPx } from './collagen-edge.ts';
import { lookColours, type RGB } from './lz-colours.ts';
import type { LookId } from '../../looks/looks.ts';

/** The tile's lobule radius in pixels (2D's FIELD_RS step that a lobule on an iPad's screen uses). */
export const FIELD_TILE_R = 160;
/** The field's half side, in lobule radii: past every screen through the whole dive, from where the body begins to dissolve (the camera DIVE_OUT from the liver's point, about 950 lobule radii away)
 *  to the landing, so the liver's inside is lobules to every edge however far out the camera is (a single quad: the tile repeats, its mips keep the far ones calm). */
export const FIELD_HALF = 900;
/** The dive's breadth (0 at the lobule's framing, 1 from FIELD_WIDE_FAR of it out): how far the field reaches past the lobule in focus. At the framing it fades into the page from 1.1 of the lobule's
 *  radius as 2D's does; as the camera draws back it reaches the screen's edges, so from afar the liver's inside is hex lobules everywhere, never a patch on an empty page (Mohammad, 20 Nov 2026). */
export const FIELD_WIDE_NEAR = 1.15, FIELD_WIDE_FAR = 3;
export function fieldWide(d: number, rest: number): number {
  if (!(rest > 0) || !Number.isFinite(d)) return 0;
  const t = Math.min(1, Math.max(0, Math.log(d / (rest * FIELD_WIDE_NEAR)) / Math.log(FIELD_WIDE_FAR / FIELD_WIDE_NEAR)));
  return t * t * (3 - 2 * t);
}
export const FIELD_Z = PLATE_Z - 0.1;
/** Plan 31 part C: the lobule's own six corners (lobule radii, the tile's lattice: a flat-topped hexagon) and the tract's full radius there (the cuff's outer edge at growth 1). The neighbour plates' rounded corners reach into these
 *  discs and showed through the tract's reveal as a stippled wedge with straight edges; inside them the field draws only its gap tone, so a home tract always lies on one ground. */
export const HOME_CORNERS: readonly [number, number][] = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)] as [number, number]);
export const HOME_TRACT_R = TRACT_REACH_PX / PX_PER_R;   // (how far the tract's painted bundles and collar reach, collagen-edge.ts: Plan 49c, the tract has no disc and no clip any more)
/** The plates give way entirely inside HOME_TRACT_R and ease back to the tile from there out to this many times it (outside the cuff, so nothing of the tract's reveal lies on the ease). */
export const HOME_EASE = 1.25;
/** Plan 31c: the cleared disc follows the tract collagen that is drawn (growth.ts front: the cream reaches tau p + GROW_H; the tract of radius rt (0.8 + 0.9 g) reaches r at g = (r / rt - 0.8) / 0.9), so with no tract collagen (Healthy, p = 0) there is nothing to clear and the field is untouched.
 *  At p = 1 it is HOME_TRACT_R, the cuff's full edge. */
export const homeRadius = (p: number): number => Math.min(HOME_TRACT_R, (tractRadiusPx(Math.min(1, Math.max(0, p) + GROW_H)) + tractSoftPx(Math.min(1, Math.max(0, p) + GROW_H))) / PX_PER_R);
/** 0 with no tract collagen, 1 once the first of it is whole (growth.ts: the earliest arrival is TAU_LO, whole at TAU_LO + GROW_H = 0.135). A ramp that wide moves no pixel more than 0.08 in a frame at GROW_RATE (1.5 / 0.135 x 0.35 / 60 = 0.065); a 0.02 ramp moved it 0.43. */
export const HOME_ON = TAU_LO + GROW_H;
export const homeK = (p: number): number => { const x = Math.min(1, Math.max(0, p / HOME_ON)); return x * x * (3 - 2 * x); };
/** The share of the neighbours' plates the shader keeps at r lobule radii from a home corner (the shader's own rule, in JS for the gate): 0 inside the tract disc, 1 from HOME_EASE times it. */
export const plateShare = (r: number, p = 1): number => { const R = homeRadius(p), x = Math.min(1, Math.max(0, (r - R) / (R * (HOME_EASE - 1)))); return 1 - homeK(p) * (1 - x * x * (3 - 2 * x)); };

/** The field's state as 2D quantizes it (lobule-zoom-field.js fsQ: eighths, with a little hysteresis so a value on a step does not flip tiles). */
export interface FieldState { su: number; pre: number; post: number; sin: number; cong: number }
export function fieldQuantizer(): (s: { septU: number; fibPre: number; fibPost: number; fibSin: number; congU: number }) => FieldState {
  const last: Partial<Record<keyof FieldState, number>> = {};
  const q = (k: keyof FieldState, x: number) => { const v = x || 0, o = last[k]; return o !== undefined && Math.abs(v - o) < 0.09 ? o : (last[k] = Math.round(v * 8) / 8); };
  return (m) => ({ su: q('su', m.septU), pre: q('pre', m.fibPre), post: q('post', m.fibPost), sin: q('sin', m.fibSin), cong: q('cong', m.congU) });
}
export const fieldKey = (s: FieldState, look: LookId): string => `${look}|${s.su},${s.pre},${s.post},${s.sin},${s.cong}`;

/** The tile is painted and then read back (getImageData, for the blur): a canvas that is read back is kept in main memory.
 *  On a GPU canvas every read stalls the GPU (the console's "GPU stall due to ReadPixels"). */
const READ_BACK: CanvasRenderingContext2DSettings = { willReadFrequently: true };

/** Paints 2D's tile for a look and state into a canvas made by mk(w, h) (null in node: the tile's size is still worked out). Returns the canvas. */
export function paintFieldTile(look: LookId, fs: FieldState, mk: (w: number, h: number) => HTMLCanvasElement | null, R = FIELD_TILE_R): { cv: HTMLCanvasElement | null; tw: number; th: number } {
  const L = lookColours(look);
  useTokens((n: string, a?: number | string) => L.tk(n, a));   // (the bands' fibroblast nuclei read --lz-shade through the painter's own reader)
  let cv: HTMLCanvasElement | null = null;
  const drawTile = makeDrawTile({
    tk: (n: string, a?: number | string) => L.tk(n, a),
    cssRGB01: (n: string) => L.rgb01(n),
    recordPaint: (w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) => {
      cv = mk(w, h);
      const ctx = cv?.getContext('2d', READ_BACK);
      if (ctx) paint(ctx);
      return cv;
    },
  });
  const t: { R: number; tw?: number; th?: number } = { R };
  drawTile(t, { cell: L.text('--og-field-1') || L.text('--og-liver-1'), gap: L.text('--og-field-2') || L.text('--og-liver-2'), cvc: L.text('--vein-systemic'), pvc: L.text('--vein-portal'), art: L.text('--artery'), duct: L.text('--bile-duct'), dark: L.dark, fs });
  // 2D's quiet copy's blur (a Gaussian of neighbourBlur(R) tile pixels, wrapping round the repeat so it shows no seam)
  const c = cv as HTMLCanvasElement | null;
  const ctx = c?.getContext('2d', READ_BACK);   // (the same context: the attributes of the first getContext call stand)
  if (c && ctx) {
    const img = ctx.getImageData(0, 0, c.width, c.height);
    img.data.set(blurWrapped(img.data, c.width, c.height, neighbourBlur(R)));
    ctx.putImageData(img, 0, 0);
  }
  return { cv: c, tw: t.tw ?? 0, th: t.th ?? 0 };
}

export const LOBULE_FIELD_VS = /* glsl */ `
varying vec2 vLob;
varying vec4 vClip;
varying vec4 vCen;
varying vec4 vEdge;
varying float vAspect;
void main() {
  vLob = vec2(position.x, -position.y) / ${LOBULE_R.toFixed(4)};
  mat4 pvm = projectionMatrix * modelViewMatrix;
  // (the lobule in focus: its centre and a point on its rim, where the camera sees them; the fade and the blur are measured on the screen, as in 2D)
  vCen = pvm * vec4(0.0, 0.0, ${(-FIELD_Z).toFixed(4)}, 1.0);
  vEdge = pvm * vec4(${LOBULE_R.toFixed(4)}, 0.0, ${(-FIELD_Z).toFixed(4)}, 1.0);
  vAspect = abs(projectionMatrix[1][1] / projectionMatrix[0][0]);
  vClip = pvm * vec4(position, 1.0);
  gl_Position = vClip;
}`;
export const LOBULE_FIELD_FS = /* glsl */ `
${CEL_TISSUE_GLSL}
uniform sampler2D tile;
uniform vec3 bg;
uniform vec2 grey;
uniform vec3 gapCol;   // the tile's gap tone (--og-liver-2), what lies between its plates
uniform vec2 homeC[6];   // this lobule's six corners (lobule radii)
uniform float homeR;   // the radius of the tract's drawn collagen there, cuff swell included (lobule radii, homeRadius)
uniform float homeK;   // 0 with no tract collagen: nothing is cleared (Healthy is untouched)
uniform float ready;
uniform float wide;   // the dive's breadth (fieldWide): 0 at the lobule's framing (the field fades into the page past the lobule), 1 from afar (lobules to every edge of the screen)
uniform float fade;   // the dive's one dissolve of the lobule going under the sinusoid (lobule3d.ts: 1 whole, 0 gone), the same value every tile, tube and mark of the lobule is dropping pixels at
uniform float soft;   // the dive's focus (camera/dive.ts fieldSoft): 1 as the camera comes in, the neighbours out of focus; 0 once it has landed
varying vec2 vLob;
varying vec4 vClip;
varying vec4 vCen;
varying vec4 vEdge;
varying float vAspect;
float fadeAt(float d, float r0, float r1) {
  float s = clamp((d - r0) / max(1e-6, r1 - r0), 0.0, 1.0);
  return s < 0.5 ? ${FADE_MID.toFixed(4)} * s * 2.0 : ${FADE_MID.toFixed(4)} + ${(1 - FADE_MID).toFixed(4)} * (s - 0.5) * 2.0;
}
void main() {
  // the screen in units of its half height, centred: corners at (+-aspect, +-1)
  vec2 sc = vec2(vAspect, 1.0);
  vec2 p = vClip.xy / vClip.w * sc, c = vCen.xy / vCen.w * sc, e = vEdge.xy / vEdge.w * sc;
  float rd = max(1e-4, length(e - c)), d = length(p - c);
  // depth of field (lobule-look.js fieldDof at rest): sharp to 2.4 rd, 1.6 mip levels softer by 10 rd (or 0.6 of the diagonal)
  float diag = 2.0 * length(sc), r0d = rd * 2.4, r1d = max(r0d + 1e-3, min(rd * 10.0, diag * 0.6));
  float bias = mix(1.6 * smoothstep(r0d, r1d, d), 0.0, wide) + 4.0 * soft * (1.0 - 0.6 * wide);   // (from afar the mips alone keep the far tiles calm: the hexes read as a pattern, then blur, then resolve as the camera lands)
  vec2 uv = vec2(vLob.x / 6.0, vLob.y / 3.4641016151377544);
  vec3 col = texture2D(tile, uv, bias).rgb;
  vec3 colB = texture2D(tile, uv, bias + 3.0).rgb;
  // (a home tract lies on one ground: inside its full disc the neighbours' plates give way to the gap tone, eased back in over the next quarter of its radius, so no stippled wedge shows through the tract's reveal)
  float home = 0.0;
  for (int i = 0; i < 6; i++) home = max(home, 1.0 - smoothstep(homeR, homeR * ${HOME_EASE.toFixed(4)}, length(vLob - homeC[i])));
  home *= homeK;
  col = mix(col, gapCol, home); colB = mix(colB, gapCol, home);
  // the neighbours in the same three flat tones as the lobule (cel.ts), about their own local lightness; the blur they are drawn at softens the edge, and they carry no ink: they stay quiet
  float lbN = celLight(colB);
  float dvN = (celLight(col) - lbN) / max(lbN, 0.08);
  col = celTissue(col, lbN, max(fwidth(dvN) * CEL_EDGE_HALF, 1e-3) + ${FIELD_EDGE_PER_MIP.toFixed(4)} * bias);
  // the quiet copy (tile-gl.js): toward its luma by 0.45, the page's colour over it at 0.42, then NEIGHBOUR_FLAT more
  float l = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(l), 0.45);
  col = mix(col, bg, 0.42);
  col = mix(col, bg, ${NEIGHBOUR_FLAT.toFixed(4)});
  // grey as the anatomy's liver is in a lens other than Pressure (surroundGrade)
  col = mix(bg, mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, grey.x), grey.y);
  // the fade into the page: clear inside 1.1 rd, the ramp stretched so no screen corner is more than EDGE_FADE faded (fadeOuter)
  float r0 = rd * 1.1;
  float reach = 0.0;
  for (int i = 0; i < 4; i++) { vec2 k = vec2(i == 0 || i == 2 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * sc; reach = max(reach, length(k - c)); }
  float s = ${(EDGE_FADE / (2 * FADE_MID)).toFixed(6)};
  float r1 = max(r0 * ${FADE_SPAN.toFixed(6)}, r0 + max(0.0, reach - r0) / s);
  // (the fade is laid as transparency over the page, which is the same picture at rest, where the page is all there is behind it; on the way in, while the
  // body still shows, the field comes in as the lobule grows on screen, as 2D's dive field does, instead of standing as a square in the liver)
  float a = mix((1.0 - fadeAt(d, r0, r1)) * smoothstep(0.05, 0.25, rd), 1.0, wide) * ready;
  gl_FragColor = vec4(col, a * fade);   // (the neighbours' plate is the lobule's too: it goes with the tiles and the vessels, never before or after them)
}`;

export class NeighbourField {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  private tex: CanvasTexture | null = null;
  private key = '';
  paints = 0;
  private readonly mk: (w: number, h: number) => HTMLCanvasElement | null;
  constructor(mk: (w: number, h: number) => HTMLCanvasElement | null) {
    this.mk = mk;
    this.mat = new ShaderMaterial({ name: 'lobule field',
      vertexShader: LOBULE_FIELD_VS, fragmentShader: LOBULE_FIELD_FS,
      uniforms: { tile: { value: blankTexture() }, bg: { value: new Color() }, grey: { value: new Vector2(1, 1) }, gapCol: { value: new Color() }, homeC: { value: HOME_CORNERS.map(([x, y]) => new Vector2(x, y)) }, homeR: { value: homeRadius(0) }, homeK: { value: 0 }, ready: { value: 0 }, soft: { value: 0 }, wide: { value: 0 }, fade: { value: 1 } },
      transparent: true, depthWrite: false,
      userData: { fadeKind: 'ground' },   // (an alpha draw: it takes the lobule's ground fade from LobuleRoot, one-fade.ts)
    });
    const side = 2 * FIELD_HALF * LOBULE_R;
    this.mesh = new Mesh(new PlaneGeometry(side, side), this.mat);
    this.mesh.position.z = FIELD_Z; this.mesh.renderOrder = -3; this.mesh.name = 'lobule/field';
  }
  get currentKey(): string { return this.key; }

  /** The tile for a look and state (painted only when either changed). */
  want(look: LookId, fs: FieldState): boolean {
    const k = fieldKey(fs, look);
    if (k === this.key) return false;
    this.key = k;
    const L = lookColours(look), bg: RGB = L.text('--stage-bg') ? L.rgb01('--stage-bg') : L.rgb01('--bg');
    (this.mat.uniforms.bg!.value as Color).setRGB(bg[0], bg[1], bg[2]);
    const gp = L.rgb01(L.text('--og-field-2') ? '--og-field-2' : '--og-liver-2'); (this.mat.uniforms.gapCol!.value as Color).setRGB(gp[0], gp[1], gp[2]);
    this.paints++;
    const { cv } = paintFieldTile(look, fs, this.mk);
    if (!cv) return true;
    if (this.tex && this.tex.image === cv) this.tex.needsUpdate = true;
    else {
      this.tex?.dispose();
      const t = (this.tex = new CanvasTexture(cv));
      t.wrapS = t.wrapT = RepeatWrapping; t.flipY = false; t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.anisotropy = 4;
      this.mat.uniforms.tile!.value = t;
    }
    this.mat.uniforms.ready!.value = 1;
    return true;
  }

  /** The surround's grey in a lens other than Pressure, k 0 (as drawn) … 1 (the lens's grey liver): 2D's surroundGrade. */
  /** The dive's focus, 0 sharp to 1 out of focus (the neighbours resolve as the camera lands). */
  setSoft(k: number): void { this.mat.uniforms.soft!.value = k; }
  /** The dive's breadth (fieldWide): 0 at the lobule's framing, 1 from afar. */
  setWide(k: number): void { this.mat.uniforms.wide!.value = k; }
  /** The lobule's dissolve under the sinusoid as this plate reads it (1 whole, 0 gone). Its only writer is LobuleFade.set (one-fade.ts): the uniform is the lobule root's own, given when the mesh is added. */
  get fadeNow(): number { return this.mat.uniforms.fade!.value as number; }
  get wideNow(): number { return this.mat.uniforms.wide!.value as number; }
  get softNow(): number { return this.mat.uniforms.soft!.value as number; }
  /** The tract collagen's eased growth now (the plate shader's uP.y): the cleared discs follow it. */
  setHome(p: number): void { this.mat.uniforms.homeR!.value = homeRadius(p); this.mat.uniforms.homeK!.value = homeK(p); }
  setGrey(k: number): void {
    const g = surroundGrade(k) as [number, number];
    (this.mat.uniforms.grey!.value as Vector2).set(g[0], g[1]);
  }

  dispose(): void { this.tex?.dispose(); this.mat.dispose(); this.mesh.geometry.dispose(); }
}

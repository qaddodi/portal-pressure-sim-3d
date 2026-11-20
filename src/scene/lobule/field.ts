// The neighbouring lobules, out of focus as 2D shows them (lobule-zoom-field.js, field-gl.js, tile-gl.js; atlas-look-plan.md §5.2). 2D's own field tile
// (drawTile, copied by scripts/copy-lobule.mjs: a repeat two lobules wide and two high, each lobule warmer toward its central vein, faint sinusoids,
// soft septa, a triad at each corner) is painted once per look and tissue state, blurred as 2D's quiet copy is (blurWrapped, its Gaussian of
// neighbourBlur(R)), and repeated on one flat plane under the lobule. A shader then does what 2D's field pass does at rest in the lobule view:
// drains it (saturation 0.45), lays the page's colour over it (0.42, then NEIGHBOUR_FLAT), fades it into the page from 1.1 R of the lobule in focus
// (FADE_MID halfway, never more than EDGE_FADE at any screen corner) and softens it with distance (fieldDof's mip bias). One draw, no dither.
// The page shows through where it fades (the clear colour is the page's), so on the dive in it never stands as an opaque square inside the liver.
import { CEL_TISSUE_GLSL, FIELD_EDGE_PER_MIP } from './cel.ts';
import { CanvasTexture, Color, Mesh, PlaneGeometry, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter, ShaderMaterial, Vector2 } from 'three';
import { makeDrawTile } from './from2d/field-tile.generated.js';
import { useTokens } from './from2d/lobule-paint.generated.js';
import { EDGE_FADE, FADE_MID, FADE_SPAN, NEIGHBOUR_FLAT, blurWrapped, neighbourBlur, surroundGrade } from './from2d/lobule-look.generated.js';
import { LOBULE_R } from './shots.ts';
import { PLATE_Z, blankTexture } from './plate.ts';
import { lookColours, type RGB } from './lz-colours.ts';
import type { LookId } from '../../looks/looks.ts';

/** The tile's lobule radius in pixels (2D's FIELD_RS step that a lobule on an iPad's screen uses). */
export const FIELD_TILE_R = 160;
/** The field's half side, in lobule radii: past every screen at the widest the hand can pull the lobule out. */
export const FIELD_HALF = 12;
export const FIELD_Z = PLATE_Z - 0.1;

/** The field's state as 2D quantizes it (lobule-zoom-field.js fsQ: eighths, with a little hysteresis so a value on a step does not flip tiles). */
export interface FieldState { su: number; pre: number; post: number; sin: number; cong: number }
export function fieldQuantizer(): (s: { septU: number; fibPre: number; fibPost: number; fibSin: number; congU: number }) => FieldState {
  const last: Partial<Record<keyof FieldState, number>> = {};
  const q = (k: keyof FieldState, x: number) => { const v = x || 0, o = last[k]; return o !== undefined && Math.abs(v - o) < 0.09 ? o : (last[k] = Math.round(v * 8) / 8); };
  return (m) => ({ su: q('su', m.septU), pre: q('pre', m.fibPre), post: q('post', m.fibPost), sin: q('sin', m.fibSin), cong: q('cong', m.congU) });
}
export const fieldKey = (s: FieldState, look: LookId): string => `${look}|${s.su},${s.pre},${s.post},${s.sin},${s.cong}`;

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
      const ctx = cv?.getContext('2d');
      if (ctx) paint(ctx);
      return cv;
    },
  });
  const t: { R: number; tw?: number; th?: number } = { R };
  drawTile(t, { cell: L.text('--og-liver-1'), gap: L.text('--og-liver-2'), cvc: L.text('--vein-systemic'), pvc: L.text('--vein-portal'), art: L.text('--artery'), duct: L.text('--bile-duct'), dark: L.dark, fs });
  // 2D's quiet copy's blur (a Gaussian of neighbourBlur(R) tile pixels, wrapping round the repeat so it shows no seam)
  const c = cv as HTMLCanvasElement | null;
  const ctx = c?.getContext('2d');
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
uniform float ready;
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
  float bias = 1.6 * smoothstep(r0d, r1d, d) + 4.0 * soft;
  vec2 uv = vec2(vLob.x / 6.0, vLob.y / 3.4641016151377544);
  vec3 col = texture2D(tile, uv, bias).rgb;
  // the neighbours in the same three flat tones as the lobule (cel.ts), about their own local lightness; the blur they are drawn at softens the edge, and they carry no ink: they stay quiet
  float lbN = celLight(texture2D(tile, uv, bias + 3.0).rgb);
  float dvN = (celLight(col) - lbN) / max(lbN, 0.08);
  col = celTissue(col, lbN, max(fwidth(dvN) * CEL_EDGE_PX * 1.5, 1e-3) + ${FIELD_EDGE_PER_MIP.toFixed(4)} * bias);
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
  float a = (1.0 - fadeAt(d, r0, r1)) * smoothstep(0.05, 0.25, rd) * ready;
  gl_FragColor = vec4(col, a);
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
    this.mat = new ShaderMaterial({
      vertexShader: LOBULE_FIELD_VS, fragmentShader: LOBULE_FIELD_FS,
      uniforms: { tile: { value: blankTexture() }, bg: { value: new Color() }, grey: { value: new Vector2(1, 1) }, ready: { value: 0 }, soft: { value: 0 } },
      transparent: true, depthWrite: false,
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
  get softNow(): number { return this.mat.uniforms.soft!.value as number; }
  setGrey(k: number): void {
    const g = surroundGrade(k) as [number, number];
    (this.mat.uniforms.grey!.value as Vector2).set(g[0], g[1]);
  }

  dispose(): void { this.tex?.dispose(); this.mat.dispose(); this.mesh.geometry.dispose(); }
}

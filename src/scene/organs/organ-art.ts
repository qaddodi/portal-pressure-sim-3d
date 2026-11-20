// What 2D draws on its organs that the pillows do not: the small bowel's loops (rims, edges, walls, shade and light), the colon's haustra, bands and rim shade, the
// organs' surface lines (the stomach's rugae, the spleen's, kidney's and heart's hairlines) and the esophagus (its own tone, its top fade and the seam where its tone gives
// way to the stomach's: stage.js esoFadeG, seamFG). The art is 2D's own paths (public/anatomy/organ-art.json, scripts/copy-organ-art.mjs), painted once per look into a small
// texture per organ (organ-art-paint.ts) and laid on the pillow by its position in the 2D frame, so it is cut to the pillow's outline, sits under the organ's ink and the
// other organs hide it as they hide the fill. The organ painter (organ-shader.ts) is not edited: the patch below wraps its `main`, so a change there merges clean.
import { type BufferGeometry, CanvasTexture, DataTexture, Float32BufferAttribute, LinearMipmapLinearFilter, type ShaderMaterial, type Texture, Vector2, Vector3, Vector4 } from 'three';
import { ORGAN_TONES_2D } from '../../looks/organ-tones.copied.ts';
import type { LookId, Palette } from '../palette.ts';
import { LOOK_IDS } from '../palette.ts';
import { LUMA } from '../disease/copied/anatomy-b4.ts';
import { type OrganInks, type OrganState, organColour, rgbOf } from './organ-look.ts';
import { type Art, type ArtTokens, type Ctx2D, type Surface, paintArt } from './organ-art-paint.ts';
import { UNITS_PER_SCENE, x3, y3 } from '../frame2d.ts';

export interface ArtData {
  from: string;
  tokens: Record<string, ArtTokens>;
  eso: { poly: number[]; box: [number, number, number, number]; fade: [number, number]; seam: [number, number] };
  /** where the rectum fades out (anatomy.js RECTUM_FADE: clear above the first y, gone at the second): the colon's whole group fades, art, fill and outline */
  rectum: [number, number];
  stomachBox: [number, number, number, number];
  arts: Record<string, Art>;
}

let data: ArtData | null = null;
let settle: () => void = () => {};
/** Resolves once the art file is in, or has failed (the organs then draw as the pillows alone: the art is detail, never a reason for the figure to wait for ever). */
export const artReady: Promise<void> = new Promise((res) => { settle = res; });
/** Takes the art file's data (the browser fetch below; tests read it from disk). */
export function setArtData(d: ArtData): void { data = d; settle(); }
export const artData = (): ArtData | null => data;

const env = (import.meta as { env?: { BASE_URL?: string } }).env;
if (typeof fetch === 'function' && typeof window !== 'undefined') {
  fetch(`${env?.BASE_URL ?? '/'}anatomy/organ-art.json`)
    .then((r) => { if (!r.ok) throw new Error(`organ-art.json ${r.status}`); return r.json() as Promise<ArtData>; })
    .then(setArtData, (e) => { console.error(e); settle(); });
} else settle();   // (outside a browser nothing is fetched: the tests give the data with setArtData, or run without it)

/** Texture pixels to a 2D unit: the figure is drawn at one to three pixels a unit, and the hairlines are 0.9 wide. */
export const ART_PX_PER_UNIT = 2;
const MAX_SIDE = 2048;
/** The right edge of what counts as esophagus beside the cardia (2D's esophagus outline ends at x 813): left of it, above the seam, the esophagus's own tone shows. */
const ESO_RIGHT_MARGIN = 3;

const lookOf = (p: Palette): LookId => LOOK_IDS.find((id) => ORGAN_TONES_2D[id] === p.organs) ?? 'light';

/** The per-vertex numbers of the esophagus on the stomach's pillow (the pillow is one shape with it, as 2D's SEAM_D is): `eso` how much of the esophagus's own tone shows
 *  (1 above y 226, none below y 262, as seamFG), `esoA` how much of the figure shows (1 below y 40, none above y -40, as esoFadeG). Linear in y, so the pillow's fine
 *  triangles carry them exactly. Positions are the scene's: y2d = 556 - 300 y. */
/** The rectum's fade as `esoA` on the colon's pillow: 1 above the first y, 0 below the second (2D's rectFadeG, linear in y). */
export function rectumAttribute(g: BufferGeometry, fade: [number, number]): void {
  const pos = g.getAttribute('position'), a = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) a[i] = Math.min(1, Math.max(0, (fade[1] - (556 - pos.getY(i) * UNITS_PER_SCENE)) / (fade[1] - fade[0])));
  g.setAttribute('esoA', new Float32BufferAttribute(a, 1));
}
export function esoAttributes(g: BufferGeometry, eso: ArtData['eso']): void {
  const pos = g.getAttribute('position');
  const n = pos.count, a = new Float32Array(n), b = new Float32Array(n);
  const right = Math.max(...eso.poly.filter((_, i) => i % 2 === 0)) + ESO_RIGHT_MARGIN;
  const [s0, s1] = eso.seam, [f0, f1] = eso.fade;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i) * UNITS_PER_SCENE + 700, y = 556 - pos.getY(i) * UNITS_PER_SCENE;
    a[i] = x < right ? clamp01((s1 - y) / (s1 - s0)) : 0;
    b[i] = clamp01((y - f1) / (f0 - f1));
  }
  g.setAttribute('eso', new Float32BufferAttribute(a, 1));
  g.setAttribute('esoA', new Float32BufferAttribute(b, 1));
}

/** Renames a shader's one `void main() {` to `main_organ` and puts `decl` and a new `main` after it that calls it and then `body`. A shader without exactly one
 *  `void main() {` throws: the patch must never silently miss its anchor. */
export function wrapMain(src: string, decl: string, body: string): string {
  const n = src.split('void main() {').length - 1;
  if (n !== 1) throw new Error(`organ art: expected one "void main() {", found ${n}`);
  return `${src.replace('void main() {', 'void main_organ() {')}\n${decl}\nvoid main() {\n  main_organ();\n${body}\n}\n`;
}

const f = (v: number) => v.toFixed(5);
export interface PatchOpts { art: boolean; eso: ArtData['eso'] | null; /** the organ fades out along y (the colon's rectum): fill and outline both, by the per-vertex `esoA` */ fade?: boolean }

/** The patched shaders of an organ: its fill (vertex and fragment), and for the esophagus the ink's. Pure strings (tests read them). */
export function patchedShaders(vs: string, fs: string, inkVs: string, inkFs: string, o: PatchOpts): { vs: string; fs: string; inkVs: string; inkFs: string } {
  let vd = '', vb = '', fd = '', fb = '';
  if (o.art) {
    vd += 'uniform vec4 artBox;\nvarying vec2 vArt;\n';
    vb += '  vArt = vec2(position.x - artBox.x, artBox.y - position.y) / artBox.zw;\n';
    fd += 'uniform sampler2D art;\nuniform vec2 artState;\nvarying vec2 vArt;\n';
    // the art is premultiplied in its texture (so its mips never bleed black); un-premultiply, take the lens's grey and the dim as organColour does, and lay it over the fill
    fb += `  vec4 ar = texture2D(art, vArt);
  if (ar.a > 0.002) {
    vec3 ac = ar.rgb / ar.a;
    float al = dot(ac, vec3(${LUMA.map(f).join(', ')}));
    ac = vec3(al) + (ac - vec3(al)) * artState.x;
    ac = mix(page, ac, artState.y);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, ac, ar.a);
  }
`;
  }
  let ivd = '', ivb = '', ifd = '', ifb = '';
  if (o.fade || o.eso) {
    vd += 'attribute float esoA;\nvarying float vEsoA;\n'; vb += '  vEsoA = esoA;\n';
    fd += 'varying float vEsoA;\n'; fb += '  gl_FragColor.a *= vEsoA;\n';
    ivd = 'attribute float esoA;\nvarying float vEsoA;\n'; ivb = '  vEsoA = esoA;\n';
    ifd = 'varying float vEsoA;\n'; ifb = '  gl_FragColor.a *= vEsoA;\n';
  }
  if (o.eso) {
    const [ex, ey, ew, eh] = o.eso.box;
    vd += 'attribute float eso;\nvarying float vEso;\nvarying float vEsoT;\n';
    // the esophagus's own gradient over its own box (2D: og-eso, x1 .15 y1 0 to x2 .85 y2 1)
    vb += `  vEso = eso;
  vec2 xy2d = vec2(position.x * ${UNITS_PER_SCENE.toFixed(1)} + 700.0, 556.0 - position.y * ${UNITS_PER_SCENE.toFixed(1)});
  vEsoT = clamp(dot(vec2((xy2d.x - ${f(ex)}) / ${f(ew)}, (xy2d.y - ${f(ey)}) / ${f(eh)}) - vec2(0.15, 0.0), vec2(0.7, 1.0)) / 1.49, 0.0, 1.0);
`;
    fd += 'uniform vec3 eso1;\nuniform vec3 eso2;\nvarying float vEso;\nvarying float vEsoT;\n';
    // the stomach's gradient at this point, and the esophagus's: the esophagus's tone replaces it as vEso says; the figure fades out up the tube
    fb += `  float tS = clamp(dot(vBox - vec2(0.15, 0.0), vec2(0.7, 1.0)) / 1.49, 0.0, 1.0);
  gl_FragColor.rgb += (mix(eso1, eso2, vEsoT) - mix(o1, o2, tS)) * vEso;
`;
  }
  return {
    vs: wrapMain(vs, vd, vb), fs: wrapMain(fs, fd, fb),
    inkVs: ivd ? wrapMain(inkVs, ivd, ivb) : inkVs, inkFs: ifd ? wrapMain(inkFs, ifd, ifb) : inkFs,
  };
}

interface Slot { id: string; art: Art; mat: ShaderMaterial; tex: Texture | null; w: number; h: number; scale: number }

const blank = (): Texture => { const t = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); t.needsUpdate = true; return t; };
function canvasOf(w: number, h: number): Surface | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return { canvas: c, ctx: c.getContext('2d') as unknown as Ctx2D };
}

/** The art of the organs: attaches to an organ's materials (patches its shaders, gives it its texture), paints the textures for a look, and takes the organ's state. */
export class OrganArt {
  private readonly slots = new Map<string, Slot>();
  private palette: Palette | null = null;
  private stomach: ShaderMaterial | null = null;

  /** Patches the organ's materials when the art knows it (and the file is in). Returns whether it did. Call after the organ painter is on the material, before the first draw. */
  attach(id: string, toon: ShaderMaterial, ink: ShaderMaterial, g: BufferGeometry): boolean {
    const d = data;
    if (!d) return false;
    const art = d.arts[id] ?? null, isStomach = id === 'stomach';
    if (!art && !isStomach) return false;
    const eso = isStomach ? d.eso : null;
    const p = patchedShaders(toon.vertexShader, toon.fragmentShader, ink.vertexShader, ink.fragmentShader, { art: !!art, eso, fade: id === 'colon' });
    toon.vertexShader = p.vs; toon.fragmentShader = p.fs; ink.vertexShader = p.inkVs; ink.fragmentShader = p.inkFs;
    toon.needsUpdate = ink.needsUpdate = true;
    const u = toon.uniforms;
    if (isStomach) {
      // 2D's stomach gradient runs over the stomach's own outline, not over the pillow it shares with the esophagus (which is 2.4 times as tall)
      const [bx, by, bw, bh] = d.stomachBox;
      (u.box!.value as Vector4).set(x3(bx), y3(by), bw / UNITS_PER_SCENE, bh / UNITS_PER_SCENE);
      esoAttributes(g, d.eso);
      u.eso1 = { value: new Vector3() }; u.eso2 = { value: new Vector3() };
      this.stomach = toon;
    }
    if (id === 'colon') rectumAttribute(g, d.rectum);
    if (art) {
      const [bx, by, bw, bh] = art.box;
      const scale = Math.min(ART_PX_PER_UNIT, MAX_SIDE / Math.max(bw, bh));
      u.artBox = { value: new Vector4(x3(bx), y3(by), bw / UNITS_PER_SCENE, bh / UNITS_PER_SCENE) };
      u.art = { value: blank() }; u.artState = { value: new Vector2(1, 1) };
      this.slots.set(id, { id, art, mat: toon, tex: null, w: Math.ceil(bw * scale), h: Math.ceil(bh * scale), scale });
    }
    if (this.palette) this.applyLook(this.palette);
    return true;
  }

  /** The look's tones: every texture is painted again (a look change is rare; nothing is painted per frame). */
  applyLook(p: Palette): void {
    this.palette = p;
    const d = data;
    if (!d) return;
    const tok = d.tokens[lookOf(p)];
    if (!tok) return;
    for (const s of this.slots.values()) this.paintSlot(s, p, tok);
  }

  private paintSlot(s: Slot, p: Palette, tok: ArtTokens): void {
    const surf = canvasOf(s.w, s.h);
    if (!surf) return;   // no canvas (a test): the organ keeps its blank texture
    const og = p.organs.tones[s.art.tone as keyof typeof p.organs.tones];
    const t = { o1: rgbOf(og[0]), o2: rgbOf(og[1]), o3: rgbOf(og[2]), light: p.organs.light.map((v, i) => (i < 3 ? v / 255 : v)) as unknown as readonly [number, number, number, number], tok: { ...tok, hi: tok.hi.map((v) => v / 255) as unknown as ArtTokens['hi'], ao: tok.ao.map((v, i) => (i < 3 ? v / 255 : v)) as unknown as ArtTokens['ao'] }, soft: p.organs === ORGAN_TONES_2D.soft };
    const [bx, by] = s.art.box;
    const base = (c: Ctx2D): void => { c.setTransform(s.scale, 0, 0, s.scale, -bx * s.scale, -by * s.scale); };
    const env = {
      path: () => new Path2D(),
      surface: () => canvasOf(s.w, s.h),
    };
    paintArt(env, surf.ctx, s.art, t, base);
    s.tex?.dispose();
    const tex = new CanvasTexture(surf.canvas as HTMLCanvasElement);
    tex.flipY = false; tex.premultiplyAlpha = true; tex.generateMipmaps = true; tex.minFilter = LinearMipmapLinearFilter; tex.anisotropy = 4;
    tex.needsUpdate = true;
    s.tex = tex;
    s.mat.uniforms.art!.value = tex;
  }

  /** The organ's state for the next frames: the lens's grey and the dim, as organColour has them, and the esophagus's own tones (so they dim and grey with the organ). */
  setState(id: string, s: OrganState, k: OrganInks, p: Palette): void {
    const slot = this.slots.get(id);
    if (slot) (slot.mat.uniforms.artState!.value as Vector2).set(s.sat, s.dim * s.ghost);
    if (id === 'stomach' && this.stomach) {
      const eso = p.organs.tones.eso, u = this.stomach.uniforms;
      const c1 = organColour(rgbOf(eso[0]), s, k), c2 = organColour(rgbOf(eso[1]), s, k);
      (u.eso1!.value as Vector3).set(c1[0], c1[1], c1[2]); (u.eso2!.value as Vector3).set(c2[0], c2[1], c2[2]);
    }
  }

  dispose(): void { for (const s of this.slots.values()) s.tex?.dispose(); this.slots.clear(); }
}

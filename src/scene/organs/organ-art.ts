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
import { fetchBin } from '../../boot/fetch-bin.ts';
import { reportFileLoss } from '../file-loss.ts';
import { type PlaneMap, mapBox, planeMap, unmapX, unmapY } from './placed-map.ts';

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

const env = (import.meta as { env?: { BASE_URL?: string } }).env;
if (typeof fetch === 'function' && typeof window !== 'undefined') {
  // (asked for twice, by progress: boot/fetch-bin.ts. If it still does not come the figure draws without the detail AND says so, with Reload: file-loss.ts, ContextNote)
  fetchBin(`${env?.BASE_URL ?? '/'}anatomy/organ-art.json`, { label: 'organ-art' })
    .then((buf) => { if (!buf) throw new Error('organ-art.json was not found'); return JSON.parse(new TextDecoder().decode(buf)) as ArtData; })
    .then(setArtData, (e) => { console.error(e); reportFileLoss('organ-art'); settle(); });
} else settle();   // (outside a browser nothing is fetched: the tests give the data with setArtData, or run without it)

/** Texture pixels to a 2D unit: the figure is drawn at one to three pixels a unit, and the hairlines are 0.9 wide. */
export const ART_PX_PER_UNIT = 2;
const MAX_SIDE = 2048;
/** The right edge of what counts as esophagus beside the cardia (2D's esophagus outline ends at x 813): left of it, above the seam, the esophagus's own tone shows. */
const ESO_RIGHT_MARGIN = 3;
/** Placed: over how many 2D units right of the esophagus's outline its tone gives way to the stomach's (esoAttributes): whole up to the outline, as 2D's, then a ramp, never a cut. */
const ESO_RIGHT_SOFT = 8;

/** The stomach's own box (2D's stomach outline, without the oesophagus), in the scene, where the stomach is (placed-map.ts). */
const stomachBoxOf = (d: ArtData): [number, number, number, number] => mapBox(planeMap('stomach'), [x3(d.stomachBox[0]), y3(d.stomachBox[1]), d.stomachBox[2] / UNITS_PER_SCENE, d.stomachBox[3] / UNITS_PER_SCENE]);
const lookOf = (p: Palette): LookId => LOOK_IDS.find((id) => ORGAN_TONES_2D[id] === p.organs) ?? 'light';

/** The per-vertex numbers of the esophagus on the stomach's pillow (the pillow is one shape with it, as 2D's SEAM_D is): `eso` how much of the esophagus's own tone shows
 *  (1 above y 226, none below y 262, as seamFG), `esoA` how much of the figure shows (1 below y 40, none above y -40, as esoFadeG). Linear in y, so the pillow's fine
 *  triangles carry them exactly. Positions are the scene's: y2d = 556 - 300 y. */
const smooth01 = (t: number): number => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
export function esoAttributes(g: BufferGeometry, eso: ArtData['eso'], m: PlaneMap = planeMap('stomach')): void {
  const pos = g.getAttribute('position');
  const n = pos.count, a = new Float32Array(n), b = new Float32Array(n);
  const right = Math.max(...eso.poly.filter((_, i) => i % 2 === 0)) + ESO_RIGHT_MARGIN;
  const [s0, s1] = eso.seam, [f0, f1] = eso.fade;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  for (let i = 0; i < n; i++) {
    const x = unmapX(m, pos.getX(i)) * UNITS_PER_SCENE + 700, y = 556 - unmapY(m, pos.getY(i)) * UNITS_PER_SCENE;   // (the place on the 2D figure: the placed stomach is moved, placed-map.ts)
    // (the oesophagus's right edge gives way over ESO_RIGHT_SOFT units from its outline, not as a cut at `right`: the placed stomach's surface runs on past it there, and a cut laid a step of its tone across the cardia)
    const side = 1 - smooth01((x - (right - ESO_RIGHT_MARGIN)) / ESO_RIGHT_SOFT);
    a[i] = side * clamp01((s1 - y) / (s1 - s0));
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
/** The stomach's move (placed-map.ts), which the oesophagus's own gradient undoes to find its place on the 2D figure. */
const ESO_MAP = planeMap('stomach');
export interface PatchOpts { art: boolean; eso: ArtData['eso'] | null; /** the organ fades out along y (the colon's rectum): fill and outline both, by the per-vertex `esoA` */ fade?: boolean;
  /** the placed stomach's cut (placed.ts stomachCut): fill and outline drop where the per-vertex `cutA` is under one half, a clean edge inside the duodenum's funnel */ cut?: boolean;
  /** the placed duodenum wears the stomach's look by the per-vertex `tos` (gut-tubes.ts stomachShare): the stomach's wash over the stomach's box, and its layer */ tos?: boolean }

/** The patched shaders of an organ: its fill (vertex and fragment), and for the esophagus the ink's. Pure strings (tests read them). */
/** The tones of the organ painter (organ-shader.ts ORGAN_FS) the gut's look blend carries from the stomach into the duodenum's funnel: every one the fill is made of, so by the cut the funnel draws the stomach's own fill. */
/** The stomach's pool of blood, as the organ shader reads it (organ-shader.ts): the duodenum's funnel shares these with the stomach. */
export const POOL_UNIFORMS = ['poolA', 'poolLand', 'poolDelta', 'poolBlood', 'poolShadeC'] as const;
export const GUT_LOOK = ['o1', 'o2', 'ogLight', 'ogDark', 'volLight', 'volShade', 'volGeo', 'volShadeAt', 'shadeSteps', 'rimK', 'layer'] as const;
/** The organ painter's fill with the stomach's look laid in as the vertex's `tos` says: each tone of GUT_LOOK read as mix(u, uS, vTos) (the `uS` uniforms ARE the stomach's: OrganArt.shareGutLook), and the box the
 *  gradient and the volume are measured in mixed toward the stomach's (vBoxS). At tos 1 the funnel computes what the stomach computes at that point, term by term: one surface, no step at the cut (the mock's round 13,
 *  which measured the funnel's volume in the stomach's box; the old patch here carried only the gradient and the layer, and the funnel's own volume, shade and rim laid a step of 30/255 at the pylorus). */
export function gutLook(fs: string): string {
  const at = fs.indexOf('void main() {');
  if (at < 0 || fs.indexOf('void main() {', at + 1) >= 0) throw new Error('organ art: expected one "void main() {" for the gut look');
  let decl = 'varying float vTos;\nvarying vec2 vBoxS;\n', body = fs.slice(at);
  for (const k of GUT_LOOK) {
    const ty = new RegExp(`uniform (\\w+) ${k};`).exec(fs)?.[1];
    if (!ty) throw new Error(`organ art: the gut look needs uniform ${k}`);
    decl += `uniform ${ty} ${k}S;\n`;
    body = body.replace(new RegExp(`\\b${k}\\b`, 'g'), `mix(${k}, ${k}S, vTos)`);
  }
  body = body.replace(/\bvBox\b/g, 'mix(vBox, vBoxS, vTos)');
  // the stomach's pool of blood runs on into the funnel (the antrum, to the pylorus): the funnel reads the stomach's own pool uniforms
  // (OrganArt.shareGutLook) and has as much of it as of the stomach's look, so the blood stops where the duodenum's own look begins, easing over the bulb
  if (!body.includes('float poolZ = poolA.z;')) throw new Error('organ art: the gut look needs the pool gate');
  body = body.replace('float poolZ = poolA.z;', 'float poolZ = poolA.z * vTos;');
  return `${fs.slice(0, at)}${decl}${body}`;
}

export function patchedShaders(vs: string, fs: string, inkVs: string, inkFs: string, o: PatchOpts): { vs: string; fs: string; inkVs: string; inkFs: string } {
  let vd = '', vb = '', fd = '', fb = '';
  if (o.tos) fs = gutLook(fs);
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
  if (o.cut) {
    vd += 'attribute float cutA;\nvarying float vCut;\n'; vb += '  vCut = cutA;\n';
    fd += 'varying float vCut;\n'; fb += '  if (vCut < 0.5) discard;\n';
    ivd += 'attribute float cutA;\nvarying float vCut;\n'; ivb += '  vCut = cutA;\n';
    ifd += 'varying float vCut;\n'; ifb += '  if (vCut < 0.5) discard;\n';
  }
  if (o.tos) {
    vd += 'attribute float tos;\nvarying float vTos;\nuniform vec4 boxS;\nvarying vec2 vBoxS;\n';
    vb += '  vTos = tos;\n  vBoxS = vec2((position.x - boxS.x) / max(boxS.z, 1e-5), (boxS.y - position.y) / max(boxS.w, 1e-5));\n';
    // (the fragment side is gutLook's: the whole fill, not only its gradient, wears the stomach's look by vTos)
  }
  if (o.eso) {
    const [ex, ey, ew, eh] = o.eso.box;
    vd += 'attribute float eso;\nvarying float vEso;\nvarying float vEsoT;\n';
    // the esophagus's own gradient over its own box (2D: og-eso, x1 .15 y1 0 to x2 .85 y2 1)
    vb += `  vEso = eso;
  vec2 xy2d = vec2((position.x - ${f(ESO_MAP.ox)}) / ${f(ESO_MAP.sx)} * ${UNITS_PER_SCENE.toFixed(1)} + 700.0, 556.0 - (position.y - ${f(ESO_MAP.oy)}) * ${UNITS_PER_SCENE.toFixed(1)});
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
  /** the placed duodenum's fill: it wears the stomach's look by the cut (`tos`) */
  private duodenum: ShaderMaterial | null = null;
  /** the stomach's fill, whose tones the duodenum's funnel wears (shareGutLook) */
  private stomachToon: ShaderMaterial | null = null;

  /** Patches the organ's materials when the art knows it (and the file is in). Returns whether it did. Call after the organ painter is on the material, before the first draw. */
  attach(id: string, toon: ShaderMaterial, ink: ShaderMaterial, g: BufferGeometry, seat?: ShaderMaterial | null): boolean {
    if (id === 'stomach') { this.stomachToon = toon; this.shareGutLook(); }
    const d = data;
    // the approved placement: the gut is tubes, and the bowel's loops and the colon's haustra and bands painted on the 2D pillows are retired (plan question 7); the colon's rectum fades by its tube's
    // own `esoA`, the duodenum wears the stomach's look by its `tos`, the stomach is cut where the funnel takes over (`cutA`). The art that stays (the stomach's rugae, the hairlines) is laid by the organ's move (placed-map.ts).
    const tube = id === 'duodenum' || id === 'bowel' || id === 'colon', cut = !!g.getAttribute('cutA'), tos = !!g.getAttribute('tos');
    if (!d && !tube && !cut) return false;
    const art = tube ? null : d?.arts[id] ?? null, isStomach = id === 'stomach' && !!d;
    const fade = id === 'colon';
    if (!art && !isStomach && !fade && !cut && !tos) return false;
    const eso = isStomach ? d!.eso : null, m = planeMap(id);
    const p = patchedShaders(toon.vertexShader, toon.fragmentShader, ink.vertexShader, ink.fragmentShader, { art: !!art, eso, fade, cut, tos });
    toon.vertexShader = p.vs; toon.fragmentShader = p.fs; ink.vertexShader = p.inkVs; ink.fragmentShader = p.inkFs;
    toon.needsUpdate = ink.needsUpdate = true;
    // the AO seat (the soft halo round the outline) fades with the line: left whole it keeps a hollow outline where the fill and ink have gone (a faint box at the esophagus's top)
    if (seat && (eso !== null || id === 'colon' || cut)) {
      const q = patchedShaders(seat.vertexShader, seat.fragmentShader, seat.vertexShader, seat.fragmentShader, { art: false, eso: null, fade: eso !== null || id === 'colon', cut });
      seat.vertexShader = q.inkVs; seat.fragmentShader = q.inkFs; seat.needsUpdate = true;
    }
    const u = toon.uniforms;
    if (isStomach) {
      // 2D's stomach gradient runs over the stomach's own outline, not over the pillow it shares with the esophagus (which is 2.4 times as tall)
      (u.box!.value as Vector4).set(...stomachBoxOf(d!));
      esoAttributes(g, d!.eso, m);
      u.eso1 = { value: new Vector3() }; u.eso2 = { value: new Vector3() };
      this.stomach = toon;
    }
    if (tos) {
      // (the stomach's box as the stomach has it; without the art file, a unit box)
      u.boxS = { value: new Vector4(...(d ? stomachBoxOf(d) : [0, 0, 1, 1])) };
      this.duodenum = toon;
    }
    this.shareGutLook();
    if (art) {
      const [bx, by, bw, bh] = mapBox(m, [x3(art.box[0]), y3(art.box[1]), art.box[2] / UNITS_PER_SCENE, art.box[3] / UNITS_PER_SCENE]);   // (laid where the organ is: the art moves with it, placed-map.ts)
      const scale = Math.min(ART_PX_PER_UNIT, MAX_SIDE / Math.max(art.box[2], art.box[3]));
      u.artBox = { value: new Vector4(bx, by, bw, bh) };
      u.art = { value: blank() }; u.artState = { value: new Vector2(1, 1) };
      this.slots.set(id, { id, art, mat: toon, tex: null, w: Math.ceil(art.box[2] * scale), h: Math.ceil(art.box[3] * scale), scale });
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

  /** The duodenum's `<tone>S` uniforms (gutLook) are the stomach's own uniform objects, so the funnel wears the stomach's tones, layer and state as the stomach has them this frame, with nothing copied (either may attach first). */
  private shareGutLook(): void {
    const dz = this.duodenum, st = this.stomachToon;
    if (!dz) return;
    for (const k of GUT_LOOK) dz.uniforms[`${k}S`] = st?.uniforms[k] ?? dz.uniforms[`${k}S`] ?? { value: dz.uniforms[k]!.value };
    // (the pool's own uniforms ARE the stomach's, the same objects: its level, landing, ripples and blood colour, one pool across the stomach and the antrum)
    if (st) for (const k of POOL_UNIFORMS) dz.uniforms[k] = st.uniforms[k]!;
  }

  dispose(): void { for (const s of this.slots.values()) s.tex?.dispose(); this.slots.clear(); }
}

// Fade layers, not pixels (compare-2d-3d-20nov.md, idea 1; Mohammad: "everything eases, nothing pops").
//
// Before, a part that was fading (the body in the dive, an organ leaving for the Circuit, a scope parked, a lobule dissolving) threw away a growing share of its pixels in a fixed screen
// pattern (the old `fadedOut()`), which reads as grain for the whole length of a fade, worst on a 3x phone. 2D fades the whole layer by its opacity. This is that, on the GPU:
//   - every material that fades shares one uniform, `fadeLayer` (FADE_LAYER): 0 the old dissolve (a material that does not carry it keeps working), 1 the main picture (a part still fading is left
//     out of it), 2 a fade layer (the part is drawn whole);
//   - each frame a part is mid-fade (its own `fade` uniform strictly between 0 and 1) the scene finds those parts (`plan`), groups the ones of nearly one value (a handful of groups, never more than
//     MAX_GROUPS), draws each group whole into a texture of its own and lays that over the figure with ONE opacity (`draw`), so the fade is a true glide, with no grain, and overlapping parts of a group
//     never show through each other. Between the figure's two passes (organs, then the vessels over the cleared depth) the layers go in with their own pass, so a fading organ still sits under a vessel.
//   - at rest (nothing mid-fade) the plan is null, nothing is drawn twice and the texture is let go after a while.
// A part is picked into a layer by a camera layer bit (4 + 2 * group + pass), set for the frame and put back after it (`plan.restore`).
//
// Not done here: the draw-on of a vessel (`frontOut`, its soft front along its length) is still a short screen-pattern front; it is a reveal along the length, not a fade of the whole, and wants a per-pixel
// alpha of its own. `?fade=dither` turns the layers off and brings the old dissolve back everywhere (the escape if a driver refuses the texture).
import {
  AddEquation, CustomBlending, LinearFilter, Mesh, OneFactor, OneMinusSrcAlphaFactor, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget, Color,
  type Camera, type Object3D, type WebGLRenderer,
} from 'three';

/** The shared uniform every fading material carries (FADE_GLSL reads it): 0 the old dissolve, 1 the main picture, 2 a fade layer. */
export const FADE_LAYER: { value: number } = { value: 0 };

/** A part is fading when its `fade` is below this (the shader's own test) and gone when it is below FADE_GONE. */
export const FADE_FULL = 0.999;
export const FADE_GONE = 0.001;
/** At most this many layers in a frame (each is one more draw of the parts in it and one more full-screen blend). */
export const MAX_GROUPS = 4;
/** Values closer than this share a layer. */
export const GROUP_GAP = 0.02;

type Fade = { value: number };
const registry: WeakRef<Fade>[] = [];

/** A part's fade uniform (1 whole, 0 gone), registered so a frame with nothing mid-fade costs one pass over a short list and no more. */
export function fadeUniform(v = 1): Fade {
  const u = { value: v };
  registry.push(new WeakRef(u));
  return u;
}

/** Whether any registered fade is strictly between whole and gone. Drops the ones that are collected. */
export function anyFading(): boolean {
  let any = false, w = 0;
  for (let i = 0; i < registry.length; i++) {
    const u = registry[i]!.deref();
    if (!u) continue;
    registry[w++] = registry[i]!;
    const v = u.value;
    if (v > FADE_GONE && v < FADE_FULL) any = true;
  }
  registry.length = w;
  return any;
}

export interface FadeGroup { lo: number; hi: number; mid: number }

/** The values of the parts mid-fade, grouped: values within GROUP_GAP of the next one share a group; when there are more than `max` groups the two nearest are joined until there are `max`. Each group lies
 *  between `lo` and `hi` and is laid over the figure at `mid` (the mean). Sorted ascending. */
export function fadeGroups(values: readonly number[], max = MAX_GROUPS, gap = GROUP_GAP): FadeGroup[] {
  const vs = values.filter((v) => v > FADE_GONE && v < FADE_FULL).sort((a, b) => a - b);
  if (!vs.length) return [];
  const gs: { lo: number; hi: number; sum: number; n: number }[] = [];
  for (const v of vs) {
    const g = gs[gs.length - 1];
    if (g && v - g.hi <= gap) { g.hi = v; g.sum += v; g.n++; } else gs.push({ lo: v, hi: v, sum: v, n: 1 });
  }
  while (gs.length > max) {
    let at = 0, best = Infinity;
    for (let i = 0; i + 1 < gs.length; i++) { const d = gs[i + 1]!.lo - gs[i]!.hi; if (d < best) { best = d; at = i; } }
    const a = gs[at]!, b = gs[at + 1]!;
    gs.splice(at, 2, { lo: a.lo, hi: b.hi, sum: a.sum + b.sum, n: a.n + b.n });
  }
  return gs.map((g) => ({ lo: g.lo, hi: g.hi, mid: g.sum / g.n }));
}

/** The group a value belongs to (the one whose range holds it, else the nearest). */
export function groupOf(groups: readonly FadeGroup[], v: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!, d = v < g.lo ? g.lo - v : v > g.hi ? v - g.hi : 0;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** The camera layer bit of group `g` in pass `pass` (0 the organs, 1 the vessels). Bits 0 and 1 are the passes themselves, 2 and 3 are the scene's own. */
export const groupBit = (g: number, pass: 0 | 1): number => 1 << (4 + 2 * g + pass);

export const FADE_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
/** The layer laid over the figure: its texture holds premultiplied colour and coverage (the layer was cleared to nothing and the parts drawn into it), scaled by the layer's opacity. */
export const FADE_FS = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(map, vUv) * opacity; }`;

export interface FadePlan {
  groups: FadeGroup[];
  /** Per group, whether any of its parts is in the organs' pass [0] and the vessels' pass [1]. */
  has: [boolean, boolean][];
  /** Puts every object's camera layers back as they were. */
  restore(): void;
}

/** `?fade=dither` brings the old dissolve back. */
export function fadeLayersOn(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('fade') !== 'dither';
}

const hasLayerFade = (m: unknown): number | null => {
  const u = (m as { uniforms?: Record<string, { value: unknown } | undefined> } | null | undefined)?.uniforms;
  if (!u || !u.fadeLayer) return null;
  const v = u.fade?.value;
  return typeof v === 'number' ? v : null;
};

const _c = new Color();
const IDLE_FREE = 180;

export class FadeLayers {
  readonly enabled: boolean;
  private rt: WebGLRenderTarget | null = null;
  private idle = 0;
  private failed = false;
  private readonly quad = new Scene();
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: ShaderMaterial;

  constructor(enabled = fadeLayersOn()) {
    this.enabled = enabled;
    this.material = new ShaderMaterial({
      name: 'fade layer', vertexShader: FADE_VS, fragmentShader: FADE_FS, depthTest: false, depthWrite: false, transparent: true,
      blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
      uniforms: { map: { value: null }, opacity: { value: 1 } },
    });
    this.material.userData.onFail = () => { this.fail(); };
    const mesh = new Mesh(new PlaneGeometry(2, 2), this.material);
    mesh.frustumCulled = false;
    this.quad.add(mesh);
  }

  get on(): boolean { return this.enabled && !this.failed; }
  /** A refused program or texture: the old dissolve from now on. */
  fail(): void { this.failed = true; FADE_LAYER.value = 0; this.free(); }

  /** Sets the frame's mode and, when a part is mid-fade, finds the layers: null when nothing is. Call before the first pass. */
  plan(scene: Object3D): FadePlan | null {
    if (!this.on) { FADE_LAYER.value = 0; return null; }
    FADE_LAYER.value = 1;
    if (!anyFading()) { if (++this.idle > IDLE_FREE) this.free(); return null; }
    const found: { o: Object3D; v: number; mask: number }[] = [];
    scene.traverseVisible((o) => {
      const mat = (o as { material?: unknown }).material;
      if (!mat || !(o.layers.mask & 3)) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        const v = hasLayerFade(m);
        if (v !== null && v > FADE_GONE && v < FADE_FULL) { found.push({ o, v, mask: o.layers.mask }); return; }
      }
    });
    if (!found.length) { if (++this.idle > IDLE_FREE) this.free(); return null; }
    this.idle = 0;
    const groups = fadeGroups(found.map((f) => f.v));
    const has = groups.map(() => [false, false] as [boolean, boolean]);
    for (const f of found) {
      const g = groupOf(groups, f.v);
      let bits = 0;
      if (f.mask & 1) { bits |= groupBit(g, 0); has[g]![0] = true; }
      if (f.mask & 2) { bits |= groupBit(g, 1); has[g]![1] = true; }
      f.o.layers.mask = f.mask | bits;
    }
    return { groups, has, restore: () => { for (const f of found) f.o.layers.mask = f.mask; } };
  }

  /** Draws every layer of one pass whole into the texture and lays it over `into` (the figure's texture, or null for the canvas). The render target is `into` again afterwards. */
  draw(gl: WebGLRenderer, scene: Scene, cam: Camera, pass: 0 | 1, plan: FadePlan, into: WebGLRenderTarget | null): void {
    if (this.failed) return;
    const size = gl.getDrawingBufferSize(_s);
    const w = into ? into.width : Math.max(1, Math.floor(size.x)), h = into ? into.height : Math.max(1, Math.floor(size.y));
    const mask = cam.layers.mask, ac = gl.autoClear;
    gl.getClearColor(_c);
    const ca = gl.getClearAlpha();
    for (let g = 0; g < plan.groups.length; g++) {
      if (!plan.has[g]![pass]) continue;
      const rt = this.target(w, h);
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.autoClear = false;
      gl.clear(true, true, true);
      cam.layers.mask = groupBit(g, pass);
      FADE_LAYER.value = 2;
      gl.render(scene, cam);
      FADE_LAYER.value = 1;
      gl.setRenderTarget(into);
      this.material.uniforms.map!.value = rt.texture;
      this.material.uniforms.opacity!.value = plan.groups[g]!.mid;
      gl.render(this.quad, this.cam);
    }
    gl.setClearColor(_c, ca);
    cam.layers.mask = mask;
    gl.autoClear = ac;
    gl.setRenderTarget(into);
  }

  private target(w: number, h: number): WebGLRenderTarget {
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.free();
      // (a stencil with the depth, as the figure's own texture has: the vessels' outlines mark it so each pixel is inked once)
      this.rt = new WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false, samples: 0 });
    }
    return this.rt;
  }
  private free(): void { this.rt?.dispose(); this.rt = null; }
  dispose(): void { this.free(); this.material.dispose(); }
}
const _s = new Vector2();

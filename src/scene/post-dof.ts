// Depth of field for the dive into the lobule and the sinusoid (depth upgrade 4; owner, 19 Nov 2026: a deliberate step beyond 2D, desktop only, behind Settings > Figure depth).
// Inside the liver the camera is a few lobule radii from a thin slab, and a lens would keep that slab sharp and let what stands off it (the field's far side when the
// camera is tilted, a vessel standing up from the plate) fall out of focus. Cheap and bounded, and zero when it is not wanted:
//   - ONLY on a laptop or desktop (dofAllowed: a fine pointer, hover, a window 900 CSS px wide or more, not an iPad in Mac clothes), never with reduced motion, never with the
//     switch off, never in Circuit. A phone or an iPad therefore never makes the depth texture, the half-size target or either program: its frame is exactly the FXAA frame.
//   - its strength is a function of the camera's distance to the place dived to (dofShare), 0 from the distance the body has gone (DIVE_IN) and 1 once the lobule is framed, so
//     the way in and the way out are one picture run both ways and nothing pops. At 0 the pass is not drawn at all.
//   - the scene is drawn into post-aa.ts's texture, which for this switch also carries a depth texture; the pass reads it.
//     PASS 1 (half size): per pixel the circle of confusion of its four full-size texels (the lobule's plates, the neighbour field and the sinusoid's tissue write no depth, so a
//     pixel with none is taken to lie on the plane through the focus, facing the camera's own +z as those planes do: planeUniform); a pixel in focus costs 5 reads and stops there; a blurred one
//     gathers TAPS (10) golden-angle taps over its disc, each tap weighted by its OWN circle (a tap in focus never reaches into a blurred pixel and a blurred tap never smears
//     over a crisp one: the cel look's ink lines do not bloom). Its alpha carries the smallest circle of the four texels.
//     PASS 2 (full size): the blur blended over the picture by that alpha (a pixel whose texels are in focus has alpha 0 and is not touched at all: `discard`).
//   - between the two passes of scene.ts the depth is not cleared while the pass runs (the vessels' pass draws nothing once the body has gone), so the depth the pass reads is the figure's.
//   - the programs fail soft like FXAA's: a driver that refuses one turns the pass off for good (userData.onFail through the shader guard) and the figure is drawn as it was.
import { DepthTexture, LinearFilter, Matrix4, Mesh, NoBlending, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, UnsignedInt248Type, DepthStencilFormat, Vector2, Vector3, Vector4, WebGLRenderTarget, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { LOBULE_SCALE, SIN_SCALE } from './lobule/frames.ts';
import { LOBULE_T } from './lobule/shots.ts';
import { useSettings } from '../state/settings.ts';

// ---- who gets it ---------------------------------------------------------------------------------------------------------------------------------------------

/** What `dofAllowed` asks of the device. `coarsePointer`: the primary pointer is a finger; `hover`: the primary input can hover; `width`: the window's CSS px; `touchMac`: an iPad that says it is a Mac. */
export interface DofEnv { coarsePointer: boolean; hover: boolean; width: number; reducedMotion: boolean; touchMac: boolean }
/** The narrowest window that counts as a laptop or desktop (CSS px). */
export const DOF_MIN_WIDTH = 900;
/** A laptop or desktop with its motion not reduced: no coarse pointer, a pointer that hovers, a window of DOF_MIN_WIDTH or more, not an iPad (an iPadOS Safari says "Mac" and has touch points). */
export function dofAllowed(e: DofEnv): boolean {
  return !e.reducedMotion && !e.coarsePointer && e.hover && !e.touchMac && e.width >= DOF_MIN_WIDTH;
}
/** The device's answers now (null off the browser, where nothing is drawn). */
export function dofEnv(): DofEnv | null {
  if (typeof window === 'undefined' || typeof matchMedia !== 'function') return null;
  const q = (s: string) => { try { return matchMedia(s).matches; } catch { return false; } };
  const nav = typeof navigator === 'undefined' ? null : navigator;
  return { coarsePointer: q('(pointer: coarse)'), hover: q('(hover: hover)'), width: window.innerWidth, reducedMotion: q('(prefers-reduced-motion: reduce)'), touchMac: !!nav && (nav.maxTouchPoints ?? 0) > 1 && /Mac/i.test(nav.platform ?? '') };
}

// ---- how much, and how far out of focus ---------------------------------------------------------------------------------------------------------------------

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The strength (0 off, 1 whole) with the camera `d` scene units from the place dived to, `rest` the distance the lobule is framed at in this room, `edge` the distance the body is gone at (scene.ts DIVE_IN):
 *  whole from the lobule's framing in, fading out to nothing by `edge`, so it is 0 whenever any of the body is drawn (the body's vessels draw in the second pass, which clears depth). Circuit has none. */
export function dofShare(view: 'body' | 'circuit' | 'lobule' | 'sinusoid', d: number, rest: number, edge: number): number {
  if (view === 'circuit' || !(d > 0) || !(edge > 0)) return 0;
  const near = Math.min(rest * 1.3, edge * 0.5);
  return 1 - smooth(near, edge, d);
}

/** The biggest circle of confusion, as a share of the canvas's height (0.5%: 7 px on a 1350 px figure), and the relative depth it takes to reach it. */
export const DOF_MAX_FRAC = 0.005, DOF_SPAN = 0.35;
/** The half thickness kept sharp either side of the focus (scene units): the lobule's slab with a margin for its vessels, and the sinusoid's own. */
export const DOF_SLAB_LOBULE = 0.75 * LOBULE_T * LOBULE_SCALE, DOF_SLAB_SINUSOID = 1.0 * SIN_SCALE;
/** The focus band's biggest circle, as a share of the picture's height (2%: about 34 px on an iPhone's 1688 px). */
export const DOF_BAND_FRAC = 0.02;
/** The taps of the gather. */
export const DOF_TAPS = 10;

/** The circle of confusion in pixels at view distance `z` with the focus at `zf` and `slab` kept sharp either side: 0 in focus and whenever `share` is 0, growing with the depth off the slab relative to the distance (a lens),
 *  to `maxPx`. The shader's `cocAt` is this, line for line. */
export function cocPx(z: number, zf: number, slab: number, share: number, maxPx: number, span = DOF_SPAN): number {
  if (!(z > 0) || !(share > 0)) return 0;
  const rel = Math.max(Math.abs(z - zf) - slab, 0) / z;
  return smooth(0, span, rel) * share * maxPx;
}

const _inv = new Matrix4(), _t = new Vector3(), _n = new Vector3(), _q = new Vector4(), _p = new Vector3(), _a = new Vector2(), _b = new Vector2(), _c = new Vector2();
/** The plane through the focus, facing +z of the scene (the lobule's, the field's and the sinusoid's planes face it), as the shader takes it: view distance t = w / dot(xyz, (1, ndc.x, ndc.y)). Returns the focus distance
 *  (the view distance of the target). A view straight on gives xyz = (k, 0, 0): the same distance across the picture. */
export function planeUniform(cam: PerspectiveCamera, target: ArrayLike<number>, out: Vector4): number {
  _inv.copy(cam.matrixWorld).invert();
  _t.set(target[0]!, target[1]!, target[2]!).applyMatrix4(_inv);
  _n.set(0, 0, 1).transformDirection(_inv);
  const k = (x: number, y: number): number => {
    _q.set(x, y, 1, 1).applyMatrix4(cam.projectionMatrixInverse);
    const iw = 1 / _q.w, qx = _q.x * iw, qy = _q.y * iw, qz = _q.z * iw;   // (the point on the far plane; the ray is it over its depth, so its z is -1)
    return (_n.x * qx + _n.y * qy + _n.z * qz) / -qz;
  };
  const k0 = k(0, 0);
  out.set(k0, k(1, 0) - k0, k(0, 1) - k0, _n.dot(_t));
  return -_t.z;
}

// ---- the shaders ----------------------------------------------------------------------------------------------------------------------------------------------

/** The full-screen quad's vertex shader (the same text as the FXAA pass's: post-aa.ts imports this file, so it is not imported back). */
export const DOF_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// PASS 1, at half size. `plane`, `focus` (x the focus distance, y the slab kept sharp, z the span, w the biggest circle in full-size px), `gate` (x the strength, y the far clip), `proj` (the projection's
// [2][2] and [3][2]: view distance = proj.y / (ndc z + proj.x)). The picture's own numbers are averaged, as the FXAA pass takes them.
export const DOF_GATHER_FS = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform vec2 proj;
uniform vec4 plane;
uniform vec4 focus;
uniform vec2 gate;
// the focus band (the sinusoid: its own lumen and plates sharp, the neighbours and whatever drifts off it out of focus, Mohammad 20 Nov 2026): band.xy the band's unit normal and band.z its
// centre line's offset, in the full-size picture's pixels; bandK x the half width kept sharp, y the run to whole, z the biggest circle (px), w the strength (0: none)
uniform vec4 band;
uniform vec4 bandK;
// and along it (the scene's two ends: never seen to end, Mohammad 20 Nov "don't let me see the end of the sinusoid"): bandA.xy the line's unit direction, z the offset of its middle, bandA.w unused;
// bandAK x the half length kept sharp, y the run to whole (px; 0: none)
uniform vec4 bandA;
uniform vec2 bandAK;
varying vec2 vUv;
#define TAPS ${DOF_TAPS}
float distAt(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  if (d >= 0.99999) {
    float k = dot(plane.xyz, vec3(1.0, uv * 2.0 - 1.0));
    float t = plane.w / max(k, 1e-6);
    return (k > 1e-4 && t > 0.0 && t < gate.y) ? t : focus.x;
  }
  return proj.y / (d * 2.0 - 1.0 + proj.x);
}
float cocAt(float z) {
  float rel = max(abs(z - focus.x) - focus.y, 0.0) / max(z, 1e-9);
  return smoothstep(0.0, focus.z, rel) * gate.x * focus.w;
}
float bandCoc(vec2 uv) {
  if (bandK.w <= 0.0) return 0.0;
  vec2 p = uv / texel;
  float d = abs(dot(band.xy, p) - band.z);
  float t = clamp((d - bandK.x) / max(bandK.y, 1e-3), 0.0, 1.0), k = t * (2.0 - t);   // (eases out: the blur comes in quickly past the sharp band, then settles)
  if (bandAK.y > 0.0) k = max(k, smoothstep(bandAK.x, bandAK.x + bandAK.y, abs(dot(bandA.xy, p) - bandA.z)));
  return k * bandK.z * bandK.w;
}
float cocOf(vec2 uv) { return max(gate.x > 0.0 ? cocAt(distAt(uv)) : 0.0, bandCoc(uv)); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 h = texel * 0.5;
  float c0 = cocOf(vUv + vec2(-h.x, -h.y));
  float c1 = cocOf(vUv + vec2(h.x, -h.y));
  float c2 = cocOf(vUv + vec2(-h.x, h.y));
  float c3 = cocOf(vUv + vec2(h.x, h.y));
  float cMax = max(max(c0, c1), max(c2, c3));
  float cMin = min(min(c0, c1), min(c2, c3));
  vec3 mid = texture2D(tColor, vUv).rgb;
  if (cMax < 0.25) { gl_FragColor = vec4(mid, 0.0); return; }
  float radius = 0.25 * (c0 + c1 + c2 + c3);
  float turn = ign(gl_FragCoord.xy) * 6.2831853;
  vec3 sum = mid;
  float weight = 1.0;
  for (int i = 0; i < TAPS; i++) {
    float f = float(i) + 0.5;
    float ang = f * 2.3999632 + turn;
    vec2 off = vec2(cos(ang), sin(ang)) * (sqrt(f / float(TAPS)) * radius);
    vec2 uv = vUv + off * texel;
    float w = clamp(cocOf(uv) - length(off) + 1.0, 0.0, 1.0);
    sum += texture2D(tColor, uv).rgb * w;
    weight += w;
  }
  gl_FragColor = vec4(sum / weight, clamp(cMin / max(max(focus.w * gate.x, bandK.z * bandK.w), 1e-3), 0.0, 1.0));
}`;

// PASS 2, at full size, blended over the picture (SRC_ALPHA, ONE_MINUS_SRC_ALPHA): the blur where its texels are all out of focus.
export const DOF_MIX_FS = /* glsl */ `
uniform sampler2D tBlur;
varying vec2 vUv;
void main() {
  vec4 b = texture2D(tBlur, vUv);
  float w = smoothstep(0.1, 0.5, b.a);
  if (w <= 0.0) discard;
  gl_FragColor = vec4(b.rgb, w);
}`;

// ---- the pass ---------------------------------------------------------------------------------------------------------------------------------------------------

export class PostDof {
  readonly gather: ShaderMaterial;
  readonly mix: ShaderMaterial;
  private readonly gatherScene = new Scene();
  private readonly mixScene = new Scene();
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private half: WebGLRenderTarget | null = null;
  private failed = false;
  private env: DofEnv | null;
  private readonly enabled: () => boolean;
  private readonly size = new Vector2();
  private off: (() => void) | null = null;
  /** The strength the last `frame` worked out (0: the pass is not drawn). */
  share = 0;

  constructor(enabled: () => boolean = () => useSettings.getState().dof, env: DofEnv | null = dofEnv()) {
    this.enabled = enabled;
    this.env = env;
    const uniforms = {
      tColor: { value: null }, tDepth: { value: null }, texel: { value: new Vector2(1, 1) }, proj: { value: new Vector2(-1, -1) },
      plane: { value: new Vector4(1, 0, 0, 1) }, focus: { value: new Vector4(1, 0, DOF_SPAN, 1) }, gate: { value: new Vector2(0, 1) },
      band: { value: new Vector4(0, 1, 0, 0) }, bandK: { value: new Vector4(1, 1, 0, 0) }, bandA: { value: new Vector4(1, 0, 0, 0) }, bandAK: { value: new Vector2(0, 0) },
    };
    this.gather = new ShaderMaterial({ name: 'post dof', vertexShader: DOF_VS, fragmentShader: DOF_GATHER_FS, depthTest: false, depthWrite: false, blending: NoBlending, uniforms });
    this.mix = new ShaderMaterial({ name: 'post dof mix', vertexShader: DOF_VS, fragmentShader: DOF_MIX_FS, depthTest: false, depthWrite: false, transparent: true, uniforms: { tBlur: { value: null } } });
    // a failure the driver reports on either program is told here by the shader guard (debug/shader-guard.ts `extras`)
    for (const m of [this.gather, this.mix]) m.userData.onFail = () => { this.failed = true; };
    const quad = (m: ShaderMaterial, s: Scene) => { const mesh = new Mesh(new PlaneGeometry(2, 2), m); mesh.frustumCulled = false; s.add(mesh); };
    quad(this.gather, this.gatherScene); quad(this.mix, this.mixScene);
    this.watch();
  }

  /** The materials the shader guard lends to the pass (a refused program turns the blur off). */
  get materials(): readonly ShaderMaterial[] { return [this.gather, this.mix]; }
  /** Whether the figure's texture carries a depth texture for this pass: a laptop or desktop with the switch on and the programs not refused. On a phone or an iPad it never is. */
  get wants(): boolean { return !this.failed && this.env !== null && dofAllowed(this.env) && this.enabled(); }

  /** The device's answers change with the window and the system's settings; they are read again then (never per frame). */
  private watch(): void {
    if (this.env === null || typeof window === 'undefined') return;
    const again = () => { this.env = dofEnv(); };
    const mqs = ['(pointer: coarse)', '(hover: hover)', '(prefers-reduced-motion: reduce)'].map((s) => { try { return matchMedia(s); } catch { return null; } });
    window.addEventListener('resize', again);
    for (const m of mqs) m?.addEventListener?.('change', again);
    this.off = () => { window.removeEventListener('resize', again); for (const m of mqs) m?.removeEventListener?.('change', again); };
  }

  /** The focus band's strength this frame (0: none). Unlike the depth's, it is wanted on every device (Mohammad tests on an iPhone) and needs no depth texture: it is only the picture blurred by a
   *  circle that grows with the distance from a line on the screen. */
  bandShare = 0;
  /** This frame's focus band: `a`, `b` two points on its centre line and `e0`, `e1` a point where the blur starts and one where it is whole (world points), `w`, `h` the picture's size in px,
   *  `k` the strength; `ends`, when given: the middle of the line and a point on it where the blur along it starts and one where it is whole (the scene's two ends, symmetric about the middle). Returns the strength. */
  bandFrame(cam: PerspectiveCamera, a: Vector3, b: Vector3, e0: Vector3, e1: Vector3, w: number, h: number, k: number, ends?: { mid: Vector3; f0: Vector3; f1: Vector3 }): number {
    this.bandShare = 0;
    if (this.failed || !(k > 0) || this.env?.reducedMotion) return 0;
    const px = (v: Vector3, o: Vector2) => { _p.copy(v).project(cam); return o.set((_p.x * 0.5 + 0.5) * w, (_p.y * 0.5 + 0.5) * h); };
    px(a, _a); px(b, _b);
    const dx = _b.x - _a.x, dy = _b.y - _a.y, l = Math.hypot(dx, dy);
    if (!(l > 1e-6)) return 0;
    const nx = -dy / l, ny = dx / l, c = nx * _a.x + ny * _a.y;
    const d0 = Math.abs(nx * px(e0, _c).x + ny * _c.y - c), d1 = Math.abs(nx * px(e1, _c).x + ny * _c.y - c);
    const u = this.gather.uniforms;
    (u.band!.value as Vector4).set(nx, ny, c, 0);
    (u.bandK!.value as Vector4).set(d0, Math.max(d1 - d0, 1), DOF_BAND_FRAC * h, k);
    if (ends) {
      const tx = dx / l, ty = dy / l, cm = tx * px(ends.mid, _c).x + ty * _c.y;
      const g0 = Math.abs(tx * px(ends.f0, _c).x + ty * _c.y - cm), g1 = Math.abs(tx * px(ends.f1, _c).x + ty * _c.y - cm);
      (u.bandA!.value as Vector4).set(tx, ty, cm, 0); (u.bandAK!.value as Vector2).set(g0, Math.max(g1 - g0, 1));
    } else (u.bandAK!.value as Vector2).set(0, 0);
    this.bandShare = k;
    return k;
  }

  /** One frame's numbers: the strength, and the focus (the camera's target and the plane through it) into the gather's uniforms. `d` is the camera's distance to the place dived to. Returns the strength; 0 costs nothing. */
  frame(view: 'body' | 'circuit' | 'lobule' | 'sinusoid', cam: PerspectiveCamera, target: ArrayLike<number>, d: number, rest: number, edge: number): number {
    this.share = 0;
    (this.gather.uniforms.gate!.value as Vector2).x = 0;
    if (!this.wants) return 0;
    const s = dofShare(view, d, rest, edge);
    if (s <= 0) return 0;
    const u = this.gather.uniforms;
    const zf = planeUniform(cam, target, u.plane!.value as Vector4);
    const e = cam.projectionMatrix.elements;
    (u.proj!.value as Vector2).set(e[10]!, e[14]!);
    (u.focus!.value as Vector4).set(zf, view === 'sinusoid' ? DOF_SLAB_SINUSOID : DOF_SLAB_LOBULE, DOF_SPAN, 1);
    (u.gate!.value as Vector2).set(s, cam.far);
    this.share = s;
    return s;
  }

  /** The two passes, with the scene already drawn into `into` (which carries a depth texture): the blur at half size, then over the picture. Leaves `into` as the render target; the caller puts the canvas back. */
  run(gl: Pick<WebGLRenderer, 'render' | 'setRenderTarget'>, into: WebGLRenderTarget): void {
    if (this.failed || (this.share <= 0 || !into.depthTexture) && this.bandShare <= 0) return;
    // (the depth's part only with a depth texture; the band's on its own otherwise)
    if (!into.depthTexture) (this.gather.uniforms.gate!.value as Vector2).x = 0;
    if (this.bandShare <= 0) (this.gather.uniforms.bandK!.value as Vector4).w = 0;
    const hw = Math.max(1, Math.ceil(into.width / 2)), hh = Math.max(1, Math.ceil(into.height / 2));
    if (!this.half || this.half.width !== hw || this.half.height !== hh) {
      this.half?.dispose();
      this.half = new WebGLRenderTarget(hw, hh, { depthBuffer: false, stencilBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false, samples: 0 });
    }
    const u = this.gather.uniforms;
    u.tColor!.value = into.texture; u.tDepth!.value = into.depthTexture;
    (u.texel!.value as Vector2).set(1 / into.width, 1 / into.height);
    (u.focus!.value as Vector4).w = DOF_MAX_FRAC * into.height;
    gl.setRenderTarget(this.half);
    gl.render(this.gatherScene, this.cam);
    if (this.failed) return;   // (a refused gather: nothing is mixed in, the picture stays as drawn)
    this.mix.uniforms.tBlur!.value = this.half.texture;
    gl.setRenderTarget(into);
    gl.render(this.mixScene, this.cam);
  }

  /** The depth texture the figure's target carries when the pass wants one (post-aa.ts). */
  makeDepth(w: number, h: number): DepthTexture {
    return new DepthTexture(w, h, UnsignedInt248Type, undefined, undefined, undefined, undefined, undefined, undefined, DepthStencilFormat);
  }

  dispose(): void { this.half?.dispose(); this.half = null; this.off?.(); this.off = null; }
}

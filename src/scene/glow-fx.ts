// The screen-space selection glow (glow.ts says why): the picked vessel's mask, blurred, laid over the figure outside the mask.
//
//   1. MASK   the glow meshes (the picked vessels' tubes and junction skins, built with `GLOW`, on GLOW_LAYER) are drawn into a texture the size of the canvas: premultiplied colour and weight, painted by MAX so a
//             vein's pieces and a skin at its join overlap without adding up. Cleared to nothing first.
//   2. BLUR   two passes of a Gaussian (horizontal, then vertical) at half the canvas's size: sigma GLOW_SIGMA CSS px.
//   3. LAY    one quad over the figure: the blurred colour (un-premultiplied) at GLOW_GAIN of the blurred weight held to GLOW_A_MAX, times one minus the sharp mask, so the vessel itself is never tinted.
//
// Runs only while a glow is showing (highlight.ts `glowing`): nothing is made or drawn otherwise, and the textures are made the first time and kept (freed with the scene).
//
// Two instances, one pipeline. The vessels' (`run`, GLOW_LAYER): mask, blur and lay after the figure's two passes, over the figure. The organs' (ORGAN_GLOW_LAYER, `prepare` before the figure's first pass, and `figure`, the
// lay as a quad IN the figure at the organ's own place in its draw order, behind the vessels): the same blur, so the organ's glow is a true distance fall-off (a Gaussian of the organ's silhouette), not stacked hulls.
import { AddEquation, Color, CustomBlending, DataTexture, HalfFloatType, LinearFilter, Mesh, NoBlending, OneFactor, OneMinusSrcAlphaFactor, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SrcAlphaFactor, UnsignedByteType, Vector2, WebGLRenderTarget, ZeroFactor, type Camera, type TextureDataType, type WebGLRenderer } from 'three';
import { BLUR_TAPS, GLOW_A_MAX, GLOW_GAIN, GLOW_LAYER, GLOW_SIGMA, blurTaps } from './glow.ts';
import { glslNum as F } from './cel-glsl.ts';

export const GLOW_FX_VS = /* glsl */ `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const BLUR_FS = /* glsl */ `varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 stepUv;   // one tap, in uv
uniform float sigma;   // in taps
void main() {
  vec4 s = vec4(0.0);
  float ws = 0.0;
  for (int i = -${BLUR_TAPS}; i <= ${BLUR_TAPS}; i++) {
    float x = float(i);
    float w = exp(-x * x / (2.0 * sigma * sigma));
    s += w * texture2D(tSrc, vUv + stepUv * x);
    ws += w;
  }
  gl_FragColor = s / ws;
}`;

export const LAY_FS = /* glsl */ `varying vec2 vUv;
uniform sampler2D tBlur;   // the blurred mask (premultiplied colour, weight)
uniform sampler2D tMask;   // the sharp mask
void main() {
  vec4 g = texture2D(tBlur, vUv);
  float inside = smoothstep(0.0, 1.0, texture2D(tMask, vUv).a);
  float a = clamp(g.a * ${F(GLOW_GAIN)}, 0.0, ${F(GLOW_A_MAX)}) * (1.0 - inside);
  // a hair of noise so the soft tail never steps in an 8-bit canvas
  a += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0 * step(0.004, a);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(g.rgb / max(g.a, 1e-4), a);
}`;

/** The glow's two passes, compiled by the GLSL compile test and the ?gl page (src/debug/gl-auto.ts reads this). */
export const GL_PROGRAMS = [{ name: 'glow blur', vs: GLOW_FX_VS, fs: BLUR_FS }, { name: 'glow lay', vs: GLOW_FX_VS, fs: LAY_FS }] as const;

/** What the lay's two samplers hold until the first mask is made (the lay quad of the figure is on the scene graph from the start, hidden: a sampler with no value is a bug the uniform check names). */
const NO_MASK = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
NO_MASK.needsUpdate = true;

export class GlowFx {
  private mask: WebGLRenderTarget | null = null;
  private a: WebGLRenderTarget | null = null;
  private b: WebGLRenderTarget | null = null;
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly scene = new Scene();
  private readonly quad: Mesh;
  private readonly blur = new ShaderMaterial({ name: 'glow blur', vertexShader: GLOW_FX_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false, blending: NoBlending, uniforms: { tSrc: { value: null }, stepUv: { value: new Vector2() }, sigma: { value: 1 } } });
  private readonly lay = new ShaderMaterial({ name: 'glow lay',
    vertexShader: GLOW_FX_VS, fragmentShader: LAY_FS, transparent: true, depthTest: false, depthWrite: false,
    blending: CustomBlending, blendEquation: AddEquation, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,   // (the figure's own alpha is left as it is)
    uniforms: { tBlur: { value: NO_MASK }, tMask: { value: NO_MASK } },
  });
  /** The two passes' materials: the warm-up compiles them under the splash (materials/warm.ts passWarmScene) and the shader guard watches them. */
  get materials(): readonly ShaderMaterial[] { return [this.blur, this.lay]; }
  private readonly size = new Vector2();
  private type: TextureDataType = UnsignedByteType;
  private typeChecked = false;
  private readonly layer: number;
  /** The lay as an object of the figure (not of this class's own quad scene): a full-screen quad, hidden until the owner asks for it, whose draw order is the owner's to set. Shares the lay material, so no second program. */
  readonly figure: Mesh;

  constructor(layer: number = GLOW_LAYER) {
    this.layer = layer;
    const plane = new PlaneGeometry(2, 2);
    this.quad = new Mesh(plane, this.blur);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.figure = new Mesh(plane, this.lay);
    this.figure.frustumCulled = false; this.figure.visible = false; this.figure.name = 'glow lay';
    this.figure.raycast = () => {};   // (a full-screen quad is never a pick)
  }

  /** Whether the device can draw into half-float textures (a soft tail needs more than 8 bits); otherwise bytes, with the noise to hide the steps. */
  private pickType(gl: WebGLRenderer): void {
    if (this.typeChecked) return;
    this.typeChecked = true;
    const ex = gl.extensions;
    this.type = ex?.has?.('EXT_color_buffer_float') || ex?.has?.('EXT_color_buffer_half_float') ? HalfFloatType : UnsignedByteType;
  }

  private ensure(gl: WebGLRenderer): void {
    this.pickType(gl);
    gl.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x)), h = Math.max(1, Math.floor(this.size.y)), hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    const make = (x: number, y: number): WebGLRenderTarget => new WebGLRenderTarget(x, y, { depthBuffer: false, stencilBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false, type: this.type });
    if (!this.mask || this.mask.width !== w || this.mask.height !== h) { this.mask?.dispose(); this.a?.dispose(); this.b?.dispose(); this.mask = make(w, h); this.a = make(hw, hh); this.b = make(hw, hh); }
  }

  /** The mask and the blur (steps 1 and 2): after it, `blurred` and `masked` hold the glow. The renderer's state (target, clear colour, auto clear, the camera's layers, the figure's background) is put back. */
  prepare(gl: WebGLRenderer, cam: Camera, figure: Scene, dpr: number): void {
    this.ensure(gl);
    const mask = this.mask!, a = this.a!, b = this.b!;
    const target = gl.getRenderTarget(), clear = gl.getClearColor(new Color()), clearA = gl.getClearAlpha(), ac = gl.autoClear, layers = cam.layers.mask, bg = figure.background;
    gl.autoClear = false; figure.background = null;
    // 1. the mask
    gl.setRenderTarget(mask); gl.setClearColor(0x000000, 0); gl.clear(true, false, false);
    cam.layers.set(this.layer);
    gl.render(figure, cam);
    cam.layers.mask = layers; figure.background = bg;
    // 2. the blur: half size, the mask read with its own linear filter
    const { spacing, sigma } = blurTaps(GLOW_SIGMA * dpr / 2);
    this.quad.material = this.blur;
    this.blur.uniforms.sigma!.value = sigma;
    this.blur.uniforms.tSrc!.value = mask.texture; (this.blur.uniforms.stepUv!.value as Vector2).set(spacing / a.width, 0);
    gl.setRenderTarget(a); gl.clear(true, false, false); gl.render(this.scene, this.cam);
    this.blur.uniforms.tSrc!.value = a.texture; (this.blur.uniforms.stepUv!.value as Vector2).set(0, spacing / b.height);
    gl.setRenderTarget(b); gl.clear(true, false, false); gl.render(this.scene, this.cam);
    this.lay.uniforms.tBlur!.value = b.texture; this.lay.uniforms.tMask!.value = mask.texture;
    gl.setRenderTarget(target); gl.setClearColor(clear, clearA); gl.autoClear = ac;
  }

  /** Step 3: the lay over what `into` holds now (the canvas's texture, or null for the canvas itself), after `prepare`. */
  layOver(gl: WebGLRenderer, into: WebGLRenderTarget | null): void {
    const target = gl.getRenderTarget(), ac = gl.autoClear;
    gl.autoClear = false;
    this.quad.material = this.lay;
    gl.setRenderTarget(into); gl.render(this.scene, this.cam);
    gl.setRenderTarget(target); gl.autoClear = ac;
  }

  /** Make the glow over the figure drawn into `into` (the canvas's texture, or null for the canvas itself): the vessels' glow, after the figure's passes. */
  run(gl: WebGLRenderer, into: WebGLRenderTarget | null, cam: Camera, figure: Scene, dpr: number): void {
    this.prepare(gl, cam, figure, dpr);
    this.layOver(gl, into);
  }

  dispose(): void { this.mask?.dispose(); this.a?.dispose(); this.b?.dispose(); this.mask = this.a = this.b = null; this.blur.dispose(); this.lay.dispose(); this.quad.geometry.dispose(); }
}

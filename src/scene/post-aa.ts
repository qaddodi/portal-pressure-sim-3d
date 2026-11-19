// Anti-aliasing without multisampling (visual review 19 Nov 2026, section 7). The figure is drawn without a multisampled canvas from 2x up (quality.ts), and the vessel's outline
// is geometry (a hull pushed out in screen pixels), so its outer edge and the body's silhouette are plain stair steps. Multisampling every pass at 4x samples is what a phone cannot
// spare, and the lines are already soft inside their shaders; what is left is the two geometric edges. One full-screen pass of FXAA (the classic one: luma of the four corners, a
// direction from their difference, two or four taps along it) takes both, for the cost of one read of the picture: about 1.3 M fragments of nine texture reads on a 2x iPhone, 5 M on a
// 2x Mac, none of it per vertex. The scene is drawn into a texture of its own size (no depth sharing, no multisampling) and the pass writes the canvas.
//
// Modes (`?aa=` on the address): fxaa (the default), msaa (the canvas is multisampled below 2x, as before, and nothing here runs), off (nothing at all). A device that refuses the
// program draws the scene straight to the canvas (the shader guard tells `fail()`), so a bad driver gives hard edges, never a blank figure.
import { LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget, type WebGLRenderer } from 'three';

export type AaMode = 'fxaa' | 'msaa' | 'off';
/** The anti-aliasing the page asks for: `?aa=msaa` or `?aa=off`; anything else is the default, FXAA. */
export function aaMode(search: string = typeof location === 'undefined' ? '' : location.search): AaMode {
  const v = new URLSearchParams(search).get('aa');
  return v === 'msaa' || v === 'off' ? v : 'fxaa';
}

export const AA_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// FXAA as in NVIDIA's 2009 white paper (the "quality" console path of Lottes, in the short form most engines carry): the colours are the picture's own numbers, as written to the canvas.
// SPAN_MAX 4 keeps a 1.5 px line from being smeared along its length; REDUCE_* stop a flat patch from taking a direction out of noise.
export const AA_FS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
varying vec2 vUv;
#define FXAA_REDUCE_MIN (1.0 / 128.0)
#define FXAA_REDUCE_MUL (1.0 / 8.0)
#define FXAA_SPAN_MAX 4.0
float lumaOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * resolution).xyz;
  vec3 rgbNE = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * resolution).xyz;
  vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * resolution).xyz;
  vec3 rgbSE = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * resolution).xyz;
  vec4 rgbaM = texture2D(tDiffuse, vUv);
  vec3 rgbM = rgbaM.xyz;
  float lumaNW = lumaOf(rgbNW), lumaNE = lumaOf(rgbNE), lumaSW = lumaOf(rgbSW), lumaSE = lumaOf(rgbSE), lumaM = lumaOf(rgbM);
  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  vec2 dir;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = min(vec2(FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX), dir * rcpDirMin)) * resolution;
  vec3 rgbA = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).xyz + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).xyz);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tDiffuse, vUv + dir * -0.5).xyz + texture2D(tDiffuse, vUv + dir * 0.5).xyz);
  float lumaB = lumaOf(rgbB);
  gl_FragColor = vec4((lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB, 1.0);
}`;

export class PostAA {
  readonly mode: AaMode;
  readonly material: ShaderMaterial;
  private readonly quad = new Scene();
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private rt: WebGLRenderTarget | null = null;
  private readonly size = new Vector2();
  private failed = false;

  constructor(mode: AaMode = aaMode()) {
    this.mode = mode;
    this.material = new ShaderMaterial({
      name: 'post aa', vertexShader: AA_VS, fragmentShader: AA_FS, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, resolution: { value: new Vector2(1, 1) } },
    });
    // a failure the driver reports on this program is told here by the shader guard (debug/shader-guard.ts `extras`)
    this.material.userData.onFail = () => { this.failed = true; };
    const mesh = new Mesh(new PlaneGeometry(2, 2), this.material);
    mesh.frustumCulled = false;
    this.quad.add(mesh);
  }

  /** Whether the next frame goes through the pass. */
  get on(): boolean { return this.mode === 'fxaa' && !this.failed; }
  /** The pass is not on from now: the figure draws straight to the canvas (a refused program). */
  fail(): void { this.failed = true; this.dispose(); }

  /** The texture the scene is to be drawn into, the size of the canvas's drawing buffer; made again when that size changes. Null when the pass is not on. */
  target(gl: Pick<WebGLRenderer, 'getDrawingBufferSize'>): WebGLRenderTarget | null {
    if (!this.on) return null;
    gl.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x)), h = Math.max(1, Math.floor(this.size.y));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.dispose();
      // (a stencil with the depth: the vessels' outlines mark it so each pixel is inked once, vessels/vessel-object.ts hullMat; no depth sharing and no samples: the two passes of the figure clear and refill the depth in this texture as they did on the canvas)
      this.rt = new WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false, samples: 0 });
      (this.material.uniforms.resolution!.value as Vector2).set(1 / w, 1 / h);
    }
    return this.rt;
  }

  /** The pass: the texture the scene was drawn into, filtered onto the canvas. Call with the render target already back on the canvas. */
  resolve(gl: Pick<WebGLRenderer, 'render'>): void {
    if (!this.rt) return;
    this.material.uniforms.tDiffuse!.value = this.rt.texture;
    gl.render(this.quad, this.cam);
  }

  dispose(): void { this.rt?.dispose(); this.rt = null; }
}

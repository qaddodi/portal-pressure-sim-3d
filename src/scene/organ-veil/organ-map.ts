// The organ map (organ-veil/config.ts says what for). Before the figure's first pass the scene draws the organs' fills once more into a texture HALF the figure's size (their colour over the page, their coverage in alpha, and their depth in a
// depth texture): the vessels' shaders read it to find how deep behind an organ's front surface they lie, and what the organ looks like there. The organs behind (kidney, spleen, caudate) are drawn flat into a second, smaller mask which the
// organs in front read to let them show. Nothing here is drawn when the switch is off or both strengths are zero (a still, zoomed-in figure costs nothing).
import { Color, DepthStencilFormat, DepthTexture, LinearFilter, MeshBasicMaterial, DoubleSide, NearestFilter, UnsignedByteType, UnsignedInt248Type, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';
import { ORGAN_BACK_LAYER, ORGAN_MAP_LAYER } from '../layers.ts';
import { ORGAN_VEIL_U, resetOrganVeil } from './uniforms.ts';
import { sceneKey } from './scene-key.ts';

const WHITE = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, fog: false });
const tmp = new Color();

export class OrganMap {
  private map: WebGLRenderTarget | null = null;
  private back: WebGLRenderTarget | null = null;
  private w = 0; private h = 0;
  // What the maps were last drawn from (scene-key.ts). The maps depend only on the organs, the camera and the size, so while the key
  // stands still they are kept, not drawn again: a figure at rest draws the four big organ meshes twice fewer times a frame.
  // `drawn` counts the draws made at the current key: two, not one, because the organs' draw into the colour map reads the back mask
  // the PREVIOUS draw left (the show-through), so the first draw after a change is made with the old mask and only the second is
  // the settled picture; a frame is skipped only after that one.
  private key = NaN; private drawn = 0; private kept = 0;
  /** Draws made, frames that kept the maps, and frames the key could not be made for (?perf). */
  readonly stats = { drawn: 0, kept: 0, unkeyed: 0 };
  /** The most frames in a row the maps are kept: the key is generic, but a picture that never refreshes is a bug nobody could see, so one frame in KEEP_MAX draws anyway. */
  static readonly KEEP_MAX = 60;

  private ensure(w: number, h: number): void {
    if (this.map && this.w === w && this.h === h) return;
    this.dispose();
    this.key = NaN; this.drawn = 0;
    this.w = w; this.h = h;
    const dep = new DepthTexture(w, h, UnsignedInt248Type, undefined, undefined, undefined, NearestFilter, NearestFilter, undefined, DepthStencilFormat);
    this.map = new WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: true, depthTexture: dep, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false, type: UnsignedByteType });
    this.back = new WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false, type: UnsignedByteType });
    ORGAN_VEIL_U.tOrgCol.value = this.map.texture; ORGAN_VEIL_U.tOrgDep.value = dep; ORGAN_VEIL_U.tSeeMask.value = this.back.texture;
  }

  /** Draws what `want` asks for from `cam`, for a figure target of `fullW` x `fullH` device px: `veil` the colour and depth map, `see` the mask of the organs behind. The caller's render target, layers and clear state are put back. */
  render(gl: WebGLRenderer, cam: Camera, scene: Scene, fullW: number, fullH: number, want: { veil: boolean; see: boolean }): void {
    if (!want.veil && !want.see) { this.key = NaN; return; }
    this.ensure(Math.max(2, Math.ceil(fullW / 2)), Math.max(2, Math.ceil(fullH / 2)));
    // (the clear colour is part of the picture: the page's background under the organs' colour)
    const cc = gl.getClearColor(tmp);
    scene.updateMatrixWorld();
    const key = sceneKey(scene, cam, (1 << ORGAN_MAP_LAYER) | (1 << ORGAN_BACK_LAYER), fullW, fullH, [+want.veil, +want.see, cc.r, cc.g, cc.b, gl.getClearAlpha()]);
    if (Number.isNaN(key)) { this.stats.unkeyed++; this.key = NaN; this.drawn = 0; }
    else if (key !== this.key) { this.key = key; this.drawn = 0; this.kept = 0; }
    if (this.drawn >= 2 && this.kept < OrganMap.KEEP_MAX) { this.kept++; this.stats.kept++; return; }
    this.drawn++; this.kept = 0; this.stats.drawn++;
    const rt0 = gl.getRenderTarget(), mask = cam.layers.mask, ac = gl.autoClear, a0 = gl.getClearAlpha(), c0 = gl.getClearColor(tmp).clone();
    const bg = scene.background, ov = scene.overrideMaterial;
    gl.autoClear = true;
    if (want.veil && this.map) {
      gl.setRenderTarget(this.map); gl.setClearColor(c0, 0);
      cam.layers.set(ORGAN_MAP_LAYER); scene.background = null;
      gl.render(scene, cam);
    }
    if (want.see && this.back) {
      gl.setRenderTarget(this.back); gl.setClearColor(0x000000, 0);
      cam.layers.set(ORGAN_BACK_LAYER); scene.overrideMaterial = WHITE;
      gl.render(scene, cam);
    }
    scene.background = bg; scene.overrideMaterial = ov;
    cam.layers.mask = mask; gl.autoClear = ac; gl.setClearColor(c0, a0); gl.setRenderTarget(rt0);
  }

  dispose(): void {
    this.map?.depthTexture?.dispose(); this.map?.dispose(); this.back?.dispose(); this.map = null; this.back = null;
    resetOrganVeil();
  }
}

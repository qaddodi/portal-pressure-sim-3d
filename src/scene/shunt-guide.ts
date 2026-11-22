// The shunt's guide (2D stage-hover.js shuntMove, styles .stent-guide): from the vessel the shunt starts at, a dashed line follows the pointer in the accent colour (the danger colour while the pointer is
// over a vessel it cannot join), 2.5 px wide, dashes 6 on 4 off, round at its ends. One quad in the figure's plane, its dashes cut in the fragment shader by screen pixels, drawn over everything on the vessels' pass.
import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { VESSEL_LAYER } from './layers.ts';
import { Ease } from '../clock/ease.ts';
import { clock, type Clock } from '../clock/frame.ts';
import { D_FLIP, easeMove } from '../ui/tests/copied/motion.copied.js';

const WIDTH_PX = 2.5, DASH_PX = 6, GAP_PX = 4;
/** The guide's alpha when whole (2D .stent-guide). */
const ALPHA = 0.95;
const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FS = `varying vec2 vUv; uniform vec3 color; uniform float lenPx; uniform float widthPx; uniform float dash; uniform float gap; uniform float alpha;
void main() {
  float along = vUv.x * lenPx, across = (vUv.y - 0.5) * widthPx, r = widthPx * 0.5 - 1.0;
  float cyc = mod(along, dash + gap);
  // a dash is a capsule: its centre line from r to dash - r, round at both ends, soft by a pixel
  float c0 = clamp(cyc, r, max(r, dash - r));
  float d = length(vec2(cyc - c0, across));
  gl_FragColor = vec4(color, alpha * (1.0 - smoothstep(r - 0.5, r + 0.5, d)));
}`;

export class ShuntGuide {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  private readonly d = new Vector3();
  // It fades in and out over D_FLIP (never a frame's switch) and its colour mixes between accent and danger over D_FLIP: the mesh is drawn while it is asked to show or is still fading.
  private want = false;
  private readonly fade: Ease;
  private readonly mix: Ease;
  private readonly from = new Color(); private readonly to = new Color(); private goal = '';
  constructor(c: Clock = clock) {
    this.fade = new Ease(0, 'shunt-guide-fade', (a) => { this.mat.uniforms.alpha!.value = a * ALPHA; this.mesh.visible = this.want || a > 0.002; }, c);
    this.mix = new Ease(1, 'shunt-guide-colour', (k) => (this.mat.uniforms.color!.value as Color).copy(this.from).lerp(this.to, k), c);
    this.mat = new ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide,
      uniforms: { color: { value: new Color('#2f7cf6') }, lenPx: { value: 1 }, widthPx: { value: WIDTH_PX }, dash: { value: DASH_PX }, gap: { value: GAP_PX }, alpha: { value: 0 } },
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 1100; this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.name = 'shunt-guide';
    this.mesh.layers.set(VESSEL_LAYER);
  }
  /** Asked to show (it may still be fading out). */
  get shown(): boolean { return this.want; }
  /** Draws the line from `a` to `b` (scene points in one plane); `pxPerUnit` is how many screen px a scene unit is there. */
  set(a: Vector3, b: Vector3, pxPerUnit: number, color: string): void {
    this.d.copy(b).sub(a);
    const len = this.d.length();
    if (len < 1e-5 || !(pxPerUnit > 0)) { this.hide(); return; }
    const m = this.mesh;
    m.position.copy(a).addScaledVector(this.d, 0.5);
    m.rotation.set(0, 0, Math.atan2(this.d.y, this.d.x));
    m.scale.set(len, (WIDTH_PX + 2) / pxPerUnit, 1);
    const u = this.mat.uniforms;
    u.lenPx!.value = len * pxPerUnit; u.widthPx!.value = WIDTH_PX + 2;
    // the colour: the first one it shows in is its own; a different one (the pointer is over a vessel it cannot join) mixes in from where the colour stands
    if (color !== this.goal) {
      this.goal = color;
      if (this.want || this.fade.value > 0.002) { this.from.copy(u.color!.value as Color); this.to.set(color); this.mix.snap(0, true); this.mix.to(1, { ms: D_FLIP, curve: easeMove }); }
      else { this.from.set(color); this.to.set(color); this.mix.snap(1, true); (u.color!.value as Color).set(color); }
    }
    this.want = true;
    this.fade.to(1, { ms: D_FLIP, curve: easeMove });
    m.visible = true;
  }
  /** It fades out where it is (the pointer left, or the shunt was placed). */
  hide(): void { this.want = false; this.fade.to(0, { ms: D_FLIP, curve: easeMove }); }
  dispose(): void { this.fade.dispose(); this.mix.dispose(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

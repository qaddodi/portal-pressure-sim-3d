// The shunt's guide (2D stage-hover.js shuntMove, styles .stent-guide): from the vessel the shunt starts at, a dashed line follows the pointer in the accent colour (the danger colour while the pointer is
// over a vessel it cannot join), 2.5 px wide, dashes 6 on 4 off, round at its ends. One quad in the figure's plane, its dashes cut in the fragment shader by screen pixels, drawn over everything on the vessels' pass.
import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { VESSEL_LAYER } from './layers.ts';

const WIDTH_PX = 2.5, DASH_PX = 6, GAP_PX = 4;
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
  constructor() {
    this.mat = new ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide,
      uniforms: { color: { value: new Color('#2f7cf6') }, lenPx: { value: 1 }, widthPx: { value: WIDTH_PX }, dash: { value: DASH_PX }, gap: { value: GAP_PX }, alpha: { value: 0.95 } },
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 1100; this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.name = 'shunt-guide';
    this.mesh.layers.set(VESSEL_LAYER);
  }
  get shown(): boolean { return this.mesh.visible; }
  /** Draws the line from `a` to `b` (scene points in one plane); `pxPerUnit` is how many screen px a scene unit is there. */
  set(a: Vector3, b: Vector3, pxPerUnit: number, color: string): void {
    this.d.copy(b).sub(a);
    const len = this.d.length();
    if (len < 1e-5 || !(pxPerUnit > 0)) { this.mesh.visible = false; return; }
    const m = this.mesh;
    m.position.copy(a).addScaledVector(this.d, 0.5);
    m.rotation.set(0, 0, Math.atan2(this.d.y, this.d.x));
    m.scale.set(len, (WIDTH_PX + 2) / pxPerUnit, 1);
    const u = this.mat.uniforms;
    u.lenPx!.value = len * pxPerUnit; u.widthPx!.value = WIDTH_PX + 2;
    (u.color!.value as Color).set(color);
    m.visible = true;
  }
  hide(): void { this.mesh.visible = false; }
  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

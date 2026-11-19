// The Zones layer over the plate (lobule-paint.js: "one radial gradient from the portal tracts (zone 1, at the corners, radius R) to the central vein
// (zone 3), not nested hexagons"), drawn by a shader with 2D's stops and opacity so it eases in and out with the layer and needs no new painting.
import { Color, CustomBlending, DoubleSide, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial } from 'three';
import { LOBULE_R } from './shots.ts';
import { PLATE_Z } from './plate.ts';
import { lookColours } from './lz-colours.ts';
import type { LookId } from '../../looks/looks.ts';

/** 2D's stops (lobule-paint.js ZONE_AT): share of R from the central vein → zone colour (3, 3, 2, 1, 1). */
export const ZONE_STOPS: readonly (readonly [number, 1 | 2 | 3])[] = [[0, 3], [0.18, 3], [0.5, 2], [0.85, 1], [1, 1]];
/** 2D's opacity of the gradient (dark 0.2, light 0.17). */
export const zoneAlpha = (dark: boolean): number => (dark ? 0.2 : 0.17);

const VS = /* glsl */ `
varying vec2 vP;
void main() { vP = position.xy / ${LOBULE_R.toFixed(4)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = /* glsl */ `
uniform vec3 z1; uniform vec3 z2; uniform vec3 z3;
uniform float amount;
varying vec2 vP;
void main() {
  // inside the lobule's hexagon only (corners at angle 0, 60, ...: its flat sides face 30, 90, ... degrees)
  float m = 0.0;
  for (int k = 0; k < 6; k++) { float a = 0.5235988 + float(k) * 1.0471976; m = max(m, (vP.x * cos(a) + vP.y * sin(a)) / 0.8660254); }
  float inside = 1.0 - smoothstep(0.995, 1.005, m);
  float r = length(vP);
  vec3 c = r < 0.18 ? z3 : r < 0.5 ? mix(z3, z2, (r - 0.18) / 0.32) : r < 0.85 ? mix(z2, z1, (r - 0.5) / 0.35) : z1;
  float a = amount * inside;
  gl_FragColor = vec4(c * a, a);
}`;

export class ZonesOverlay {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  private dark = false;
  constructor() {
    this.mat = new ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: { z1: { value: new Color() }, z2: { value: new Color() }, z3: { value: new Color() }, amount: { value: 0 } },
      transparent: true, depthWrite: false, side: DoubleSide,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    this.mesh = new Mesh(new PlaneGeometry(2.1 * LOBULE_R, 2.1 * LOBULE_R), this.mat);
    this.mesh.position.z = PLATE_Z + 0.01; this.mesh.renderOrder = 0; this.mesh.visible = false; this.mesh.name = 'lobule/zones';
  }
  applyLook(look: LookId): void {
    const L = lookColours(look);
    this.dark = L.dark;
    ([1, 2, 3] as const).forEach((z) => { const c = L.rgb01(`--lz-zone-${z}`); (this.mat.uniforms[`z${z}`]!.value as Color).setRGB(c[0], c[1], c[2]); });
  }
  /** How much of the layer shows, 0 … 1 (its fade). */
  set(k: number): void { this.mat.uniforms.amount!.value = zoneAlpha(this.dark) * k; this.mesh.visible = k > 0.002; }
  get amount(): number { return this.mat.uniforms.amount!.value as number; }
  dispose(): void { this.mat.dispose(); this.mesh.geometry.dispose(); }
}

// The water's top (21 Nov 2026, ascites package A): a tilt down onto the figure shows the surface of the ascites, a thin lighter straw ellipse with a crisp pale line along its front edge,
// rippling as the pool does. It is one strip per pool column, lying in the surface (the column's top row), from the swell's front (bellyZ + the dome) back to its mirror (bellyZ - the dome).
//   - It rides the pool's own program parts: the lift (ripple, climb, slosh) is `poolLift` from POOL_COMMON_GLSL, never a copy, the swell is `poolSwell`, and the uniforms are the pool's own object
//     (ink, opacity, living, phase, amplitude, slosh, canvas size), so the Living switch, Reduce Motion, the volume's fade and later uniforms (the dim) reach it without a second path.
//   - It is seen only from above: the face winds upward and the material culls the rest, and its alpha rises with the camera's elevation over the surface (TOP_ELEV_FROM..TOP_ELEV_TO, the sine of the
//     angle). That second part is what keeps the head-on figure as 2D has it: a perspective camera at the figure's middle already looks down a degree or three onto a low surface, and a strip a
//     fraction of a unit deep would show as a 2 px band there. A tilt of 12 degrees or more brings it in whole; a tilt up never draws it. It glides with the tilt: nothing pops.
//   - It is kept off a congested liver by the pool's own cut (liver-edge.ts liverKeep, the same uniforms) and dims with the figure (uOpacity carries package B's dim).
//   - It fades with the water's depth under 20 units (a first film has no top), with the living switch (off is 2D's flat pool), with the volume and the body (uOpacity), and out over the feather at its
//     two ends, where the swell, and so its width, is zero anyway.
// Imports from ascites.ts are read lazily (inside functions) because ascites.ts builds the layer that owns this mesh: the two modules import each other.
import { BufferAttribute, BufferGeometry, FrontSide, Mesh, ShaderMaterial, type IUniform } from 'three';
import { x3, y3 } from '../frame2d.ts';
import * as A from './ascites.ts';
import { LIVER_CUT_FS, LIVER_CUT_VS_DECL, LIVER_CUT_VS_MAIN } from './liver-edge.ts';

/** The camera's elevation over the surface (sine of the angle) where the top starts to show and where it shows whole: about 5.7 and 11.5 degrees. */
export const TOP_ELEV_FROM = 0.1, TOP_ELEV_TO = 0.2;
/** Water shallower than this many 2D units (at a column) has no top yet. */
export const TOP_DEPTH_FROM = 0, TOP_DEPTH_TO = 20;

const ss = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How much of the top shows (the vertex shader's `vShow` without the living share): `elev` is the sine of the camera's elevation over the surface, `depth` the water's depth at the column (2D units). */
export const topShow = (elev: number, depth: number): number => ss(TOP_ELEV_FROM, TOP_ELEV_TO, elev) * ss(TOP_DEPTH_FROM, TOP_DEPTH_TO, depth);

/** The top's two columns' vertices: 0 the front of the swell, 1 the back (the mirror). */
export const topVS = (): string => /* glsl */ `
attribute float aW;
attribute float aS;
attribute float aH;
${A.POOL_COMMON_GLSL}
varying float vW;
varying float vPxu;
varying float vSpx;
varying float vShow;
${LIVER_CUT_VS_DECL}
void main() {
  float pxu = poolPxu(position);
  float wx = position.x * 300.0 + 700.0;
  vec3 base = position;
  base.y += poolLift(wx, aW, 0.0, pxu) / 300.0;
  float dz = poolSwell(aW);
  vec3 front = base + vec3(0.0, 0.0, dz);
  vec3 p = base + vec3(0.0, 0.0, dz * (1.0 - 2.0 * aS));
  vec4 cf = projectionMatrix * modelViewMatrix * vec4(front, 1.0);
  vec4 cp = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vSpx = length((cp.xy / cp.w - cf.xy / cf.w) * 0.5 * uRes);   // CSS px from the strip's front edge: the crisp line is drawn in px, as the pool's is
  vec3 toCam = normalize(cameraPosition - (modelMatrix * vec4(base, 1.0)).xyz);
  vShow = smoothstep(${A.f(TOP_ELEV_FROM)}, ${A.f(TOP_ELEV_TO)}, toCam.y) * smoothstep(${A.f(TOP_DEPTH_FROM)}, ${A.f(TOP_DEPTH_TO)}, aH) * uLiving;
  vW = aW;
  vPxu = pxu;
  ${LIVER_CUT_VS_MAIN}
  gl_Position = cp;
}`;
/** The top's colour is the pool's surface tone (2D's meniscus colour at d = 0: the ink 45 % toward white, the surface share of the alpha), with the pool's sheen and a crisp pale line along the front edge only. */
export const topFS = (): string => /* glsl */ `
precision highp float;
${LIVER_CUT_FS}
uniform vec3 uInk;
uniform float uInkA;
uniform float uOpacity;
varying float vW;
varying float vPxu;
varying float vSpx;
varying float vShow;
void main() {
  vec3 c = mix(uInk, vec3(1.0), ${A.f(A.MENISCUS)});
  c = mix(c, vec3(1.0), ${A.f(A.SHEEN_K)});
  c = mix(c, vec3(1.0), ${A.f(A.LINE_K)} * (1.0 - smoothstep(${A.f(A.LINE_FROM_PX)}, ${A.f(A.LINE_TO_PX)}, vSpx)));
  float edge = smoothstep(0.0, ${A.f(A.FEATHER_PX)}, vW * vPxu);
  gl_FragColor = vec4(c, uInkA * ${A.f(A.SURFACE_SHARE)} * edge * vShow * uOpacity);
  gl_FragColor.a *= liverKeep(vW2d, 1.0 / max(vPxu, 1e-3));   // (2D's liver cut, package B: the top is kept off a congested liver like the pool)
}`;

export class AscitesTop {
  readonly mesh: Mesh;
  private readonly pos: Float32Array;
  private readonly aW: Float32Array;
  private readonly aS: Float32Array;
  private readonly aH: Float32Array;
  constructor(uniforms: Record<string, IUniform>) {
    const n = A.POOL_COLS * 2;
    this.pos = new Float32Array(n * 3); this.aW = new Float32Array(n); this.aS = new Float32Array(n); this.aH = new Float32Array(n);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aW', new BufferAttribute(this.aW, 1));
    g.setAttribute('aS', new BufferAttribute(this.aS, 1));
    g.setAttribute('aH', new BufferAttribute(this.aH, 1));
    const idx: number[] = [];
    // each quad winds upward (+y): (front c, front c+1, back c) and (front c+1, back c+1, back c); the material culls what is seen from below
    for (let c = 0; c < A.POOL_COLS - 1; c++) { const f0 = 2 * c, b0 = f0 + 1, f1 = f0 + 2, b1 = f0 + 3; idx.push(f0, f1, b0, f1, b1, b0); }
    g.setIndex(idx);
    for (let c = 0; c < A.POOL_COLS; c++) { this.aS[2 * c] = 0; this.aS[2 * c + 1] = 1; }
    const mat = new ShaderMaterial({ name: 'pool-top', vertexShader: topVS(), fragmentShader: topFS(), uniforms, transparent: true, depthWrite: false, depthTest: false, side: FrontSide });
    this.mesh = new Mesh(g, mat);
    this.mesh.renderOrder = A.POOL_ORDER; this.mesh.frustumCulled = false; this.mesh.visible = false;
  }
  /** Lays the strip along the pool's surface: per column the surface y (2D units), the wall distance there and the water's depth. The strip lies flat on the belly's plane; the shader adds the swell. */
  lay(tops: ArrayLike<number>, wall: ArrayLike<number>, depth: ArrayLike<number>): void {
    const z = A.bellyZ();
    for (let c = 0; c < A.POOL_COLS; c++) {
      const x = x3(A.POOL_X0 + c * A.POOL_STEP), y = y3(tops[c]!);
      for (let k = 0; k < 2; k++) { const v = 2 * c + k; this.pos[v * 3] = x; this.pos[v * 3 + 1] = y; this.pos[v * 3 + 2] = z; this.aW[v] = wall[c]!; this.aH[v] = depth[c]!; }
    }
    for (const n of ['position', 'aW', 'aH']) (this.mesh.geometry.getAttribute(n) as BufferAttribute).needsUpdate = true;
    this.mesh.geometry.boundingSphere = null;
  }
  /** The CPU copy as the shader draws it for a living share `live` (0 flat on the belly's plane): used by the tap's ray cast, never uploaded. */
  swell(live: number): void {
    const z = A.bellyZ();
    for (let v = 0; v < this.aW.length; v++) this.pos[v * 3 + 2] = z + live * A.DOME * A.poolDome(this.aW[v]!) * (1 - 2 * this.aS[v]!);
    this.mesh.geometry.boundingSphere = null;
  }
  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as ShaderMaterial).dispose(); }
}

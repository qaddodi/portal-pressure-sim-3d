// The scope ring on the varices (2D scope-lens-rule.js ringShapes, stage-clamps.js: "drawn by the GPU, in world units, so it moves with every zoom, pan and view change as the bands on the
// same esophagus do"). One camera-facing quad at the lower esophagus's varix columns, in the figure's own units, and one fragment shader that draws everything in 2D units: a dashed ring
// (16 dashes with round ends, 0.55 of each turn) that fills into a solid one as its lens opens, each line with the labels' halo under it so it reads on
// any vessel in either theme. It has no icon badge
// (the 2D ring wore a disc with a scope's end face on its upper-right edge; the owner's ruling L9, 27 Nov, review 3531bdfa E-D9: a ring and no badge, so
// nothing round and white stands on the varix). Its shown share and its opening ease on the clock (never a pop); a line is never
// thinner than a pixel and a half on the screen, so it stays a line at a far zoom. The page draws nothing of it.
import { Color, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { RING, BLEED_BOX } from './copied/scope-lens-rule.js';
import { UNITS_PER_SCENE as U, x3, y3 } from '../frame2d.ts';
import { rawColor } from '../materials/cel.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { VESSEL_LAYER } from '../layers.ts';
import { Eased } from './follow.ts';
import { PLACED_PATH_2D, PLACED_Z } from '../anatomy/placed-network.ts';
import { PLACED_VESSELS } from '../anatomy/placement.generated.ts';

/** The varix the ring rings (the esophageal varix's course, placed: the approved placement's coronary vein run up the esophagus). */
const RINGED = 'C1a';
/** The ring's depth at the figure's height `y` (2D units, down): the ringed varix's own near surface there (the vein's centreline depth plus its radius: where the bleed leaves it, stream-fit.ts tearAt), so the
 *  ring and the vein it rings stay together from every camera angle. It was one plane 0.36 in front of the figure for every view (the bleed's old fixed plane): the varix lies at about -0.03, and the 14
 *  degree view turns a 0.4 gap in depth into a slide on the canvas of more than the ring's own radius, so a turned figure showed the ring beside its vein (27 Nov, the 2D-plate audit). The ring draws over
 *  everything by its order, not by depth (`depthTest` off), so its depth moves nothing else. Reads the placed course only (no organ raster), so building the ring costs nothing. */
export function ringZ(y: number): number {
  const c = PLACED_PATH_2D[RINGED], z = PLACED_Z[RINGED];
  if (!c || !z) return 0;
  let best = 0, bd = Infinity;
  for (let i = 0; i < c.length; i++) { const d = Math.abs(c[i]![1] - y); if (d < bd) { bd = d; best = i; } }
  return (z[best] ?? 0) + (PLACED_VESSELS[RINGED]?.r ?? 0);
}
/** Where the ring stands at rest (2D units): at the scope rule's height (RING.y) ON the ringed varix as the placement draws it. The rule's own x (798) is the 2D plate's esophagus, and the placed varix runs 15 units
 *  left of it, a whole ring radius (17), so the ring stood beside its vein even face on. */
export const RING_REST: { readonly x: number; readonly y: number } = (() => {
  const c = PLACED_PATH_2D[RINGED];
  if (!c?.length) return { x: RING.x, y: RING.y };
  let best = c[0]!, bd = Infinity;
  for (const p of c) { const d = Math.abs(p[1] - RING.y); if (d < bd) { bd = d; best = p; } }
  return { x: best[0], y: RING.y };
})();
/** How long the ring takes to come in and go (an eased fade, ms) and its dashes to close into the solid ring when its lens opens: tau of the ease, seconds. */
export const SHOW_TAU = 0.14, OPEN_TAU = 0.1, CENTRE_TAU = 0.16;
/** The quad's half side in 2D units: the ring and its halo. */
const HALF = 28;

export const RING_VS = /* glsl */ `
uniform vec3 uC;
uniform float uHalf;
varying vec2 vP;
const float U = ${U}.0;
void main() {
  vP = position.xy * uHalf;   // (2D units from the ring's centre, x right, y up)
  vec3 cw = (modelMatrix * vec4(uC, 1.0)).xyz;
  float s = length(modelMatrix[0].xyz);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  gl_Position = projectionMatrix * viewMatrix * vec4(cw + (right * vP.x + up * vP.y) / U * s, 1.0);
}`;

export const RING_FS = /* glsl */ `
uniform float uR;
uniform float uSolid;
uniform float uAlpha;
uniform vec3 uInk;
uniform vec3 uHalo;
varying vec2 vP;
const float TAU = 6.28318530718;
float cover(float d, float px) { return 1.0 - smoothstep(-0.5 * px, 0.5 * px, d); }
// distance to the dash capsules: 16 dashes on the ring, the share of each turn drawn grows from 0.55 to the whole ring as it opens
float dashD(vec2 p) {
  float rad = abs(length(p) - uR);
  float seg = TAU * uR / 16.0, on = mix(0.55, 1.0, uSolid) * seg;
  float t = fract(atan(p.y, p.x) / TAU * 16.0) * seg;
  float a = t - clamp(t, 0.0, on), b = (t - seg) - clamp(t - seg, 0.0, on);
  return min(length(vec2(a, rad)), length(vec2(b, rad)));
}
void main() {
  vec2 p = vP;
  float px = max(fwidth(p.x), 1e-4);
  float w = max(0.425, 0.8 * px), wh = w + max(0.575, 0.9 * px);
  float dd = dashD(p);
  float ink = cover(dd - w, px), halo = cover(dd - wh, px);
  // paint order: the ring's halo, then the ring
  vec3 col = uHalo;
  float a = halo * 0.85;
  col = mix(col, uInk, ink); a = max(a, ink);
  if (a * uAlpha < 0.003) discard;
  gl_FragColor = vec4(col, a * uAlpha);
}`;

export class ScopeRing {
  readonly group = new Group();
  private mat: ShaderMaterial;
  private mesh: Mesh;
  private shown = new Eased(0, SHOW_TAU, 0.004);
  private solid = new Eased(0, OPEN_TAU, 0.004);
  /** The ring's centre in 2D units: the scope rule's (RING) at rest, the tear's while a varix bleeds (capture 52ef8e63: the ring stood up the esophagus and the "Bleeding varix" words at the tear, 26 units apart); it eases between them. */
  private cx = new Eased(RING_REST.x, CENTRE_TAU, 0.02);
  private cy = new Eased(RING_REST.y, CENTRE_TAU, 0.02);
  private gx = RING_REST.x;
  private gy = RING_REST.y;
  private want = false; private open = false;
  private fade = 1;
  private readonly c = new Vector3();
  private readonly e = new Vector3();
  constructor() {
    this.mat = new ShaderMaterial({ name: 'scope ring',
      vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        uC: { value: new Vector3(x3(RING_REST.x), y3(RING_REST.y), ringZ(RING_REST.y)) }, uHalf: { value: HALF },
        uR: { value: RING.r },
        uSolid: { value: 0 }, uAlpha: { value: 0 }, uInk: { value: new Color() }, uHalo: { value: new Color() },
      },
    });
    // (the quad's own units are 2D units over the ring's centre: the vertex shader scales them by uHalf; the plane's -1..1 is its half side)
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 60; this.mesh.visible = false;
    this.mesh.layers.set(VESSEL_LAYER);
    this.group.add(this.mesh);
    this.applyLook('light');
  }
  applyLook(look: LookId): void {
    const l = LOOKS[look], u = this.mat.uniforms;
    rawColor(l.text, u.uInk!.value as Color); rawColor(l.bg, u.uHalo!.value as Color);
  }
  /** Whether the ring stands (it eases in and out) and whether its lens is open (its dashes close into a line). */
  set(on: boolean, open: boolean): void { this.want = on; this.open = open; }
  /** The body's dissolve (the dive, the Circuit): 1 whole. */
  setFade(f: number): void { this.fade = f; this.sync(); }
  /** Where the ring stands (2D units; null: the scope rule's place). It glides there. */
  setCentre(at: readonly [number, number] | null): void { this.gx = at ? at[0] : RING_REST.x; this.gy = at ? at[1] : RING_REST.y; }
  /** The ring's centre now, 2D units. */
  centre(): readonly [number, number] { return [this.cx.value, this.cy.value]; }
  /** Eases on the clock (dt in seconds); true while it moves. */
  step(dt: number, instant = false): boolean {
    const a = this.shown.to(this.want ? 1 : 0, dt, instant), b = this.solid.to(this.want && this.open ? 1 : 0, dt, instant);
    // (a ring that is not showing goes to its place at once: nothing to see move)
    const c = this.cx.to(this.gx, dt, instant || this.shown.value < 0.01), d = this.cy.to(this.gy, dt, instant || this.shown.value < 0.01);
    this.sync();
    return a || b || c || d;
  }
  private sync(): void {
    const a = this.shown.value * this.fade;
    this.mesh.visible = a > 0.003;
    this.mat.uniforms.uAlpha!.value = a;
    this.mat.uniforms.uSolid!.value = this.solid.value;
    (this.mat.uniforms.uC!.value as Vector3).set(x3(this.cx.value), y3(this.cy.value), ringZ(this.cy.value));
  }
  /** How much of the ring shows now, 0..1 (the tap is taken only while it shows). */
  get alpha(): number { return this.shown.value * this.fade; }
  /** The ring on the screen now, CSS px from the stage's corner: its centre and radius, the badge's centre and radius. `project` is the camera's, `toWorld` the figure's group's (the ring is its child:
   *  it returns a new point), `cameraRight` the camera's right axis in the world. Null when it is not on the screen. There is no badge: its centre is the
   *  ring's and its radius 0, so a tap and the names' keep-off
   *  room are the ring's alone. */
  screen(project: (p: Vector3, out: { x: number; y: number }) => { x: number; y: number }, toWorld: (p: Vector3) => Vector3, cameraRight: Vector3, out: ScopeRingScreen): ScopeRingScreen | null {
    const s = this.group.parent ? this.group.parent.matrixWorld.getMaxScaleOnAxis() : 1;
    const wc = toWorld(this.c.set(x3(this.cx.value), y3(this.cy.value), ringZ(this.cy.value)));
    const a = project(wc, this.pa);
    // (the radius: where a point one radius along the camera's right lands, so the figure's turn and its zoom both count)
    const r = project(this.e.copy(wc).addScaledVector(cameraRight, (RING.r / U) * s), this.pr);
    out.x = a.x; out.y = a.y; out.bx = a.x; out.by = a.y;
    out.r = Math.hypot(r.x - a.x, r.y - a.y); out.br = 0;
    const q0 = project(toWorld(this.c.set(x3(BLEED_BOX.l), y3(BLEED_BOX.t), ringZ(this.cy.value))), this.pa), x0 = q0.x, y0 = q0.y;
    const q1 = project(toWorld(this.c.set(x3(BLEED_BOX.r), y3(BLEED_BOX.b), ringZ(this.cy.value))), this.pa);
    out.bleed.l = Math.min(x0, q1.x); out.bleed.r = Math.max(x0, q1.x); out.bleed.t = Math.min(y0, q1.y); out.bleed.b = Math.max(y0, q1.y);
    return Number.isFinite(out.x) && Number.isFinite(out.r) ? out : null;
  }
  private readonly pa = { x: 0, y: 0 }; private readonly pr = { x: 0, y: 0 };
  /** What is drawn, for the tests. */
  state(): { alpha: number; solid: number; visible: boolean } { return { alpha: this.alpha, solid: this.solid.value, visible: this.mesh.visible }; }
  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
export interface ScopeRingScreen {
  x: number; y: number; r: number; bx: number; by: number; br: number;
  /** the bleed's patch (the tear and the stream down into the stomach) as a rectangle on the screen: the lens never opens over it */
  bleed: { l: number; t: number; r: number; b: number };
}

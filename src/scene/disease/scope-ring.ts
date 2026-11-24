// The scope ring on the varices (2D scope-lens-rule.js ringShapes, stage-clamps.js: "drawn by the GPU, in world units, so it moves with every zoom, pan and view change as the bands on the
// same esophagus do"). One camera-facing quad at the lower esophagus's varix columns, in the figure's own units, and one fragment shader that draws everything in 2D units: a dashed ring
// (16 dashes with round ends, 0.55 of each turn) that fills into a solid one as its lens opens, the scope badge on its upper-right edge (a disc with the end face of a scope tip: lens, two light guides,
// the working channel), each line with the labels' halo under it so it reads on any vessel in either theme. Its shown share and its opening ease on the clock (never a pop); a line is never
// thinner than a pixel and a half on the screen, so it stays a line at a far zoom. The page draws nothing of it.
import { Color, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from 'three';
import { RING, BADGE_R, BLEED_BOX, badgeAt } from './copied/scope-lens-rule.js';
import { withOrgan } from '../editor-anchors.ts';
/** The ring's places on the figure, carried with the stomach's edit (the same numbers unedited). */
const STO = (x: number, y: number): readonly [number, number] => withOrgan('stomach', [x, y]);
import { UNITS_PER_SCENE as U, x3, y3 } from '../frame2d.ts';
import { rawColor } from '../materials/cel.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { VESSEL_LAYER } from '../layers.ts';
import { Eased } from './follow.ts';

/** The ring's depth: the plane the bleed leaves the varix in (disease/bleed.ts STREAM_Z), in front of the organs; the ring draws over everything of the figure by its order, not by depth. */
export const RING_Z = 0.36;
/** How long the ring takes to come in and go (an eased fade, ms) and its dashes to close into the solid ring when its lens opens: tau of the ease, seconds. */
export const SHOW_TAU = 0.14, OPEN_TAU = 0.1;
/** The quad's half side in 2D units: the ring, the badge beyond it and their halos. */
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
uniform float uBadgeR;
uniform vec2 uBadge;
uniform float uSolid;
uniform float uAlpha;
uniform vec3 uInk;
uniform vec3 uHalo;
uniform vec3 uSurface;
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
  // the badge: halo, fill, edge, then the scope's end face in the ink (the surface once the lens is open and the fill is the ink)
  vec2 q = p - uBadge;
  float k = uBadgeR / 17.0, bl = length(q);
  float bHalo = cover(bl - (uBadgeR + 0.6), px);
  float bFill = cover(bl - uBadgeR, px);
  float bEdge = cover(abs(bl - uBadgeR) - 0.3, px);
  float face = 0.0;
  face = max(face, cover(abs(length(q) - 10.5 * k) - 1.2 * k, px));
  face = max(face, cover(length(q - vec2(-3.2, 2.0) * k) - 3.6 * k, px));
  face = max(face, cover(length(q - vec2(4.6, 4.4) * k) - 1.7 * k, px));
  face = max(face, cover(length(q - vec2(4.2, -4.4) * k) - 1.7 * k, px));
  face = max(face, cover(abs(length(q - vec2(-2.6, -5.6) * k) - 2.0 * k) - 0.75 * k, px));
  vec3 fill = mix(uSurface, uInk, uSolid);
  vec3 faceInk = mix(uInk, uSurface, uSolid);
  // paint order: halos, the ring, the badge's fill, its edge, its end face
  float aH = max(halo, bHalo) * 0.85;
  vec3 col = uHalo;
  float a = aH;
  col = mix(col, uInk, ink * (1.0 - 0.0)); a = max(a, ink);
  col = mix(col, fill, bFill); a = max(a, bFill);
  col = mix(col, uInk, bEdge); a = max(a, bEdge);
  col = mix(col, faceInk, face * bFill);
  if (a * uAlpha < 0.003) discard;
  gl_FragColor = vec4(col, a * uAlpha);
}`;

export class ScopeRing {
  readonly group = new Group();
  private mat: ShaderMaterial;
  private mesh: Mesh;
  private shown = new Eased(0, SHOW_TAU, 0.004);
  private solid = new Eased(0, OPEN_TAU, 0.004);
  private want = false; private open = false;
  private fade = 1;
  private readonly c = new Vector3();
  private readonly e = new Vector3();
  constructor() {
    const b = badgeAt();
    this.mat = new ShaderMaterial({ name: 'scope ring',
      vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        uC: { value: new Vector3(x3(STO(RING.x, RING.y)[0]), y3(STO(RING.x, RING.y)[1]), RING_Z) }, uHalf: { value: HALF },
        uR: { value: RING.r }, uBadgeR: { value: BADGE_R }, uBadge: { value: new Vector2(b.x - RING.x, -(b.y - RING.y)) },
        uSolid: { value: 0 }, uAlpha: { value: 0 }, uInk: { value: new Color() }, uHalo: { value: new Color() }, uSurface: { value: new Color() },
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
    rawColor(l.text, u.uInk!.value as Color); rawColor(l.bg, u.uHalo!.value as Color); rawColor(l.card, u.uSurface!.value as Color);
  }
  /** Whether the ring stands (it eases in and out) and whether its lens is open (its dashes close into a line). */
  set(on: boolean, open: boolean): void { this.want = on; this.open = open; }
  /** The body's dissolve (the dive, the Circuit): 1 whole. */
  setFade(f: number): void { this.fade = f; this.sync(); }
  /** Eases on the clock (dt in seconds); true while it moves. */
  step(dt: number, instant = false): boolean {
    const a = this.shown.to(this.want ? 1 : 0, dt, instant), b = this.solid.to(this.want && this.open ? 1 : 0, dt, instant);
    this.sync();
    return a || b;
  }
  private sync(): void {
    const a = this.shown.value * this.fade;
    this.mesh.visible = a > 0.003;
    this.mat.uniforms.uAlpha!.value = a;
    this.mat.uniforms.uSolid!.value = this.solid.value;
  }
  /** How much of the ring shows now, 0..1 (the tap is taken only while it shows). */
  get alpha(): number { return this.shown.value * this.fade; }
  /** The ring on the screen now, CSS px from the stage's corner: its centre and radius, the badge's centre and radius. `project` is the camera's, `toWorld` the figure's group's (the ring is its child:
   *  it returns a new point), `cameraRight` the camera's right axis in the world. Null when it is not on the screen. */
  screen(project: (p: Vector3, out: { x: number; y: number }) => { x: number; y: number }, toWorld: (p: Vector3) => Vector3, cameraRight: Vector3, out: ScopeRingScreen): ScopeRingScreen | null {
    const s = this.group.parent ? this.group.parent.matrixWorld.getMaxScaleOnAxis() : 1;
    const rc = STO(RING.x, RING.y), wc = toWorld(this.c.set(x3(rc[0]), y3(rc[1]), RING_Z));
    const bd = badgeAt(), bm = STO(bd.x, bd.y), wb = toWorld(this.c.set(x3(bm[0]), y3(bm[1]), RING_Z));
    const a = project(wc, this.pa), b = project(wb, this.pb);
    // (the radii: where a point one radius along the camera's right lands, so the figure's turn and its zoom both count)
    const r = project(this.e.copy(wc).addScaledVector(cameraRight, (RING.r / U) * s), this.pr), r2 = project(this.e.copy(wc).addScaledVector(cameraRight, (BADGE_R / U) * s), this.pr2);
    const ax = a.x, ay = a.y;
    out.x = ax; out.y = ay; out.bx = b.x; out.by = b.y;
    out.r = Math.hypot(r.x - a.x, r.y - a.y); out.br = Math.hypot(r2.x - a.x, r2.y - a.y);
    const b0 = STO(BLEED_BOX.l, BLEED_BOX.t), b1 = STO(BLEED_BOX.r, BLEED_BOX.b), q0 = project(toWorld(this.c.set(x3(b0[0]), y3(b0[1]), RING_Z)), this.pa), x0 = q0.x, y0 = q0.y;
    const q1 = project(toWorld(this.c.set(x3(b1[0]), y3(b1[1]), RING_Z)), this.pa);
    out.bleed.l = Math.min(x0, q1.x); out.bleed.r = Math.max(x0, q1.x); out.bleed.t = Math.min(y0, q1.y); out.bleed.b = Math.max(y0, q1.y);
    return Number.isFinite(out.x) && Number.isFinite(out.r) ? out : null;
  }
  private readonly pa = { x: 0, y: 0 }; private readonly pb = { x: 0, y: 0 }; private readonly pr = { x: 0, y: 0 }; private readonly pr2 = { x: 0, y: 0 };
  /** What is drawn, for the tests. */
  state(): { alpha: number; solid: number; visible: boolean } { return { alpha: this.alpha, solid: this.solid.value, visible: this.mesh.visible }; }
  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
export interface ScopeRingScreen {
  x: number; y: number; r: number; bx: number; by: number; br: number;
  /** the bleed's patch (the tear and the stream down into the stomach) as a rectangle on the screen: the lens never opens over it */
  bleed: { l: number; t: number; r: number; b: number };
}

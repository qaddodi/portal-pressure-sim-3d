// Ascites: the water in the belly (the pool of 2D, as one inflated hull in 3D). The 2D figure fills the abdominal cavity (its wall bulges with the volume, anatomy.js abdomenOutline) up to a meniscus whose height follows the
// volume (fluid-step.js fluidLevel / fluidBase, both copied): none under 150 mL, fading in over the next 150, standing higher by volume^1.1, concave, the same on both sides.
// 21 Nov 2026 (Mohammad: "a flat right and left; it should have an organic curvature throughout"): the water is ONE closed hull (ascites-hull.ts lays it, ascites-hull-glsl.ts draws it), thickest in the middle of the cavity
// and meeting the wall line with a vertical tangent, so a turn shows a rounded body, never a flat side; every vertex is slid along the rest camera's ray so head-on it is exactly 2D's pool. The numbers, tones and GLSL
// chunks both share are in ascites-pool.ts (re-exported here). Design: /mnt/project-files/rebuild-3d/ascites-organic-design.md.
//   - the surface ripples as 2D's does (two sines, amplitude from the volume, the phase running with the blood's eased flow rate, so Pause stills it over half a second);
//   - "Living fluid" (Settings > Figure depth, on by default; off is 2D's flat, hard-edged pool): the body glides flat onto the belly's plane, the edge feathers, the surface climbs the wall, a crisp pale line rides it, deep water is a
//     richer amber, the surface sloshes while the level moves.
// ONE BELLY: the hull's middle plane is the gut's (HULL.MID), also the flank line's (landmarks.ts) and the tap's. Everything is a number the clock eases: nothing pops, and nothing is re-meshed per frame (a relayout only when the level moved 0.25 units).
import { BufferGeometry, DataTexture, FloatType, FrontSide, BackSide, Group, Matrix4, Mesh, NearestFilter, RedFormat, ShaderMaterial, Vector2, Vector3, type Raycaster } from 'three';
import { fluidBase, fluidLevel, poolFade } from './copied/fluid-step.js';
import { HULL, HullLayout, hullHit, hullThickness } from './ascites-hull.ts';
import { HULL_FS, HULL_VS } from './ascites-hull-glsl.ts';
import { EDGE_STEPS, FLUID_COLS, NO_LIVER, liverCut, liverEdgeTable, liverScaleOf } from './liver-edge.ts';
import { ASCITES_INK, FLUID_RGBA, LIVING_TAU, POOL_ORDER, RIPPLE_PERIOD, RIPPLE_WRAP, bulgeStep, crossings, hexTo01, polyOf, sloshStep, type Slosh } from './ascites-pool.ts';
import type { CelShared } from '../materials/cel.ts';
import type { LookId } from '../../looks/looks.ts';

export * from './ascites-pool.ts';

/** The belly's one plane (scene units): the hull's middle, the gut's own (organs.bin: bowel -0.224..-0.035, colon -0.104..0.040). The hull, the flank ribbon (landmarks.ts) and the tap all lie on it. */
export const bellyZ = (): number => HULL.MID;
/** The back of the water is drawn BEFORE the organs (after the flank's -1, before the heart's fill at 0), so the organs sit in the water; the front and the lid are drawn after them, at POOL_ORDER, as the pool always was. */
export const SHELL_BACK_ORDER = -0.5;

export class AscitesLayer {
  readonly group = new Group();
  /** The hull: one geometry, two meshes (the BackSide material draws its back sheet before the organs, the FrontSide one its front sheet and lid after them). */
  private readonly hull = new HullLayout();
  private readonly back: Mesh;
  private readonly fill: Mesh;
  private readonly mats: ShaderMaterial[];
  private shared: CelShared | null = null;
  private lastH = NaN; private lastStep = -1;
  private body = 1; private poolA = 0;
  private ink = new Vector3(FLUID_RGBA[0], FLUID_RGBA[1], FLUID_RGBA[2]);
  private readonly uniforms = {
    uInk: { value: this.ink }, uInkA: { value: FLUID_RGBA[3] as number }, uOpacity: { value: 0 },
    uPhase: { value: 0 }, uAmp: { value: 0 }, uSlosh: { value: 0 }, uLiving: { value: 1 },
    uRes: { value: new Vector2(1, 1) } as { value: Vector2 },
    // the liver's lower edge (one number per column across 2D's fluid rectangle), how far the straw is kept off it, and the liver's drawn scale: set by `setLiver`
    uLiverEdge: { value: null as unknown as DataTexture }, uLiverCut: { value: 0 }, uLiverScale: { value: 1 },
    // the hull: its deepest distance from the wall (2D units), how far the front and the back reach from the belly's plane (scene units), the rest eye in this group's frame, the turn off rest (0..1) and the world light
    uR: { value: 1 }, uTf: { value: 0 }, uTb: { value: 0 }, uRestEye: { value: new Vector3(0, 0, 1) }, uOff: { value: 0 },
    uLight: { value: new Vector3(0.4, 0.6, 0.7).normalize() } as { value: Vector3 },
  };
  private readonly edge = new Float32Array(FLUID_COLS).fill(NO_LIVER);
  private edgeKey = '';
  /** What the organs are dimmed to apart from the lens's grey (2D: the selection's and a slide spotlight's dim; the Circuit's change is `body`): the organs' own eased value, handed over each frame. */
  private dim = 1;
  /** The pool's level in 2D units at the middle of the belly (x 712), for the tests and the labels; null while there is no pool. */
  surface: number | null = null;
  /** Reduce Motion: the surface holds still (no ripple, no slosh); the soft edges are still. */
  still = false;
  private livingGoal = 1; private phase = 0;
  private readonly swing: Slosh = { x: 0, v: 0 };
  private levelNow = 0; private levelWas = NaN; private amp = 0;
  private thick = { tf: 0, tb: 0 };
  private readonly localEye = new Vector3();
  constructor() {
    // (the colours are written as the figure's own numbers, the way materials/cel.ts rawColor does: the picture goes through the anti-aliasing pass as it is)
    const tex = new DataTexture(this.edge, FLUID_COLS, 1, RedFormat, FloatType);
    tex.minFilter = tex.magFilter = NearestFilter; tex.needsUpdate = true;
    this.uniforms.uLiverEdge.value = tex;
    // (a key left out, not `defines: undefined`: three.js warns "parameter defines has value of undefined"
    //  for every key it is handed undefined)
    const mk = (name: string, side: typeof BackSide | typeof FrontSide, defines?: Record<string, string>): ShaderMaterial =>
      new ShaderMaterial({
        name, vertexShader: HULL_VS, fragmentShader: HULL_FS, uniforms: this.uniforms, ...(defines ? { defines } : {}), side,
        transparent: true, depthWrite: false, depthTest: false,
      });
    const bm = mk('pool-hull-back', BackSide, { HULL_BACK: '' }), fm = mk('pool-hull-front', FrontSide);
    this.mats = [bm, fm];
    const g: BufferGeometry = this.hull.geometry;
    this.back = new Mesh(g, bm); this.back.renderOrder = SHELL_BACK_ORDER;
    this.fill = new Mesh(g, fm); this.fill.renderOrder = POOL_ORDER;
    for (const m of [this.back, this.fill]) { m.frustumCulled = false; m.visible = false; this.group.add(m); }
  }
  /** The scene's shared uniforms: the canvas size in CSS px (the pool's sizes are pixels), the one world light and the camera's rest eye and turn (read each frame in `step`). */
  bindShared(shared: CelShared): void { this.uniforms.uRes = shared.res; this.uniforms.uLight = shared.light; this.shared = shared; }
  /** The canvas size in CSS px (the scene's shared `res`). */
  bindRes(res: { value: Vector2 }): void { this.uniforms.uRes = res; }
  /** The look's straw (tokens.css --ascites, --ascites-a): two uniforms, nothing is laid again. */
  applyLook(look: LookId): void {
    const k = ASCITES_INK[look], c = hexTo01(k.hex);
    this.ink.set(c[0], c[1], c[2]); this.uniforms.uInkA.value = k.a;
  }
  /** Settings > Figure depth > Living fluid. It glides (step), unless `instant` (the first read at boot). */
  setLiving(on: boolean, instant = false): void { this.livingGoal = on ? 1 : 0; if (instant) { this.uniforms.uLiving.value = this.livingGoal; this.applyThick(); this.syncBack(); } }
  get living(): number { return this.uniforms.uLiving.value; }
  /** The body's dissolve (disease/index.ts setFade): the pool lies in the belly, so it fades with the anatomy. */
  setFade(f: number): void { this.body = f; this.apply(); }
  /** The organs' dim (their selection and spotlight dim, already eased by the organs' own clock: no second timer here): the pool is never brighter than the belly it lies in (2D stage-transitions.js stepFluid). */
  setDim(k: number): void { if (k !== this.dim) { this.dim = k; this.apply(); } }
  /** The liver's shown cirrhosis and congestion (the organs' eased values): the straw is kept off the liver by 2D's cut, smooth01(congestion / 0.5), above the liver's lower edge in its drawn frame. True when the edge changed. */
  setLiver(cirrhosis: number, congestion: number): boolean {
    const u = this.uniforms, cut = liverCut(congestion);
    u.uLiverCut.value = cut; u.uLiverScale.value = liverScaleOf(cirrhosis, congestion);
    if (!(cut > 0)) return false;
    const key = `${Math.round(Math.min(1, Math.max(0, cirrhosis)) * EDGE_STEPS)},${Math.round(Math.min(1, Math.max(0, congestion)) * EDGE_STEPS)}`;
    if (key === this.edgeKey) return false;
    this.edgeKey = key;
    liverEdgeTable(cirrhosis, congestion, this.edge); u.uLiverEdge.value.needsUpdate = true;
    return true;
  }
  private apply(): void {
    this.fill.visible = this.poolA > 0 && this.body > 0.001 && this.dim > 0.001;
    this.syncBack();
    this.uniforms.uOpacity.value = this.poolA * this.body * this.dim;
  }
  /** The back sheet is drawn while there is water and the living switch is not fully off (off is 2D's flat pool: nothing behind it). */
  private syncBack(): void { this.back.visible = this.fill.visible && this.uniforms.uLiving.value > 0.002; }
  /** The body's reach from the belly's plane (hullThickness of the laid radius, which follows the shown volume) times the living share: it swells and shrinks with the volume's spring and glides flat with the switch. */
  private applyThick(): void {
    const th = hullThickness(this.hull.radius, 1), live = this.uniforms.uLiving.value;
    this.thick.tf = th.tf * live; this.thick.tb = th.tb * live;
    this.uniforms.uTf.value = this.thick.tf; this.uniforms.uTb.value = this.thick.tb; this.uniforms.uR.value = this.hull.radius;
  }
  /** One frame on the clock: the ripple's phase runs with the eased flow rate (0 paused .. 1), the slosh swings with the level's speed, the living switch glides, the rest eye follows the camera. True while any of it still moves (the clock draws another frame). */
  step(dt: number, flowRate: number): boolean {
    const u = this.uniforms, shown = this.fill.visible;
    const gl = this.livingGoal - u.uLiving.value;
    if (gl !== 0) { u.uLiving.value = Math.abs(gl) < 0.002 ? this.livingGoal : u.uLiving.value + gl * -Math.expm1(-dt / LIVING_TAU); }
    let moving = gl !== 0;
    if (gl !== 0) { this.syncBack(); this.applyThick(); }
    if (!shown) { this.levelWas = NaN; return moving; }
    const sh = this.shared;
    if (sh) { this.localEye.copy(sh.restEye.value); this.group.worldToLocal(this.localEye); u.uRestEye.value.copy(this.localEye); u.uOff.value = sh.offRest.value; }
    const calm = this.still;
    // the ripple: 2D's phase, advanced by the eased flow rate (a pause settles it over the flow's own half second)
    if (!calm && flowRate > 0.001) { this.phase = (this.phase + (dt / RIPPLE_PERIOD) * flowRate) % RIPPLE_WRAP; moving = true; }
    u.uPhase.value = this.phase;
    u.uAmp.value = calm ? 0 : this.amp;
    // the slosh: the level's speed (2D units/s) swings the surface; scaled by the pool's depth so a first film does not tilt
    const rise = Number.isFinite(this.levelWas) && dt > 0 ? (this.levelWas - this.levelNow) / dt : 0;
    this.levelWas = this.levelNow;
    if (calm) { this.swing.x = this.swing.v = 0; }
    else { sloshStep(this.swing, rise, dt, Math.min(1, this.levelH / 60)); if (this.swing.x !== 0 || this.swing.v !== 0) moving = true; }
    u.uSlosh.value = this.swing.x;
    return moving;
  }
  private levelH = 0;
  /** The wall's bulge in 2D units shown now (the bowel floats up with it: bowel group moves by 26/34 of it). */
  bulge = 0;
  /** `ml` is the shown (sprung) volume. Returns true when the picture changed. */
  set(ml: number): boolean {
    const fade = poolFade(ml), step = bulgeStep(ml);
    this.bulge = step / 2;
    const { h, amp } = fluidLevel(ml);
    this.amp = amp; this.levelH = h;
    const show = fade > 0;
    this.poolA = fade; this.apply();
    if (!show) { this.surface = null; return false; }
    this.surface = fluidBase(712, h);
    this.levelNow = this.surface;
    const relay = !(Math.abs(h - this.lastH) < 0.25 && step === this.lastStep);
    if (relay) {
      this.lastH = h; this.lastStep = step;
      const poly = polyOf(step);
      let ymin = Infinity; for (const q of poly) ymin = Math.min(ymin, q[1]);
      this.hull.lay(poly, (x) => Math.max(fluidBase(x, h), ymin));   // (the hull, from the cavity's outline under the surface; preallocated: nothing is made per call)
    }
    const was = this.thick.tf;
    this.applyThick();
    return relay || Math.abs(this.thick.tf - was) > 1e-5;
  }
  /** Whether a 2D point is in the pool: inside the belly's wall and below the surface (2D stage-hover.js organAt: `wy > fluidSurf(wx)` inside the abdomen). False while there is none. */
  holds(x: number, y: number): boolean {
    if (this.poolA <= 0 || this.body < 0.5 || !Number.isFinite(this.lastH)) return false;
    const cr = crossings(polyOf(this.lastStep), x);
    return !!cr && y <= cr[1] && y > Math.max(fluidBase(x, this.lastH), cr[0]);
  }
  /** What a tap hits: the hull, by the ray walked through its depth (hullHit, pure JS: no mesh raycast, no geometry pushed and put back). Returns the hit's 2D point when it lies in the water (`holds`), else null. */
  pick(raycaster: Raycaster): { x: number; y: number } | null {
    if (!this.fill.visible) return null;
    this.group.updateWorldMatrix(true, false);
    const inv = new Matrix4().copy(this.group.matrixWorld).invert(), r = raycaster.ray;
    const o = r.origin.clone().applyMatrix4(inv), d = r.direction.clone().transformDirection(inv);
    return hullHit({ origin: o, direction: d }, this.uniforms.uRestEye.value, this.hull, (x, y) => this.holds(x, y), this.thick);
  }
  dispose(): void { this.hull.dispose(); for (const m of this.mats) m.dispose(); }
}

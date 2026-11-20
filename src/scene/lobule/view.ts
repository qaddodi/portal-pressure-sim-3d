// The lobule's host: its network (built once from the same layout the 2D app draws, geometry.ts), the model's state eased toward the engine's frame, the layers and their fades, the lens's
// ink context, the wedge's wash, what a tap lands on (2D's own rule, pick.ts), the halo on a tapped part (mark.ts) and the out-of-focus neighbouring lobules (field.ts). It draws nothing
// of the lobule itself: every vessel, cell and mouth is the 3D lobule's (micro3d/lobule3d.ts), which reads its state from here (Mohammad 20 Nov 2026: "remove the 2D stuff from the code").
//
//   const lobule = new LobuleView(cel.shared, { look });           cel.scene.add(lobule.group);
//   lobule.setVisible(true);                                       // the view is on (nothing is stepped while it is off)
//   lobule.setModel(lobuleModel(frame, healthy));                  // from the engine frame; states ease in, nothing jumps
//   lobule.setLayers({ lymph: true, zones: false });               // the toolbar's Layers (the 2D app starts with lymph on)
//   lobule.startWash(now) / stopWash();                            // HVPG slide 5: the wedge's amber from the central vein out
//   lobule.update(now) → true while anything moves                 // called by the scene, in the clock's order
import { type Camera, type Group, Matrix4, Plane, type Ray, Vector3 } from 'three';
import type { CelShared } from '../materials/cel.ts';
import { highlightColour } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { FLOW_FADE_MS } from '../flow.ts';
import type { LensId } from '../lenses/model.ts';
import type { V3 } from './shots.ts';
import { type LobuleHit, type PickTube, lobuleHit } from './pick.ts';
import { buildBile } from './bile.ts';
import { type Course, type LobuleNet, buildLobule } from './geometry.ts';
import { type LobuleModel, easeToward, lymphProtein, lymphRate, lymphSeal, smooth } from './model.ts';
import { LOBULE_PALETTES } from './tones.ts';
import { LOBULE_R, lobuleToScene, slabZ } from './shots.ts';
import { LobuleMark } from './mark.ts';
import { lobuleWorld } from './frames.ts';
import type { InkContext } from './ink.ts';
import { washProgress } from './wash.ts';
import { NeighbourField, fieldQuantizer } from './field.ts';
import { DISC_R, DUCT_R, LT_R, RS_N, congShare, inletRadius, lyTaper, sinRadius, twigR } from './widths.ts';
import { endTaper } from './lymph.ts';
import { defaultCanvas, type MakeCanvas } from './plate.ts';
import { LobuleFade, LobuleRoot } from './one-fade.ts';

/** Tags hang just over the plate (it is flat: a point any higher would slide against the tissue as the view turns). */
const ANCHOR_Z = 0.05;
const R = LOBULE_R;
/** The Bile layer's widest canaliculus and its canals of Hering (lobule radii; 2D lobule-bile.js). */
const BC_R = 0.0036, BH_R = 0.0075;
/** 2D's three dark shares of a sinusoid kind that congestion widens (zone 3: 1 - smooth(0.24, 0.56, rho), at the middle of each generation): radiusAt's `1 + 1.5 congU z3`. */
/** Ids of the Bile layer's vessels for picking. */
const BILE_ID = 2_000_000;
/** 2D's lymphatic caliber against the healthy flow (lobule-zoom-field.js lyWr): 1 at a normal rate. */
const lyWr = (lr: number, k: number) => 1 + k * smooth(1, 4, lr) - 0.12 * (1 - smooth(0.3, 1, lr));

export interface LobuleLayers { lymph: boolean; zones: boolean; bile: boolean }
export interface LobuleViewOptions { look?: LookId; reduceMotion?: boolean; canvas?: MakeCanvas }
/** How long the surround takes to grey (or come back) when the lens changes (2D: the lens crossfade). */
const GREY_MS = 350;

/** The eased scalars the 3D lobule reads (all move toward the model's targets). */
export interface Cur {
  fibSin: number; fibPre: number; fibPost: number; congU: number; septU: number; act: number; lum: number;
  flow: number; portal: number; art: number; lymphRate: number; seal: number; prot: number;
}
const REST: Cur = { fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, septU: 0, act: 0, lum: 1, flow: 1, portal: 1, art: 1, lymphRate: 1, seal: 0, prot: 1 };

export class LobuleView {
  /** The halo and the neighbouring field (the lobule itself is the 3D lobule's group). */
  /** The ONE fade of everything in this group (one-fade.ts): the lobule's tiles, tubes, marks, plate and the neighbours' ground all read it, and `group.setFade` is its only writer. */
  readonly fade = new LobuleFade();
  readonly group = new LobuleRoot(this.fade);
  readonly net: LobuleNet;
  private lens: LensId = 'pressure';
  private ref: ArrayLike<number> | null = null;
  private model: LobuleModel | null = null;
  readonly cur: Cur = { ...REST };
  private goal: Cur = { ...REST };
  private layers: LobuleLayers = { lymph: true, zones: false, bile: true };
  /** The layers' fades, 0..1 (each eases over FLOW_FADE_MS: nothing pops). */
  lyFade = 1;
  bileFade = 0;
  zoneFade = 0;
  /** The Bile layer's vessels (the canaliculi between plates, the canals of Hering) as things a tap can land on. */
  private readonly bilePick: PickTube[] = [];
  /** The surround's grey (a lens other than Pressure greys the neighbouring lobules as it greys the anatomy's liver), eased. */
  private greyK = 0;
  /** The out-of-focus neighbours. */
  readonly field: NeighbourField;
  /** The halo on the part the learner tapped (mark.ts). */
  private mark: LobuleMark;
  private readonly fsQ = fieldQuantizer();
  private visible = false;
  private lastNow = -1;
  look: LookId;
  private reduce: boolean;
  private washAt = -1;
  private washOn = false;
  private washK = 0;
  dirty = true;

  constructor(_shared: CelShared, opts: LobuleViewOptions = {}, net: LobuleNet = buildLobule()) {
    this.net = net;
    this.look = opts.look ?? 'light';
    this.reduce = !!opts.reduceMotion;
    const mk = opts.canvas ?? defaultCanvas;
    this.field = new NeighbourField((w, h) => { const c = mk(1); if (c) { c.width = w; c.height = h; } return c; });
    this.field.mesh.name = 'lobule/field';
    this.group.add(this.field.mesh);
    for (const c of buildBile(net)) this.bilePick.push({ id: BILE_ID + this.bilePick.length, kind: c.kind, pts: c.pts, ...(c.tri != null ? { tri: c.tri } : {}) });
    this.mark = new LobuleMark(this.group);
    this.applyLook(this.look);
    this.group.visible = false;
  }

  // ---- looks ----------------------------------------------------------------------------------------------------------------------

  applyLook(look: LookId): void {
    this.look = look; this.mark.setColour(highlightColour(LOBULE_PALETTES[look], 'portal')); this.dirty = true;
  }

  // ---- what the slide and the model say -------------------------------------------------------------------------------------------

  setVisible(v: boolean): void {
    this.visible = v; this.group.visible = v; this.dirty = true; if (!v) { this.washOn = false; this.washK = 0; }
    if (v) { this.wantTissue(); this.greyK = this.greyGoal(); this.field.setGrey(this.greyK); }
  }
  get isVisible(): boolean { return this.visible; }

  /** Targets from the engine's frame (lobuleModel). They ease in; nothing jumps. */
  setModel(m: LobuleModel): void {
    this.model = m;
    const g = this.goal;
    g.fibSin = m.fibSin; g.fibPre = m.fibPre; g.fibPost = m.fibPost; g.congU = m.congU; g.septU = m.septU; g.act = m.act;
    g.lum = m.zone.sin ** -0.12;   // (2D radiusAt: the sinusoid's width is / sin^0.12 and, by zone 3's share of each generation, x (1 + 1.5 congU))
    g.flow = m.rev.sin ? -Math.abs(m.flow) : Math.abs(m.flow);
    g.portal = m.rev.pre ? -Math.abs(m.portal) : Math.abs(m.portal);
    g.art = Math.abs(m.art);
    g.lymphRate = Math.min(6, Math.max(0.2, lymphRate(m)));
    g.seal = lymphSeal(m); g.prot = lymphProtein(m);
    this.dirty = true;
  }
  /** The state at once, no ease (the view opens on the first frame already as the model has it). */
  snapModel(m: LobuleModel): void { this.setModel(m); Object.assign(this.cur, this.goal); this.dirty = true; }

  setLayers(l: Partial<LobuleLayers>): void { this.layers = { ...this.layers, ...l }; this.dirty = true; }
  get currentLayers(): Readonly<LobuleLayers> { return this.layers; }

  /** The colour lens the vessels wear (the Layers menu's, as the 2D lobule colours its lumen by it). */
  setLens(lens: LensId): void { if (lens === this.lens) return; this.lens = lens; this.dirty = true; }
  get currentLens(): LensId { return this.lens; }
  /** Every lens but Pressure (and the neutral one) greys the anatomy's organs; the neighbouring lobules take the same grey (2D: surroundGrade). */
  private greyGoal(): number { return this.lens !== 'pressure' && this.lens !== ('neutral' as LensId) ? 1 : 0; }
  /** The tissue the field should show: the model's targets (painted once per state, not every eased frame). */
  private wantTissue(): void { this.field.want(this.look, this.fsQ(this.goal)); }
  /** The node pressures the Change, Congestion and `since` lenses count from (the healthy patient's, a pinned moment's, a slide's). */
  setReference(ref: ArrayLike<number> | null): void { this.ref = ref; this.dirty = true; }
  /** What the vessels' colour is worked out from now (the sinusoid view colours its lumen the same way); null before the first model. */
  inkContext(): InkContext | null { return this.model ? { lens: this.lens, look: this.look, model: this.model, ref: this.ref, fibSin: this.cur.fibSin } : null; }

  /** The wedge's wash begins counting from when the view landed. Only a slide that says `wash` turns it on. */
  startWash(landedAtMs: number): void { this.washOn = true; this.washAt = landedAtMs; this.dirty = true; }
  stopWash(): void { this.washOn = false; this.washK = 0; this.dirty = true; }
  get washProgress(): number { return this.washK; }

  // ---- the frame ------------------------------------------------------------------------------------------------------------------

  /** Steps the state on the clock. Returns true while anything moves (a state easing, the wash, a fade): the scene draws another frame. */
  update(now: number): boolean {
    if (!this.visible) { this.lastNow = -1; return false; }
    const dt = this.lastNow < 0 ? 16 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    let moving = this.dirty;
    this.dirty = false;
    if (easeToward(this.cur as unknown as Record<string, number>, this.goal as unknown as Record<string, number>, this.reduce ? 1e6 : dt)) moving = true;
    // the layers fade in and out (the ducts shrink to nothing, never pop)
    const k = this.reduce ? 1 : Math.min(1, dt / FLOW_FADE_MS);
    const step = (v: number, goal: number) => (Math.abs(goal - v) <= k ? goal : v + Math.sign(goal - v) * k);
    const ly = this.layers.lymph ? 1 : 0, bi = this.layers.bile ? 1 : 0, zo = this.layers.zones ? 1 : 0;
    if (this.lyFade !== ly || this.bileFade !== bi || this.zoneFade !== zo) { this.lyFade = step(this.lyFade, ly); this.bileFade = step(this.bileFade, bi); this.zoneFade = step(this.zoneFade, zo); moving = true; }
    if (this.mark.step(dt, this.reduce)) moving = true;
    this.wantTissue();
    const gGoal = this.greyGoal();
    if (this.greyK !== gGoal) { const gk = this.reduce ? 1 : dt / GREY_MS; this.greyK = Math.abs(gGoal - this.greyK) <= gk ? gGoal : this.greyK + Math.sign(gGoal - this.greyK) * gk; this.field.setGrey(this.greyK); moving = true; }
    if (this.washOn) { const kk = washProgress(now - this.washAt, this.reduce); if (kk !== this.washK) { this.washK = kk; moving = true; } if (kk < 1) moving = true; }
    return moving;
  }

  /** A vessel's radius at its sample i as drawn now, in lobule radii: 2D's radiusAt (widths.ts) with the state's widening and narrowing. */
  radiusNow(t: PickTube, i: number): number {
    const c = this.cur, k = t.kind, n = t.pts.length;
    if (k === 's0' || k === 's1' || k === 's2' || k === 'an') { const rho = (t as Course).rho[i]!; return sinRadius(k, rho) * c.lum * (1 + 1.5 * c.congU * congShare(rho)); }
    if (k === 'in') return inletRadius(i, n, Math.hypot(t.pts[i]![0] - t.pts[0]![0], t.pts[i]![1] - t.pts[0]![1])) / (1 + 0.45 * c.fibPre);
    if (k === 'tw') return twigR(i / (n - 1), RS_N);
    if (k === 'lt' || k === 'lv') return LT_R * lyWr(c.lymphRate, 0.4);
    if (k === 'ly') return DUCT_R * lyTaper((t as Course).rho[i]!) * endTaper(t as Course, i) * lyWr(c.lymphRate, 0.45);
    if (k === 'bs') return BC_R;
    return BH_R;
  }
  /** How much each sinusoid generation is widened (congested zone 3) or narrowed (capillarized) now, as a share of its healthy radius. */
  /** The sinusoids' widening now: radius x (whole + share x congShare(rho)) (widths.ts), the same at every place along every course. */
  /** A sinusoid's share of its healthy radius now at rho. */
  sinScaleAt(rho: number): number { return this.cur.lum * (1 + 1.5 * this.cur.congU * congShare(rho)); }
  get sinSwell(): { whole: number; share: number } { return { whole: this.cur.lum - 1, share: this.cur.lum * 1.5 * this.cur.congU }; }
  /** The inlet venules' share of their healthy radius (they narrow with pre-sinusoidal fibrosis). */
  get inletScale(): number { return 1 / (1 + 0.45 * this.cur.fibPre); }

  /** The central vein's radius as drawn now (lobule radii). */
  get cvRadiusNow(): number { return (DISC_R.cv + 0.05 * this.cur.congU) * (1 - 0.3 * this.cur.fibPost); }

  /** What a tap at lobule-plane point (x, y) (lobule radii, y down) is, with `pxPerR` screen pixels to a radius (2D's own rule, pick.ts). */
  hit(x: number, y: number, pxPerR: number): LobuleHit | null {
    return lobuleHit(this.net, [...this.net.courses, ...this.bilePick], {
      septU: this.cur.septU, lymphOn: this.layers.lymph, bileOn: this.layers.bile, radius: (t, i) => this.radiusNow(t, i), cvRadius: this.cvRadiusNow, pxPerR,
    }, x, y);
  }

  /** The hit under a world ray (the plate lies in the group's z = 0): the ray's point on the plate in lobule radii, and the screen pixels to a radius there, from the camera and the canvas size. */
  hitRay(ray: Ray, camera: Camera, canvas: { w: number; h: number }): LobuleHit | null {
    this.group.updateWorldMatrix(true, false);
    const inv = new Matrix4().copy(this.group.matrixWorld).invert();
    const local = ray.clone().applyMatrix4(inv), at = local.intersectPlane(new Plane(new Vector3(0, 0, 1), 0), new Vector3());
    if (!at) return null;
    const x = at.x / R, y = -at.y / R;
    // screen pixels to a lobule radius: two points a radius apart on the plate, projected
    const a = new Vector3(at.x, at.y, 0).applyMatrix4(this.group.matrixWorld).project(camera), b = new Vector3(at.x + R, at.y, 0).applyMatrix4(this.group.matrixWorld).project(camera);
    const pxPerR = Math.max(1e-3, Math.hypot((b.x - a.x) * canvas.w * 0.5, (b.y - a.y) * canvas.h * 0.5));
    return this.hit(x, y, pxPerR);
  }

  // ---- tags, the halo, warming ----------------------------------------------------------------------------------------------------

  /** Scene (world) points of the places tags name: the centre, each triad ('triad:0' to 'triad:5'), the zones ('zone:1' periportal, 'zone:2' midzonal, 'zone:3' pericentral).
   *  The lobule stands inside the liver, so these are points of the liver, a hundred times closer together than the lobule's own units. */
  anchor(name: string, out: V3 = [0, 0, 0]): V3 {
    const w = (x: number, y: number, z: number) => lobuleWorld(lobuleToScene(x, y, z, out), out);
    if (name === 'centre') return w(0, 0, slabZ(0, 0) + ANCHOR_Z);
    if (name.startsWith('triad:')) { const t = this.net.triads[Number(name.slice(6))]; if (t) return w(t.x, t.y, slabZ(t.x, t.y) + ANCHOR_Z); }
    if (name.startsWith('zone:')) { const rr = { 1: 0.82, 2: 0.5, 3: 0.2 }[Number(name.slice(5)) as 1 | 2 | 3] ?? 0.5; return w(Math.cos(Math.PI / 6) * rr, Math.sin(Math.PI / 6) * rr, slabZ(0.7, 0.4) + ANCHOR_Z); }
    return w(0, 0, 0);
  }
  /** A point of the plate (its own units, the plane the labels stand on) in the scene. */
  anchorAt(x: number, y: number, out: V3 = [0, 0, 0]): V3 { return lobuleWorld(lobuleToScene(x, y, slabZ(x, y) + ANCHOR_Z, out), out); }

  /** Compiles the view's programs and uploads its buffers once, ahead of the dive (call at idle after boot, with the scene's renderer): the first open then draws without a hitch. */
  warm(gl: { compile?: (s: Group, c: unknown) => void }, camera: unknown): void {
    const was = this.group.visible;
    this.group.visible = true;
    try { gl.compile?.(this.group, camera); } finally { this.group.visible = was; }
  }

  /** Marks the part a tap landed on (null lets it go): a halo of its own shape that fades in and out. */
  setMark(hit: LobuleHit | null): void {
    this.mark.set(hit, { net: this.net, tubes: [...this.net.courses, ...this.bilePick], cvRadius: this.cvRadiusNow, septU: this.cur.septU, radius: (t, i) => this.radiusNow(t, i) });
    this.dirty = true;
  }

  dispose(): void { this.mark.dispose(); this.field.dispose(); }
}

import { Color, type DataTexture, Group, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { BODY_PLATE_Z, ORGANS, VARICES, blob, bodyPlateGeometry } from './anatomy/placeholder.ts';
import { buildVessel } from './anatomy/vessels.ts';
import { NETWORK, type NetVessel, courseOf, presenceOf } from './vessels/network.ts';
import { PresenceTracks } from './vessels/presence-track.ts';
import { VesselObject } from './vessels/vessel-object.ts';
import { LensField } from './lenses/field.ts';
import type { LensId } from './lenses/model.ts';
import { BloodMarks, type BloodOptions } from './blood/marks.ts';
import { BloodField } from './blood/field.ts';
import { CameraRig } from './camera/rig.ts';
import type { Room } from './camera/room.ts';
import { SHOTS, type Shot, type ShotName } from './camera/shots.ts';
import { Catheter, type CatheterState } from './catheter.ts';
import { DEFAULT_FLOW_MODE, type FlowMarkMode, markSpeed } from './flow.ts';
import { Highlight } from './highlight.ts';
import { CelObject, type CelShared, createShared } from './materials/cel.ts';
import { type LookId, PALETTES, type Palette } from './palette.ts';
import { EDGES } from '../engine/hales/portal/topology.js';
import { TEXTURE_WIDTH, indexOf } from '../engine/vessel-data.ts';
import { latest, patient } from '../engine/store.ts';
import { LobuleView, lobuleModel, sinusoidTargets, type LobuleLayers } from './lobule/index.ts';
import { SinusoidView } from './sinusoid/index.ts';
import { ProcedureLayer } from './procedures/layer.ts';

/** What the figure shows: the body, the liver lobule (hexagon) or one sinusoid. The two small views stand away from the body in the same scene. */
export type FigureView = 'body' | 'lobule' | 'sinusoid';

// The cel-shaded scene for the HVPG slice, as plain three.js so the clock (src/clock/) owns the one frame loop and the R3F Stage is
// only the canvas around it. Order inside a frame, set by the clock: engine frame, tweens, camera, render, tag positions.
//   scene.update(now)  steps the highlight, flow marks, camera tween and catheter; returns true while anything moves (draw another frame)
//   scene.render(gl)   draws
// Nothing here starts its own loop.

/** Baseline engine flows (mL/s, topology Q) the scene shows until an engine frame binds real data. */
const STUB_Q: Record<string, number> = {
  V_SPL: 5, SV_MID: 5, SV_CONF: 6.7, SMV_CONF: 10, LGV_CONF: 1.6, PV_TRUNK: 18.3, PVH_R: 11, PVH_L: 7.3,
  RHV_IVC: 9, MHV_IVC: 8.2, LHV_IVC: 7, IVC_IS: 34.3, IVCS_RA: 59.3, SVC_RA: 24,
};

/** Healthy diameter of every topology edge (mm), the reference the engine's live diameter swells against. */
const BASE_D = new Map<string, number>((EDGES as { id: string; d?: number }[]).map((e) => [e.id, e.d ?? 1]));

export interface SceneOptions {
  look?: LookId;
  phone?: boolean;
  flowMode?: FlowMarkMode;
  reduceMotion?: boolean;
}

export class CelScene {
  readonly scene = new Scene();
  /** Everything of the body (plate, organs, vessels, catheter): hidden as one while the lobule or the sinusoid is the view. */
  private readonly body = new Group();
  readonly rig: CameraRig;
  readonly shared: CelShared = createShared();
  readonly objects: CelObject[] = [];
  readonly vessels: CelObject[] = [];
  readonly catheter: Catheter;
  /** Every device a procedure puts on the figure (B5): the catheters on their routes, the stent, the tamponade tube, bands. */
  readonly procs: ProcedureLayer;
  readonly highlight: Highlight;
  readonly flow: BloodMarks;
  /** The colour lens (src/scene/lenses/): what colour every vein wears, crossfaded on the clock. */
  readonly lens = new LensField();
  /** The blood's streams (the chevrons' distance, speed and reversed flag, from the 2D app's own stream model). */
  readonly blood = new BloodField();
  /** The lobule and sinusoid views (B8), built once, hidden until the view is chosen (setView). */
  readonly lobule: LobuleView;
  readonly sinus: SinusoidView;
  private figureView: FigureView = 'body';
  private presence!: PresenceTracks;
  private collateralsOn = false;
  private readonly plate: Mesh;
  private readonly byEdge = new Map<string, CelObject>();
  private look: LookId;
  private phone: boolean;
  private lastNow = -1;
  private width = 1;
  private height = 1;
  private moving = true; // the first frame always draws

  constructor(opts: SceneOptions = {}) {
    this.look = opts.look ?? 'light';
    this.phone = !!opts.phone;
    this.rig = new CameraRig('title', undefined, opts.reduceMotion);

    this.plate = new Mesh(bodyPlateGeometry(), new MeshBasicMaterial({ color: PALETTES[this.look].body }));
    this.plate.position.z = BODY_PLATE_Z;
    this.scene.add(this.body);
    this.body.add(this.plate);

    for (const def of ORGANS) {
      const o = new CelObject(def.geometry(), { tone: def.tone, bands: 3, spec: 0, px: def.px }, this.shared);
      if (def.position) o.group.position.set(...def.position);
      if (def.rotation) o.group.rotation.set(...def.rotation);
      this.add(o);
    }
    for (const def of NETWORK) this.addVessel(def);
    for (const v of VARICES) {
      const o = new CelObject(blob(v.r, v.r, v.r, 0, 0, 14), { tone: 'portal', bands: 2, spec: 1, px: 1 }, this.shared);
      o.group.position.set(0.48 + Math.cos(v.angle) * 0.12, v.y, -0.12 + Math.sin(v.angle) * 0.12);
      this.add(o);
    }
    this.catheter = new Catheter(this.shared);
    this.body.add(this.catheter.group);
    this.objects.push(...this.catheter.objects);
    this.procs = new ProcedureLayer(this.shared);
    this.body.add(this.procs.group);

    this.highlight = new Highlight(this.vessels, undefined, new Map(NETWORK.map((v) => [v.id, v.host])));
    this.flow = new BloodMarks(this.vessels);
    this.presence = new PresenceTracks(this.vessels as VesselObject[]);
    this.lens.setContext({ healthy: null, ref: null });
    const vo = { look: this.look, phone: this.phone, flowMode: opts.flowMode ?? DEFAULT_FLOW_MODE, reduceMotion: opts.reduceMotion };
    this.lobule = new LobuleView(this.shared, vo); this.sinus = new SinusoidView(this.shared, vo);
    this.scene.add(this.lobule.group, this.sinus.group);
    this.lobule.setVisible(false); this.sinus.setVisible(false);
    this.applyLook(this.look);
  }

  private add(o: CelObject): void { this.objects.push(o); this.body.add(o.group); }

  private addVessel(def: NetVessel): void {
    const built = buildVessel({ ...def, tone: def.tone === 'artery' ? 'portal' : def.tone });
    const q = STUB_Q[def.id] ?? 1;
    const o = new VesselObject(built.geometry, {
      tone: def.tone, artery: def.tone === 'artery', lensIndex: indexOf(def.id), widthKind: def.widthKind, bands: 2, spec: 1, px: def.kind === 'liver' ? 0.9 : def.tone === 'artery' ? 1 : 1.2,
      vessel: { index: indexOf(def.id), len: built.length, stubSpeed: markSpeed(q), radius: def.radius, baseD: def.baseD },
    }, this.shared, this.lens.shared, this.blood.shared);
    o.edge = { id: def.id, from: def.from, to: def.to, length: built.length };
    this.add(o);
    this.vessels.push(o);
    this.byEdge.set(def.id, o);
  }

  /** The vessel object of an edge, or undefined. */
  vesselObject(id: string): VesselObject | undefined { return this.byEdge.get(id) as VesselObject | undefined; }

  // ---- looks ---------------------------------------------------------------------------------

  get currentLook(): LookId { return this.look; }
  get palette(): Palette { return PALETTES[this.look]; }

  applyLook(look: LookId): void {
    this.look = look;
    const p = PALETTES[look];
    (this.plate.material as MeshBasicMaterial).color.set(p.body);
    for (const o of this.objects) { o.applyPalette(p); o.setPhone(this.phone); }
    this.procs.applyPalette(p);
    this.lens.setLook(look);
    this.lobule.applyLook(look); this.sinus.applyLook(look);
    this.moving = true;
  }

  /** The canvas ground, for the renderer's clear colour. */
  get background(): Color { return new Color(PALETTES[this.look].bg); }

  setPhone(phone: boolean): void {
    this.phone = phone;
    for (const o of this.objects) o.setPhone(phone);
    this.procs.setPhone(phone);
    this.lobule.setPhone(phone); this.sinus.setPhone(phone);
    this.moving = true;
  }

  // ---- engine data ---------------------------------------------------------------------------

  /** Reads flow, pressure and diameter from the engine's per-vessel texture (src/engine/vessel-data.ts) from now on; null goes back to the stub. */
  bindData(texture: DataTexture | null): void {
    for (const o of this.vessels) o.setUseData(!!texture);
    if (texture) {
      this.shared.vdata.value = texture;
      this.shared.vdataSize.value.set(TEXTURE_WIDTH, 1);
    }
    this.moving = true;
  }

  /** Call after the texture's data changed, so the next frame draws. */
  dataChanged(): void {
    const f = latest.frame;
    this.lens.onFrame(f);
    this.blood.streams.onFrame(f);
    if (f) this.syncPresence(f, !this.sawFrame);
    this.sawFrame = !!f;
    if (this.figureView !== 'body') this.feedViews(false);
    this.moving = true;
  }
  private sawFrame = false;

  /** Which vessels are drawn now (a collateral opens by its flow and size; the 2D figure's rules, network.ts presenceOf). */
  private syncPresence(f: NonNullable<typeof latest.frame>, instant: boolean): void {
    for (const v of NETWORK) this.presence.set(v.id, presenceOf(v, f, { collaterals: this.collateralsOn }), instant || f.jump);
    const rexOn = this.presence.stateOf('REX') === 'shown';
    if (rexOn !== this.procs.isRexUnder) this.procs.setRexUnder(rexOn, (id) => this.vesselObject(id));
    this.flow.setDrawn((id) => this.presence.stateOf(id) === 'shown', (id) => this.presence.stateOf(id) === 'shown' && NETWORK.some((v) => v.id === id && v.kind === 'collateral'));
  }

  // ---- lens and blood ------------------------------------------------------------------------

  /** Colour the veins by a lens (the Layers menu's ten, a deck's 'system' and 'since', or 'neutral' for the plain anatomy). */
  setLens(lens: LensId, now: number, instant = false): void { this.lens.setLens(lens, now, instant); this.moving = true; }
  /** The healthy patient at rest (the engine's `healthyProfile`): the reference the change, congestion, velocity and direction lenses compare to. */
  setHealthy(h: { P: ArrayLike<number>; Q: ArrayLike<number>; D: ArrayLike<number> }): void {
    this.lens.setContext({ healthy: { Q: h.Q, D: h.D, P: h.P }, ref: Float32Array.from(h.P) });
    this.blood.streams.setHealthy(h);
    this.moving = true;
  }
  /** Count Change and Congestion from a pinned moment's node pressures (Compare > Change), or from the healthy patient again (null). */
  setLensRef(P: ArrayLike<number> | null): void { this.lens.setRef(P); this.moving = true; }
  /** The Blood menu: chevrons on or off, key routes only, and potential collaterals (dotted routes). */
  setBlood(o: Partial<BloodOptions> & { collaterals?: boolean }): void {
    if (o.collaterals !== undefined && o.collaterals !== this.collateralsOn) {
      this.collateralsOn = o.collaterals;
      if (latest.frame) this.syncPresence(latest.frame, false);
    }
    const patch: Partial<BloodOptions> = {};
    if (o.chevrons !== undefined) patch.chevrons = o.chevrons;
    if (o.keyChevrons !== undefined) patch.keyChevrons = o.keyChevrons;
    if (o.presenting !== undefined) patch.presenting = o.presenting;
    this.flow.setOptions(patch);
    this.moving = true;
  }

  // ---- slide state ---------------------------------------------------------------------------

  goTo(shot: ShotName | Shot, room: Room, now: number, ms?: number): void { this.rig.goTo(shot, room, now, ms); this.moving = true; }

  /** The deck's catheter (route, free, wedge, hvpg): drawn by the procedure layer on the HVPG route of the 2D figure, so it is the same device the Tests card plays. The slice catheter keeps the state
   *  (the labels read its tip) and draws nothing. */
  setCatheter(s: CatheterState & { ring?: 'free' | 'wedge' | 'bad' | null }): void {
    this.catheter.set(s);
    this.catheter.group.visible = false;
    this.procs.showHvpgState(this.catheter.current.advance, this.catheter.current.balloon, s.ring ?? null, performance.now());
    this.moving = true;
  }

  /** The vessels a slide talks about (they carry flow marks in option A), by edge ID. The picked vessel is always included. */
  setNamedVessels(ids: readonly string[]): void {
    // a vein the engine cuts in pieces is one vein: naming any piece (or the host) names them all
    const hosts = new Set(ids.map((id) => NETWORK.find((v) => v.id === id)?.host ?? id));
    this.named = new Set(NETWORK.filter((v) => hosts.has(v.host)).map((v) => v.id));
    this.syncNamed();
  }
  private named = new Set<string>();
  private syncNamed(): void {
    const ids = new Set(this.named);
    const picked = this.highlight.picked;
    if (picked) { const host = NETWORK.find((v) => v.id === picked)?.host; for (const v of NETWORK) if (v.host === host) ids.add(v.id); }
    this.moving = true;
  }

  /** Free play: pick a vessel by edge ID (or clear it with null). */
  pick(id: string | null): void { this.highlight.set(id); this.syncNamed(); }

  /** (The 2D app has one style of flow head; the four options of the first slice are gone. Kept for the views that still take a mode.) */
  setFlowMode(mode: FlowMarkMode): void { this.lobule.setFlowMode(mode); this.sinus.setFlowMode(mode); this.moving = true; }

  // ---- the figure's view: body, lobule, sinusoid ---------------------------------------------

  get view(): FigureView { return this.figureView; }
  /** Show the body, the lobule or the sinusoid: the others are hidden and cost nothing (nothing is built or compiled here; the views were made at start). The camera is the caller's. */
  setView(v: FigureView): void {
    this.figureView = v;
    // the view being left stays drawn until the camera has landed on the new one (nothing pops while it flies); then it is hidden
    this.body.visible ||= v === 'body';
    if (v === 'lobule') this.lobule.setVisible(true);
    if (v === 'sinusoid') this.sinus.setVisible(true);
    this.hideLeftBehind = true;
    if (v !== 'body') this.feedViews(true);
    this.moving = true;
  }
  private hideLeftBehind = false;
  private settleViews(): void {
    const v = this.figureView;
    this.body.visible = v === 'body';
    this.lobule.setVisible(v === 'lobule'); this.sinus.setVisible(v === 'sinusoid');
    this.hideLeftBehind = false;
  }
  /** The model's state into the small views (from the engine's newest frame, the healthy reference and the patient's parameters); `snap` shows it at once. */
  private feedViews(snap: boolean): void {
    const f = latest.frame;
    if (!f) return;
    const m = lobuleModel({ P: f.P, Q: f.Q, params: patient.params ?? undefined, metrics: f.metrics }, patient.reference, patient.params);
    if (this.figureView === 'lobule') snap ? this.lobule.snapModel(m) : this.lobule.setModel(m);
    else if (this.figureView === 'sinusoid') snap ? this.sinus.snapTargets(sinusoidTargets(m)) : this.sinus.setTargets(sinusoidTargets(m));
  }
  setLobuleLayers(l: Partial<LobuleLayers>): void { this.lobule.setLayers(l); this.moving = true; }

  /** The vessel whose body a pointer ray hits first, for tap-to-pick. */
  pickAt(x: number, y: number, raycaster: Raycaster): string | null {
    if (this.figureView !== 'body') return null;
    raycaster.setFromCamera(new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.rig.camera);
    const hits = raycaster.intersectObjects(this.vessels.map((v) => v.toonMesh), false);
    for (const h of hits) {
      const o = this.vessels.find((v) => v.toonMesh === h.object);
      if (o) return o.edge!.id;
    }
    return null;
  }

  /** Scene point of a named place, for tags and pins: a point on the 2D figure's own vessel, carried by the one map (frame2d.ts), so a tag sits on the vein. */
  anchor(name: 'tip' | 'ra' | 'ivc' | 'rhv' | 'pv' | 'spleen', out = new Vector3()): Vector3 {
    if (name === 'tip') return this.catheter.curve.getPointAt(1, out);
    const [id, at] = ANCHORS[name];
    const c = courseOf(id), p = c[Math.round(at * (c.length - 1))]!;
    return out.set(p[0], p[1], p[2]);
  }

  // ---- the frame -----------------------------------------------------------------------------

  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.shared.res.value.set(width, height);
    this.rig.resize(width, height);
    this.moving = true;
  }

  /** Steps everything on the clock. Returns true while the scene moves, so the clock asks for another frame; false means draw nothing. */
  update(now: number): boolean {
    const dt = this.lastNow < 0 ? 16 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    this.shared.time.value = (now / 1000) % 1000;
    const camMoving = this.rig.update(now);
    if (this.hideLeftBehind && !camMoving) this.settleViews();
    const hiMoving = this.highlight.step(dt);
    this.blood.shared.projY.value = this.rig.camera.projectionMatrix.elements[5]!;
    const flowActive = this.flow.step(dt) || this.blood.streams.step(now);
    const lensMoving = this.lens.step(now);
    const presMoving = this.presence.step(dt);
    const viewMoving = this.lobule.update(now) || this.sinus.update(now);
    const procMoving = this.procs.update(now);
    const needs = this.moving || procMoving || camMoving || hiMoving || flowActive || lensMoving || presMoving || viewMoving;
    this.moving = false;
    return needs;
  }

  /** Until the camera has its first real shot and room only the background is drawn, so the figure's first picture is already in its place. */
  render(gl: WebGLRenderer): void { if (this.rig.placed) gl.render(this.scene, this.rig.camera); else gl.clear(); }

  dispose(): void {
    this.lens.dispose();
    this.blood.streams.texture.dispose();
    for (const o of this.objects) o.dispose();
    this.procs.dispose();
    this.plate.geometry.dispose();
    (this.plate.material as MeshBasicMaterial).dispose();
  }
}

/** Where each named place is: the vessel's id and how far along its 2D course (0 to 1). */
const ANCHORS = {
  ra: ['SVC_RA', 1], ivc: ['IVC_IS', 0.5], rhv: ['RHV_IVC', 0.5], pv: ['PV_TRUNK', 0.5], spleen: ['V_SPL', 0],
} as const satisfies Record<string, readonly [string, number]>;

export { SHOTS };

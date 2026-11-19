import { Color, type DataTexture, Group, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { BODY_PLATE_Z, FIGURE_Z, ORGANS, PLATE_BOUNDS, VARICES, blob, bodyPlateGeometry } from './anatomy/placeholder.ts';
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
import { organsReady } from './organs/meshes.ts';
import { clock } from '../clock/frame.ts';
import { COURSES } from './circuit/course.ts';
import { attachCircuit, slicesFor } from './circuit/geometry.ts';
import { mapToScene, turnScenePt } from './circuit/map.ts';
import { MapLayer, mapRamp } from './circuit/map-layer.ts';
import { circuitBounds } from './circuit/shots.ts';
import { CircuitView } from './circuit/view.ts';
import { CIRCUIT_NODES, MAP_LOOKS } from './circuit/data.copied.ts';

/** What the figure shows: the body, the Circuit (the body's vessels flown onto a flat map), the liver lobule (hexagon) or one sinusoid. The two small views stand away from the body in the same scene. */
export type FigureView = 'body' | 'circuit' | 'lobule' | 'sinusoid';

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
  /** The Circuit: the change between the body and the map, and the map's quarter turn (src/scene/circuit/). */
  readonly circuit = new CircuitView();
  private readonly mapLayer = new MapLayer();
  /** The organs, varices and catheter: what leaves as the figure turns into the map (the vessels stay and fly). */
  private readonly leaving: CelObject[] = [];
  private lastFade = 1;
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

    // The organs' vertex data is a static file (src/scene/organs/meshes.ts): they join the scene when it is in, and ask for a frame.
    organsReady.then(() => {
      for (const def of ORGANS) {
        const o = new CelObject(def.geometry(), { tone: def.tone, bands: 3, spec: 0, px: def.px }, this.shared);
        if (def.position) o.group.position.set(...def.position);
        if (def.rotation) o.group.rotation.set(...def.rotation);
        this.add(o); this.leaving.push(o);
      }
      clock.invalidate('organs');
    }, (e) => console.error(e));
    for (const def of NETWORK) this.addVessel(def);
    for (const v of VARICES) {
      const o = new CelObject(blob(v.r * 0.5, v.r * 0.5, v.r * 0.5, 0, 0, 14), { tone: 'portal', bands: 2, spec: 1, px: 1 }, this.shared);
      o.group.position.set(0.34 + Math.cos(v.angle) * 0.035, v.y - 0.85, 0.06 + Math.sin(v.angle) * 0.035);   // on the lower oesophagus (2D x 800, y 170 to 220)
      this.add(o); this.leaving.push(o);
    }
    this.catheter = new Catheter(this.shared);
    this.body.add(this.catheter.group);
    this.objects.push(...this.catheter.objects); this.leaving.push(...this.catheter.objects);
    this.procs = new ProcedureLayer(this.shared);
    this.body.add(this.procs.group);
    for (const id of ['TIPS', 'DIPS'] as const) this.procs.addStent(id, this.byEdge.get(id) as VesselObject);

    this.highlight = new Highlight(this.vessels, undefined, new Map(NETWORK.map((v) => [v.id, v.host])));
    this.flow = new BloodMarks(this.vessels);
    this.presence = new PresenceTracks(this.vessels as VesselObject[]);
    this.lens.setContext({ healthy: null, ref: null });
    const vo = { look: this.look, phone: this.phone, flowMode: opts.flowMode ?? DEFAULT_FLOW_MODE, reduceMotion: opts.reduceMotion };
    this.lobule = new LobuleView(this.shared, vo); this.sinus = new SinusoidView(this.shared, vo);
    this.scene.add(this.lobule.group, this.sinus.group, this.mapLayer.group);
    this.lobule.setVisible(false); this.sinus.setVisible(false);
    this.applyLook(this.look);
  }

  private add(o: CelObject): void { this.objects.push(o); this.body.add(o.group); }

  private addVessel(def: NetVessel): void {
    const built = buildVessel({ ...def, tone: def.tone === 'artery' ? 'portal' : def.tone }, slicesFor(def.id));
    attachCircuit(built, COURSES.get(def.id)!, def.radius);
    const q = STUB_Q[def.id] ?? 1;
    const o = new VesselObject(built.geometry, {
      tone: def.tone, artery: def.tone === 'artery', lensIndex: indexOf(def.id), widthKind: def.widthKind, bands: 2, spec: 1, px: def.kind === 'liver' ? 0.9 : def.tone === 'artery' ? 1 : 1.2,
      vessel: { index: indexOf(def.id), len: built.length, stubSpeed: markSpeed(q), radius: def.radius, baseD: def.baseD },
    }, this.shared, this.lens.shared, this.blood.shared, this.circuit.shared);
    this.circuit.attach({ id: def.id, len: o.toon.uniforms.len as { value: number }, circRow: o.toon.uniforms.circRow as { value: number } });
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
    this.mapLayer.applyLook(look, p.ink, MAP_LOOKS[look]?.ground ?? p.bg);
    for (const o of this.objects) { o.applyPalette(p); o.setPhone(this.phone); }
    this.procs.applyPalette(p);
    this.lens.setLook(look);
    this.lobule.applyLook(look); this.sinus.applyLook(look);
    this.moving = true;
  }

  /** The canvas ground, for the renderer's clear colour. */
  get background(): Color { return new Color(PALETTES[this.look].bg); }
  /** The clear colour now: the look's ground, on its way to the map's own ground (the dark looks) as the map comes in. */
  private readonly clear = new Color();
  private readonly mapGround = new Color();
  clearColor(): Color {
    const ground = MAP_LOOKS[this.look]?.ground;
    this.clear.set(PALETTES[this.look].bg);
    if (ground) this.clear.lerp(this.mapGround.set(ground), mapRamp(this.circuit.t));
    return this.clear;
  }

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
    this.procs.syncStents(f, patient.params, f ? (f.jump || !this.sawFrame) : false);
    this.procs.syncBands((f as { bands?: number } | null)?.bands ?? 0, f ? (f.jump || !this.sawFrame) : false);
    this.procs.syncTamponade(patient.params as never, f ? (f.jump || !this.sawFrame) : false);
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
  setView(v: FigureView, now = performance.now()): void {
    this.figureView = v;
    // the view being left stays drawn until the camera has landed on the new one (nothing pops while it flies); then it is hidden
    this.body.visible ||= v === 'body' || v === 'circuit';
    // the body turns into the map (or back) on the camera's own clock, from wherever it stands
    if (v === 'circuit') { if (this.circuit.t === 0) this.circuit.snapTurn(this.circuit.upright); }
    this.circuit.go(v === 'circuit', now);
    this.rig.setBounds(v === 'circuit' ? circuitBounds(this.circuit.upright) : { ...PLATE_BOUNDS, z: FIGURE_Z });
    if (v === 'lobule') this.lobule.setVisible(true);
    if (v === 'sinusoid') this.sinus.setVisible(true);
    this.hideLeftBehind = true;
    if (v !== 'body') this.feedViews(true);
    this.moving = true;
  }
  private hideLeftBehind = false;

  // ---- the Circuit ---------------------------------------------------------------------------

  /** Stand the map upright (flow bottom to top) or lay it wide. With the map not showing the turn is laid at once. */
  setCircuitUpright(on: boolean, now = performance.now()): void {
    if (this.circuit.t === 0 && !this.circuit.toCircuit) this.circuit.snapTurn(on); else this.circuit.setUpright(on, now);
    if (this.figureView === 'circuit') this.rig.setBounds(circuitBounds(on));
    this.moving = true;
  }
  /** A station's place in the scene on the map as it stands (turned with the map); for the labels. Null for a name the map does not have. */
  circuitStation(id: string, out = new Vector3()): Vector3 | null {
    const s = CIRCUIT_NODES[id];
    if (!s) return null;
    const p = mapToScene(s.at[0], s.at[1]), q = turnScenePt(p[0], p[1], this.circuit.rr);
    return out.set(q[0], q[1], p[2]);
  }
  private readonly stationsOf = (() => {
    const m = new Map<string, string[]>();
    for (const v of NETWORK) for (const n of [v.from, v.to]) { const a = m.get(n) ?? []; a.push(v.id); m.set(n, a); }
    return m;
  })();
  /** The vessel the pointer is on, in the Circuit: the nearest drawn course within a thumb's reach (screen px). */
  private pickCircuit(x: number, y: number): string | null {
    if (this.circuit.t < 1) return null;
    const rr = this.circuit.rr, reach = this.phone ? 16 : 10;
    let best: string | null = null, bestD = reach * reach;
    const v3 = new Vector3(), a = { x: 0, y: 0 };
    for (const v of NETWORK) {
      if (this.presence.stateOf(v.id) !== 'shown') continue;
      const pts = COURSES.get(v.id)!.mapPts;
      let px = NaN, py = NaN;
      for (let i = 0; i < pts.length; i += 2) {
        const m = mapToScene(pts[i]![0], pts[i]![1]), q = turnScenePt(m[0], m[1], rr);
        this.rig.project(v3.set(q[0], q[1], m[2]), a);
        if (!Number.isNaN(px)) {
          const dx = a.x - px, dy = a.y - py, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / L)), ex = px + dx * u - x, ey = py + dy * u - y, d = ex * ex + ey * ey;
          if (d < bestD) { bestD = d; best = v.id; }
        }
        px = a.x; py = a.y;
      }
    }
    return best;
  }
  private settleViews(): void {
    const v = this.figureView;
    this.body.visible = v === 'body' || v === 'circuit';
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
    if (this.figureView === 'circuit') return this.pickCircuit(x, y);
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
    const circMoving = this.stepCircuit(now, dt);
    if (this.hideLeftBehind && !camMoving && !this.circuit.moving) this.settleViews();
    const hiMoving = this.highlight.step(dt);
    this.blood.shared.projY.value = this.rig.camera.projectionMatrix.elements[5]!;
    const flowActive = this.flow.step(dt) || this.blood.streams.step(now);
    const lensMoving = this.lens.step(now);
    const presMoving = this.presence.step(dt);
    const viewMoving = this.lobule.update(now) || this.sinus.update(now);
    const procMoving = this.procs.update(now);
    const needs = this.moving || procMoving || camMoving || circMoving || hiMoving || flowActive || lensMoving || presMoving || viewMoving;
    this.moving = false;
    return needs;
  }

  /** The change and the turn, the organs leaving, the map coming in and its stations' dots. */
  private stepCircuit(now: number, dt: number): boolean {
    const moving = this.circuit.update(now), t = this.circuit.t;
    const fade = 1 - t;
    if (fade !== this.lastFade) {
      this.lastFade = fade;
      for (const o of this.leaving) o.setFade(fade);
      const m = this.plate.material as MeshBasicMaterial;
      m.transparent = fade < 1; m.opacity = fade; this.plate.visible = fade > 0.001;
    }
    this.mapLayer.set(mapRamp(t), this.circuit.rr);
    let dots = false;
    if (t > 0) dots = this.mapLayer.stepDots((id) => (this.stationsOf.get(id) ?? []).some((e) => this.presence.stateOf(e) === 'shown'), Math.min(1, dt / 280));
    return moving || dots;
  }

  /** Until the camera has its first real shot and room only the background is drawn, so the figure's first picture is already in its place. */
  render(gl: WebGLRenderer): void { if (this.rig.placed) { gl.setClearColor(this.clearColor()); gl.render(this.scene, this.rig.camera); } else gl.clear(); }

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

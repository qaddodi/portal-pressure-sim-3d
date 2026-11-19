import { Box3, Color, type DataTexture, Group, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { FIGURE_Z, PLATE_BOUNDS } from './anatomy/placeholder.ts';
import { MAPPED, NETWORK, type NetVessel, courseOf, presenceOf, recruitFrac } from './vessels/network.ts';
import { PresenceTracks } from './vessels/presence-track.ts';
import { ShapeTracks } from './vessels/shape-track.ts';
import { REST, coursesOf, tubularOf } from './vessels/shape.ts';
import { buildTubes } from './vessels/tubes.ts';
import { FAINT_ONLY_LAYER, VesselObject } from './vessels/vessel-object.ts';
import { BACK_EDGES, IVC_EDGES } from './vessels/paths.copied.ts';
import { fadeOf } from './vessels/fades.ts';
import { LensField } from './lenses/field.ts';
import type { LensId } from './lenses/model.ts';
import { BloodMarks, type BloodOptions } from './blood/marks.ts';
import { BloodField } from './blood/field.ts';
import { CameraRig } from './camera/rig.ts';
import { cutUniform, fieldSoft } from './camera/dive.ts';
import { ORGAN_CUT } from './organs/layer.ts';
import { quietOf } from './camera/quiet.ts';
import { effectiveDistance, type Room } from './camera/room.ts';
import { SHOTS, type Shot, type ShotName } from './camera/shots.ts';
import { Catheter, type CatheterState } from './catheter.ts';
import { DEFAULT_FLOW_MODE, FLOW_FADE_MS, type FlowMarkMode, markSpeed } from './flow.ts';
import { Highlight, OrganPins } from './highlight.ts';
import { CelObject, type CelShared, createShared } from './materials/cel.ts';
import { type LookId, PALETTES, type Palette } from './palette.ts';
import { EDGES } from '../engine/hales/portal/topology.js';
import { TEXTURE_WIDTH, hasVessel, indexOf } from '../engine/vessel-data.ts';
import { latest, patient } from '../engine/store.ts';
import { x2d, x3, y2d, y3 } from './frame2d.ts';
import { type FigureHit, organHit } from './organs/pick.ts';
import { FLUID_Z } from './disease/ascites.ts';
import { LobuleView, lobuleModel, sinusoidTargets, type LobuleHit, type LobuleLayers, type LobulePartName } from './lobule/index.ts';
import { LIVER_POINT, LOBULE_SCALE, SIN_LOCAL, SIN_REL, SIN_SCALE, lobuleWorld, sinusoidWorld } from './lobule/frames.ts';
import { LOBULE_ORIGIN, LOBULE_R, LOBULE_T, SINUSOID_L, lobuleShot } from './lobule/shots.ts';
import type { Vec3 } from './anatomy/vessels.ts';
import { SinusoidView, diveShare, isPortrait, restScale } from './sinusoid/index.ts';
import { sinusoidBox } from './lobule/shots.ts';
import { ProcedureLayer } from './procedures/layer.ts';
import { DiseaseLayer, type DiseaseParams } from './disease/index.ts';
import { ProbeLayer } from './devices/probes/layer.ts';
import { organsReady } from './organs/meshes.ts';
import { clock } from '../clock/frame.ts';
import { COURSES } from './circuit/course.ts';
import { attachRuns, slicesFor } from './circuit/geometry.ts';
import { mapToScene, turnScenePt } from './circuit/map.ts';
import { MapLayer, mapRamp } from './circuit/map-layer.ts';
import { circuitBounds } from './circuit/shots.ts';
import { CircuitView } from './circuit/view.ts';
import { CIRCUIT_NODES, MAP_LOOKS, VB_CIRC } from './circuit/data.copied.ts';
import { CircuitTubes } from './circuit/tubes.ts';
import { PostAA } from './post-aa.ts';
import { ResistorLayer } from './circuit/resistors.ts';
import { RES_KINDS, type ResKey, resRatio } from './circuit/res-model.ts';
import { MAP_K } from './circuit/map.ts';

const CIRC_MID: readonly [number, number] = [VB_CIRC[0] + VB_CIRC[2] / 2, VB_CIRC[1] + VB_CIRC[3] / 2];
/** What the figure shows: the body, the Circuit (the body's vessels flown onto a flat map), the liver lobule (hexagon) or one sinusoid. The two small views stand INSIDE the liver (the lobule in the liver, the sinusoid in the lobule). */
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

/** The body dissolves as the camera goes into the liver: whole at DIVE_OUT scene units from the lobule's place, gone at DIVE_IN (the right lobe's surface is about 0.85 from it). */
export const DIVE_OUT = 1.9, DIVE_IN = 0.7;
/** How much of the body is drawn with the camera `d` scene units from the lobule's place: 1 whole, 0 gone (smoothstep between DIVE_IN and DIVE_OUT). */
export function bodyFade(d: number): number { const t = Math.min(1, Math.max(0, (d - DIVE_IN) / (DIVE_OUT - DIVE_IN))); return t * t * (3 - 2 * t); }

/** The corners (scene units) of the lobule's box and of the sinusoid's: what the hand's pan and zoom keep on screen while each is the view. */
export function lobuleCorners(): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(lobuleWorld([sx * LOBULE_R, sy * LOBULE_R * 0.866, sz * LOBULE_T / 2]) as Vec3);
  return out;
}
export function sinusoidCorners(): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(sinusoidWorld([sx * (SINUSOID_L / 2 + 0.3), sy * 1.4, sz * 1.0]) as Vec3);
  return out;
}

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
  /** Everything of the body (organs, vessels, catheter): hidden as one while the lobule or the sinusoid is the view. */
  private readonly body = new Group();
  readonly rig: CameraRig;
  readonly shared: CelShared = createShared();
  readonly objects: CelObject[] = [];
  readonly vessels: CelObject[] = [];
  readonly catheter: Catheter;
  /** Every device a procedure puts on the figure (B5): the catheters on their routes, the stent, the tamponade tube, bands. */
  readonly procs: ProcedureLayer;
  /** The Tests card's devices on the figure (B11): the Doppler probe, the FibroScan probe, the endoscope with its ligator cap and EUS needle. */
  readonly probes: ProbeLayer;
  readonly highlight: Highlight;
  /** The organs a slide outlines (and the normal spleen's line). */
  readonly pins = new OrganPins();
  readonly flow: BloodMarks;
  /** The colour lens (src/scene/lenses/): what colour every vein wears, crossfaded on the clock. */
  readonly lens = new LensField();
  /** The blood's streams (the chevrons' distance, speed and reversed flag, from the 2D app's own stream model). */
  readonly blood = new BloodField();
  /** The lobule and sinusoid views (B8), built once, hidden until the view is chosen (setView). */
  /** The organs and the disease states on the figure (B4). */
  readonly disease: DiseaseLayer;
  readonly lobule: LobuleView;
  readonly sinus: SinusoidView;
  /** The Circuit: the change between the body and the map, and the map's quarter turn (src/scene/circuit/). */
  readonly circuit = new CircuitView();
  private readonly mapLayer = new MapLayer();
  /** What only the map has: the liver's branch trees, the caudate's lane, the custom shunts a learner opened (circuit/tubes.ts). */
  readonly tubes: CircuitTubes;
  /** The resistors' zigzags on the map, and which of them a slide asks for (circuit/resistors.ts). */
  readonly resistors: ResistorLayer;
  private resWant = new Set<ResKey>();
  private resNow: Partial<Record<ResKey, number>> = {};
  private caudPin = false;
  private openShunts: Record<string, number> = {};
  /** The organs, varices and catheter: what leaves as the figure turns into the map (the vessels stay and fly). */
  private readonly leaving: CelObject[] = [];
  private lastFade = 1;
  private figureView: FigureView = 'body';
  /** The anti-aliasing pass over the whole figure (post-aa.ts). */
  readonly post = new PostAA();
  private readonly dive = new Group();
  private readonly sinFrame = new Group();
  private fadeNow = 1;
  private presence!: PresenceTracks;
  private shapes!: ShapeTracks;
  private healthyQ: ArrayLike<number> | undefined;
  private collateralsOn = false;
  private bloodOpts = { chevrons: true, keyChevrons: false };
  private readonly byEdge = new Map<string, CelObject>();
  /** the vessels that fade at a free end (fades.ts), and the collaterals whose opening makes the tip solid */
  /** The cava's pieces, and the veins that fade into it: shown whole (2D's F_WHOLE) while the cava is picked or named, eased over FLOW_FADE_MS so nothing pops. */
  private readonly cava: VesselObject[] = [];
  private readonly ivcJoins: VesselObject[] = [];
  private cavaGoal = 0;
  private cavaWhole = 0;
  private readonly tipFades: { o: VesselObject; connect: readonly string[] }[] = [];
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

    this.scene.add(this.body);

    for (const def of NETWORK) this.addVessel(def);
    // the organs and every state of the patient's disease on the figure (clots, plexuses, ascites, bleed, dye): src/scene/disease/ (B4)
    this.disease = new DiseaseLayer(this.shared, this.vessels);
    this.body.add(this.disease.group);
    // The organs' vertex data is a static file (src/scene/organs/meshes.ts): the organ layer builds them when it is in, in the patient's state, and asks for a frame.
    organsReady.then(() => { this.disease.organs.build(); this.moving = true; clock.invalidate('organs'); }, (e) => console.error(e));
    this.catheter = new Catheter(this.shared);
    this.body.add(this.catheter.group);
    this.catheter.group.traverse((c) => c.layers.set(VESSEL_LAYER));
    this.objects.push(...this.catheter.objects); this.leaving.push(...this.catheter.objects);
    this.tubes = new CircuitTubes(this.shared, this.lens.shared, this.blood.shared, this.circuit.shared);
    this.body.add(this.tubes.group);
    this.resistors = new ResistorLayer(this.shared.res);
    this.mapLayer.group.add(this.resistors.group);
    this.procs = new ProcedureLayer(this.shared);
    this.body.add(this.procs.group);
    this.procs.group.traverse((c) => c.layers.set(VESSEL_LAYER));
    for (const id of ['TIPS', 'DIPS'] as const) this.procs.addStent(id, this.byEdge.get(id) as VesselObject);
    this.probes = new ProbeLayer(this.shared, {
      organBox: (organ) => { const o = this.disease.organs.byId.get(organ); return o ? new Box3().setFromObject(o.group) : null; },
      kpa: (organ) => { const m = latest.frame?.metrics as Record<string, number | null | undefined> | undefined; return m?.[organ === 'spleen' ? 'ssm' : 'lsm'] ?? null; },
    });
    this.body.add(this.probes.group);

    this.highlight = new Highlight(this.vessels, undefined, new Map(NETWORK.map((v) => [v.id, v.host])));
    this.flow = new BloodMarks(this.vessels);
    this.presence = new PresenceTracks(this.vessels as VesselObject[]);
    this.shapes = new ShapeTracks(NETWORK, this.byEdge as unknown as Map<string, VesselObject>);
    this.lens.setContext({ healthy: null, ref: null });
    const vo = { look: this.look, phone: this.phone, flowMode: opts.flowMode ?? DEFAULT_FLOW_MODE, reduceMotion: opts.reduceMotion };
    this.lobule = new LobuleView(this.shared, vo); this.sinus = new SinusoidView(this.shared, vo);
    // the lobule stands inside the liver, the sinusoid inside the lobule (lobule/frames.ts): two frames, each a place and a scale
    this.dive.position.set(...LIVER_POINT); this.dive.scale.setScalar(LOBULE_SCALE);
    this.sinFrame.position.set(...SIN_LOCAL); this.sinFrame.scale.setScalar(SIN_REL);
    this.sinFrame.add(this.sinus.group); this.dive.add(this.lobule.group, this.sinFrame); this.scene.add(this.dive, this.mapLayer.group);
    this.lobule.setVisible(false); this.sinus.setVisible(false);
    this.applyLook(this.look);
  }

  private add(o: CelObject): void { this.objects.push(o); this.body.add(o.group); }

  private addVessel(def: NetVessel): void {
    const courses = coursesOf(def, REST);
    const built = buildTubes(courses, tubularOf(def, slicesFor(def.id)), def.radius);
    const circ = COURSES.get(def.id);
    if (circ) attachRuns(built.geometry, built.runs, circ, def.radius);
    const q = STUB_Q[def.lensId] ?? 1;
    const o = new VesselObject(built.geometry, {
      tone: def.tone, artery: def.tone === 'artery', lensIndex: indexOf(def.lensId), widthKind: def.widthKind, bands: 2, spec: 1, px: def.kind === 'liver' ? 0.9 : def.tone === 'artery' ? 1 : 1.2,
      vessel: { index: indexOf(def.lensId), len: built.length, stubSpeed: markSpeed(q), radius: def.radius, baseD: def.baseD },
    }, this.shared, this.lens.shared, this.blood.shared, this.circuit.shared);
    if (circ) this.circuit.attach({ id: def.id, len: o.toon.uniforms.len as { value: number }, circRow: o.toon.uniforms.circRow as { value: number } });
    else this.leaving.push(o);   // a fan of tributaries has no map course: it leaves with the organs as the figure turns into the map
    o.edge = { id: def.id, from: def.from, to: def.to, length: built.length };
    o.group.traverse((c) => c.layers.set(VESSEL_LAYER));
    const fade = def.feeder ? null : fadeOf(def.id, def.tone === 'artery');
    if (fade) { o.setTipFade(fade); this.tipFades.push({ o, connect: fade.connect }); if (fade.ivcJoin) this.ivcJoins.push(o); }
    if (BACK_EDGES.has(def.id)) { o.setBehindOrgans(VESSEL_LAYER, IVC_EDGES.has(def.id)); if (IVC_EDGES.has(def.id)) this.cava.push(o); }
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
    this.mapLayer.applyLook(look, p.ink, MAP_LOOKS[look]?.ground ?? p.bg);
    for (const o of this.objects) { o.applyPalette(p); o.setPhone(this.phone); }
    this.procs.applyPalette(p); this.probes.applyPalette(p);
    this.tubes.applyPalette(p); this.resistors.setLook(look);
    this.disease.applyLook(look, p); this.disease.setPhone(this.phone);
    this.lens.setLook(look);
    this.lobule.applyLook(look); this.sinus.applyLook(look); this.feedSinusInk();
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
    this.procs.setPhone(phone); this.probes.setPhone(phone); this.tubes.setPhone(phone);
    this.disease.setPhone(phone);
    this.lobule.setPhone(phone); this.sinus.setPhone(phone);
    this.moving = true;
  }

  // ---- engine data ---------------------------------------------------------------------------

  /** Reads flow, pressure and diameter from the engine's per-vessel texture (src/engine/vessel-data.ts) from now on; null goes back to the stub. */
  bindData(texture: DataTexture | null): void {
    for (const o of this.vessels) o.setUseData(!!texture);
    this.tubes.setUseData(!!texture);
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
    if (f) { this.syncPresence(f, !this.sawFrame); this.feedDisease(f, !this.sawFrame); }
    this.procs.syncStents(f, patient.params, f ? (f.jump || !this.sawFrame) : false);
    this.procs.syncBands((f as { bands?: number } | null)?.bands ?? 0, f ? (f.jump || !this.sawFrame) : false);
    this.procs.syncTamponade(patient.params as never, f ? (f.jump || !this.sawFrame) : false);
    this.sawFrame = !!f;
    this.syncCircuitData(f);
    if (this.figureView !== 'body') this.feedViews(false);
    this.moving = true;
  }
  private sawFrame = false;

  /** The patient's disease into the organ and disease layers (src/scene/disease/): the newest frame, the patient's parameters, the healthy pressures. */
  private feedDisease(f: NonNullable<typeof latest.frame>, first: boolean): void {
    this.disease.feed(f as never, (patient.params ?? null) as DiseaseParams | null, (patient.reference?.P as ArrayLike<number> | undefined) ?? null, {
      instant: first || f.jump,
      presence: (id) => (this.presence.isDrawn(id) ? 1 : 0),
      recruit: (id, fr) => recruitFrac(id, fr as never),
    }, f.jump);
  }

  /** Which vessels are drawn now (a collateral opens by its flow and size; the 2D figure's rules, network.ts presenceOf). */
  private syncPresence(f: NonNullable<typeof latest.frame>, instant: boolean): void {
    for (const v of NETWORK) this.presence.set(v.id, presenceOf(v, f, { collaterals: this.collateralsOn }, this.healthyQ), instant || f.jump);
    this.shapes.onFrame(f as never, performance.now(), this.healthyQ, instant || !!f.jump);
    for (const t of this.tipFades) if (t.connect.length) t.o.setTipJoined(t.connect.some((c) => this.presence.stateOf(c) === 'shown'));
    const rexOn = this.presence.stateOf('REX') === 'shown';
    if (rexOn !== this.procs.isRexUnder) this.procs.setRexUnder(rexOn, (id) => this.vesselObject(id));
    this.flow.setDrawn((id) => this.presence.stateOf(id) === 'shown', (id) => this.presence.stateOf(id) === 'shown' && NETWORK.some((v) => v.id === id && v.kind === 'collateral'));
  }

  // ---- lens and blood ------------------------------------------------------------------------

  /** Colour the veins by a lens (the Layers menu's ten, a deck's 'system' and 'since', or 'neutral' for the plain anatomy). */
  setLens(lens: LensId, now: number, instant = false): void { this.lens.setLens(lens, now, instant); this.lobule.setLens(lens); this.feedLobuleRef(); this.feedSinusInk(); this.disease.setLensGrey(lens !== 'pressure' && lens !== 'neutral'); this.moving = true; }
  /** The healthy patient at rest (the engine's `healthyProfile`): the reference the change, congestion, velocity and direction lenses compare to. */
  setHealthy(h: { P: ArrayLike<number>; Q: ArrayLike<number>; D: ArrayLike<number> }): void {
    this.lens.setContext({ healthy: { Q: h.Q, D: h.D, P: h.P }, ref: Float32Array.from(h.P) });
    this.blood.streams.setHealthy(h);
    this.healthyP = Float32Array.from(h.P); this.lobule.setReference(this.healthyP); this.feedSinusInk();
    this.healthyQ = h.Q;
    if (latest.frame) this.syncPresence(latest.frame, false);
    this.moving = true;
  }
  /** Count Change and Congestion from a pinned moment's node pressures (Compare > Change), or from the healthy patient again (null). */
  setLensRef(P: ArrayLike<number> | null): void { this.lens.setRef(P); this.moving = true; }
  /** A "change since" slide's reference (2D: stage.changeRef): the node pressures the Since lens counts from, a slide's own state; null takes the arrival state again. The lobule counts from the same one. */
  setSinceRef(P: ArrayLike<number> | null): void { this.lens.setSinceRef(P); this.feedLobuleRef(); this.moving = true; }
  private healthyP: Float32Array | null = null;
  /** The lobule's colours count from the Since reference while that lens is on, from the healthy patient otherwise (2D: lobule-model.js sinceOf). */
  private feedLobuleRef(): void { this.lobule.setReference(this.lens.lens === 'since' ? this.lens.sinceReference : this.healthyP); }
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
    this.bloodOpts = { chevrons: o.chevrons ?? this.bloodOpts.chevrons, keyChevrons: (o.keyChevrons ?? this.bloodOpts.keyChevrons) || !!o.presenting };
    this.lobule.setBlood(this.bloodOpts); this.sinus.setBlood(this.bloodOpts);
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
    this.cavaGoal = [...ids].some((id) => IVC_EDGES.has(id)) ? 1 : 0;
    this.moving = true;
  }

  /** Eases the cava toward whole or veiled; true while it moves. */
  private stepCava(dtMs: number): boolean {
    if (this.cavaWhole === this.cavaGoal) return false;
    const k = Math.min(1, dtMs / FLOW_FADE_MS), d = this.cavaGoal - this.cavaWhole;
    this.cavaWhole = Math.abs(d) <= k ? this.cavaGoal : this.cavaWhole + Math.sign(d) * k;
    for (const o of this.cava) o.setWholeShare(this.cavaWhole);
    for (const o of this.ivcJoins) o.setIvcWhole(this.cavaWhole);
    return true;
  }

  /** Light a set of vessels at once (the shunt's valid targets); an empty list puts them out. */
  markVessels(ids: readonly string[]): void { this.highlight.setOnly(ids); this.moving = true; }

  /** Outline these organs (organ ids: liver, spleen, heart, bowel, colon, duodenum, kidney-l...); [] clears. */
  pinOrgans(ids: readonly string[], normalSpleen = false): void { this.pins.set(ids); this.pins.setNormalOutline(normalSpleen); this.moving = true; }

  /** Free play: pick a vessel by edge ID (or clear it with null). */
  pick(id: string | null): void { this.highlight.set(id); this.syncNamed(); }

  /** (The 2D app has one style of flow head; the four options of the first slice are gone. Kept for the views that still take a mode.) */
  setFlowMode(mode: FlowMarkMode): void { this.lobule.setFlowMode(mode); this.sinus.setFlowMode(mode); this.moving = true; }

  // ---- the figure's view: body, lobule, sinusoid ---------------------------------------------

  get view(): FigureView { return this.figureView; }
  /** Show the body, the lobule or the sinusoid: the others are hidden and cost nothing (nothing is built or compiled here; the views were made at start). The camera is the caller's. */
  setView(v: FigureView, now = performance.now()): void {
    this.figureView = v;
    this.rig.setSubject(v === 'lobule' ? lobuleCorners() : v === 'sinusoid' ? (sinusoidBox(this.portrait) as Vec3[]) : null);
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
  /** The resistors a slide asks for ('rLiver', 'rColl', 'rGut'): their zigzags and readings show on the map. An empty list clears them. */
  setResistors(keys: readonly ResKey[]): void {
    this.resWant = new Set(keys);
    this.syncCircuitData(latest.frame);
    this.moving = true;
  }
  /** A slide is about the caudate lobe: the caudate's own lane shows in the Circuit (2D: stage-outlines.js pinOrgans). */
  setCaudatePin(on: boolean): void { this.caudPin = on; this.moving = true; }
  /** The resistors showing now and their ratios against the healthy liver (for the captions). */
  get resistorsNow(): Readonly<Partial<Record<ResKey, number>>> { return this.resNow; }
  /** The engine's newest frame into the map's own parts: the resistors' ratios, and the custom shunts that are open (routed once each). */
  private syncCircuitData(f: typeof latest.frame): void {
    const healthy = patient.reference ? { P: patient.reference.P, Q: patient.reference.Q } : null;
    const next: Partial<Record<ResKey, number>> = {};
    if (f && healthy) for (const key of this.resWant) { const r = resRatio(RES_KINDS[key], { P: f.Pf ?? f.P, Q: f.Qf ?? f.Q }, healthy, patient.params); if (r != null) next[key] = r; }
    this.resNow = next;
    const cs = ((patient.params as { customShunts?: Record<string, number> } | null)?.customShunts) ?? {};
    const open: Record<string, number> = {};
    for (const id of Object.keys(cs)) if (cs[id]! > 0 && (!f || !hasVessel(id) || (f.D[indexOf(id)] ?? 0) > 0)) open[id] = cs[id]!;
    this.openShunts = open;
    if (this.tubes.routeOpen(open).length) this.moving = true;
  }
  /** A map point (units) on the canvas now, turned with the map and seen through the camera (CSS px). */
  mapPoint(x: number, y: number, out = { x: 0, y: 0 }): { x: number; y: number } {
    const p = mapToScene(x, y), q = turnScenePt(p[0], p[1], this.circuit.rr);
    return this.rig.project(this.tmpMap.set(q[0], q[1], p[2]), out);
  }
  private readonly tmpMap = new Vector3();
  /** Pixels a map unit takes on the canvas now (the map's scale as the camera and the hand's zoom make it). */
  mapScale(): number {
    const a = this.mapPoint(CIRC_MID[0], CIRC_MID[1]), ax = a.x, ay = a.y, b = this.mapPoint(CIRC_MID[0] + 100, CIRC_MID[1]);
    return Math.hypot(b.x - ax, b.y - ay) / 100;
  }
  /** Whether a station's dot is on (a vessel at it is drawn). */
  stationOn(id: string): boolean { return (this.stationsOf.get(id) ?? []).some((e) => this.presence.stateOf(e) === 'shown'); }
  /** Whether a vessel is drawn solid now. */
  vesselDrawn(id: string): boolean { return this.presence.stateOf(id) === 'shown'; }
  /** The hand's zoom over the shot's own framing (1 = as framed). */
  get handZoom(): number { return this.rig.handZoom; }
  /** A station's place in the scene on the map as it stands (turned with the map); for the labels. Null for a name the map does not have. */
  circuitStation(id: string, out = new Vector3()): Vector3 | null {
    const s = CIRCUIT_NODES[id];
    if (!s) return null;
    const p = mapToScene(s.at[0], s.at[1]), q = turnScenePt(p[0], p[1], this.circuit.rr);
    return out.set(q[0], q[1], p[2]);
  }
  readonly stationsOf = (() => {
    const m = new Map<string, string[]>();
    for (const v of MAPPED) for (const n of [v.from, v.to]) { const a = m.get(n) ?? []; a.push(v.id); m.set(n, a); }
    return m;
  })();
  /** The vessel the pointer is on, in the Circuit: the nearest drawn course within a thumb's reach (screen px). */
  private pickCircuit(x: number, y: number): string | null {
    if (this.circuit.t < 1) return null;
    const rr = this.circuit.rr, reach = this.phone ? 16 : 10;
    let best: string | null = null, bestD = reach * reach;
    const v3 = new Vector3(), a = { x: 0, y: 0 };
    for (const v of MAPPED) {
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
    this.body.visible = v === 'body' || v === 'circuit' || this.fadeNow > 0;
    this.lobule.setVisible(v === 'lobule'); this.sinus.setVisible(v === 'sinusoid');
    this.hideLeftBehind = false;
  }
  /** The body dissolves as the camera goes into the liver and comes back as it leaves (a function of the camera's distance to the lobule's place, so the dive in and the way out are the same picture run both ways). */
  private fadeBody(): void {
    const f = bodyFade(this.rig.camera.position.distanceTo(this.livePoint));
    if (f === this.fadeNow || (Math.abs(f - this.fadeNow) < 1e-3 && f > 0 && f < 1)) return;
    this.fadeNow = f;
    for (const o of this.objects) o.setFade(f);
    this.disease.setFade(Math.min(f, this.lastFade));
    this.body.visible = f > 0 || this.figureView === 'body';
    this.moving = true;
  }
  private readonly livePoint = new Vector3(...LIVER_POINT);
  /** The sinusoid's tissue is one opaque plane to every edge of the screen once the camera has landed on it (the lobule is then hidden: nothing of the lobule is ever seen through or around it). While the
   *  camera flies between the lobule and the sinusoid (the view being left stays drawn until it lands) the tissue comes in over the lobule by how far the dive has gone (the pose's own distance: the
   *  shots' `r`, blended geometrically, whatever the room and the screen), as 2D's zoom does it. */
  private stepSinusDive(): void {
    const flying = this.hideLeftBehind && this.sinus.isVisible;
    this.sinus.setDive(flying ? diveShare(this.rig.pose.shot.r, 2.5 * LOBULE_SCALE, 3 * SIN_SCALE) : null);
  }
  /** The dive's cutaway window in the organs' wash and the field's focus: both are functions of the camera's distance to the place dived to, so the way in and the way out are one picture run both ways,
   *  however the move is reversed, held or resized by a card (camera/dive.ts). Nothing changes at rest: every body shot is outside the window. */
  private stepCutaway(): void {
    const cam = this.rig.camera, d = cam.position.distanceTo(this.livePoint);
    const p = this.divePt.copy(this.livePoint).project(cam);
    cutUniform(d, p.x, p.y, cam.aspect, this.cutArr);
    const was = ORGAN_CUT.value.z;
    ORGAN_CUT.value.set(this.cutArr[0], this.cutArr[1], this.cutArr[2], this.cutArr[3]);
    this.lobule.field.setSoft(fieldSoft(d, this.lobuleRest()));
    if (was !== this.cutArr[2] && (was > -1 || this.cutArr[2] > -1)) this.moving = true;
  }
  /** A portrait room (narrower than tall, 2D's `W < H * 0.95`) runs the sinusoid top to bottom: the sinusoid view takes it (SinusoidView.setPortrait, the sinusoid worker's), and the shot asks for it (sinusoidShot(portrait)). */
  private portrait = false;
  private stepPortrait(): void {
    const r = this.rig.targetRoom, p = isPortrait(r.w, r.h);
    if (p !== this.portrait) {
      this.portrait = p;
      this.sinus.setPortrait(p);
      if (this.figureView === 'sinusoid') this.rig.setSubject(sinusoidBox(p) as Vec3[]);
      this.moving = true;
    }
    // what the view needs of the screen to lay its end arrows and run its traffic as 2D does: px per µm along the flow (the hand's zoom included), the room's length and the canvas's along it
    const short = Math.min(r.w, r.h), s = this.rig.stageSize;
    this.sinus.setScreen(restScale(short) * this.rig.handZoom, p ? r.h : r.w, p ? s.h : s.w);
  }
  get isPortrait(): boolean { return this.portrait; }
  /** The distance the camera sits at with the whole lobule framed in the room it has (kept per room size). */
  private restKey = ''; private restD = 0.1;
  private lobuleRest(): number {
    const r = this.rig.targetRoom, key = `${r.w}x${r.h}x${this.height}`;
    if (key !== this.restKey) { this.restKey = key; this.restD = effectiveDistance(lobuleShot('lobule'), r, this.height); }
    return this.restD;
  }
  private readonly divePt = new Vector3();
  private readonly cutArr: [number, number, number, number] = [0, 0, -1, 1];
  /** How much of the body is drawn now (1 whole, 0 gone): for tests and tags. */
  get bodyShown(): number { return this.fadeNow; }

  /** The model's state into the small views (from the engine's newest frame, the healthy reference and the patient's parameters); `snap` shows it at once. */
  private feedViews(snap: boolean): void {
    const f = latest.frame;
    if (!f) return;
    const m = lobuleModel({ P: f.P, Q: f.Q, params: patient.params ?? undefined, metrics: f.metrics }, patient.reference, patient.params);
    if (this.figureView === 'lobule') snap ? this.lobule.snapModel(m) : this.lobule.setModel(m);
    else if (this.figureView === 'sinusoid') {
      snap ? this.sinus.snapTargets(sinusoidTargets(m)) : this.sinus.setTargets(sinusoidTargets(m));
      this.lobule.snapModel(m);   // (the lobule is hidden; it keeps the model the sinusoid's colour is worked out from)
      this.feedSinusInk();
    }
  }
  private feedSinusInk(): void { const c = this.lobule.inkContext(); if (c) this.sinus.setInk(c); }
  setLobuleLayers(l: Partial<LobuleLayers>): void { this.lobule.setLayers(l); this.moving = true; }
  /** The wedge's wash (a slide that says `wash`): amber from the central vein along the sinusoids, counted from `landedAtMs` in both small views. Off clears it. */
  setWash(on: boolean, landedAtMs = performance.now()): void {
    if (on) { this.lobule.startWash(landedAtMs); this.sinus.startWash(landedAtMs); } else { this.lobule.stopWash(); this.sinus.stopWash(); }
    this.moving = true;
  }

  /** The vessel whose body a pointer ray hits first, for tap-to-pick. */
  pickAt(x: number, y: number, raycaster: Raycaster): string | null {
    if (this.figureView === 'circuit') return this.pickCircuit(x, y);
    if (this.figureView !== 'body') return null;
    raycaster.layers.enable(VESSEL_LAYER); raycaster.layers.enable(FAINT_ONLY_LAYER);
    raycaster.setFromCamera(new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.rig.camera);
    const hits = raycaster.intersectObjects(this.vessels.map((v) => v.toonMesh), false);
    for (const h of hits) {
      const o = this.vessels.find((v) => v.toonMesh === h.object);
      if (o && o.group.visible) return o.edge!.id;   // (a vessel not drawn, a collateral not yet open, takes no tap)
    }
    return null;
  }

  /** What a tap on the lobule is (a part, and the zone for the hepatocytes), by 2D's own rule (lobule/pick.ts), or null; only while the lobule is the view. */
  pickLobule(x: number, y: number, raycaster: Raycaster): LobuleHit | null {
    if (this.figureView !== 'lobule') return null;
    raycaster.setFromCamera(new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.rig.camera);
    return this.lobule.hitRay(raycaster.ray, this.rig.camera, { w: this.width, h: this.height });
  }

  /** The lobule part a tap lands on, in the lobule view, with the tap's place on the lobule plate in its own units (the centre is 0, 0; a triad is at a corner, about 1 away). */
  pickLobuleAt(x: number, y: number, raycaster: Raycaster): { part: LobulePartName; x: number; y: number } | null {
    if (this.figureView !== 'lobule') return null;
    raycaster.setFromCamera(new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.rig.camera);
    const hits = raycaster.intersectObjects(this.lobule.pickables, false);
    const part = this.lobule.partAt(hits);
    const p = hits[0]?.point;
    return part && p ? { part, x: (p.x - LOBULE_ORIGIN[0]) / LOBULE_R, y: -(p.y - LOBULE_ORIGIN[1]) / LOBULE_R } : null;
  }

  /** What a tap at canvas point (x, y) opens, in the 2D app's order (stage.js pick): the vessel under it, else the nearest vessel within reach of the finger (12 px, 18 for a touch),
   *  else the organ under it (the liver with its lobe, the heart, the spleen), else the belly's fluid, else nothing. Only the body takes organ and fluid taps (the Circuit has no organs). */
  pickTargetAt(x: number, y: number, raycaster: Raycaster, touch = false): FigureHit | null {
    const edge = this.pickAt(x, y, raycaster) ?? (this.figureView === 'body' ? this.nearVessel(x, y, touch ? 18 : 12) : null);
    if (edge) return { type: 'edge', id: edge };
    if (this.figureView !== 'body' || this.circuit.t > 0.5 || this.bodyShown < 0.5) return null;
    const o = this.disease.organs.pick(raycaster);   // (the ray is the one pickAt set)
    if (o) return organHit(o.id, x2d(o.x));
    const at = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -FLUID_Z), new Vector3());
    if (at && this.disease.ascites.holds(x2d(at.x), y2d(at.y))) return organHit('abdomen', x2d(at.x));
    return null;
  }

  /** The drawn vessel nearest the point within `reach` CSS px of its edge (screen space, from the courses as laid; 2D nearbyEdge), or null. */
  private nearVessel(x: number, y: number, reach: number): string | null {
    const a = new Vector3(), b = new Vector3(), pa = { x: 0, y: 0 }, pb = { x: 0, y: 0 };
    const one = this.rig.project(b.set(1, 0, 0), pb), zero = this.rig.project(a.set(0, 0, 0), pa);
    const k = Math.hypot(one.x - zero.x, one.y - zero.y);   // CSS px in a scene unit at the figure's plane
    let best: string | null = null, bestD = reach;
    for (const v of NETWORK) {
      if (v.plan?.kind === 'feeder' || this.presence.stateOf(v.id) !== 'shown' || !this.byEdge.get(v.id)?.group.visible) continue;
      const half = v.radius * k, pts = v.pts;
      let px = NaN, py = NaN;
      for (const p of pts) {
        this.rig.project(a.set(p[0], p[1], p[2]), pb);
        if (!Number.isNaN(px)) {
          const dx = pb.x - px, dy = pb.y - py, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / L));
          const d = Math.hypot(px + dx * u - x, py + dy * u - y) - half;
          if (d < bestD) { bestD = d; best = v.id; }
        }
        px = pb.x; py = pb.y;
      }
    }
    return best;
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
    this.disease.organs.setQuiet(quietOf(this.rig.orbitAngle));   // (quiet depth on a turn: the organs' wash eases back as the figure turns)
    const circMoving = this.stepCircuit(now, dt);
    this.fadeBody();
    if (this.hideLeftBehind && !camMoving && !this.circuit.moving) this.settleViews();
    const hiMoving = this.highlight.step(dt);
    const pinMoving = this.pins.step(dt, this.disease.organs.byId);
    this.blood.shared.projY.value = this.rig.camera.projectionMatrix.elements[5]!;
    const streamsMoving = this.blood.streams.step(now);
    const chainMoving = this.blood.chain.step(now, this.blood.streams, (id) => this.flow.carriesHeads(id));
    const flowActive = this.flow.step(dt) || streamsMoving || chainMoving || this.stepCava(dt);
    const lensMoving = this.lens.step(now);
    const presMoving = this.presence.step(dt);
    const shapeMoving = this.shapes.step(dt);
    this.stepSinusDive();
    this.stepCutaway();
    this.stepPortrait();
    const viewMoving = this.lobule.update(now) || this.sinus.update(now);
    const procMoving = this.procs.update(now);
    const diseaseMoving = this.disease.update(now);
    if (diseaseMoving) this.tagOverOrgans();
    const probesMoving = this.probes.update(now, this.circuit.t > 0.02, this.procs.glueDrive);
    const needs = probesMoving || diseaseMoving || this.moving || procMoving || camMoving || circMoving || hiMoving || pinMoving || flowActive || lensMoving || presMoving || shapeMoving || viewMoving;
    this.moving = false;
    return needs;
  }

  /** The change and the turn, the organs leaving, the map coming in and its stations' dots. */
  private stepCircuit(now: number, dt: number): boolean {
    const moving = this.circuit.update(now), t = this.circuit.t;
    const fade = 1 - t;
    if (fade !== this.lastFade) {
      this.lastFade = fade;
      for (const o of [...this.leaving, ...this.disease.organs.objects]) { o.setFade(fade); o.group.visible = fade > 0.001; }
      this.disease.setFade(Math.min(fade, this.fadeNow));
    }
    this.mapLayer.set(mapRamp(t), this.circuit.rr);
    this.procs.setFade(fade);
    const ramp = mapRamp(t);
    const tubesMoving = this.tubes.update(dt, { ramp, t, body: this.fadeNow, drawn: (id) => this.vesselDrawn(id), caudPin: this.caudPin, open: this.openShunts });
    this.resistors.setAlpha(ramp);
    let resMoving = false;
    if (ramp > 0) { this.resistors.set(this.resNow, this.mapScale()); resMoving = this.resistors.step(dt); }
    let dots = false;
    if (t > 0) dots = this.mapLayer.stepDots((id) => (this.stationsOf.get(id) ?? []).some((e) => this.presence.stateOf(e) === 'shown'), Math.min(1, dt / 280));
    return moving || dots || tubesMoving || resMoving;
  }

  /** What the disease layer puts on the vessels (clots, plexus strands, the bleed, the dye) is drawn with them, over the organs (the layers are made as the states come on, so they are tagged as they move). */
  private tagOverOrgans(): void {
    const d = this.disease;
    for (const g of [d.clots.group, d.strands.group, d.bleed.group, d.dye.group]) g.traverse((c) => { if (c.layers.mask !== 2) c.layers.set(VESSEL_LAYER); });
  }

  /** Until the camera has its first real shot and room only the background is drawn, so the figure's first picture is already in its place. */
  render(gl: WebGLRenderer): void {
    if (!this.rig.placed) { gl.clear(); return; }
    gl.setClearColor(this.clearColor());
    const dpr = gl.getPixelRatio?.() ?? 1;
    this.blood.shared.dpr.value = dpr;   // (the vessels' line is held in device px)
    this.disease.strands.setDpr(dpr);
    // Two passes, as the 2D figure paints: the organs first, then the vessels (and what is in them) over the cleared depth, so no organ's relief ever hides a vessel and a joined
    // vessel never looks cut. (The vessels keep their own depth among themselves: their tiers.)
    this.sinus.setDpr(gl.getPixelRatio?.() ?? 1);
    this.lobule.setDpr(gl.getPixelRatio?.() ?? 1);
    const cam = this.rig.camera, mask = cam.layers.mask, ac = gl.autoClear;
    // the figure is drawn into a texture of the canvas's size and filtered onto the canvas once (post-aa.ts), unless the pass is off or the device refused it
    const into = this.post.target(gl);
    if (into) gl.setRenderTarget(into);
    cam.layers.set(0);
    gl.render(this.scene, cam);
    gl.autoClear = false;
    gl.clearDepth(); gl.clearStencil();   // (the outlines' stencil goes with the depth: each pass inks a pixel once, vessel-object.ts hullMat)
    cam.layers.set(VESSEL_LAYER);
    gl.render(this.scene, cam);
    if (into) { gl.setRenderTarget(null); this.post.resolve(gl); }
    gl.autoClear = ac;
    cam.layers.mask = mask;
  }

  dispose(): void {
    this.lens.dispose();
    this.disease.dispose();
    this.blood.streams.texture.dispose();
    this.blood.chain.texture.dispose();
    for (const o of this.objects) o.dispose();
    this.procs.dispose(); this.probes.dispose();
    this.tubes.dispose(); this.resistors.dispose(); this.post.dispose();
  }
}

/** The camera layer of everything drawn over the organs: the vessels, the catheter, the varices. */
/** The organs a tap opens a card for in the body view (2D ORGAN_KEYS: the heart, the liver, the spleen; the heart is two meshes). */
const VESSEL_LAYER = 1;

/** Where each named place is: the vessel's id and how far along its 2D course (0 to 1). */
const ANCHORS = {
  ra: ['SVC_RA', 1], ivc: ['IVC_IS', 0.5], rhv: ['RHV_IVC', 0.5], pv: ['PV_TRUNK', 0.5], spleen: ['V_SPL', 0],
} as const satisfies Record<string, readonly [string, number]>;

export { SHOTS };

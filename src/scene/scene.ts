import { edgeOnLine, maskOf } from './devices/probes/organ-edge.ts';
import { Box3, type BufferGeometry, Color, type DataTexture, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, SphereGeometry, type Object3D, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { FIGURE_Z, PLATE_BOUNDS } from './anatomy/placeholder.ts';
import { groundFor } from './ground.ts';
import { MAPPED, NETWORK, NETWORK_BY_ID, type NetVessel, courseOf, feederLive, presenceOf, recruitFrac } from './vessels/network.ts';
import { PresenceTracks } from './vessels/presence-track.ts';
import { FeederLives, LIVE_FLOOR } from './vessels/feeder-live.ts';
import { DIVIDED, PV_START, stumpOf } from './vessels/divide.ts';
import { SEWN_IDS, seamsFor } from './vessels/seams.ts';
import { ShapeTracks } from './vessels/shape-track.ts';
import { REST, coursesOf, tubularOf } from './vessels/shape.ts';
import { buildTubes } from './vessels/tubes.ts';
import { setSmoothJoins } from './vessels/join-mode.ts';
import { SkinSet, SKIN_BUILD_TAG } from './vessels/skin/skin-set.ts';
import { WHY_COLOUR, joinsReport, type JoinsReport } from './vessels/skin/join-report.ts';
import { SkinObject } from './vessels/skin/skin-object.ts';
import { joinsMode, joinsPhase, type JoinsMode } from './vessels/skin/joins-mode.ts';
import { bakedCircuitSkins, bakedPending, bakedReady, bakedSkins } from './vessels/skin/baked.ts';
import { CircuitSkinSet } from './circuit/skins.ts';
import { SKIN_CIRC_IN } from './vessels/skin/types.ts';
import { BURY, SMOOTH } from './vessels/smooth-joins.ts';
/** A hepatic vein that opens into the cava dissolves over the last 0.8 of a cava radius before its wall (shaders.ts cavA) and is not there inside it: its flow marks are held back from where the dissolve starts, 1.8 cava radii from the vein's end
 *  (times the marks' ramp, 2.0 to 3.6, shaders.ts markK), so no chevron is ever caught half faded in it (eyes, v11). */
const CAVA_BURY = 0.9;
/** The ascending lumbar collateral, drawn like the cava (fades.ts CAVA_LIKE) but named on its own. */
const LUMBAR_ID = 'C9';
import { flowRate, flowTarget } from './flow-rate.ts';
import { useSettings } from '../state/settings.ts';
import { FAINT_ONLY_LAYER, VesselObject, circuitWidth } from './vessels/vessel-object.ts';
import { BACK_EDGES } from './vessels/paths.copied.ts';
import { centrelineOf, type Centreline } from './vessels/centreline.ts';
import { nbrMatesOf, cavaMateOf, neighbourAttr } from './vessels/neighbour.ts';
import { fadeOf, opensIntoCava, cavaEndSpan, CAVA_LIKE, CAVA_RECEDE } from './vessels/fades.ts';
import { IVC_EDGES } from './vessels/paths.copied.ts';
import { LensField } from './lenses/field.ts';
import type { LensId } from './lenses/model.ts';
import { BloodMarks, type BloodOptions } from './blood/marks.ts';
import { BloodField } from './blood/field.ts';
import { BloodCells } from './blood/cells/cells.ts';
import { dustTuner } from './blood/dust.ts';
import { turnTargets } from './blood/routes.ts';
import { CIRCUIT_MATES, mateUniform } from './circuit/mates.ts';
import { CameraRig } from './camera/rig.ts';
import { cutUniform, fieldSoft } from './camera/dive.ts';
import { MICRO_DPR } from './micro3d/cel3d.ts';
import { fieldWide } from './lobule/field.ts';
import { ORGAN_CUT } from './organs/layer.ts';
import { quietOf } from './camera/quiet.ts';
import { effectiveDistance, type Room } from './camera/room.ts';
import { SHOTS, type Shot, type ShotName } from './camera/shots.ts';
import { Catheter, type CatheterState } from './catheter.ts';
import { DEFAULT_FLOW_MODE, FLOW_FADE_MS, type FlowMarkMode, markSpeed } from './flow.ts';
import { Highlight, OrganPins, glowGate } from './highlight.ts';
/** Each vessel's course and radius, for the selection's glow (glow.ts). */
import { CelObject, type CelShared, createShared } from './materials/cel.ts';
import { type LookId, PALETTES, type Palette } from './palette.ts';
import { EDGES } from '../engine/hales/portal/topology.js';
import { TEXTURE_WIDTH, hasVessel, indexOf } from '../engine/vessel-data.ts';
import { latest, live, patient } from '../engine/store.ts';
import { x2d, x3, y2d, y3 } from './frame2d.ts';
import { type FigureHit, organHit } from './organs/pick.ts';
import { FLUID_Z } from './disease/ascites.ts';
import { LobuleView, lobuleModel, sinusoidTargets, type LobuleHit, type LobuleLayers, type LobulePartName } from './lobule/index.ts';
import { LIVER_POINT, LOBULE_SCALE, SIN_LOCAL, SIN_REL, SIN_SCALE, lobuleWorld, sinusoidWorld } from './lobule/frames.ts';
import { LOBULE_ORIGIN, LOBULE_R, LOBULE_T, SINUSOID_L, lobuleShot } from './lobule/shots.ts';
import type { Vec3 } from './anatomy/vessels.ts';
import { shortSide } from './sinusoid/portrait.ts';
import { SinusoidView, diveShare, isPortrait, restScale } from './sinusoid/index.ts';
import { Sinusoid3D } from './micro3d/sinusoid3d.ts';
import { Lobule3D } from './micro3d/lobule3d.ts';
import { framePoint, measureScreen } from './sinusoid/portrait.ts';
import { U as SIN_UNIT } from './sinusoid/view.ts';
import { sinusoidBox } from './lobule/shots.ts';
import { ProcedureLayer } from './procedures/layer.ts';
import { DiseaseLayer, type DiseaseParams } from './disease/index.ts';
import { ProbeLayer } from './devices/probes/layer.ts';
import { VESSEL_LAYER, inVesselPass } from './layers.ts';
import { ShuntGuide } from './shunt-guide.ts';
import type { EusDrive } from './devices/probes/scope.ts';
import { probeCards } from './devices/probes/cards.ts';
import { probeAvoid } from './labels/probe-boxes.ts';
import { useUi } from '../ui/ui-store.ts';
import { organsReady } from './organs/meshes.ts';
import { artReady } from './organs/organ-art.ts';
import { clock } from '../clock/frame.ts';
import { COURSES } from './circuit/course.ts';
import { flatOf, growOf, stageOf } from './circuit/grow.ts';
import { attachRuns, slicesFor } from './circuit/geometry.ts';
import { mapToScene, turnScenePt } from './circuit/map.ts';
import { MapLayer, mapRamp } from './circuit/map-layer.ts';
import { circuitBounds } from './circuit/shots.ts';
import { CircuitView } from './circuit/view.ts';
import { CIRCUIT_NODES, MAP_LOOKS, VB_CIRC } from './circuit/data.copied.ts';
import { CircuitTubes } from './circuit/tubes.ts';
import { PostAA } from './post-aa.ts';
import { GlowFx } from './glow-fx.ts';
import { GLOW_LAYER } from './glow.ts';
import { ResistorLayer } from './circuit/resistors.ts';
import { RES_KINDS, type ResKey, resRatio } from './circuit/res-model.ts';
import { MAP_CENTRE, MAP_K, circBoostOf, mapPxPerUnit } from './circuit/map.ts';

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
// (DIVE_IN follows the lobule's scale: the body is gone only when the camera is a few lobule-fits away, where the lobule's field starts to fill the screen. A fixed 0.7 left
//  the screen showing the bare page between the body going and the 1/1500 lobule growing: the near-white flash in the Anatomy -> Lobule dive.)
/** The dive share (sinusoid/view.ts diveShare) below which nothing of the sinusoid is drawn on the way in from the lobule. */
export const SIN_SHOW_FROM = 0.2;   // (the focus pull's start, sinusoid3d FOCUS[0]: the scene is up, its parts not yet drawn, its blur band working)
/** The dive share from which the 3D lobule stands aside under the sinusoid: once the sinusoid (sinusoid3d.ts, whole from 0.86) covers it. */
export const LOBULE_UNDER_FROM = 0.7;
export const DIVE_OUT = 1.9, DIVE_IN = 40 * LOBULE_SCALE;
/** How much of the body is drawn with the camera `d` scene units from the lobule's place: 1 whole, 0 gone (smoothstep between DIVE_IN and DIVE_OUT). */
// (in log distance: the zoom is geometric, so the dissolve runs evenly through the whole dive instead of all at once at its end)
export function bodyFade(d: number, inner = DIVE_IN): number { const t = d <= 0 ? 0 : Math.min(1, Math.max(0, Math.log(d / inner) / Math.log(DIVE_OUT / inner))); return t * t * (3 - 2 * t); }

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
  /** Which junction method to draw (vessels/skin/joins-mode.ts): the page's `?joins` and the default when left out. A test hands one in. */
  joins?: JoinsMode;
}

/** A fork's two tubes know each other (vessels/neighbour.ts): `nbr` on every vertex. */
function withNeighbour(id: string, g: BufferGeometry): void {
  // (every tube carries it, zeros where it has no mate: a junction is a fork only with Smooth vessel joins on, and a toggle rewrites the tubes in place, which needs the attribute to be there either way)
  const a = neighbourAttr(id, g.getAttribute('position').array) ?? new Float32Array(g.getAttribute('position').count * 2);
  g.setAttribute('nbr', new Float32BufferAttribute(a, 2));
}

export class CelScene {
  readonly scene = new Scene();
  /** Everything of the body (organs, vessels, catheter): hidden as one while the lobule or the sinusoid is the view. */
  private readonly body = new Group();
  private readonly shuntGuide = new ShuntGuide();
  private readonly shuntRay = new Raycaster();
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
  /** Blood-cell particles (Settings > Figure depth): built the first time they are switched on, one draw call. */
  readonly cells: BloodCells;
  /** The colour lens (src/scene/lenses/): what colour every vein wears, crossfaded on the clock. */
  readonly lens = new LensField();
  /** The blood's streams (the chevrons' distance, speed and reversed flag, from the 2D app's own stream model). */
  readonly blood = new BloodField();
  /** The flow's one eased rate (flow-rate.ts): every visible phase that rides the blood's distance advances by it. */
  readonly flowRate = flowRate;
  /** The lobule and sinusoid views (B8), built once, hidden until the view is chosen (setView). */
  /** The organs and the disease states on the figure (B4). */
  readonly disease: DiseaseLayer;
  readonly lobule: LobuleView;
  readonly sinus: SinusoidView;
  /** The same two views as true 3D scenes, ALWAYS (Mohammad, 20 Nov 2026: "remove the toggle for 3D or not 3D; everything 3D"): drawn in place of the flat ones' pictures; the flat views keep the model, names, taps and clock. */
  readonly sinus3d: Sinusoid3D;
  readonly lobule3d: Lobule3D;
  private readonly micro3d = true;
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
  /** the vessels with no map course (the tributary fans, the liver's branching veins): the Circuit's shader fades them by 2D's `1 - 2 * T0` (circuit/shader.ts), the model's `live` and the dive's dissolve are composed into their one `fade` (composeFade) */
  private readonly fans = new Map<CelObject, string>();
  private readonly leavingSet = new Set<CelObject>();
  private feeders!: FeederLives;
  private figureView: FigureView = 'body';
  /** The anti-aliasing pass over the whole figure (post-aa.ts). */
  readonly post = new PostAA();
  /** The picked vessel's glow, made on the screen from its mask (glow-fx.ts). */
  readonly glowFx = new GlowFx();
  private readonly dive = new Group();
  private readonly sinFrame = new Group();
  private fadeNow = 1;
  private presence!: PresenceTracks;
  private shapes!: ShapeTracks;
  private healthyQ: ArrayLike<number> | undefined;
  private collateralsOn = false;
  private procQuietWas = false;
  /** the swirl's turns each vessel should carry (blood/routes.ts turnTargets), kept so a frame makes no array */
  private readonly turnsScratch = new Float32Array((EDGES as unknown[]).length);
  private wedgeSet = new Set<string>();
  /** The HVPG's amber column: a tint on the vessels upstream of the balloon (their own shader), thinning toward the branch tips. Eases with the column (one eased number from the procedure's clock). */
  private syncWedge(): void {
    const w = this.procs.wedgeTint(), now = new Set<string>();
    if (w) for (const o of this.vessels) {
      const id = o.edge?.id, p = id ? w.pieces.get(id) : undefined;
      if (!id || !p) continue;
      (o as VesselObject).setWedge(w.amount, p.cut, p.fade, w.color, p.edge, p.front, p.frontEdge); now.add(id);
    }
    for (const id of this.wedgeSet) if (!now.has(id)) (this.vessels.find((o) => o.edge?.id === id) as VesselObject | undefined)?.setWedge(0, 2, 0, undefined, 0.02, -1, 0.02);
    this.wedgeSet = now;
  }
  private bloodOpts = { chevrons: true, keyChevrons: false };
  private readonly byEdge = new Map<string, CelObject>();
  /** the vessels that fade at a free end (fades.ts), and the collaterals whose opening makes the tip solid */
  /** The cava's pieces, and the veins that fade into it: shown whole (2D's F_WHOLE) while the cava is picked or named, eased over FLOW_FADE_MS so nothing pops. */
  private readonly cava: VesselObject[] = [];
  private readonly ivcJoins: VesselObject[] = [];
  /** The hepatic veins, whose last stretch eases to the faint cava's alpha (fades.ts cavaEndSpan). */
  private readonly hvJoins: VesselObject[] = [];
  /** Every vein that opens into the cava (the hepatic and the renal veins): the opacity it comes to at the cava's wall follows the cava's (named: whole). */
  private readonly cavaCuts: VesselObject[] = [];
  /** what each cut hepatic vein's `setCavaCut` was given (the cava piece's lens, where along it, its alpha), so a skin that takes the end over can switch the cut off and the scene put it back */
  private readonly cavaCutArgs = new Map<string, [number, number, number]>();
  /** The vessels of the back tier: they ease toward the page on a turn (quiet depth). */
  private readonly back: VesselObject[] = [];
  /** Settings > Hide vessels behind organs: the share (0 show-through, 1 normal occlusion) the vessels of the back tier are at, and where it is going; eased on the clock. */
  private occNow = 0; private occGoal = 0;
  private cavaGoal = 0;
  private cavaWhole = 0;
  private lumbarGoal = 0; private lumbarWhole = 0;
  private readonly tipFades: { o: VesselObject; connect: readonly string[] }[] = [];
  private look: LookId;
  private phone: boolean;
  private lastNow = -1;
  private width = 1;
  private height = 1;
  private moving = true; // the first frame always draws

  constructor(opts: SceneOptions = {}) {
    this.look = opts.look ?? 'light';
    this.joins = opts.joins ?? joinsMode();
    this.phone = !!opts.phone;
    this.rig = new CameraRig('title', undefined, opts.reduceMotion);

    this.scene.add(this.body);

    setSmoothJoins(useSettings.getState().smoothJoins);   // (Settings > Figure depth > Smooth vessel joins: read before any tube is built)
    for (const def of NETWORK) this.addVessel(def);
    // (junction skins: before the mates, which skip the ends a skin has taken over. On the page they are baked at build time and still on their way: the figure is not drawn before they are in, the boot waits for the same promise)
    if (bakedPending()) void bakedReady.then(() => { if (this.disposed) return; this.refreshSkins(); this.applyMates(); this.moving = true; clock.invalidate('skins'); });
    else this.refreshSkins();
    this.applyMates();
    this.occGoal = this.occNow = useSettings.getState().hideBehind ? 1 : 0;
    for (const o of this.back) o.setOcclusion(this.occNow);
    this.unJoins = useSettings.subscribe((st, prev) => {
      if (st.smoothJoins !== prev.smoothJoins) this.useSmoothJoins(st.smoothJoins);
      if (st.hideBehind !== prev.hideBehind) { this.occGoal = st.hideBehind ? 1 : 0; this.moving = true; }
      if (st.fluidSurface !== prev.fluidSurface) { this.disease.ascites.setLiving(st.fluidSurface); this.moving = true; clock.invalidate('living-fluid'); }
    });
    // the organs and every state of the patient's disease on the figure (clots, plexuses, ascites, bleed, dye): src/scene/disease/ (B4)
    this.disease = new DiseaseLayer(this.shared, this.vessels);
    this.body.add(this.disease.group);
    this.disease.bleed.still = !!opts.reduceMotion;   // (the jet holds still under Reduce Motion)
    this.disease.ascites.still = !!opts.reduceMotion;   // (so does the pool's surface: no ripple, no slosh)
    this.disease.ascites.setLiving(useSettings.getState().fluidSurface, true);   // (Settings > Figure depth > Living fluid: read at boot, then glided)
    // The organs' vertex data is a static file (src/scene/organs/meshes.ts): the organ layer builds them when it is in, in the patient's state, and asks for a frame.
    Promise.all([organsReady, artReady]).then(() => { this.disease.organs.build(); this.moving = true; clock.invalidate('organs'); }, (e) => console.error(e));
    this.catheter = new Catheter(this.shared);
    this.body.add(this.catheter.group);
    this.catheter.group.traverse((c) => c.layers.set(VESSEL_LAYER));
    this.objects.push(...this.catheter.objects); this.leaving.push(...this.catheter.objects); for (const o of this.catheter.objects) this.leavingSet.add(o);
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
      organEdge: (organ, anchor, aim, out) => {
        const o = this.disease.organs.byId.get(organ);
        if (!o) return false;
        o.group.updateWorldMatrix(true, false);
        return edgeOnLine(maskOf(o.toonMesh.geometry), o.group.matrixWorld, anchor, aim, out);
      },
      kpa: (organ) => { const m = latest.frame?.metrics as Record<string, number | null | undefined> | undefined; return m?.[organ === 'spleen' ? 'ssm' : 'lsm'] ?? null; },
      eus: () => { const pl = this.procs.playing; return pl && pl.kind === 'eus' ? this.procs.frame as unknown as EusDrive : null; },
      screen: {
        project: (p, out) => this.rig.project(this.body.localToWorld(p.clone()), out),
        size: () => this.rig.stageSize,
        cards: () => probeCards(),
        avoid: () => probeAvoid(),
        reduceMotion: () => !!opts.reduceMotion,
        moving: () => this.rig.isMoving,
        presenting: () => useUi.getState().deck != null,
      },
    });
    this.body.add(inVesselPass(this.probes.group));
    this.body.add(this.shuntGuide.mesh);

    this.highlight = new Highlight(this.vessels, undefined, new Map(NETWORK.map((v) => [v.id, v.host])));
    this.flow = new BloodMarks(this.vessels);
    // the dust's settings (blood/dust.ts; the hidden ?dust panel writes them): a change wakes the figure for the frames its glide takes
    dustTuner.onWake = () => { this.moving = true; clock.invalidate('dust'); };
    dustTuner.setPhone(this.phone);
    this.cells = new BloodCells({ vessels: NETWORK, object: (id) => this.vesselObject(id), shared: this.shared, lens: this.lens.shared, blood: this.blood.shared, parent: this.body, layer: VESSEL_LAYER, phone: () => this.phone });
    this.presence = new PresenceTracks(this.vessels as VesselObject[]);
    this.presence.own(this.grownIds);
    // the tributary groups are graded by the model's `live` (feeder-live.ts), not drawn on along their flow: their presence keeps only its state
    this.feeders = new FeederLives([...this.fans].map(([obj, id]) => ({ obj: obj as VesselObject, id, conditional: !!NETWORK_BY_ID.get(id)?.feeder?.when })));
    this.presence.own(this.feeders.ids());
    for (const id of this.grownIds) { const g = COURSES.get(id); if (g) this.vesselObject(id)?.setStretchAnchors(g.curveA.getPointAt(0), g.curveC.getPointAt(0)); }
    this.shapes = new ShapeTracks(NETWORK, this.byEdge as unknown as Map<string, VesselObject>);
    this.shapes.onReshaped = (id) => this.skins?.markDirty(id);   // (an arm's course changed: the skin on it is rebuilt in the render phase, skins.step below)
    this.lens.setContext({ healthy: null, ref: null });
    const vo = { look: this.look, phone: this.phone, flowMode: opts.flowMode ?? DEFAULT_FLOW_MODE, reduceMotion: opts.reduceMotion };
    this.lobule = new LobuleView(this.shared, vo); this.sinus = new SinusoidView(this.shared, vo);
    // the lobule stands inside the liver, the sinusoid inside the lobule (lobule/frames.ts): two frames, each a place and a scale
    this.dive.position.set(...LIVER_POINT); this.dive.scale.setScalar(LOBULE_SCALE);
    this.sinFrame.position.set(...SIN_LOCAL); this.sinFrame.scale.setScalar(SIN_REL);
    this.sinFrame.add(this.sinus.group); this.dive.add(this.lobule.group, this.sinFrame); this.scene.add(this.dive, this.mapLayer.group);
    this.lobule.setVisible(false); this.sinus.setVisible(false);
    this.dive.visible = false;   // (the whole dive frame is off at the body's rest: nothing of the lobule or the sinusoid, or anything added to them later, can show on the liver)
    this.sinus3d = new Sinusoid3D(this.sinus, this.shared); this.sinus.group.add(this.sinus3d.group);
    this.lobule3d = new Lobule3D(this.lobule, this.shared);   // (it mounts itself under the Lobule's root: lobule/one-fade.ts)
    this.applyLook(this.look);
  }

  private unJoins: () => void = () => {};
  private disposed = false;

  /** Junction skins (vessels/skin, docs/junction-skin-spec.md): one welded mesh at each junction the page asks for, only with Smooth vessel joins on and `?joins` not `old`. Built here, once per scene load and per join toggle; null: today's joins everywhere. */
  private skins: SkinSet | null = null;
  /** The Circuit's own junction skins (circuit/skins.ts): the same welds on the map, built with the Anatomy's, drawn over the end of the change. */
  private circuitSkins: CircuitSkinSet | null = null;
  private circuitSkinKey = '';
  private joins: JoinsMode;
  /** The inspector's join switch (`?inspect`, src/ui/debug/inspect): the mode is read again from the page's live answer (joins-mode.ts) and the skins are built again on the tubes, or taken away for `old`: the same path as the Smooth vessel joins switch. */
  useJoinsLive(): void {
    const m = joinsMode();
    if (m !== this.joins) { this.joins = m; this.refreshSkins(); this.applyMates(); }
    this.moving = true; clock.invalidate('joins-live');
  }
  /** The mode the skins are built in now. */
  get joinsNow(): JoinsMode { return this.joins; }
  /** The junction skins now drawn (the node names), for tests and the debug page. */
  get skinNodes(): readonly string[] { return this.skins?.nodes ?? []; }
  private refreshSkins(): void {
    const phase = useSettings.getState().smoothJoins ? joinsPhase(this.joins) : 0;
    if (!phase) { this.skins?.dispose(); this.skins = null; this.circuitSkins?.dispose(); this.circuitSkins = null; return; }
    this.skins ??= new SkinSet({
      vessel: (id) => this.byEdge.get(id) as VesselObject | undefined,
      stateOf: (id) => this.shapes?.stateOf(id),
      make: (skin, axes, arms) => new SkinObject(skin, arms[0]!, axes, arms),
      add: (o) => { this.body.add(o); },
      remove: (o) => { this.body.remove(o); },
      baked: bakedSkins,
      endsChanged: () => { this.applyMates(); },   // (a rebuild that failed or came back: the mates and burial of its ends follow)
    });
    this.skins.build(phase);
    this.circuitSkins ??= new CircuitSkinSet({
      vessel: (id) => this.byEdge.get(id) as VesselObject | undefined,
      make: (skin, axes, arms) => new SkinObject(skin, arms[0]!, axes, arms, true),
      add: (o) => { this.body.add(o); },
      remove: (o) => { this.body.remove(o); },
      baked: bakedCircuitSkins,
      endsChanged: () => { this.applyMates(); },   // (a skinned end of the map has no taper of its own: applyMates writes the map's mates again)
    });
    this.circuitSkinKey = '';
    this.circuitSkins.build();
  }

  /** The vessels each vessel's ends carry on into, for the shader's live-width easing (smooth joins on); none with it off. */
  private applyMates(): void {
    const on = useSettings.getState().smoothJoins;
    for (const def of NETWORK) {
      const o = this.byEdge.get(def.id) as VesselObject | undefined, sj = SMOOTH.get(def.id);
      if (!o) continue;
      const mate = (id: string | null | undefined) => { const m = on && id ? NETWORK_MATE.get(id) : undefined; return m ? { index: indexOf(m.lensId), baseD: m.baseD, widthKind: m.widthKind } : null; };
      const sk = this.skins?.endsOf(def.id) ?? [false, false];   // (a skinned end's mate is off: the skin's weights blend the live widths, spec 4.6)
      o.setMates(sk[0] ? null : mate(sj?.mate[0]), sk[1] ? null : mate(sj?.mate[1]));
      // (the map's own pairs and their taper: an end the Circuit's skin has taken over has none, the skin's weights blend the live widths there, as on the body)
      { const cm = CIRCUIT_MATES.get(def.id), ce = this.circuitSkins?.endsOf(def.id) ?? [false, false]; if (cm) o.setCircuitMates(ce[0] ? null : mateUniform(cm[0]), ce[1] ? null : mateUniform(cm[1]), [cm[0]?.ease ?? 0, cm[1]?.ease ?? 0]); }
      // (a junction's fork: the outline of the branch and its trunk is the union's, with the switch on)
      { const nm = nbrMatesOf(def.id)[0], md = nm ? NETWORK_BY_ID.get(nm) : undefined; o.setNbrOn(!!md); if (md) o.setNbrMate(indexOf(md.lensId), md.baseD, md.widthKind); }
      // (a declared branch's end buried in its trunk: the ink stays off inside it, and only there. One rule for every junction, Mohammad 20 Nov: a child's outline is not drawn where it lies inside its parent's lumen.
      //  Besides the declared branches: a hepatic vein's last stretch inside the cava, and a liver branch's first stretch inside the vein it leaves, as far as that vein is wide)
      const bury: [number, number] = [0, 0];
      for (const e of [0, 1] as const) if (on && sj?.attach[e]) bury[e] = BURY * (sj.hostR[e] ?? def.radius);
      for (const e of [0, 1] as const) if (sk[e]) bury[e] = 0;   // (the part of the tube the bury guarded is cut away)
      // THE CAVA'S CUT RULES (spec 10.4): a hepatic vein that opens into the cava is cut away inside the cava's lumen (`cavaCut`, shaders.ts cavA) and its ink held back there (`CAVA_BURY`). Where a skin has taken over that end of it the skin IS the
      // opening (the tube stops at its seam ring, outside the cava's wall), so both are off there and come back, exactly, with the skin. (Its `cavaEnd` ease is zero for every vein now: fades.ts cavaEndSpan.)
      const cc = this.cavaCutArgs.get(def.id);
      if (cc) o.setCavaCut(!sk[1], ...cc);
      if (on && !sk[1] && (this.ivcJoins.includes(o) || opensIntoCava(def.id))) bury[1] = Math.max(bury[1], CAVA_BURY * (NETWORK_BY_ID.get('IVC_IS')?.radius ?? def.radius));
      const joinEnd = def.plan?.kind === 'feeder' ? def.plan.list[0]?.join : undefined;
      if (on && joinEnd != null) bury[joinEnd] = Math.max(bury[joinEnd], BURY * def.radius * (def.plan?.kind === 'feeder' ? (def.plan.list[0]?.k ?? 1) : 1));
      o.setBury(bury[0], bury[1]);
      o.setSmoothColour(on);
    }
  }

  /** Settings > Figure depth > Smooth vessel joins changed: every tube is rewritten in place (same vertices, new positions and widths: the joins are geometry), then drawn once. */
  private useSmoothJoins(on: boolean): void {
    if (!setSmoothJoins(on)) return;
    for (const def of NETWORK) {
      const o = this.byEdge.get(def.id) as VesselObject | undefined;
      if (!o) continue;
      const built = buildTubes(coursesOf(def, this.shapes.stateOf(def.id) ?? REST), tubularOf(def, slicesFor(def.id)), def.radius);
      withNeighbour(def.id, built.geometry);
      o.reshape(built.geometry, built.length);
      built.geometry.dispose();
      }
    this.refreshSkins();   // (the tubes were rewritten: the skins are built again on them, or taken away with the switch)
    this.applyMates();
    this.moving = true;
    clock.invalidate('smooth-joins');
  }

  private add(o: CelObject): void { this.objects.push(o); this.body.add(o.group); }

  private addVessel(def: NetVessel): void {
    const courses = coursesOf(def, REST);
    const built = buildTubes(courses, tubularOf(def, slicesFor(def.id)), def.radius);
    withNeighbour(def.id, built.geometry);
    const circ = COURSES.get(def.id);
    if (circ) attachRuns(built.geometry, built.runs, circ, def.radius);
    const q = STUB_Q[def.lensId] ?? 1;
    const o = new VesselObject(built.geometry, {
      tone: def.tone, artery: def.tone === 'artery', lensIndex: indexOf(def.lensId), widthKind: def.widthKind, circW: circuitWidth(def.widthKind, def.circFine ?? 1), bands: 2, spec: 1, px: def.kind === 'liver' ? 0.9 : def.tone === 'artery' ? 1 : 1.2,
      vessel: { index: indexOf(def.lensId), len: built.length, stubSpeed: markSpeed(q), radius: def.radius, baseD: def.baseD },
    }, this.shared, this.lens.shared, this.blood.shared, this.circuit.shared);
    if (circ) this.circuit.attach({ id: def.id, len: o.toon.uniforms.len as { value: number }, circRow: o.toon.uniforms.circRow as { value: number } });
    else this.fans.set(o, def.id);   // a fan of tributaries has no map course: it never morphs, and the Circuit's shader fades it as 2D does (clamp(1 - 2 * T0))
    { const cm = CIRCUIT_MATES.get(def.id); if (cm) o.setCircuitMates(mateUniform(cm[0]), mateUniform(cm[1]), [cm[0]?.ease ?? 0, cm[1]?.ease ?? 0]); }   // (the map's own pairs and their taper, circuit/mates.ts: whatever the joins switch or a skin says)
    { const nm = nbrMatesOf(def.id)[0], md = nm ? NETWORK_BY_ID.get(nm) : undefined; if (md) { o.setNbrOn(true); o.setNbrMate(indexOf(md.lensId), md.baseD, md.widthKind); } }
    { const cm = cavaMateOf(def.id); if (cm) { const args: [number, number, number] = [indexOf(NETWORK_BY_ID.get(cm)!.lensId), cm === 'IVC_IS_1' ? 0 : 1, fadeOf(cm, false)?.a0 ?? 1]; o.setCavaCut(true, ...args); this.cavaCuts.push(o); this.cavaCutArgs.set(def.id, args); } }
    if (def.lensSpan) o.setLensSpan(def.lensSpan[0], def.lensSpan[1]);
    o.edge = { id: def.id, from: def.from, to: def.to, length: built.length };
    o.group.traverse((c) => c.layers.set(VESSEL_LAYER));
    o.glowMesh?.layers.set(GLOW_LAYER);   // (the glow's mask has its own pass: glow-fx.ts)
    const fade = fadeOf(def.id, def.tone === 'artery', def.feeder?.host);
    if (fade) { o.setTipFade(fade); this.tipFades.push({ o, connect: fade.connect }); if (fade.ivcJoin) this.ivcJoins.push(o); }
    { const span = cavaEndSpan(def.id); if (span > 0) { o.setCavaEnd(span, CAVA_RECEDE); this.hvJoins.push(o); } }
    if (BACK_EDGES.has(def.id)) { o.setBehindOrgans(VESSEL_LAYER, CAVA_LIKE.has(def.id)); this.back.push(o); if (CAVA_LIKE.has(def.id)) this.cava.push(o); }
    this.add(o);
    this.vessels.push(o);
    this.byEdge.set(def.id, o);
  }

  /** The vessel object of an edge, or undefined. */
  vesselObject(id: string): VesselObject | undefined { return this.byEdge.get(id) as VesselObject | undefined; }
  /** The drawn centreline and radius of vessel `id` at its present shape: what anything that lies in a vessel (the HVPG column, a catheter, a probe) binds to (vessels/centreline.ts). */
  vesselCentreline(id: string): Centreline | null { return centrelineOf(id, this.shapes.stateOf(id) ?? REST); }

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
  clearColor(intoTexture = false): Color {
    const ground = MAP_LOOKS[this.look]?.ground;
    this.clear.set(PALETTES[this.look].bg);
    if (ground) this.clear.lerp(this.mapGround.set(ground), mapRamp(this.circuit.t));
    // Into the anti-aliasing pass's texture (post-aa.ts) three clears in its linear working space and the pass writes the canvas the picture's own numbers (every shader of the figure writes sRGB
    // numbers as they are), so the ground would land as the LINEAR value of the page's colour: #F1EBE0 as #E0D4BE and Dark's #1A1917 as near black, a visible plate behind the figure against the
    // chrome. The ground is therefore stored as its own numbers there (rawColor's rule); straight to the canvas three converts it itself.
    return groundFor(this.clear, intoTexture);
  }

  setPhone(phone: boolean): void {
    this.phone = phone;
    for (const o of this.objects) o.setPhone(phone);
    this.procs.setPhone(phone); this.probes.setPhone(phone); this.tubes.setPhone(phone);
    this.disease.setPhone(phone);
    dustTuner.setPhone(phone);
    this.sinus.setPhone(phone);
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
    this.lens.onFrame(f, !!f?.jump && this.sawFrame, performance.now());   // (a new patient: the colours glide from the old patient's)
    this.blood.streams.onFrame(f);
    if (f) { this.syncPresence(f, !this.sawFrame); this.feedDisease(f, !this.sawFrame); }
    if (this.procs.setLive((f as { D?: ArrayLike<number> } | null)?.D ?? null)) this.moving = true;   // (the catheters follow the veins' live width)
    this.procs.syncStents(f, patient.params, f ? !this.sawFrame : false);
    this.procs.syncBands((f as { bands?: number } | null)?.bands ?? 0, f ? !this.sawFrame : false);
    this.procs.syncTamponade(patient.params as never, f ? !this.sawFrame : false);
    this.sawFrame = !!f;
    this.syncCircuitData(f);
    if (this.figureView !== 'body') this.feedViews(false);
    this.moving = true;
  }
  private sawFrame = false;

  /** The patient's disease into the organ and disease layers (src/scene/disease/): the newest frame, the patient's parameters, the healthy pressures. */
  private feedDisease(f: NonNullable<typeof latest.frame>, first: boolean): void {
    this.disease.feed(f as never, (patient.params ?? null) as DiseaseParams | null, (patient.reference?.P as ArrayLike<number> | undefined) ?? null, {
      instant: first,   // (a new patient eases: the organs, the disease and the collaterals glide from the old patient to the new, never swap; only the very first frame is at once)
      presence: (id) => (this.presence.isDrawn(id) ? 1 : 0),
      recruit: (id, fr) => recruitFrac(id, fr as never),
    }, false);
  }

  private readonly focusP = new Vector3();
  /** Where the exam the Tests card is about stands on the screen now, CSS px (a probe's gate or tip); null with no probe up. */
  testFocus(out: { x: number; y: number }): { x: number; y: number } | null {
    const p = this.probes.focus(this.focusP);
    return p ? this.rig.project(this.body.localToWorld(p.clone()), out) : null;
  }

  /** The divided veins (vessels/divide.ts): the splenic vein under a Warren shunt, the portal trunk under a portocaval one, opening and closing with the shunt's drawing on and off. */
  private syncStumps(): void {
    const side = !!(patient.params as { portocavalSide?: boolean } | null)?.portocavalSide;
    for (const [shunt, vein] of DIVIDED) {
      const o = this.byEdge.get(vein) as VesselObject | undefined;
      if (!o) continue;
      const [cut, tie, k] = stumpOf(shunt, vein, this.presence.amountOf(shunt), vein === PV_START && side);
      if (o.setStump(cut, tie, k)) this.moving = true;
    }
    // the stitch rings at a surgical shunt's sewn ends: where the shunt is drawn at all (they ease with its drawing on, as the tube does)
    for (const id of SEWN_IDS) {
      const o = this.byEdge.get(id) as VesselObject | undefined;
      if (!o) continue;
      const [a, b] = seamsFor(id, side);
      if (o.setSeam(a, b)) this.moving = true;
    }
  }

  /** Which vessels are drawn now (a collateral opens by its flow and size; the 2D figure's rules, network.ts presenceOf). */
  private syncPresence(f: NonNullable<typeof latest.frame>, instant: boolean): void {
    for (const v of NETWORK) this.presence.set(v.id, presenceOf(v, f, { collaterals: this.collateralsOn, circuit: this.figureView === 'circuit' }, this.healthyQ), instant);
    for (const v of NETWORK) if (v.feeder) this.feeders.set(v.id, feederLive(v.feeder, f, this.healthyQ), instant);
    this.pushFades();
    this.shapes.onFrame(f as never, performance.now(), this.healthyQ, instant);
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
  setBlood(o: Partial<BloodOptions> & { collaterals?: boolean; keyStreaks?: boolean }): void {
    if (o.keyStreaks !== undefined) this.blood.routes.setKeyOnly(o.keyStreaks);
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
    this.sinus.setBlood(this.bloodOpts);
    this.moving = true;
  }

  // ---- slide state ---------------------------------------------------------------------------

  goTo(shot: ShotName | Shot, room: Room, now: number, ms?: number, ease?: (k: number) => number): void { this.rig.goTo(shot, room, now, ms, false, ease ?? null); this.moving = true; }

  /** The deck's catheter (route, free, wedge, hvpg): drawn by the procedure layer on the HVPG route of the 2D figure, so it is the same device the Tests card plays. The slice catheter keeps the state
   *  (the labels read its tip) and draws nothing. */
  /** The EUS-PPG's two targets in the world, for the cards that point to them: `tip` the hepatic vein's (the HV card), `ahead` the portal vein's (the PV card, 2D's `ahead`). */
  eusTargets(tip: Vector3, ahead: Vector3): boolean {
    this.probes.scope.targetAt(1, tip); this.probes.scope.targetAt(0, ahead);
    this.body.localToWorld(tip); this.body.localToWorld(ahead);
    return true;
  }
  /** The two points a measurement's cards point to (proc-anim.js `at`: 'tip' and 'ahead'), in the world: the EUS-PPG's targets, or the procedure's catheter tip and the point just ahead of it. False with none out. */
  procPoints(kind: string, tip: Vector3, ahead: Vector3): boolean {
    if (kind === 'eus') return this.eusTargets(tip, ahead);
    if (!this.procs.tipPosition(tip) || !this.procs.aheadPosition(ahead)) return false;
    this.body.localToWorld(tip); this.body.localToWorld(ahead);
    return true;
  }
  setCatheter(s: CatheterState & { ring?: 'free' | 'wedge' | 'bad' | null; column?: number; clock?: number }): void {
    // (the still column fills after the balloon is up and the WHVP pill comes after the column, 2D cathTo: the labels read the slice's balloon as "wedged" at 0.999, so it says so only once the column is full)
    const col = s.column ?? s.balloon;
    this.catheter.set({ advance: s.advance, balloon: col >= 0.999 ? s.balloon : Math.min(s.balloon, 0.99) });
    this.catheter.group.visible = false;
    this.procs.showHvpgState(s.advance, s.balloon, s.ring ?? null, s.clock ?? performance.now(), col);
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
    // (the cava is whole only when the cava itself is named or picked: naming the lumbar collateral, which is drawn like the cava, raises its own tone and never the cava's: the whole cava is opaque and hid the arteries that cross it, Mohammad 20 Nov)
    this.cavaGoal = [...ids].some((id) => IVC_EDGES.has(id)) ? 1 : 0;
    this.lumbarGoal = ids.has(LUMBAR_ID) ? 1 : 0;
    this.moving = true;
  }

  /** Eases the back tier between show-through and normal occlusion (Settings > Hide vessels behind organs); true while it moves. */
  private stepOcclusion(dtMs: number): boolean {
    if (this.occNow === this.occGoal) return false;
    const k = Math.min(1, dtMs / FLOW_FADE_MS), d = this.occGoal - this.occNow;
    this.occNow = Math.abs(d) <= k ? this.occGoal : this.occNow + Math.sign(d) * k;
    for (const o of this.back) o.setOcclusion(this.occNow);
    return true;
  }

  /** Eases the cava toward whole or veiled; true while it moves. */
  private stepCava(dtMs: number): boolean {
    if (this.cavaWhole === this.cavaGoal && this.lumbarWhole === this.lumbarGoal) return false;
    const k = Math.min(1, dtMs / FLOW_FADE_MS), d = this.cavaGoal - this.cavaWhole, dl = this.lumbarGoal - this.lumbarWhole;
    this.cavaWhole = Math.abs(d) <= k ? this.cavaGoal : this.cavaWhole + Math.sign(d) * k;
    this.lumbarWhole = Math.abs(dl) <= k ? this.lumbarGoal : this.lumbarWhole + Math.sign(dl) * k;
    for (const o of this.cava) o.setWholeShare(o.edge?.id === LUMBAR_ID ? this.lumbarWhole : this.cavaWhole);
    for (const o of this.ivcJoins) o.setIvcWhole(this.cavaWhole);
    for (const o of this.hvJoins) o.setCavaEndWhole(this.cavaWhole);
    for (const o of this.cavaCuts) o.setCavaJoinWhole(this.cavaWhole);
    return true;
  }

  /** Light a set of vessels at once (the shunt's valid targets); an empty list puts them out. */
  markVessels(ids: readonly string[]): void { this.highlight.setOnly(ids); this.moving = true; }
  /** The vessel under a point of the canvas (CSS px), or null: what a shunt's pointer is over. */
  vesselAtPoint(x: number, y: number): string | null { const h = this.pickTargetAt(x, y, this.shuntRay, false); return h && h.type === 'edge' ? h.id : null; }
  /** The shunt's target under the pointer stands out a little more than the lit others (2D shuntGlow); null lets it go. */
  hoverVessel(id: string | null): void { this.highlight.setHover(id); this.moving = true; }
  /** The shunt's dashed guide, from the middle of vessel `src` to the canvas point (x, y); null (or no src) takes it away. */
  setShuntGuide(src: string | null, x: number, y: number, color: string): void {
    const v = src ? NETWORK_BY_ID.get(src) : null;
    if (!v || !v.pts.length) { if (this.shuntGuide.shown) { this.shuntGuide.hide(); this.moving = true; } return; }
    let total = 0;
    for (let i = 1; i < v.pts.length; i++) total += Math.hypot(v.pts[i]![0] - v.pts[i - 1]![0], v.pts[i]![1] - v.pts[i - 1]![1], v.pts[i]![2] - v.pts[i - 1]![2]);
    let at = 0; const a = new Vector3(...(v.pts[0] as [number, number, number]));
    for (let i = 1; i < v.pts.length; i++) {
      const p0 = v.pts[i - 1]!, p1 = v.pts[i]!, l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      if (at + l >= total / 2 && l > 0) { const k = (total / 2 - at) / l; a.set(p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k, p0[2] + (p1[2] - p0[2]) * k); break; }
      at += l;
    }
    this.shuntRay.setFromCamera(new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.rig.camera);
    const b = this.shuntRay.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -a.z), new Vector3());
    if (!b) return;
    const p0 = this.rig.project(a, { x: 0, y: 0 }), p1 = this.rig.project(a.clone().add(new Vector3(0.1, 0, 0)), { x: 0, y: 0 });
    this.shuntGuide.set(a, b, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 0.1, color);
    this.moving = true;
  }

  /** Outline these organs (organ ids: liver, spleen, heart, bowel, colon, duodenum, kidney-l...); [] clears. */
  /** The lobule's tapped part gets a halo (null lets it go). */
  markLobule(hit: LobuleHit | null): void { this.lobule.setMark(hit); this.moving = true; }
  /** The tapped organ gets a heavy outline (the selection's mark); [] puts it out. */
  selectOrgans(ids: readonly string[]): void { this.pins.select(ids); this.moving = true; }
  pinOrgans(ids: readonly string[], normalSpleen = false): void { this.pins.set(ids); this.pins.setNormalOutline(normalSpleen); this.moving = true; }

  /** Free play: pick a vessel by edge ID (or clear it with null). */
  pick(id: string | null): void { this.highlight.set(id); this.syncNamed(); }

  /** (The 2D app has one style of flow head; the four options of the first slice are gone. Kept for the views that still take a mode.) */
  setFlowMode(mode: FlowMarkMode): void { this.sinus.setFlowMode(mode); this.moving = true; }

  // ---- the figure's view: body, lobule, sinusoid ---------------------------------------------

  get view(): FigureView { return this.figureView; }
  /** Show the body, the lobule or the sinusoid: the others are hidden and cost nothing (nothing is built or compiled here; the views were made at start). The camera is the caller's. */
  setView(v: FigureView, now = performance.now()): void {
    const wasCircuit = this.figureView === 'circuit';
    this.figureView = v;
    if (wasCircuit !== (v === 'circuit') && latest.frame) this.syncPresence(latest.frame, false);   // (the liver's beds are drawn on the map only: they draw on as the body turns into it, and draw back as it returns)
    this.rig.setSubject(v === 'lobule' ? lobuleCorners() : v === 'sinusoid' ? (sinusoidBox() as Vec3[]) : null);
    // the view being left stays drawn until the camera has landed on the new one (nothing pops while it flies); then it is hidden
    this.body.visible ||= v === 'body' || v === 'circuit';
    // the body turns into the map (or back) on the camera's own clock, from wherever it stands
    if (v === 'circuit') { if (this.circuit.t === 0) this.circuit.snapTurn(this.circuit.upright); }
    this.circuit.go(v === 'circuit', now);
    this.rig.setBounds(v === 'circuit' ? circuitBounds(this.circuit.upright) : { ...PLATE_BOUNDS, z: FIGURE_Z });
    if (v === 'lobule') this.lobule.setVisible(true);
    if (v === 'sinusoid') this.sinus.setVisible(true);
    // (the dive frame is not switched on here: fadeBody shows it only once the camera is through the liver's surface and the body is dissolving, so the lobule is never seen on or through the liver)
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
    this.dive.visible = v === 'lobule' || v === 'sinusoid';
    this.hideLeftBehind = false;
  }
  /** The body dissolves as the camera goes into the liver and comes back as it leaves (a function of the camera's distance to the lobule's place, so the dive in and the way out are the same picture run both ways). */
  private fadeBody(): void {
    // the dive's effects belong to a dive (or to the lobule and the sinusoid): a close-up of the body at rest (a deck's zoom on the liver) is outside every dive and never fades the organs or opens the window
    const f = this.inDive() ? bodyFade(this.rig.camera.position.distanceTo(this.livePoint), this.diveIn()) : 1;
    // the lobule and the sinusoid live inside the liver: drawn only once the body has begun to dissolve (the camera is through the surface) or when one of them is the view at rest.
    // Before, the dive frame was on for the whole flight, so the see-through liver showed the lobule on its surface and the two fought in the wash (the dive's flicker).
    const dv = this.figureView === 'lobule' || this.figureView === 'sinusoid' ? (!this.hideLeftBehind || f < 1) : this.hideLeftBehind && f < 1;
    if (this.dive.visible !== dv) { this.dive.visible = dv; this.moving = true; }
    if (f === this.fadeNow || (Math.abs(f - this.fadeNow) < 1e-3 && f > 0 && f < 1)) return;
    this.fadeNow = f;
    this.pushFades();
    this.disease.setFade(Math.min(f, this.lastFade));
    this.body.visible = f > 0 || this.figureView === 'body';
    this.moving = true;
  }
  /** What an object's `fade` is: ONE value composed of everything that dissolves it (before, the dive's dissolve and the Circuit's change both wrote the uniform and the last writer won): the dive's
   *  dissolve of the body, the Circuit's change for what leaves with the organs (1 - t), and a conditional tributary group's own `live`. (A fan's Circuit fade, 2D's 1 - 2 * T0, is the vertex shader's.) */
  private composeFade(o: CelObject): number {
    let f = this.fadeNow;
    if (this.leavingSet.has(o)) f = Math.min(f, this.lastFade);
    const id = this.fans.get(o);
    if (id !== undefined) f = Math.min(f, this.feeders.liveOf(id));
    return f;
  }
  /** Writes the composed fade to every object (only a change reaches it: the dive, the Circuit's change, the model's `live`). A tributary group is drawn only while it has something to show and the change has not taken it (the shader fades it out by the half-way point). */
  private pushFades(): void {
    let changed = false;
    for (const o of this.objects) { const f = this.composeFade(o); if (o.fade !== f) { o.setFade(f); changed = true; } }
    const half = this.circuit.t < 0.5;
    for (const [o, id] of this.fans) {
      const vis = half && (!NETWORK_BY_ID.get(id)!.feeder?.when || this.feeders.liveOf(id) > LIVE_FLOOR);
      if (o.group.visible !== vis) { o.group.visible = vis; changed = true; }
    }
    if (changed) this.moving = true;
  }
  private readonly livePoint = new Vector3(...LIVER_POINT);
  /** Whether the camera is in, or on its way into or out of, the liver (the lobule, the sinusoid, or a view change still flying): the only time the dive's fade, window and field apply. */
  private inDive(): boolean { return this.figureView === 'lobule' || this.figureView === 'sinusoid' || this.hideLeftBehind; }
  private readonly mapPt = new Vector3(MAP_CENTRE.x, MAP_CENTRE.y, MAP_CENTRE.z);
  /** The sinusoid's tissue is one opaque plane to every edge of the screen once the camera has landed on it (the lobule is then hidden: nothing of the lobule is ever seen through or around it). While the
   *  camera flies between the lobule and the sinusoid (the view being left stays drawn until it lands) the tissue comes in over the lobule by how far the dive has gone (the pose's own distance: the
   *  shots' `r`, blended geometrically, whatever the room and the screen), as 2D's zoom does it. */
  private stepSinusDive(): void {
    // (only while the camera is really flying: a dive share kept past the landing would hold the tissue dim, its detail, names and arrows away)
    const flying = this.hideLeftBehind && this.sinus.isVisible && this.rig.isMoving;
    const share = flying ? diveShare(this.rig.pose.shot.r, 2.5 * LOBULE_SCALE, 3 * SIN_SCALE) : null;
    this.sinus.setDive(share);
    // (the same rule as the lobule in the liver: nothing of the sinusoid is drawn until the dive is close to landing. Before, its frame was up for the whole flight and a line of it
    //  showed over the zoomed-out lobule. Every part of it fades in from SIN_SHOW_FROM or later (the 3D parts grow out from the lumen from 0.3, sinusoid3d REVEAL_FROM), so hiding it below that never pops.)
    const sv = share == null || share >= SIN_SHOW_FROM;
    if (this.sinFrame.visible !== sv) { this.sinFrame.visible = sv; this.moving = true; }
  }
  /** The dive's cutaway window in the organs' wash and the field's focus: both are functions of the camera's distance to the place dived to, so the way in and the way out are one picture run both ways,
   *  however the move is reversed, held or resized by a card (camera/dive.ts). Nothing changes at rest: every body shot is outside the window. */
  private stepCutaway(): void {
    const cam = this.rig.camera, d = this.inDive() ? cam.position.distanceTo(this.livePoint) : Infinity;
    const p = this.divePt.copy(this.livePoint).project(cam);
    // (owner, 20 Nov: no cut-out. The circular window drew a dark-ringed disc in the liver with nothing in it; the body now dissolves evenly over the lobules' field, which
    //  fills the screen from the moment the camera is inside. The window stays shut: cutUniform at an infinite distance.)
    cutUniform(Infinity, p.x, p.y, cam.aspect, this.cutArr, this.diveIn());
    const was = ORGAN_CUT.value.z;
    ORGAN_CUT.value.set(this.cutArr[0], this.cutArr[1], this.cutArr[2], this.cutArr[3]);
    this.lobule.field.setSoft(fieldSoft(d, this.lobuleRest()));
    this.lobule.field.setWide(fieldWide(d, this.lobuleRest()));   // (from afar the field reaches every edge: the liver's inside is lobules throughout the dive)
    if (was !== this.cutArr[2] && (was > -1 || this.cutArr[2] > -1)) this.moving = true;
  }
  /** A portrait room (narrower than tall, 2D's `W < H * 0.95`) runs the sinusoid top to bottom: the sinusoid view takes it (SinusoidView.setPortrait, the sinusoid worker's), and the shot asks for it (sinusoidShot(portrait)). */
  private portrait = false;
  private readonly sinusPt = new Vector3(); private readonly scrO = { x: 0, y: 0 }; private readonly scrA = { x: 0, y: 0 };
  private stepPortrait(): void {
    const r = this.rig.targetRoom, st = this.rig.stageSize, p = isPortrait(st.w, st.h);   // (2D's rule on the stage: ensureGeo(W, H))
    if (p !== this.portrait) {
      this.portrait = p;
      this.sinus.setPortrait(p);
      this.moving = true;
    }
    // what the view needs of the screen to lay its end arrows and run its traffic as 2D does: px per µm along the flow (the hand's zoom included), the room's length and the canvas's along it
    const short = shortSide(p, r), s = this.rig.stageSize;
    // (measured on the screen, not modelled: where the sinusoid's middle and a point 10 µm down the flow land, against the free room's middle)
    if (!this.sinus.isVisible) return;   // (nothing of the view is read while it is away)
    const o = this.rig.project(this.sinusPt.set(...sinusoidWorld([0, 0, 0])), this.scrO), a = this.rig.project(this.sinusPt.set(...sinusoidWorld(framePoint(10, 0, SIN_UNIT, 0))), this.scrA);   // (the plane keeps its own frame; the camera's roll turns it on screen)
    const m = measureScreen(o, a, this.rig.roomCentre());
    this.sinus.setScreen(m.k > 0 ? m.k : restScale(short) * this.rig.handZoom, p ? r.h : r.w, p ? s.h : s.w, m.k > 0 ? m.centreUm : 0);
  }
  get isPortrait(): boolean { return this.portrait; }
  /** The distance the camera sits at with the whole lobule framed in the room it has (kept per room size). */
  private restKey = ''; private restD = 0.1;
  private lobuleRest(): number {
    const r = this.rig.targetRoom, key = `${r.w}x${r.h}x${this.height}x${this.width}`;
    if (key !== this.restKey) { this.restKey = key; this.restD = effectiveDistance(lobuleShot('lobule'), r, this.height, this.width); }
    return this.restD;
  }
  /** Where the body is gone: twice the distance the lobule lands at in this room (never nearer than DIVE_IN), so the body is always gone on landing, whatever the screen. */
  private diveIn(): number { return Math.max(DIVE_IN, 2 * this.lobuleRest()); }
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

  /** What every vessel is doing now, for the debug page (`pps.vessels()` on `?debug`): which are drawn, with what fade, reveal, caps and widths, and why one is not. */
  probeVessels(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const row = (o: VesselObject, extra: Record<string, unknown>) => {
      const u = o.toon.uniforms, v = (n: string) => { const x = (u[n] as { value: unknown } | undefined)?.value; return x && typeof x === 'object' && 'toArray' in x ? (x as { toArray(): number[] }).toArray().map((n2) => +n2.toFixed(3)) : x; };
      rows.push({ id: o.edge?.id, visible: o.group.visible, fade: v('fade'), reveal: v('reveal'), circT: v('circT'), circW: v('circW'), circCap: v('circCap'), circRow: v('circRow'), len: v('len'), radius: v('radius'), transparent: o.toon.transparent, ...extra });
    };
    for (const o of this.vessels) row(o as VesselObject, { kind: 'vessel', presence: this.presence.stateOf(o.edge?.id ?? ''), drawn: this.vesselDrawn(o.edge?.id ?? '') });
    this.tubes.objects.forEach((o, i) => row(o, { kind: 'tube', tube: this.tubes.ids[i]?.id }));
    rows.push({ id: '*', fadeNow: this.fadeNow, circBoost: this.circuit.shared.circBoost.value, circPerPx: this.circuit.shared.circPerPx.value, t: this.circuit.t, rr: this.circuit.rr, bodyVisible: this.body.visible, view: this.figureView });
    return rows;
  }

  private capSig = 0;
  /** The Circuit rounds the ends no other drawn vessel meets (a collateral that opens covers its own join again; a closed one leaves a clean end). Only when the set of drawn vessels changes. */
  private updateCaps(): void {
    let sig = 17;
    for (const v of MAPPED) sig = (sig * 31 + (this.presence.stateOf(v.id) === 'shown' ? 1 : 0)) | 0;
    if (sig === this.capSig) return;
    this.capSig = sig;
    const shown = (id: string) => this.presence.stateOf(id) === 'shown';
    const free = (node: string, self: string) => !(this.stationsOf.get(node) ?? []).some((e) => e !== self && shown(e));
    for (const v of MAPPED) { const o = this.byEdge.get(v.id) as VesselObject | undefined; if (o && shown(v.id)) o.setCircCap(free(v.from, v.id) ? 1 : 0, free(v.to, v.id) ? 1 : 0); }
  }

  /** The map's size on the screen now: 2D's circBoost (the lines widen as it is zoomed out, 1 to 1.75) and the map units under one CSS pixel (the floor of every line's width). */
  private circuitScale(): void {
    const cam = this.rig.camera, h = this.rig.stageSize.h, sc = mapPxPerUnit(h, cam.projectionMatrix.elements[5]!, cam.position.distanceTo(this.mapPt));
    this.circuit.shared.circBoost.value = circBoostOf(sc);
    this.circuit.shared.circPerPx.value = sc > 0 ? Math.min(40, 1 / sc) : 1;
  }

  /** Steps everything on the clock. Returns true while the scene moves, so the clock asks for another frame; false means draw nothing. */
  update(now: number): boolean {
    const dt = this.lastNow < 0 ? 16 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    this.shared.time.value = (now / 1000) % 1000;
    const camMoving = this.rig.update(now);
    this.circuitScale();   // (the map's lines widen as it is zoomed out, as 2D's circBoost)
    const quiet = quietOf(this.rig.orbitAngle);
    for (const o of this.back) o.setQuiet(quiet);
    this.disease.organs.setQuiet(quiet);   // (quiet depth on a turn: the organs' wash eases back as the figure turns)
    const circMoving = this.stepCircuit(now, dt);
    this.fadeBody();
    // (the camera's own move, not the gentle tilt still easing or a hand on the figure: the view left behind goes the moment the move lands)
    if (this.hideLeftBehind && !this.rig.isMoving && !this.circuit.moving) this.settleViews();
    this.highlight.setGlowShown(glowGate(this.circuit.t));   // (it eases away over the change's first 15 %, never snaps at the switch)
    const hiMoving = this.highlight.step(dt);
    const pinMoving = this.pins.step(dt, this.disease.organs.byId);
    this.blood.shared.projY.value = this.rig.camera.projectionMatrix.elements[5]!;
    this.flowRate.step(dt / 1000, flowTarget(live.frame?.running));   // (Pause and Play ease the visible flow, 0.5 s each way; the model's own numbers pause at once)
    // ONE GATE for the flow marks during procedures: while any procedure is on the figure (a catheter's run or its held step, the scope) the chevrons and the streaks ease out, and back when it ends
    const procQuiet = this.procs.busy || !!this.probes.scope.driven;
    if (procQuiet !== this.procQuietWas) { this.procQuietWas = procQuiet; this.flow.setOptions({ quiet: procQuiet }); }
    const streamsMoving = this.blood.streams.step(now, this.flowRate.value);
    const chainMoving = this.blood.chain.step(now, this.blood.streams, (id) => this.flow.carriesHeads(id), this.circuit.t);
    const routesMoving = this.blood.routes.step(now, this.blood.streams, (id) => this.flow.carriesHeads(id), turnTargets(this.blood.streams, dustTuner.uniform.value, this.turnsScratch), this.circuit.t);
    const occMoving = this.stepOcclusion(dt);
    const flowActive = this.flow.step(dt) || streamsMoving || chainMoving || routesMoving || this.stepCava(dt) || occMoving;
    const lensMoving = this.lens.step(now);
    const dustMoving = dustTuner.step(dt);
    const cellsMoving = this.cells.step(dt, { view: this.figureView, circuit: this.circuit.t, body: this.fadeNow, flowMoving: streamsMoving, quiet: procQuiet });
    const presMoving = this.presence.step(dt) || this.feeders.step(dt, () => this.pushFades());
    this.syncStumps();
    this.updateCaps();
    const shapeMoving = this.shapes.step(dt);
    // (one junction skin rebuilt at most, here in the render phase and before the handover, so the tubes and the skin change together; while one still waits, the clock is asked for the next frame under the tag `skin-build`)
    const skinPending = this.skins?.step() ?? false;
    if (skinPending) clock.invalidate(SKIN_BUILD_TAG);
    const skinMoving = (this.skins?.sync() ?? false) || skinPending || (this.circuitSkins?.sync() ?? false);   // (only an arm whose own fade, highlight, lens position or colour changed reaches its skin)
    this.stepSinusDive();
    this.stepCutaway();
    this.stepPortrait();
    this.sinus3d.pinTraffic(this.micro3d);
    const lobMoving = this.lobule.update(now), sinMoving = this.sinus.update(now);
    // (the 3D lobule dissolves as the camera goes down onto the sinusoid, and stands aside once landed: its solid tiles and tubes rise above the sinusoid's plane and would cross it in the foreground)
    // (the lobule stays whole under the sinusoid until the sinusoid is whole over it, then stands aside: the two dissolving at once let the page show through both, the pale washed frame of
    //  the Lobule -> Sinusoid handoff, eyes 20 Nov. The sinusoid is drawn over it, lifted, from SIN_SHOW_FROM, so nothing of the lobule shows once it is whole.)
    const dv = this.sinus.diveShareNow, under = !this.sinus.isVisible ? 0 : dv == null ? 1 : smoothstep01(LOBULE_UNDER_FROM, LOBULE_UNDER_FROM + 0.04, dv);
    const lob3 = this.lobule3d.update(this.micro3d, under, now, this.flowRate.value), sin3 = this.sinus3d.update(this.micro3d, this.flowRate.value);
    this.sinus3d.holdScale(this.rig.camera.position);
    const viewMoving = lob3 || sin3 || lobMoving || sinMoving;
    const procMoving = this.procs.update(now);
    this.syncWedge();
    const diseaseMoving = this.disease.update(now, this.flowRate.value);
    if (diseaseMoving) this.tagOverOrgans();
    const probesMoving = this.probes.update(now, this.circuit.t > 0.02, this.procs.glueDrive);
    const needs = probesMoving || diseaseMoving || this.moving || procMoving || camMoving || circMoving || hiMoving || pinMoving || flowActive || cellsMoving || dustMoving || lensMoving || presMoving || shapeMoving || viewMoving || skinMoving;
    this.moving = false;
    return needs;
  }

  /** The liver's own branches (portal venules, sinusoids, hepatic venules) draw on along their flow as the body turns into the map, and back, on the change's eased share (circuit/grow.ts). */
  private growLiver(t: number): void {
    if (t === this.lastGrow) return;
    this.lastGrow = t;
    for (const id of this.grownIds) {
      const g = growOf(id, t) ?? 0;
      this.presence.drive(id, g);
      this.vesselObject(id)?.setFlat(flatOf(g));
    }
  }
  private lastGrow = -1;
  private readonly grownIds: readonly string[] = NETWORK.filter((v) => v.kind === 'liver' && stageOf(v.id)).map((v) => v.id);

  /** The change and the turn, the organs leaving, the map coming in and its stations' dots. */
  private stepCircuit(now: number, dt: number): boolean {
    const moving = this.circuit.update(now), t = this.circuit.t;
    const fade = 1 - t;
    if (fade !== this.lastFade) {
      this.lastFade = fade;
      for (const o of [...this.leaving, ...this.disease.organs.objects]) o.group.visible = fade > 0.001;
      this.pushFades();   // (the fades are composed in one place: the leaving objects, the fans' visibility)
      this.disease.setFade(Math.min(fade, this.fadeNow));
    }
    this.mapLayer.set(mapRamp(t), this.circuit.rr);
    // the map's junction skins: drawn only over the end of the change, turned with the map (they are built on the unturned map; the tubes turn in their shader)
    if (this.circuitSkins) {
      const rot = this.circuit.shared.circRot.value, key = `${t > SKIN_CIRC_IN - 0.02 ? 1 : 0}|${rot.x}|${rot.y}`;
      if (key !== this.circuitSkinKey) { this.circuitSkinKey = key; this.circuitSkins.show(t > SKIN_CIRC_IN - 0.02); this.circuitSkins.setTurn(rot.x, rot.y); }
    }
    this.procs.setFade(fade);
    const ramp = mapRamp(t);
    this.growLiver(t);
    const tubesMoving = this.tubes.update(dt, { ramp, t, body: this.fadeNow, drawn: (id) => this.vesselDrawn(id), caudPin: this.caudPin, open: this.openShunts });
    this.resistors.setAlpha(ramp);
    let resMoving = false;
    if (ramp > 0) { this.resistors.set(this.resNow, this.mapScale()); resMoving = this.resistors.step(dt); this.mapLayer.setScale(this.mapScale()); }
    let dots = false;
    if (t > 0) dots = this.mapLayer.stepDots((id) => (this.stationsOf.get(id) ?? []).some((e) => this.presence.stateOf(e) === 'shown'), Math.min(1, dt / 280));
    return moving || dots || tubesMoving || resMoving;
  }

  /** What the disease layer puts on the vessels (clots, plexus strands, the bleed, the dye) is drawn with them, over the organs (the layers are made as the states come on, so they are tagged as they move). */
  private tagOverOrgans(): void {
    const d = this.disease;
    for (const g of [d.clots.group, d.strands.group, d.bleed.group, d.dye.group]) g.traverse((c) => { if (c.layers.mask !== 2) c.layers.set(VESSEL_LAYER); });
  }

  // ---- the inspector's hooks (?inspect): layers on and off, wireframe. Nothing here runs unless the panel has set something. ------------------------------------------------------------------------
  private readonly inspectHidden = new Set<string>();
  private readonly inspectWired = new Set<string>();
  /** The parts of the figure the inspector can switch, each with the objects it stands for now (the vessels' tubes, the junction skins, the organs, what the disease puts on the vessels, the devices, the Circuit's map, the lobule and the sinusoid). */
  inspectLayers(): readonly { id: string; label: string; objects: () => readonly Object3D[] }[] {
    const d = this.disease;
    return [
      { id: 'tubes', label: 'Vessel tubes', objects: () => this.vessels.map((o) => o.group) },
      { id: 'skins', label: 'Junction skins', objects: () => this.body.children.filter((c) => c.name.startsWith('skin:')) },
      { id: 'organs', label: 'Organs', objects: () => [d.organs.group] },
      { id: 'disease', label: 'Clots, plexus, bleed, dye', objects: () => [d.clots.group, d.strands.group, d.bleed.group, d.dye.group] },
      { id: 'devices', label: 'Catheter, procedures, probes', objects: () => [this.catheter.group, this.procs.group, this.probes.group] },
      { id: 'circuit', label: 'Circuit map', objects: () => [this.tubes.group, this.mapLayer.group] },
      { id: 'dive', label: 'Lobule and sinusoid', objects: () => [this.dive] },
    ];
  }
  private inspectSolo = new Set<string>();
  private inspectMute = new Set<string>();
  /** Solo and mute by vessel id (`?inspect`, the panel's vessel list): with a solo set only those are drawn, a muted one never; a junction skin is drawn while any of its arms is. */
  setInspectVessels(solo: readonly string[], mute: readonly string[]): void { this.inspectSolo = new Set(solo); this.inspectMute = new Set(mute); this.moving = true; clock.invalidate('inspect'); }
  /** Every vessel the scene has (id, kind, label), and whether it is drawn now, for the panel's list. */
  inspectVesselList(): readonly { id: string; kind: string; label: string; drawn: boolean }[] {
    return NETWORK.map((v) => ({ id: v.id, kind: v.kind, label: v.label, drawn: this.presence.isDrawn(v.id) }));
  }
  /** What the junction skins did not weld (`?inspect`, the panel's Joins report): arms left out, nodes that kept tube joins, every unwelded tube end with its place. Read when asked, never per frame. */
  inspectJoinsReport(): JoinsReport {
    return joinsReport({
      endsOf: (id) => this.skins?.endsOf(id) ?? [false, false], dropped: this.skins?.dropped ?? [], fellBack: this.skins?.fellBack ?? [], built: this.skinNodes,
      circuitFellBack: this.circuitSkins?.fellBack ?? [], stateOf: (id) => this.shapes?.stateOf(id),
    });
  }
  private inspectMarks: Group | null = null;
  /** Marks the unwelded ends in the figure (a ball at each, in the colour of its reason, drawn over everything), or only those of vessel `only`; none when `on` is false. Built from the report at the time of the call: press it again after a change. Returns how many. */
  setInspectMarks(on: boolean, only: string | null = null): number {
    if (this.inspectMarks) { this.body.remove(this.inspectMarks); this.inspectMarks.traverse((c) => { if (c instanceof Mesh) { c.geometry.dispose(); (c.material as MeshBasicMaterial).dispose(); } }); this.inspectMarks = null; }
    let n = 0;
    if (on) {
      const g = new Group(); g.name = 'inspect-marks';
      for (const u of this.inspectJoinsReport().unwelded) {
        if (only && u.id !== only) continue;
        const m = new Mesh(new SphereGeometry(Math.max(u.radius * 1.5, 2.5), 12, 8), new MeshBasicMaterial({ color: WHY_COLOUR[u.why], transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }));
        m.position.set(u.pos[0], u.pos[1], u.pos[2]); m.renderOrder = 999; m.name = `unwelded:${u.id}:${u.end}`; g.add(m); n++;
      }
      g.traverse((c) => c.layers.set(VESSEL_LAYER));
      this.body.add(g); this.inspectMarks = g;
    }
    this.moving = true; clock.invalidate('inspect');
    return n;
  }
  /** Shows or hides one of `inspectLayers` (drawn or not; what the scene itself shows and hides is not touched: the flag is put on for the draw and taken off after it). */
  setInspectShown(id: string, shown: boolean): void { if (shown) this.inspectHidden.delete(id); else this.inspectHidden.add(id); this.moving = true; clock.invalidate('inspect'); }
  isInspectShown(id: string): boolean { return !this.inspectHidden.has(id); }
  /** Draws one of `inspectLayers` as a wireframe (every mesh under it; a part built later, a skin rebuilt, is taken up on the next frame). */
  setInspectWire(id: string, on: boolean): void {
    if (on) this.inspectWired.add(id);
    else {
      this.inspectWired.delete(id);
      for (const l of this.inspectLayers()) if (l.id === id) for (const o of l.objects()) o.traverse((c) => { if (c instanceof Mesh) for (const m of Array.isArray(c.material) ? c.material : [c.material]) if ((m as { wireframe?: boolean }).wireframe) { (m as { wireframe: boolean }).wireframe = false; } });
    }
    this.moving = true; clock.invalidate('inspect');
  }
  /** Before the draw: the hidden layers' flags go off and the wired layers' materials are set; returns what puts the flags back, or null when the inspector asked for nothing. */
  private inspectBegin(): (() => void) | null {
    if (!this.inspectHidden.size && !this.inspectWired.size && !this.inspectSolo.size && !this.inspectMute.size) return null;
    const back: Object3D[] = [];
    if (this.inspectSolo.size || this.inspectMute.size) {
      const shown = (id: string | undefined) => !!id && !this.inspectMute.has(id) && (!this.inspectSolo.size || this.inspectSolo.has(id));
      for (const o of this.vessels) if (o.group.visible && !shown(o.edge?.id)) { o.group.visible = false; back.push(o.group); }
      for (const s of this.skins?.drawnArms() ?? []) if (s.object.visible && !s.arms.some(shown)) { s.object.visible = false; back.push(s.object); }
    }
    for (const l of this.inspectLayers()) {
      const hide = this.inspectHidden.has(l.id), wire = this.inspectWired.has(l.id);
      if (!hide && !wire) continue;
      for (const o of l.objects()) {
        if (hide && o.visible) { o.visible = false; back.push(o); }
        if (wire) o.traverse((c) => { if (c instanceof Mesh) for (const m of Array.isArray(c.material) ? c.material : [c.material]) { const w = m as { wireframe?: boolean }; if (w.wireframe === false) w.wireframe = true; } });
      }
    }
    return () => { for (const o of back) o.visible = true; };
  }

  /** Until the camera has its first real shot and room only the background is drawn, so the figure's first picture is already in its place. */
  render(gl: WebGLRenderer): void {
    if (!this.rig.placed) { gl.clear(); return; }
    gl.setClearColor(this.clearColor(this.post.on));
    const dpr = gl.getPixelRatio?.() ?? 1;
    this.blood.shared.dpr.value = dpr;   // (the vessels' line is set in CSS px and converted with it)
    dustTuner.setView(this.phone, this.width * this.height * dpr * dpr);   // (the dust's samples a pixel follow the device and the canvas: blood/dust-spec.ts dustBudget)
    this.lobule3d.setDpr(dpr);
    this.disease.organs.setDpr(dpr);
    MICRO_DPR.value = dpr;   // (the micro parts' lines drawn in the fill are CSS px wide on every screen)
    // Two passes, as the 2D figure paints: the organs first, then the vessels (and what is in them) over the cleared depth, so no organ's relief ever hides a vessel and a joined
    // vessel never looks cut. (The vessels keep their own depth among themselves: their tiers.)
    const cam = this.rig.camera, mask = cam.layers.mask, ac = gl.autoClear;
    const inspectEnd = this.inspectBegin();   // (the inspector's hidden layers and wireframes: null, and nothing done, on every page without the panel)
    // the figure is drawn into a texture of the canvas's size and filtered onto the canvas once (post-aa.ts), unless the pass is off or the device refused it
    // depth of field in the dive (desktop only, post-dof.ts): zero cost unless its strength is above 0; the vessels' pass then keeps the depth the first pass drew (it draws nothing once the body is gone)
    const dofShare = this.post.dof.frame(this.figureView, cam, this.rig.pose.shot.target, cam.position.distanceTo(this.livePoint), this.lobuleRest(), DIVE_IN);
    const into = this.post.target(gl);
    const dof = dofShare > 0 && !!into?.depthTexture;
    // the sinusoid's focus band (every device): its own lumen and plates sharp, the neighbours and whatever drifts off them blurring by distance (post-dof.ts bandFrame)
    const bandK = into && (this.figureView === 'sinusoid' || this.sinus.diveShareNow != null) ? this.sinus3d.focusBand(_bA, _bB, _bE0, _bE1, _bEnds) : 0;
    this.post.dof.bandOpen = this.sinus3d.focusOpen;
    const band = bandK > 0 && this.post.dof.bandFrame(cam, _bA, _bB, _bE0, _bE1, into!.width, into!.height, bandK, _bEnds) > 0;
    if (!band) this.post.dof.bandShare = 0;
    if (into) gl.setRenderTarget(into);
    cam.layers.set(0);
    gl.render(this.scene, cam);
    gl.autoClear = false;
    if (!dof) { gl.clearDepth(); gl.clearStencil(); }   // (the outlines' stencil goes with the depth: each pass inks a pixel once, vessel-object.ts hullMat)
    cam.layers.set(VESSEL_LAYER);
    gl.render(this.scene, cam);
    if (this.highlight.glowing) this.glowFx.run(gl, into, cam, this.scene, dpr);   // (the picked vessel's glow: its mask, blurred, over the figure outside it)
    if (into) { if (dof || band) this.post.dof.run(gl, into); gl.setRenderTarget(null); this.post.resolve(gl); }
    gl.autoClear = ac;
    cam.layers.mask = mask;
    inspectEnd?.();
  }

  dispose(): void {
    this.disposed = true;
    this.unJoins();
    if (this.inspectMarks) this.setInspectMarks(false);
    this.skins?.dispose();
    this.circuitSkins?.dispose();
    this.sinus3d.dispose(); this.lobule3d.dispose();
    this.lens.dispose();
    this.cells.dispose();
    this.disease.dispose();
    this.blood.streams.texture.dispose();
    this.blood.chain.texture.dispose();
    this.blood.routes.texture.dispose();
    for (const o of this.objects) o.dispose();
    this.procs.dispose(); this.probes.dispose();
    this.tubes.dispose(); this.resistors.dispose(); this.post.dispose(); this.glowFx.dispose();
  }
}

const NETWORK_MATE: ReadonlyMap<string, NetVessel> = new Map(NETWORK.map((v) => [v.id, v]));

/** The camera layer of everything drawn over the organs: the vessels, the catheter, the varices. */
/** The organs a tap opens a card for in the body view (2D ORGAN_KEYS: the heart, the liver, the spleen; the heart is two meshes). */

/** Where each named place is: the vessel's id and how far along its 2D course (0 to 1). */
const ANCHORS = {
  ra: ['SVC_RA', 1], ivc: ['IVC_IS', 0.5], rhv: ['RHV_IVC', 0.5], pv: ['PV_TRUNK', 0.5], spleen: ['V_SPL', 0],
} as const satisfies Record<string, readonly [string, number]>;

export { SHOTS };

/** 0 below a, 1 above b, smooth between. */
function smoothstep01(a: number, b: number, x: number): number { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
const _bA = new Vector3(), _bB = new Vector3(), _bE0 = new Vector3(), _bE1 = new Vector3(), _bEnds = { mid: new Vector3(), f0: new Vector3(), f1: new Vector3() };

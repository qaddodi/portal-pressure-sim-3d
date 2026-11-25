import { type QuietJob } from '../clock/idle.ts';
import { type Cue } from '../ui/shell/wait-cue.ts';
import { type FrameSystem, type FrameCtx } from './frame-systems.ts';
import { Scene, Group, Raycaster, Vector2, Color, Vector3, WebGLRenderer, type WebGLRenderTarget } from 'three';
import { MAPPED, NETWORK } from './vessels/network.ts';
import { PresenceTracks } from './vessels/presence-track.ts';
import { FeederLives } from './vessels/feeder-live.ts';
import { ShapeTracks } from './vessels/shape-track.ts';
import { SkinSet } from './vessels/skin/skin-set.ts';
import { SutureSet } from './vessels/suture.ts';
import { type JoinsMode } from './vessels/skin/joins-mode.ts';
import { CircuitSkinSet } from './circuit/skins.ts';
import { FlowRate } from './flow-rate.ts';
import { VesselObject } from './vessels/vessel-object.ts';
import { LensField } from './lenses/field.ts';
import { BloodMarks } from './blood/marks.ts';
import { BloodField } from './blood/field.ts';
import { BloodCells } from './blood/cells/cells.ts';
import { CameraRig } from './camera/rig.ts';
import { type Room } from './camera/room.ts';
import { type ShotName, type Shot, SHOTS } from './camera/shots.ts';
import { Catheter } from './catheter.ts';
import { Highlight, OrganPins } from './highlight.ts';
import { type CelShared, createShared, CelObject } from './materials/cel.ts';
import { type LookId } from './palette.ts';
import { EDGES } from '../engine/hales/portal/topology.js';
import { type ModelSource } from './model-source.ts';
import { type Region } from './twin/region.ts';
import { LobuleView } from './lobule/index.ts';
import { LIVER_POINT } from './lobule/frames.ts';
import { SinusoidView } from './sinusoid/index.ts';
import { Sinusoid3D } from './micro3d/sinusoid3d.ts';
import { Lobule3D } from './micro3d/lobule3d.ts';
import { ProcedureLayer } from './procedures/layer.ts';
import { DiseaseLayer } from './disease/index.ts';
import { ProbeLayer } from './devices/probes/layer.ts';
import { OrganMap } from './organ-veil/organ-map.ts';
import { ShuntGuide } from './shunt-guide.ts';
import { Ease } from '../clock/ease.ts';
import { stageOf } from './circuit/grow.ts';
import { MapLayer } from './circuit/map-layer.ts';
import { CircuitView } from './circuit/view.ts';
import { CircuitTubes } from './circuit/tubes.ts';
import { PostAA } from './post-aa.ts';
import { GlowFx } from './glow-fx.ts';
import { ORGAN_GLOW_LAYER } from './glow.ts';
import { ResistorLayer } from './circuit/resistors.ts';
import { type ResKey } from './circuit/res-model.ts';
import { MAP_CENTRE } from './circuit/map.ts';
import { microPart, type MicroPart } from './parts/micro.ts';
import { divePart, type DivePart } from './parts/dive.ts';
import { viewsPart, type ViewsPart } from './parts/views.ts';
import { cameraPart, type CameraPart } from './parts/camera.ts';
import { circuitPart, type CircuitPart } from './parts/circuit.ts';
import { skinsPart, type SkinsPart } from './parts/skins.ts';
import { lookPart, type LookPart } from './parts/look.ts';
import { flowPart, type FlowPart } from './parts/flow.ts';
import { vesselsPart, type VesselsPart } from './parts/vessels.ts';
import { diseasePart, type DiseasePart } from './parts/disease.ts';
import { proceduresPart, type ProceduresPart } from './parts/procedures.ts';
import { pickPart, type PickPart } from './parts/pick.ts';
import { framePart, type FramePart } from './parts/frame.ts';
import { inspectPart, type InspectPart } from './parts/inspect.ts';
import { renderPart, type RenderPart } from './parts/render.ts';
import { buildPart, type BuildPart } from './parts/build.ts';
import { mixInto } from './parts/define.ts';
import { type FigureView, type SceneOptions } from './parts/shared.ts';
export { SIN_SHOW_FROM, LOBULE_UNDER_FROM, DIVE_OUT, DIVE_IN, bodyFade, lobuleCorners, sinusoidCorners } from './parts/shared.ts';
export type { FigureView, SceneOptions } from './parts/shared.ts';
export { SHOTS };

// The cel-shaded scene for the HVPG slice, as plain three.js so the clock (src/clock/) owns the one frame loop and the R3F Stage is
// only the canvas around it. Order inside a frame, set by the clock: engine frame, tweens, camera, render, tag positions.
//   scene.update(now)  steps the highlight, flow marks, camera tween and catheter; returns true while anything moves (draw another frame)
//   scene.render(gl)   draws
// Nothing here starts its own loop.
//
// This file holds the scene's state (every field) and its construction. The behaviour is in parts, one per frame system, in src/scene/parts/
// (camera, circuit, dive, flow, micro, procedures, disease, pick, render, ...): each part is an object of methods whose `this` is the scene,
// mixed into CelScene's prototype below, so `scene.goTo(...)` and the like are what they always were. The state is not private because the
// parts share it; nothing outside src/scene reaches for it.
export interface CelScene extends
  MicroPart,
  DivePart,
  ViewsPart,
  CameraPart,
  CircuitPart,
  SkinsPart,
  LookPart,
  FlowPart,
  VesselsPart,
  DiseasePart,
  ProceduresPart,
  PickPart,
  FramePart,
  InspectPart,
  RenderPart,
  BuildPart {}

export class CelScene {
  readonly scene = new Scene();
  /** The hidden stand-ins for the programs the scene graph does not hold until something happens (materials/prototypes.ts). */
  protos!: Group;
  /** Settles when the organs are in the scene (their geometry and art files arrived and were built), or failed. */
  organsBuilt!: Promise<void>;
  /** Everything of the body (organs, vessels, catheter): hidden as one while the lobule or the sinusoid is the view. */
  readonly body = new Group();
  readonly shuntGuide = new ShuntGuide();
  readonly shuntRay = new Raycaster();
  rig!: CameraRig;
  readonly shared: CelShared = createShared();
  readonly objects: CelObject[] = [];
  readonly vessels: CelObject[] = [];
  catheter!: Catheter;
  /** Every device a procedure puts on the figure (B5): the catheters on their routes, the stent, the tamponade tube, bands. */
  procs!: ProcedureLayer;
  /** The Tests card's devices on the figure (B11): the Doppler probe, the FibroScan probe, the endoscope with its EUS needle. */
  probes!: ProbeLayer;
  highlight!: Highlight;
  /** The organs a slide outlines (and the normal spleen's line). */
  readonly pins = new OrganPins();
  flow!: BloodMarks;
  /** Blood-cell particles (Settings > Figure depth): built the first time they are switched on, one draw call. */
  cells!: BloodCells;
  /** The colour lens (src/scene/lenses/): what colour every vein wears, crossfaded on the clock. */
  readonly lens = new LensField();
  /** The blood's streams (the chevrons' distance, speed and reversed flag, from the 2D app's own stream model). */
  readonly blood = new BloodField();
  /** The flow's one eased rate (flow-rate.ts): every visible phase that rides the blood's distance advances by it. */
  flowRate!: FlowRate;
  /** A second figure (the split orbit's healthy liver, scene/twin): it reads its own patient and leaves the page's shared dust and flow rate to the page's scene. */
  twin!: boolean;
  /** The lobule and sinusoid views (B8), built once, hidden until the view is chosen (setView). */
  /** The organs and the disease states on the figure (B4). */
  disease!: DiseaseLayer;
  lobule!: LobuleView;
  sinus!: SinusoidView;
  /** The same two views as true 3D scenes, ALWAYS (Mohammad, 20 Nov 2026: "remove the toggle for 3D or not 3D; everything 3D"): drawn in place of the flat ones' pictures; the flat views keep the model, names, taps and clock. */
  // Built lazily (review 21 Nov #11: about 0.75 s of boot CPU and 14 MB of geometry, hidden until the dive): in an idle slot after the first picture (`buildMicroIdle`, from Stage), or at the latest by the first
  // `setView` to the lobule or the sinusoid, or by the first read of either getter. `onMicroBuilt` lets the page compile their programs off the frame (Stage), so the first show never stalls on a driver.
  micro: { sinus: Sinusoid3D; lobule: Lobule3D } | null = null;
  microDpr = 0;
  microJob: QuietJob | null = null;
  microPrimed = false;
  microPrimed2 = false;
  primeSnapped = false;
  primeSinusAt = 0;
  onMicroBuilt: (() => void) | null = null;
  /** Called once the micro views are built AND primed: the page then sends every geometry no frame has drawn yet (the two views, the Circuit's tubes, skins and map) to the GPU, one per idle slice (materials/warm.ts GeometryUploader). */
  onMicroPrimed: (() => void) | null = null;
  /** The sinusoid's constructor, a step of its own in the idle slices (the lobule's is the next one: L4, 21 Nov). */
  microSinus: Sinusoid3D | null = null;
  /** The weld plan is wanted: by a dive straight away, by the quiet ladder when the page is usable (boot/warm.ts). Asks the Lobule once it is built (a later build asks as it is made). */
  weldsWanted = false;
  /** What the micro slot's step in hand is (the slot keeps the slowest step's name in its stat: the audit's boot digest says which step was long, clock/idle.ts QuietOpts.label). */
  microWhat = '';
  readonly micro3d = true;
  /** The Circuit: the change between the body and the map, and the map's quarter turn (src/scene/circuit/). */
  readonly circuit = new CircuitView();
  readonly mapLayer = new MapLayer();
  /** What only the map has: the liver's branch trees, the caudate's lane, the custom shunts a learner opened (circuit/tubes.ts). */
  tubes!: CircuitTubes;
  /** The resistors' zigzags on the map, and which of them a slide asks for (circuit/resistors.ts). */
  resistors!: ResistorLayer;
  resWant = new Set<ResKey>();
  resNow: Partial<Record<ResKey, number>> = {};
  caudPin = false;
  openShunts: Record<string, number> = {};
  /** The organs, varices and catheter: what leaves as the figure turns into the map (the vessels stay and fly). */
  readonly leaving: CelObject[] = [];
  lastFade = 1;
  /**
   * the vessels with no map course (the tributary fans, the liver's branching veins): the Circuit's shader fades them by 2D's `1 - 2 * T0` (circuit/shader.ts), the
   * model's `live` and the dive's dissolve are composed into their one `fade` (composeFade)
   */
  readonly fans = new Map<CelObject, string>();
  readonly leavingSet = new Set<CelObject>();
  feeders!: FeederLives;
  figureView: FigureView = 'body';
  /** The anti-aliasing pass over the whole figure (post-aa.ts). */
  readonly post = new PostAA();
  /** The organ veil's map of the organs and the mask of the ones behind (organ-veil/): drawn before the figure's first pass while the veil or the show-through has any strength. */
  readonly organMap = new OrganMap();
  readonly veilSize = new Vector2();
  /** The picked vessel's glow, made on the screen from its mask (glow-fx.ts). */
  readonly glowFx = new GlowFx();
  /** The organs' glow (a tapped or pinned organ): the same pipeline, its own mask and textures; its lay is a quad of the figure's first pass (see `render`), not a pass over the finished figure. */
  readonly organGlowFx = new GlowFx(ORGAN_GLOW_LAYER);
  readonly dive = new Group();
  readonly sinFrame = new Group();
  fadeNow = 1;
  presence!: PresenceTracks;
  shapes!: ShapeTracks;
  healthyQ: ArrayLike<number> | undefined;
  collateralsOn = false;
  procQuietWas = false;
  /** the swirl's turns each vessel should carry (blood/routes.ts turnTargets), kept so a frame makes no array */
  readonly turnsScratch = new Float32Array((EDGES as unknown[]).length);
  wedgeSet = new Set<string>();
  bloodOpts = { chevrons: true, keyChevrons: false };
  readonly byEdge = new Map<string, CelObject>();
  /** the vessels that fade at a free end (fades.ts), and the collaterals whose opening makes the tip solid */
  /** The cava's pieces, and the veins that fade into it: shown whole (2D's F_WHOLE) while the cava is picked or named, eased over FLOW_FADE_MS so nothing pops. */
  readonly cava: VesselObject[] = [];
  readonly ivcJoins: VesselObject[] = [];
  /** The hepatic veins, whose last stretch eases to the faint cava's alpha (fades.ts cavaEndSpan). */
  readonly hvJoins: VesselObject[] = [];
  /** Every vein that opens into the cava (the hepatic and the renal veins): the opacity it comes to at the cava's wall follows the cava's (named: whole). */
  readonly cavaCuts: VesselObject[] = [];
  /** what each cut hepatic vein's `setCavaCut` was given (the cava piece's lens, where along it, its alpha), so a skin that takes the end over can switch the cut off and the scene put it back */
  readonly cavaCutArgs = new Map<string, [number, number, number]>();
  /** The vessels of the back tier: they ease toward the page on a turn (quiet depth). */
  readonly back: VesselObject[] = [];
  /** Settings > Figure depth > Device shadows: the devices' shadow amount (shared.shadow); it glides on the same ease. */
  readonly shadow = new Ease(0, 'device-shadow', (v) => { this.shared.shadow.value = v; });
  /** The cava (and the lumbar collateral drawn like it) eases toward whole or veiled: each its own Ease, both writing the objects they stand for. */
  readonly cavaE = new Ease(0, 'cava-whole', () => this.applyCava());
  readonly lumbarE = new Ease(0, 'lumbar-whole', () => this.applyCava());
  /** 0 until the micro views are built, then 1 (eased when that lands mid-dive): how far the body's dive dissolve may go (fadeBody). */
  readonly diveReady = new Ease(0, 'dive-ready');
  readonly eases: readonly Ease[] = [this.shadow, this.cavaE, this.lumbarE, this.diveReady];
  readonly tipFades: { o: VesselObject; connect: readonly string[] }[] = [];
  look!: LookId;
  phone!: boolean;
  lastNow = -1;
  /** Where this scene reads its patient from. */
  src!: ModelSource;
  width = 1;
  height = 1;
  moving = true; // the first frame always draws

  /** The build, a generator: each `yield` ends a step. A constructor without `sliced` runs it to the end; the boot runs a step per task so no one task is the whole scene (finishSliced). A step may yield a promise the build
   *  must wait for (the baked skins): the boot driver awaits it and answers `true`; a driver that cannot wait (finishNow) answers `false`, and the build then goes on without it, as a scene always has (the skins when the file lands). */
  building: Generator<Promise<unknown> | void, void, boolean | undefined> | null = null;
  markBuilt: () => void = () => {};
  readonly whenBuilt: Promise<void> = new Promise<void>((r) => { this.markBuilt = r; });
  constructor(opts: SceneOptions = {}) {
    this.building = this.build(opts);
    if (!opts.sliced) this.finishNow();
  }

  unJoins: () => void = () => {};
  disposed = false;

  /**
   * Junction skins (vessels/skin, docs/junction-skin-spec.md): one welded mesh at each junction the page asks for, only with Smooth vessel joins on and `?joins` not
   * `old`. Built here, once per scene load and per join toggle; null: today's joins everywhere.
   */
  skins: SkinSet | null = null;
  /** The Circuit's own junction skins (circuit/skins.ts): the same welds on the map, built with the Anatomy's, drawn over the end of the change. */
  circuitSkins: CircuitSkinSet | null = null;
  /** The stitches at the shunt ends the skins weld (vessels/suture.ts): the tube's own are cut away with the end. */
  sutures: SutureSet | null = null;
  circuitSkinKey = '';
  joins!: JoinsMode;
  /** The Circuit's skins: built at once where its baked file is in (a test, or once it has arrived); on the page the file is fetched after the first picture, in the background slot (`startCircuitSkins`, Stage), or at
   *  once when the Circuit is opened (setView), and the skins are built when it is in. Nothing is meshed live while the file is on its way. */
  circuitJob: QuietJob | null = null;
  /** The clear colour now: the look's ground, on its way to the map's own ground (the dark looks) as the map comes in. */
  readonly clear = new Color();
  readonly mapGround = new Color();
  sawFrame = false;
  readonly camRight = new Vector3();
  readonly focusP = new Vector3();
  caudLobe = false;
  caudVeins = false;
  healthyP: Float32Array | null = null;
  /** A dive waiting for the micro views (goTo), with the room it will land in. */
  heldDive: { shot: ShotName | Shot; room: Room; ms?: number; ease?: (k: number) => number } | null = null;
  /** A dive waits (or stops waiting). A wait that passes 300 ms shows the one calm cue (ui/shell/wait-cue.ts, splash plan A7), so the held dive is never a silent blank; a short one shows nothing. */
  holdCue: Cue | null = null;
  /** The tracing has settled and the free reading is taken (the deck's catheter clock reached it): only then does the FHVP callout come. True when the caller says nothing (a catheter that is not the deck's). */
  catheterRead = true;
  named = new Set<string>();
  hideLeftBehind = false;
  readonly tmpMap = new Vector3();
  readonly stationsOf = (() => {
    const m = new Map<string, string[]>();
    for (const v of MAPPED) for (const n of [v.from, v.to]) { const a = m.get(n) ?? []; a.push(v.id); m.set(n, a); }
    return m;
  })();
  readonly livePoint = new Vector3(...LIVER_POINT);
  readonly mapPt = new Vector3(MAP_CENTRE.x, MAP_CENTRE.y, MAP_CENTRE.z);
  /** A portrait room (narrower than tall, 2D's `W < H * 0.95`) runs the sinusoid top to bottom: the sinusoid view takes it (SinusoidView.setPortrait, the sinusoid worker's), and the shot asks for it (sinusoidShot(portrait)). */
  portrait = false;
  readonly sinusPt = new Vector3();
  readonly scrO = { x: 0, y: 0 };
  readonly scrA = { x: 0, y: 0 };
  /** The distance the camera sits at with the whole lobule framed in the room it has (kept per room size). */
  restKey = '';
  restD = 0.1;
  readonly divePt = new Vector3();
  readonly cutArr: [number, number, number, number] = [0, 0, -1, 1];

  capSig = 0;

  /** Steps everything on the clock. Returns true while the scene moves, so the clock asks for another frame; false means draw nothing. */
  /** Running total of ms per update() system since the scene was made (read it for ?perf and the audit; lapTimer fills it). */
  readonly systemMs: Record<string, number> = {};

  /** The frame's systems, in the order they run (R6): each is a named step that says whether it still moves. `update` runs them all (no `||` between them: every one runs), ORs the answers and times each by its id into `systemMs`. */
  systems: readonly FrameSystem<FrameCtx>[] | null = null;

  readonly moverIds: string[] = [];
  readonly ambientIds = new Set<string>();
  /** The last update asked for frames only because the flow marks (and the cells riding them) go round: the clock draws such frames at the ambient rate. */
  ambientOnly = false;
  lastGrow = -1;
  readonly grownIds: readonly string[] = NETWORK.filter((v) => v.kind === 'liver' && stageOf(v.id)).map((v) => v.id);

  // ---- the inspector's hooks (?inspect): layers on and off, wireframe. Nothing here runs unless the panel has set something. ------------------------------------------------------------------------
  readonly inspectHidden = new Set<string>();
  readonly inspectWired = new Set<string>();
  inspectSolo = new Set<string>();
  inspectMute = new Set<string>();
  readonly inspectMarks = new Map<string, Group>();
  readonly labelV = new Vector3();

  /** The split orbit (scene/twin): while set, the share `at` of the canvas from the left is the twin's, drawn by `drawTwin` into the same
   *  render target; this scene keeps the rest. Only with the anti-aliasing pass on (it draws into a target). */
  split: { at: number; drawTwin: (gl: WebGLRenderer, into: WebGLRenderTarget, region: Region, dpr: number) => void } | null = null;
}

mixInto(
  CelScene,
  microPart,
  divePart,
  viewsPart,
  cameraPart,
  circuitPart,
  skinsPart,
  lookPart,
  flowPart,
  vesselsPart,
  diseasePart,
  proceduresPart,
  pickPart,
  framePart,
  inspectPart,
  renderPart,
  buildPart,
);

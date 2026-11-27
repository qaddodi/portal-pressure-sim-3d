// The build: the generator that makes the whole scene, run in slices at boot or at once.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { edgeOnLine, maskOf } from '../devices/probes/organ-edge.ts';
import { stamp } from '../../boot/timeline.ts';
import { Box3 } from 'three';
import { NETWORK, NETWORK_BY_ID } from '../vessels/network.ts';
import { PresenceTracks } from '../vessels/presence-track.ts';
import { FeederLives } from '../vessels/feeder-live.ts';
import { SEWN_IDS, seamsFor } from '../vessels/seams.ts';
import { ShapeTracks } from '../vessels/shape-track.ts';
import { setSmoothJoins } from '../vessels/join-mode.ts';
import { joinsMode } from '../vessels/skin/joins-mode.ts';
import { bakedPending, bakedReady } from '../vessels/skin/baked.ts';
import { FlowRate, flowRate } from '../flow-rate.ts';
import { useSettings } from '../../state/settings.ts';
import { VesselObject } from '../vessels/vessel-object.ts';
import { BloodMarks } from '../blood/marks.ts';
import { CameraRig } from '../camera/rig.ts';
import { Catheter } from '../catheter.ts';
import { FLOW_FADE_MS, DEFAULT_FLOW_MODE } from '../flow.ts';
import { Highlight } from '../highlight.ts';
import { addOrganHalos, programPrototypes } from '../materials/prototypes.ts';
import { liveSource } from '../model-source.ts';
import { buildLobuleSteps } from '../lobule/geometry.ts';
import { LobuleView } from '../lobule/index.ts';
import { LIVER_POINT, LOBULE_SCALE, SIN_LOCAL, SIN_REL } from '../lobule/frames.ts';
import { SinusoidView } from '../sinusoid/index.ts';
import { ProcedureLayer } from '../procedures/layer.ts';
import { DiseaseLayer } from '../disease/index.ts';
import { ProbeLayer } from '../devices/probes/layer.ts';
import { VESSEL_LAYER, inVesselPass } from '../layers.ts';
import type { EusDrive } from '../devices/probes/scope.ts';
import { probeCards } from '../devices/probes/cards.ts';
import { probeAvoid } from '../labels/probe-boxes.ts';
import { useUi } from '../../ui/ui-store.ts';
import { organsReady } from '../organs/meshes.ts';
import { artReady } from '../organs/organ-art.ts';
import { clock } from '../../clock/frame.ts';
import { noteSpan, span } from '../../boot/spans.ts';
import { fadeRate } from '../../clock/ease.ts';
import { COURSES } from '../circuit/course.ts';
import { CircuitTubes } from '../circuit/tubes.ts';
import { ResistorLayer } from '../circuit/resistors.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';
import { type SceneOptions } from './shared.ts';

export const buildPart = scenePart<CelScene>()({
  /** Whether every step of the build has run. */
  get builtAll(): boolean { return this.building === null; },
  /** Runs every step that is left, now (a first use of the scene before the sliced build is done: the rest is built at once, as it always was). */
  finishNow(): void {
    const g = this.building;
    if (!g) return;
    this.building = null;
    let r = g.next();
    while (!r.done) r = g.next(false);
  },
  /** One step of the build (never waits for a promise); true while more are left. */
  buildStep(): boolean {
    const g = this.building;
    if (!g) return false;
    if (g.next(false).done) { this.building = null; return false; }
    return true;
  },
  /** Runs the build one step per task: `next` gives the page back between steps (a task of its own: the cover's bar, the browser's input and the compositor run in the gaps).
   *  A step that yields a promise is awaited. Ends early if `finishNow` built the rest meanwhile. */
  async finishSliced(next: () => Promise<void>): Promise<void> {
    const g = this.building;
    if (!g) return;
    // (where the boot's build time goes, by phase, ?perf's startup spans: `build:<phase>` is the phase's own work, `build-wait:<phase>` a file it waited for, `build-gaps` the time between
    // steps that belonged to other tasks; a slow start then names its phase instead of one unexplained gap before "scene built")
    const busy: Record<string, number> = {}, waits: Record<string, number> = {};
    const t0 = clock.now();
    let gaps = 0, steps = 0;
    const step = (waited?: boolean): IteratorResult<Promise<unknown> | void, void> => {
      const at = clock.now(), what = this.buildWhat, out = waited === undefined ? g.next() : g.next(waited);
      busy[what] = (busy[what] ?? 0) + clock.now() - at; steps++;
      return out;
    };
    let r = step();
    while (!r.done) {
      let waited = false;
      if (r.value) { const at = clock.now(), what = this.buildWhat; await r.value; waits[what] = (waits[what] ?? 0) + clock.now() - at; waited = true; }
      const at = clock.now(); await next(); gaps += clock.now() - at;
      if (this.building !== g) return;
      r = step(waited);
    }
    for (const [k, ms] of Object.entries(busy)) noteSpan(`build:${k}`, t0, ms);
    for (const [k, ms] of Object.entries(waits)) noteSpan(`build-wait:${k}`, t0, ms);
    noteSpan(`build-gaps (${steps} steps)`, t0, gaps);
    if (this.building === g) this.building = null;
  },
  *build(opts: SceneOptions): Generator<Promise<unknown> | void, void, boolean | undefined> {
    this.src = opts.source ?? liveSource;
    this.twin = !!opts.source;
    this.flowRate = this.twin ? new FlowRate() : flowRate;
    this.look = opts.look ?? 'light';
    this.joins = opts.joins ?? joinsMode();
    this.phone = !!opts.phone;
    this.rig = new CameraRig('title', undefined, opts.reduceMotion);

    this.scene.add(this.body);
    this.buildWhat = 'vessels';

    setSmoothJoins(true);   // (smooth vessel joins are always on, 21 Nov 2026: the Settings switch is gone; set before any tube is built)
    let vn = 0;
    for (const def of NETWORK) { this.addVessel(def); if (++vn % 6 === 0) yield; }   // (a step every few vessels: about 5 ms each on a laptop)
    yield;
    // (junction skins: before the mates, which skip the ends a skin has taken over. On the page they are baked at build time and still on their way: the figure is not drawn before they are in, the boot waits for the same promise)
    this.buildWhat = 'skins';
    if (bakedPending()) {
      // (the boot's driver waits for the file here and builds the skins in steps of their own; one that cannot wait builds them when it lands, as before)
      if (yield bakedReady) yield* this.refreshSkinsSteps();
      else {
        void bakedReady.then(() => { if (this.disposed) return; this.refreshSkins(); this.applyMates(); this.moving = true; clock.invalidate('skins'); });
      }
    } else yield* this.refreshSkinsSteps();
    this.applyMates();
    this.shadow.snap(useSettings.getState().deviceShadow ? 1 : 0); this.shared.shadow.value = this.shadow.value;
    this.unJoins = useSettings.subscribe((st, prev) => {
      if (st.deviceShadow !== prev.deviceShadow) this.shadow.to(st.deviceShadow ? 1 : 0, fadeRate(FLOW_FADE_MS));
      if (st.fluidSurface !== prev.fluidSurface) { this.disease.ascites.setLiving(st.fluidSurface); this.moving = true; clock.invalidate('living-fluid'); }
    });
    // the organs and every state of the patient's disease on the figure (clots, plexuses, ascites, bleed): src/scene/disease/ (B4)
    yield;
    this.buildWhat = 'disease';
    this.disease = new DiseaseLayer(this.shared, this.vessels);
    this.body.add(this.disease.group);
    this.disease.bleed.still = !!opts.reduceMotion;   // (the jet holds still under Reduce Motion)
    this.disease.ascites.still = !!opts.reduceMotion;   // (so does the pool's surface: no ripple, no slosh)
    this.disease.ascites.setLiving(useSettings.getState().fluidSurface, true);   // (Settings > Figure depth > Living fluid: read at boot, then glided)
    // The organs' vertex data is a static file (src/scene/organs/meshes.ts): the organ layer builds them when it is in, in the patient's state, and asks for a frame.
    // (the promise settles once the organs are built, or failed: the warm-up under the splash waits for it so the organs' programs are compiled with the rest, Stage.tsx)
    this.organsBuilt = Promise.all([organsReady, artReady, this.whenBuilt]).then(() => {
      span('build:organs', () => this.disease.organs.build()); stamp('scene'); addOrganHalos(this.protos, this.disease.organs.objects);
      this.moving = true; clock.invalidate('organs');
    }, (e) => { console.error(e); });
    yield;
    this.buildWhat = 'catheter';
    this.catheter = new Catheter(this.shared);
    this.body.add(this.catheter.group);
    this.catheter.group.traverse((c) => c.layers.set(VESSEL_LAYER));
    this.objects.push(...this.catheter.objects); this.leaving.push(...this.catheter.objects); for (const o of this.catheter.objects) this.leavingSet.add(o);
    yield;
    this.buildWhat = 'circuit';
    this.tubes = new CircuitTubes(this.shared, this.lens.shared, this.blood.shared, this.circuit.shared);
    this.body.add(this.tubes.group);
    this.resistors = new ResistorLayer(this.shared.res);
    this.mapLayer.group.add(this.resistors.group);
    yield;
    this.buildWhat = 'procedures and probes';
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
      kpa: (organ) => { const m = this.src.frame()?.metrics as Record<string, number | null | undefined> | undefined; return m?.[organ === 'spleen' ? 'ssm' : 'lsm'] ?? null; },
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

    yield;
    this.buildWhat = 'highlight and flow';
    this.highlight = new Highlight(this.vessels, undefined, new Map(NETWORK.map((v) => [v.id, v.host])));
    // a custom shunt's tube is made when a learner opens it, after the figure is built: it is a vessel like any other, so it is pickable and lit (and let go with its tube)
    this.highlight.expect = (id) => this.tubes.isCustom(id);
    this.tubes.watch.add = (o) => { this.highlight.register(o); this.moving = true; };
    this.tubes.watch.drop = (o) => this.highlight.unregister(o);
    this.flow = new BloodMarks(this.vessels);
    yield;
    this.buildWhat = 'tracks';
    this.presence = new PresenceTracks(this.vessels as VesselObject[]);
    this.presence.own(this.grownIds);
    // the tributary groups are graded by the model's `live` (feeder-live.ts), not drawn on along their flow: their presence keeps only its state
    this.feeders = new FeederLives([...this.fans].map(([obj, id]) => ({ obj: obj as VesselObject, id, conditional: !!NETWORK_BY_ID.get(id)?.feeder?.when })));
    this.presence.own(this.feeders.ids());
    for (const id of SEWN_IDS) seamsFor(id, false);   // (the sewn ends' seam curves are a pure function of the art, memoised on first use: 32 ms in the first frame's update. Made here, in the boot, no frame pays for it)
    for (const id of this.grownIds) { const g = COURSES.get(id); if (g) this.vesselObject(id)?.setStretchAnchors(g.curveA.getPointAt(0), g.curveC.getPointAt(0)); }
    this.shapes = new ShapeTracks(NETWORK, this.byEdge as unknown as Map<string, VesselObject>);
    this.shapes.setPins(this.skins?.pins() ?? new Map());   // (the skins were built first, when the page had its baked file already: their seams stand still while the collaterals coil)
    this.shapes.onReshaped = (id) => this.skins?.markDirty(id);   // (an arm's course changed: the skin on it is rebuilt in the render phase, skins.step below)
    this.lens.setContext({ healthy: null, ref: null });
    const vo = { look: this.look, phone: this.phone, flowMode: opts.flowMode ?? DEFAULT_FLOW_MODE, reduceMotion: opts.reduceMotion };
    yield;
    this.buildWhat = 'lobule network';
    const lobuleNet = yield* buildLobuleSteps();   // (the Lobule's network, a bend pass a step)
    yield;
    this.buildWhat = 'lobule and sinusoid views';
    this.lobule = new LobuleView(this.shared, vo, lobuleNet);
    yield;
    this.sinus = new SinusoidView(this.shared, vo);
    yield;
    // the lobule stands inside the liver, the sinusoid inside the lobule (lobule/frames.ts): two frames, each a place and a scale
    this.buildWhat = 'frames and stand-ins';
    this.dive.position.set(...LIVER_POINT); this.dive.scale.setScalar(LOBULE_SCALE);
    this.sinFrame.position.set(...SIN_LOCAL); this.sinFrame.scale.setScalar(SIN_REL);
    this.sinFrame.add(this.sinus.group); this.dive.add(this.lobule.group, this.sinFrame); this.scene.add(this.dive, this.mapLayer.group);
    this.lobule.setVisible(false); this.sinus.setVisible(false);
    this.dive.visible = false;   // (the whole dive frame is off at the body's rest: nothing of the lobule or the sinusoid, or anything added to them later, can show on the liver)
    this.protos = programPrototypes(this.shared);
    this.scene.add(this.organGlowFx.figure);   // (hidden until an organ is lit; drawn with the organs, behind the vessels' pass)
    this.scene.add(this.protos);   // (hidden stand-ins for the programs nothing holds yet: compiled with the rest under the splash, materials/prototypes.ts)
    this.applyLook(this.look);
    this.markBuilt();
  },
});
export type BuildPart = typeof buildPart;

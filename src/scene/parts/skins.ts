// Vessel skins and junctions: the baked skins, the circuit's skins, the mates and the smooth joins, and adding a vessel to the figure.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { whenQuiet } from '../../clock/idle.ts';
import { NETWORK, NETWORK_BY_ID, type NetVessel } from '../vessels/network.ts';
import { CAPUT_FAN_ID, FAN_FRONT } from '../vessels/feeder-fan.ts';
import { SEWN_IDS, seamsFor } from '../vessels/seams.ts';
import { coursesOf, REST, tubularOf } from '../vessels/shape.ts';
import { buildTubes } from '../vessels/tubes.ts';
import { smoothJoinsOn, setSmoothJoins } from '../vessels/join-mode.ts';
import { SkinSet } from '../vessels/skin/skin-set.ts';
import { SutureSet } from '../vessels/suture.ts';
import { SkinObject } from '../vessels/skin/skin-object.ts';
import { joinsMode, type JoinsMode, joinsPhase } from '../vessels/skin/joins-mode.ts';
import { bakedSkins, bakedCircuitSkins, bakedCircuitPending, requestCircuitSkins } from '../vessels/skin/baked.ts';
import { CircuitSkinSet } from '../circuit/skins.ts';
import { SKIN_CUT_C_NONE } from '../vessels/skin/types.ts';
import { SMOOTH, BURY } from '../vessels/smooth-joins.ts';
import { VesselObject, circuitWidth } from '../vessels/vessel-object.ts';
import { BACK_EDGES } from '../anatomy/source.ts';
import { type Centreline, centrelineOf } from '../vessels/centreline.ts';
import { nbrMatesOf, cavaMateOf } from '../vessels/neighbour.ts';
import { opensIntoCava, cavaJoinShare, fadeOf, cavaEndSpan, CAVA_RECEDE, CAVA_LIKE } from '../vessels/fades.ts';
import { CIRCUIT_MATES, mateUniform, skinnedEase } from '../circuit/mates.ts';
import { markSpeed } from '../flow.ts';
import { CelObject } from '../materials/cel.ts';
import { indexOf } from '../../engine/vessel-data.ts';
import { trunkJoin } from '../disease/host.ts';
import { VESSEL_LAYER } from '../layers.ts';
import { clock } from '../../clock/frame.ts';
import { COURSES } from '../circuit/course.ts';
import { mapDepthOf } from '../circuit/map-depth.ts';
import { shadowEndsOf } from '../vessels/shadow.ts';
import { slicesFor, attachRuns } from '../circuit/geometry.ts';
import { sewOnMap } from '../circuit/map-sewn.ts';
import { GLOW_LAYER } from '../glow.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';
import { NETWORK_MATE, CAVA_BURY, withNeighbour, STUB_Q } from './shared.ts';

export const skinsPart = scenePart<CelScene>()({
  /** What the junction-skin rebuilds have cost so far (?perf and ?audit read it; null while no skins are built). */
  get skinStats(): Readonly<{ rebuilds: number; lastMs: number; worstMs: number; lastNode: string }> | null { return this.skins?.stats ?? null; },
  /**
   * The inspector's join switch (`?inspect`, src/ui/debug/inspect): the mode is read again from the page's live answer (joins-mode.ts) and the skins are built again on
   * the tubes, or taken away for `old`: the same path as the Smooth vessel joins switch.
   */
  useJoinsLive(): void {
    const m = joinsMode();
    if (m !== this.joins) { this.joins = m; this.refreshSkins(); this.applyMates(); }
    this.moving = true; clock.invalidate('joins-live');
  },
  /** The mode the skins are built in now. */
  get joinsNow(): JoinsMode { return this.joins; },
  /** The junction skins now drawn (the node names), for tests and the debug page. */
  get skinNodes(): readonly string[] { return this.skins?.nodes ?? []; },
  refreshSkins(): void { for (const _ of this.refreshSkinsSteps()) { /* every step */ } },
  /** `refreshSkins` a step per `yield` (an arm's tube, a baked skin laid in, a suture's seam): the boot runs them one per task. */
  *refreshSkinsSteps(): Generator<void, void, unknown> {
    const phase = smoothJoinsOn() ? joinsPhase(this.joins) : 0;   // (always on in the app; only a test's useSmoothJoins(false) turns it off)
    if (!phase) { this.sutures?.dispose(); this.sutures = null; this.skins?.dispose(); this.skins = null; this.circuitSkins?.dispose(); this.circuitSkins = null; return; }
    this.skins ??= new SkinSet({
      vessel: (id) => this.byEdge.get(id) as VesselObject | undefined,
      stateOf: (id) => this.shapes?.stateOf(id),
      make: (skin, axes, arms) => new SkinObject(skin, arms[0]!, axes, arms),
      add: (o) => { this.body.add(o); },
      remove: (o) => { this.body.remove(o); },
      baked: bakedSkins,
      divided: (shunt) => this.dividedNow(shunt),
      endsChanged: () => { this.applyMates(); },   // (a rebuild that failed or came back: the mates and burial of its ends follow)
    });
    yield* this.skins.buildSteps(phase);
    for (const id of SEWN_IDS) { seamsFor(id, true); yield; }   // (the sutures' seam curves, memoised: each is a step of its own, not 40 ms inside `sync`)
    this.sutures ??= new SutureSet({ add: (o) => { this.body.add(o); }, remove: (o) => { this.body.remove(o); }, side: () => !!(this.src.shown() as { portocavalSide?: boolean } | null)?.portocavalSide });
    this.sutures.sync(this.skins);   // (made with the skins, so the warm-up builds the program with the rest)
    this.shapes?.setPins(this.skins.pins());   // (the seams stand still while the collaterals coil: no skin is rebuilt for a growth)
    this.circuitSkins ??= new CircuitSkinSet({
      vessel: (id) => this.byEdge.get(id) as VesselObject | undefined,
      make: (skin, axes, arms) => new SkinObject(skin, arms[0]!, axes, arms, true),
      add: (o) => { this.body.add(o); },
      remove: (o) => { this.body.remove(o); },
      baked: bakedCircuitSkins,
      endsChanged: () => { this.applyMates(); },   // (a skinned end of the map has no taper of its own: applyMates writes the map's mates again)
    });
    this.buildCircuitSkins();
  },
  buildCircuitSkins(): void {
    if (!this.circuitSkins) return;
    this.circuitSkinKey = '';
    if (!bakedCircuitPending()) this.circuitSkins.build();
  },
  /** After the first picture: asks for the Circuit's file in the background slot; its skins are built the moment it is in. */
  startCircuitSkins(): void {
    if (!bakedCircuitPending() || this.disposed || (this.circuitJob && !this.circuitJob.done)) return;
    this.circuitJob = whenQuiet(() => { this.fetchCircuitSkins(); return true; }, { tag: 'circuit-skins' });
  },
  fetchCircuitSkins(): void {
    void requestCircuitSkins().then(() => {
      if (this.disposed || !this.circuitSkins) return;
      this.buildCircuitSkins(); this.applyMates(); this.moving = true; clock.invalidate('skins');
    });
  },
  /** The vessels each vessel's ends carry on into, for the shader's live-width easing (smooth joins are always on). */
  applyMates(): void {
    const on = smoothJoinsOn();
    this.skins?.syncThrough(on);
    for (const def of NETWORK) {
      const o = this.byEdge.get(def.id) as VesselObject | undefined, sj = SMOOTH.get(def.id);
      if (!o) continue;
      const mate = (id: string | null | undefined) => { const m = on && id ? NETWORK_MATE.get(id) : undefined; return m ? { index: indexOf(m.lensId), baseD: m.baseD, widthKind: m.widthKind } : null; };
      const sk = this.skins?.endsOf(def.id) ?? [false, false];
      // a skinned end's mate is off: the skin's weights blend the live widths, spec 4.6. EXCEPT where the skin runs the vein straight through the node into that same mate (through.ts): the skin
      // then takes the mean of the two widths on both halves (skin/shaders.ts armThrough), so the tube eases to that mean as far as the skin's cut and the width is one across the node, no step
      const run = (e: 0 | 1): boolean => sk[e] && !!sj?.mate[e] && this.skins?.throughOf(def.id, e) === sj.mate[e];
      const cut = (e: 0 | 1): number => (run(e) ? this.skins?.seamU(def.id, e) ?? e : e);
      o.setMates(sk[0] && !run(0) ? null : mate(sj?.mate[0]), sk[1] && !run(1) ? null : mate(sj?.mate[1]), [cut(0), cut(1)]);
      // (the map's own pairs and their taper, at EVERY end: a skinned end keeps it as far as its skin's cut (circuit/mates.ts skinnedEase), where the welded skin carries on;
      // a skin whose growing arm is closed is not drawn, and a run-on pair then met at the node at two widths, a hard step: Mohammad, 22 Nov, the SMV node)
      {
        const cm = CIRCUIT_MATES.get(def.id);
        if (cm) o.setCircuitMates(mateUniform(cm[0]), mateUniform(cm[1]), skinnedEase(def.id, cm, this.circuitSkins?.endsOf(def.id) ?? [false, false], this.circuitSkins?.cutOf(def.id) ?? SKIN_CUT_C_NONE));
      }
      // (a junction's fork: the outline of the branch and its trunk is the union's, with the switch on)
      { const nm = nbrMatesOf(def.id)[0], md = nm ? NETWORK_BY_ID.get(nm) : undefined; o.setNbrOn(!!md); if (md) o.setNbrMate(indexOf(md.lensId), md.baseD, md.widthKind); }
      // (a declared branch's end buried in its trunk: the ink stays off inside it, and only there. One rule for every junction, Mohammad 20 Nov: a child's outline is not drawn where it lies inside its parent's lumen.
      //  Besides the declared branches: a hepatic vein's last stretch inside the cava, and a liver branch's first stretch inside the vein it leaves, as far as that vein is wide)
      const bury: [number, number] = [0, 0];
      for (const e of [0, 1] as const) if (on && sj?.attach[e]) bury[e] = BURY * (sj.hostR[e] ?? def.radius);
      for (const e of [0, 1] as const) if (sk[e]) bury[e] = 0;   // (the part of the tube the bury guarded is cut away)
      // THE CAVA'S CUT RULES (spec 10.4): a hepatic vein that opens into the cava is cut away inside the cava's lumen (`cavaCut`, shaders.ts cavA) and its ink held back
      // there (`CAVA_BURY`). Where a skin has taken over that end of it the skin IS the
      // opening (the tube stops at its seam ring, outside the cava's wall), so the cut and the cava's colour are off there ('fade': only the opacity ramp stays, which
      // the skin carries on) and come back, exactly, with the skin. (Its `cavaEnd` ease is zero for every vein now: fades.ts cavaEndSpan.)
      const cc = this.cavaCutArgs.get(def.id);
      if (cc) o.setCavaCut(sk[1] ? 'fade' : true, ...cc);
      if (on && !sk[1] && (this.ivcJoins.includes(o) || opensIntoCava(def.id))) bury[1] = Math.max(bury[1], CAVA_BURY * (NETWORK_BY_ID.get('IVC_IS')?.radius ?? def.radius));
      const joinEnd = def.plan?.kind === 'feeder' ? def.plan.list[0]?.join : undefined;
      if (on && joinEnd != null && !sk[joinEnd]) bury[joinEnd] = Math.max(bury[joinEnd], BURY * def.radius * (def.plan?.kind === 'feeder' ? (def.plan.list[0]?.k ?? 1) : 1));
      o.setBury(bury[0], bury[1]);
      o.setSmoothColour(on);
    }
  },
  /**
   * Every tube is rewritten for a join mode (no Settings switch any more: smooth joins are always on; kept for the tests that look at the off drawing): every tube is
   * rewritten in place (same vertices, new positions and widths: the joins are geometry), then drawn once.
   */
  useSmoothJoins(on: boolean): void {
    if (!setSmoothJoins(on)) return;
    for (const def of NETWORK) {
      const o = this.byEdge.get(def.id) as VesselObject | undefined;
      if (!o) continue;
      const built = buildTubes(coursesOf(def, this.shapes.stateOf(def.id) ?? REST), tubularOf(def, slicesFor(def.id)), def.radius);
      withNeighbour(def.id, built.geometry);
      sewOnMap(def.id, built.geometry, built.runs);   // (the map's sunk and flared ends, circuit/map-sewn.ts: the rebuilt tube's `rkc` carries them again)
      o.reshape(built.geometry, built.length);
      built.geometry.dispose();
      }
    this.refreshSkins();   // (the tubes were rewritten: the skins are built again on them, or taken away with the switch)
    this.applyMates();
    this.moving = true;
    clock.invalidate('smooth-joins');
  },
  add(o: CelObject): void { this.objects.push(o); this.body.add(o.group); },
  addVessel(def: NetVessel): void {
    const courses = coursesOf(def, REST);
    const built = buildTubes(courses, tubularOf(def, slicesFor(def.id)), def.radius);
    withNeighbour(def.id, built.geometry);
    const circ = COURSES.get(def.id);
    if (circ) { attachRuns(built.geometry, built.runs, circ, def.radius); sewOnMap(def.id, built.geometry, built.runs); }   // (the ends no skin welds are sunk and flared on the map: circuit/map-sewn.ts)
    const q = STUB_Q[def.lensId] ?? 1;
    const o = new VesselObject(built.geometry, {
      tone: def.tone, artery: def.tone === 'artery', lensIndex: indexOf(def.lensId), widthKind: def.widthKind, circW: circuitWidth(def.widthKind, def.circFine ?? 1),
      bands: 2, spec: 1, px: def.kind === 'liver' ? 0.9 : def.tone === 'artery' ? 1 : 1.2,
      vessel: { index: indexOf(def.lensId), len: built.length, stubSpeed: markSpeed(q), radius: def.radius, baseD: def.baseD }, shadow: !def.feeder,
    }, this.shared, this.lens.shared, this.blood.shared, this.circuit.shared);
    if (circ) this.circuit.attach({ id: def.id, len: o.toon.uniforms.len as { value: number }, circRow: o.toon.uniforms.circRow as { value: number } });
    else this.fans.set(o, def.id);   // a fan of tributaries has no map course: it never morphs, and the Circuit's shader fades it as 2D does (clamp(1 - 2 * T0))
    // (the map's own pairs and their taper, circuit/mates.ts: whatever the joins switch or a skin says)
    { const cm = CIRCUIT_MATES.get(def.id); if (cm) o.setCircuitMates(mateUniform(cm[0]), mateUniform(cm[1]), [cm[0]?.ease ?? 0, cm[1]?.ease ?? 0]); }
    { const nm = nbrMatesOf(def.id)[0], md = nm ? NETWORK_BY_ID.get(nm) : undefined; if (md) { o.setNbrOn(true); o.setNbrMate(indexOf(md.lensId), md.baseD, md.widthKind); } }
    {
      const cm = cavaMateOf(def.id);
      if (cm) {
        const args: [number, number, number] = [indexOf(NETWORK_BY_ID.get(cm)!.lensId), cavaJoinShare(def.id), fadeOf(cm, false)?.a0 ?? 1];
        o.setCavaCut(true, ...args); this.cavaCuts.push(o); this.cavaCutArgs.set(def.id, args);
      }
      // (the middle hepatic vein opens into the common trunk, which is its cava: cut at the trunk's wall, its colour and its opacity there, disease/host.ts trunkJoin)
      const tj = cm ? null : trunkJoin(def.id);
      if (tj) { const args: [number, number, number] = [tj.lens, tj.u, tj.a]; o.setCavaCut(true, ...args); this.cavaCuts.push(o); this.cavaCutArgs.set(def.id, args); }
    }
    if (def.lensSpan) o.setLensSpan(def.lensSpan[0], def.lensSpan[1]);
    if (def.id === CAPUT_FAN_ID) o.setFrontDepth(FAN_FRONT);   // (the caput veins lie on the abdominal wall: over every other vein)
    if (!def.feeder) { const e = shadowEndsOf(def); o.setShadowEnds(e[0], e[1]); o.setMapDepth(mapDepthOf(def.id)); }   // (the crossing shadow's joins, and the Circuit's over and under)
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
  },
  /** The vessel object of an edge, or undefined. */
  vesselObject(id: string): VesselObject | undefined { return this.byEdge.get(id) as VesselObject | undefined; },
  /** The drawn centreline and radius of vessel `id` at its present shape: what anything that lies in a vessel (the HVPG column, a catheter, a probe) binds to (vessels/centreline.ts). */
  vesselCentreline(id: string): Centreline | null { return centrelineOf(id, this.shapes.stateOf(id) ?? REST); },
});
export type SkinsPart = typeof skinsPart;

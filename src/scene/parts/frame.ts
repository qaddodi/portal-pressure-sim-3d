// The frame: the list of systems the scene steps each frame, and what it reports as moving.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { anyMoving } from '../any-moving.ts';
import { type FrameCtx, runSystems, type FrameSystem } from '../frame-systems.ts';
import { SKIN_BUILD_TAG } from '../vessels/skin/skin-set.ts';
import { flowTarget } from '../flow-rate.ts';
import { quietOf } from '../camera/quiet.ts';
import { glowGate } from '../highlight.ts';
import { lookOf } from '../focus-reveal/reveal.ts';
import { VESSEL_LAYER } from '../layers.ts';
import { clock } from '../../clock/frame.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';
import { smoothstep01, LOBULE_UNDER_FROM } from './shared.ts';
import { SIN_POINT } from '../lobule/frames.ts';

export const framePart = scenePart<CelScene>()({
  /** The foci the slide on show is about (focus-reveal/config.ts): the reveal eases in once they are in the room. */
  setSlideFocus(ids: readonly string[]): void { this.focusReveal.setAbout(ids); this.moving = true; },
  /** The ids of the frame's systems in the order they run (a test pins this list; ?perf and the audit name a lagging system by one of these). */
  get systemIds(): readonly string[] { return (this.systems ??= this.makeSystems()).map((s) => s.id); },
  update(now: number): boolean {
    const dt = this.lastNow < 0 ? 16 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    this.shared.time.value = (now / 1000) % 1000;
    for (const e of this.eases) e.step(now);   // (the clock steps them in its tween phase; this is the same step at the same time, which changes nothing, and lets a hand-turned update(now) drive them)
    this.ambientIds.clear();
    const ctx: FrameCtx = { now, dt, ambient: this.ambientIds };
    let needs = runSystems(this.systems ??= this.makeSystems(), ctx, this.systemMs, () => clock.now(), this.moverIds);
    // (the scene's own flag, set by every setter that changes something: an ordinary change, never ambient; it is named in ?perf as "change")
    if (this.moving) { needs = true; this.moverIds.push('change'); }
    this.moving = false;
    this.ambientOnly = needs && this.moverIds.every((id) => this.ambientIds.has(id));
    return needs;
  },
  /** The systems that still moved at the last update (ids from `systemIds`, and "change" for a setter's own flag): ?perf names them, so a figure that never rests is found by name. */
  get movingSystems(): readonly string[] { return this.moverIds; },
  makeSystems(): FrameSystem<FrameCtx>[] {
    return [
      { id: 'camera', step: ({ now, dt }) => {
        // (a dive that waited for the chase camera to ease out starts the frame it is out, in this step, so its first frame is drawn with it)
        if (this.heldDive) this.releaseDive();
        this.followWhole(now);
        const camMoving = this.rig.update(now);
        this.shared.restEye.value.copy(this.rig.restEye); this.shared.offRest.value = this.rig.offRest;
        this.circuitScale();   // (the map's lines widen as it is zoomed out, as 2D's circBoost)
        // (the focus reveal follows what the camera looks at, eased: a slide's frame and a hand's zoom alike, focus-reveal/config.ts)
        const revealMoving = this.focusReveal.step(dt / 1000, (r) => lookOf(this.rig, r));
        return anyMoving(camMoving, revealMoving);
      } },
      { id: 'circuit', step: ({ now, dt }) => {
        const quiet = quietOf(this.rig.orbitAngle);
        for (const o of this.back) o.setQuiet(quiet);
        this.disease.organs.setQuiet(quiet);   // (quiet depth on a turn: the organs' wash eases back as the figure turns)
        const circMoving = this.stepCircuit(now, dt);
        this.fadeBody();
        // (the camera's own move, not the gentle tilt still easing or a hand on the figure: the view left behind goes the moment the move lands)
        if (this.hideLeftBehind && !this.rig.isMoving && !this.circuit.moving && !this.heldDive) this.settleViews();   // (a dive waiting for its parts has not landed: the body stays the view until it has flown)
        this.highlight.setGlowShown(glowGate(this.circuit.t));   // (it eases away over the change's first 15 %, never snaps at the switch)
        return circMoving;
      } },
      { id: 'highlight', step: ({ dt }) => anyMoving(this.highlight.step(dt), this.pins.step(dt, this.disease.organs.byId)) },
      { id: 'flow', step: (c) => {
        const { now, dt } = c;
        this.blood.shared.projY.value = this.rig.camera.projectionMatrix.elements[5]!;
        this.flowRate.step(dt / 1000, flowTarget(this.src.liveFrame()?.running));   // (Pause and Play ease the visible flow, 0.5 s each way; the model's own numbers pause at once)
        // ONE GATE for the flow marks during procedures: while any procedure is on the figure (a catheter's run or its held step, the scope) the chevrons ease out, and back when it ends
        const procQuiet = this.procs.busy || !!this.probes.scope.driven;
        if (procQuiet !== this.procQuietWas) { this.procQuietWas = procQuiet; this.flow.setOptions({ quiet: procQuiet }); }
        const streamsMoving = this.blood.streams.step(now, this.flowRate.value);
        const chainMoving = this.blood.chain.step(now, this.blood.streams, (id) => this.flow.carriesHeads(id), this.circuit.t);
        const flowMoving = this.flow.step(dt);
        // (the marks going round at a steady rate are ambient; a Pause or Play easing the rate, the chevrons easing, are changes the eye follows: full rate)
        if (streamsMoving && !flowMoving && !chainMoving && !this.flowRate.easing) c.ambient.add('flow');
        return anyMoving(flowMoving, streamsMoving, chainMoving);
      } },
      { id: 'lens', step: ({ now }) => this.lens.step(now) },
      { id: 'presence', step: ({ dt }) => {
        const presMoving = anyMoving(this.presence.step(dt), this.feeders.step(dt, () => this.pushFades()));
        this.syncStumps();
        this.syncTipJoins();
        this.syncMateK();
        this.updateCaps();
        return presMoving;
      } },
      { id: 'shapes', step: ({ dt }) => this.shapes.step(dt) },
      { id: 'skins', step: () => {
        // (one junction skin rebuilt at most, here in the render phase and before the handover, so the tubes and the skin change together; while one still waits, the clock is asked for the next frame under the tag `skin-build`)
        const skinPending = this.skins?.step() ?? false;
        if (skinPending) clock.invalidate(SKIN_BUILD_TAG);
        return anyMoving(this.skins?.sync() ?? false, skinPending, this.circuitSkins?.sync() ?? false, this.sutures?.sync(this.skins) ?? false);   // (only an arm whose own fade, highlight, lens position or colour changed reaches its skin)
      } },
      { id: 'micro', step: ({ now }) => {
        this.stepSinusDive();
        this.stepCutaway();
        this.stepPortrait();
        if (this.microReady) this.micro!.sinus.pinTraffic(this.micro3d);
        const lobMoving = this.lobule.update(now), sinMoving = this.sinus.update(now);
        // (the 3D lobule dissolves as the camera goes down onto the sinusoid, and stands aside once landed: its solid tiles and tubes rise above the sinusoid's plane and would cross it in the foreground)
        // (the lobule stays whole under the sinusoid until the sinusoid is whole over it, then stands aside: both dissolving at once let the page show through, docs/decisions.md "Lobule to sinusoid handoff")
        const dv = this.sinus.diveShareNow, under = !this.sinus.isVisible ? 0 : dv == null ? 1 : smoothstep01(LOBULE_UNDER_FROM, LOBULE_UNDER_FROM + 0.04, dv);
        // (the sinusoid view's own rows in the lobule show by their size on screen: a pure function of the camera's distance from the station, lobule-fine.ts fineShare)
        const cp = this.rig.camera.position, cd = Math.hypot(cp.x - SIN_POINT[0], cp.y - SIN_POINT[1], cp.z - SIN_POINT[2]);
        const fineMoved = !!this.microReady && this.lobule3d.setFineView(cd, this.height, this.rig.camera.fov);
        const lob3 = this.microReady && this.lobule3d.update(this.micro3d, under, now, this.flowRate.value, false, this.fadeNow);
        if (this.microReady) this.sinus3d.setLobuleTop(this.lobule3d.diveTopZ());
        const sin3 = this.microReady && this.sinus3d.update(this.micro3d, this.flowRate.value);
        if (this.microReady) this.micro!.sinus.holdScale(this.rig.camera.position);
        return anyMoving(lob3, sin3, lobMoving, sinMoving, fineMoved);
      } },
      { id: 'procedures', step: ({ now }) => {
        const procMoving = this.procs.update(now);
        this.syncWedge();
        return procMoving;   // (split from the disease and the probes: the iPhone audit's 100 ms frames sat in one lap that named three systems)
      } },
      { id: 'disease', step: (c) => {
        const { now } = c;
        this.procs.paracentesis.setBelly(this.disease.fluidMl);
        this.disease.bleed.seat = this.procs.tamponade.seat;   // (a seated tamponade balloon covers the tear: the jet never runs through it)
        const diseaseMoving = this.disease.update(now, this.flowRate.value);
        if (diseaseMoving) this.tagOverOrgans();
        if (diseaseMoving && this.disease.ambientOnly) c.ambient.add('disease');   // (the pool's ripple going round: ambient)
        return diseaseMoving;
      } },
      { id: 'probes', step: ({ now }) => this.probes.update(now, this.circuit.t > 0.02, this.procs.glueDrive) },
    ];
  },
  /** What the disease layer puts on the vessels (clots, plexus strands, the bleed) is drawn with them, over the organs (the layers are made as the states come on, so they are tagged as they move). */
  tagOverOrgans(): void {
    const d = this.disease;
    for (const g of [d.clots.group, d.strands.group, d.bleed.group]) g.traverse((c) => { if (c.layers.mask !== 2) c.layers.set(VESSEL_LAYER); });
  },
});
export type FramePart = typeof framePart;

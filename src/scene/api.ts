// What the other threads call. The scene is one object (CelScene) for the whole page; this file is its handle and the few things that
// have to be asked of it by name. Every call asks the clock for a frame, so nothing here draws and nothing runs when nobody asked.
import { Vector3 } from 'three';
import { clock } from '../clock/frame.ts';
import { CelScene } from './scene.ts';
import { bindTests } from './devices/probes/bind-tests.ts';
import type { Room } from './camera/room.ts';
import type { Shot, ShotName } from './camera/shots.ts';
import type { CatheterState } from './catheter.ts';
import type { PlayOptions } from './procedures/layer.ts';
import type { CATH_END } from './procedures/copied/cath-arrival.js';
import { create } from 'zustand';
import { engine } from '../engine/boot.ts';
import type { LensId } from './lenses/model.ts';
import type { FigureView } from './scene.ts';
import { lobuleShot, sinusoidShot, type LobuleCam, type LobuleLayers } from './lobule/index.ts';
import { circuitShot, circuitBoxShot } from './circuit/shots.ts';
import type { ResKey } from './circuit/res-model.ts';
import { TURN_MS } from './circuit/data.copied.ts';
import { useCircuitTurn } from './circuit/pref.ts';
import { useLens } from './lenses/store.ts';
import { useBlood } from './blood/options.ts';
import type { BloodChoice } from './blood/options.ts';
import type { Gestures } from './gesture/controller.ts';
import { createFrameQueue } from './gesture/frame-queue.ts';

export const cel = new CelScene();
/** The Tests card drives the Doppler, FibroScan and endoscope devices on the figure (src/scene/devices/probes/). */
export const stopProbeBinding = bindTests();
/** A dive between the body, the lobule and the sinusoid: a little longer than a move between two body shots (950 ms), because it covers a few hundred times the distance. */
export const DIVE_MS = 1250;

/** The gestures' asks for "the next frame", run by the clock's tween phase (Stage.tsx). */
export const frames = createFrameQueue(() => clock.invalidate('gesture'));
/** The live gesture controller, set by Stage while mounted. */
export const gesturesRef: { current: Gestures | null } = { current: null };

/** The vessel picked in free play (topology edge ID), for the data card. */
export const usePick = create<{ picked: string | null }>(() => ({ picked: null }));

export const sceneApi = {
  /** Fly the camera to a named shot, fitted into the room the cards leave free. One straight move from wherever it is (950 ms). */
  goTo(shot: ShotName | Shot, room: Room, ms?: number): void {
    gesturesRef.current?.handsOff();   // a new shot ends what the hand started: its zoom and pan come home with the move
    cel.goTo(shot, room, performance.now(), ms);
    clock.invalidate('shot');
  },
  /** Put the hand's view back (a state link: the figure turned `orbit` radians, zoom `k`, panned `x` `y` px): what a person's fingers left, set at once, held until the next shot. */
  setCameraView(v: { orbit?: number; k?: number; x?: number; y?: number }): void {
    const h = cel.rig.handView;
    cel.rig.holdHand();
    cel.rig.setHand({ k: v.k ?? h.k, x: v.x ?? h.x, y: v.y ?? h.y });
    if (v.orbit != null) cel.rig.setOrbit(v.orbit);
    clock.invalidate('hand');
  },
  /** Show the body, the lobule or the sinusoid and fly to it, straight from wherever the camera is (the view left behind stays up until the camera lands). `cam` is a lobule camera ('lobule', 'lobule:triad'…). */
  showView(v: FigureView, room: Room, cam: LobuleCam = 'lobule'): void {
    const from = cel.view;
    if (v === 'circuit') cel.setCircuitUpright(useCircuitTurn.getState().upright);
    cel.setView(v);
    // the body and the map change places on the camera's own length (the circuit's clock says how long is left of it), so they land together; body, lobule and sinusoid are one dive through the liver (camera/rig.ts blends it geometrically) that takes the dive's time
    const ms = (v === 'body' || v === 'circuit' ? cel.circuit.changeMs() : 0) || (from === v ? undefined : DIVE_MS);
    this.goTo(v === 'body' ? 'play' : v === 'circuit' ? circuitShot(cel.circuit.upright) : v === 'sinusoid' ? sinusoidShot() : lobuleShot(cam), room, ms);
    clock.invalidate('circuit');
  },
  /** Show the Circuit framed on a part of the map (a slide's region: a box in map units, `kMax` its closest zoom), or the whole map; the resistors and the caudate lane that the slide asks for come with it. */
  showCircuit(room: Room, o: { box?: readonly [number, number, number, number] | null; kMax?: number | null; resistors?: readonly ResKey[]; caudate?: boolean } = {}): void {
    const upright = useCircuitTurn.getState().upright;
    cel.setCircuitUpright(upright);
    cel.setView('circuit');
    cel.setResistors(o.resistors ?? []); cel.setCaudatePin(!!o.caudate);
    const whole = !o.box || (o.box[0] <= 30 && o.box[1] <= 30 && o.box[2] >= 1360 && o.box[3] >= 730);
    this.goTo(whole ? circuitShot(upright) : circuitBoxShot(o.box!, upright, o.kMax ?? null), room, cel.circuit.changeMs() || undefined);
    clock.invalidate('circuit');
  },
  /** Show a view and fly to a shot of the caller's own (a ported deck slide's camera), fitted into the room the cards leave free. */
  showShot(v: FigureView, shot: ShotName | Shot, room: Room): void {
    const from = cel.view;
    if (from !== v) cel.setView(v);
    if (from === 'circuit' && v !== 'circuit') { cel.setResistors([]); cel.setCaudatePin(false); }
    // the body and the map change places on the camera's own length (the circuit's clock says how long is left of it), so they land together
    this.goTo(shot, room, from !== v && (v === 'body' || from === 'circuit') ? cel.circuit.changeMs() || undefined : undefined);
  },
  /** The Circuit's quarter turn: stand the map upright (flow bottom to top) or lay it wide; the camera follows on the same 480 ms. Remembered across visits. */
  setCircuitUpright(on: boolean, room: Room): void {
    useCircuitTurn.getState().set(on);
    cel.setCircuitUpright(on);
    if (cel.view === 'circuit') this.goTo(circuitShot(on), room, TURN_MS);
    clock.invalidate('circuit');
  },
  /** Where a station stands in the Circuit now (scene point, turned with the map), for labels; null off the map. */
  circuitStation: (id: string, out?: Vector3): Vector3 | null => cel.circuitStation(id, out),
  /** The resistors a slide asks for ('rLiver', 'rColl', 'rGut'): zigzags and "R liver x2.3" readings on the Circuit's map. An empty list clears them. */
  setResistors(keys: readonly ResKey[]): void { cel.setResistors(keys); clock.invalidate('resistors'); },
  /** A slide is about the caudate lobe: the Circuit draws the caudate's own lane. */
  setCaudatePin(on: boolean): void { cel.setCaudatePin(on); clock.invalidate('caudate'); },
  /** The lobule's Layers menu (the 2D app starts with lymph on). */
  setLobuleLayers(l: Partial<LobuleLayers>): void { cel.setLobuleLayers(l); clock.invalidate('lobule-layers'); },
  /** Which view the figure is in now (body, lobule, sinusoid, circuit). */
  get figureView(): FigureView { return cel.view; },
  /** The wedge's wash on the lobule and the sinusoid (a slide that says `wash`); `landedAtMs` is when the view lands, the wash begins a beat after it. */
  setWash(on: boolean, landedAtMs?: number): void { cel.setWash(on, landedAtMs); clock.invalidate('wash'); },
  /** The veins a slide shows stented (edge ids): a stent comes in over each, and goes out of the ones left off the list. Returns the ids the scene could stent. */
  setStented(ids: readonly string[], instant = false): string[] { const r = cel.procs.setStented(ids, instant); clock.invalidate('stented'); return r; },
  /** The ring the HVPG catheter reads in while a deck slide holds it (free, wedge, bad); null for none. */
  setCatheterRing(ring: 'free' | 'wedge' | 'bad' | null): void { cel.procs.keptRing = ring; clock.invalidate('catheter'); },
  /** The cards changed room (a card opened, the phone turned): move the room alone; the viewer's turn stays. `homeTurn`: a slide or catheter step asked for the shot the camera is already on, and still brings the turn home. */
  setRoom(room: Room, ms?: number, homeTurn = false): void {
    if (homeTurn) gesturesRef.current?.turnOff();
    cel.rig.setRoom(room, performance.now(), ms, homeTurn);
    clock.invalidate('room');
  },
  /** Glide the hand's zoom and pan home to the shot's own framing (a second tap on the active view, a Fit button). */
  refit(): void { gesturesRef.current?.refit(); clock.invalidate('refit'); },
  /** The zoom buttons (+ and − keys): the 2D app's 1.4 about the middle of the room. */
  zoomStep(factor: number): void { gesturesRef.current?.zoomStep(factor); clock.invalidate('zoom'); },
  /** Catheter route advance 0..1 and balloon 0..1; the caller tweens them on the clock. */
  setCatheter(s: CatheterState): void { cel.setCatheter(s); clock.invalidate('catheter'); },
  /** The procedures' devices (B5): the 2D app's own choreography (proc-anim.js `procFrame`) drawn on its routes. Every kind of `PROCS`, the measurements and the plugs. */
  procedure: {
    /** Play a procedure ('tips', 'brto', 'bato', 'tipscoil', 'hvpgcath', …) from `from` to `to` ms of its own time (default the whole), at the 2D pace times `speed`. */
    play(kind: string, o?: PlayOptions): void { cel.procs.play(kind, performance.now(), o); clock.invalidate('procedure'); },
    /** Put a procedure at time t ms at once (a step's end, a jump). */
    seek(kind: string, t: number): void { cel.procs.seek(kind, t); clock.invalidate('procedure'); },
    /** The HVPG catheter in one of the deck's states (route, free, wedge, result, blocked), `advance` how far in (0..1). */
    hvpg(mode: keyof typeof CATH_END, advance = 1): void { cel.procs.showHvpg(mode, advance); clock.invalidate('procedure'); },
    /** Where the tip is now (scene units), for the camera that follows it; null with no catheter out. */
    tip(out: Vector3): Vector3 | null { return cel.procs.tipPosition(out) ?? cel.probes.glueFocus(out); },
    /** Stop the move; with `keep` the last frame stays up. */
    stop(keep = false): void { cel.procs.stop(keep); clock.invalidate('procedure'); },
    get playing(): { kind: string; t: number } | null { return cel.procs.playing; },
  },
  /** Dye (the 2D app's injectDye): into vessel `id` (default the gut's veins, as in mesenteric portography); `hold` keeps it going until release(). */
  dye: {
    inject(id: string | null, o: { hold?: boolean } = {}): void {
      const edge = id && cel.disease.dye.inject(id, 0.15, { hold: !!o.hold }) ? id : (cel.disease.dye.inject('V_INT', 0, { hold: !!o.hold }), 'V_INT');
      void edge; clock.invalidate('dye');
    },
    release(): void { cel.disease.dye.release(); clock.invalidate('dye'); },
    get active(): boolean { return cel.disease.dye.active; },
  },
  /** Edge IDs the slide talks about; in flow-mark option A these (and the picked vessel) carry chevrons. */
  setNamedVessels(ids: readonly string[]): void { cel.setNamedVessels(ids); clock.invalidate('named-vessels'); },
  /** Light exactly these vessels (edge IDs), as the shunt's valid targets glow; [] puts them out. Replaces the pick. */
  markVessels(ids: readonly string[]): void { cel.markVessels(ids); clock.invalidate('mark'); },
  /** Outline organs by the organ layer's ids (a slide's glow, spot or term naming an organ); `normalSpleen` also draws the normal-sized spleen's line. [] clears. */
  pinOrgans(ids: readonly string[], normalSpleen = false): void { cel.pinOrgans(ids, normalSpleen); clock.invalidate('pin'); },
  /** Pick a vessel by edge ID, or clear with null. */
  pick(id: string | null): void { cel.pick(id); usePick.setState({ picked: cel.highlight.picked }); clock.invalidate('pick'); },
  /** Option D: marks run for a few seconds after a change (a preset, a slider, a treatment). */
  flowPulse(): void { /* the 2D app has no pulse option: nothing to trigger */ clock.invalidate('flow-pulse'); },
  /** Colour the veins by a lens (the Layers menu's ten, a slide's `system` or `since`, or 'neutral' for the plain anatomy). They crossfade in 420 ms. */
  setLens(lens: LensId, instant = false): void { useLens.setState({ lens }); cel.setLens(lens, performance.now(), instant); clock.invalidate('lens'); },
  /** Compare's Change view: Change and Congestion count from a pinned moment's pressures; null goes back to the healthy reference. */
  setLensRef(P: ArrayLike<number> | null): void { cel.setLensRef(P); clock.invalidate('lens'); },
  /** A "change since" slide's baseline: the node pressures (the state of the slide before, a named slide's, a lapse's start) the Since lens counts from; null goes back to the state the figure showed as the lens came in. */
  setSinceRef(P: ArrayLike<number> | null): void { cel.setSinceRef(P); clock.invalidate('lens'); },
  /** The Blood menu: chevrons, key chevrons only, potential collaterals (the other two are the cards' and tags' business). Remembered across visits. */
  setBlood(patch: Partial<BloodChoice>, presenting = false): void {
    useBlood.getState().set(patch);
    const b = useBlood.getState();
    cel.setBlood({ chevrons: b.chevrons, keyChevrons: b.keyChevrons, collaterals: b.collaterals, presenting });
    clock.invalidate('blood');
  },
  /** Once the engine is up: the healthy reference for the lenses (a second or two of the worker's time, once per visit). */
  async loadHealthy(): Promise<void> {
    const h = await engine().request({ type: 'healthyProfile' }) as unknown as { P: number[]; Q: number[]; D: number[] };
    cel.setHealthy(h); clock.invalidate('lens');
  },
  /** Scene point of a named place for tags, valid before and after the camera moves. */
  anchor: (name: Parameters<CelScene['anchor']>[0], out?: Vector3): Vector3 => cel.anchor(name, out),
  /** Where a scene point lands on the canvas now (CSS px), for tags written in the clock's tags phase. */
  project: (p: Vector3, out?: { x: number; y: number }): { x: number; y: number } => cel.rig.project(p, out),
  /** True while the camera is in flight; tags fade out meanwhile and back in 180 ms after it lands. */
  get cameraMoving(): boolean { return cel.rig.isMoving; },
  /** True once the camera has its first real shot (nothing is drawn before). */
  get placed(): boolean { return cel.rig.placed; },
};

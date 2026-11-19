// What the other threads call. The scene is one object (CelScene) for the whole page; this file is its handle and the few things that
// have to be asked of it by name. Every call asks the clock for a frame, so nothing here draws and nothing runs when nobody asked.
import { Vector3 } from 'three';
import { clock } from '../clock/frame.ts';
import { CelScene } from './scene.ts';
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
import { circuitShot } from './circuit/shots.ts';
import { TURN_MS } from './circuit/data.copied.ts';
import { useCircuitTurn } from './circuit/pref.ts';
import { useLens } from './lenses/store.ts';
import { useBlood } from './blood/options.ts';
import type { BloodChoice } from './blood/options.ts';
import type { Gestures } from './gesture/controller.ts';
import { createFrameQueue } from './gesture/frame-queue.ts';

export const cel = new CelScene();
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
  /** Show a view and fly to a shot of the caller's own (a ported deck slide's camera), fitted into the room the cards leave free. */
  showShot(v: FigureView, shot: ShotName | Shot, room: Room): void {
    if (cel.view !== v) cel.setView(v);
    this.goTo(shot, room);
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
  /** The lobule's Layers menu (the 2D app starts with lymph on). */
  setLobuleLayers(l: Partial<LobuleLayers>): void { cel.setLobuleLayers(l); clock.invalidate('lobule-layers'); },
  /** The cards changed room (a card opened, the phone turned): move the room alone. */
  setRoom(room: Room, ms?: number): void { cel.rig.setRoom(room, performance.now(), ms); clock.invalidate('room'); },
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
    /** Stop the move; with `keep` the last frame stays up. */
    stop(keep = false): void { cel.procs.stop(keep); clock.invalidate('procedure'); },
    get playing(): { kind: string; t: number } | null { return cel.procs.playing; },
  },
  /** Edge IDs the slide talks about; in flow-mark option A these (and the picked vessel) carry chevrons. */
  setNamedVessels(ids: readonly string[]): void { cel.setNamedVessels(ids); clock.invalidate('named-vessels'); },
  /** Pick a vessel by edge ID, or clear with null. */
  pick(id: string | null): void { cel.pick(id); usePick.setState({ picked: cel.highlight.picked }); clock.invalidate('pick'); },
  /** Option D: marks run for a few seconds after a change (a preset, a slider, a treatment). */
  flowPulse(): void { /* the 2D app has no pulse option: nothing to trigger */ clock.invalidate('flow-pulse'); },
  /** Colour the veins by a lens (the Layers menu's ten, a slide's `system` or `since`, or 'neutral' for the plain anatomy). They crossfade in 420 ms. */
  setLens(lens: LensId, instant = false): void { useLens.setState({ lens }); cel.setLens(lens, performance.now(), instant); clock.invalidate('lens'); },
  /** Compare's Change view: Change and Congestion count from a pinned moment's pressures; null goes back to the healthy reference. */
  setLensRef(P: ArrayLike<number> | null): void { cel.setLensRef(P); clock.invalidate('lens'); },
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
};

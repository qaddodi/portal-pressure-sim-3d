// What the other threads call. The scene is one object (CelScene) for the whole page; this file is its handle and the few things that
// have to be asked of it by name. Every call asks the clock for a frame, so nothing here draws and nothing runs when nobody asked.
import { Vector3 } from 'three';
import { clock } from '../clock/frame.ts';
import { CelScene } from './scene.ts';
import type { Room } from './camera/room.ts';
import type { Shot, ShotName } from './camera/shots.ts';
import type { CatheterState } from './catheter.ts';
import { create } from 'zustand';
import { engine } from '../engine/boot.ts';
import type { LensId } from './lenses/model.ts';
import { useLens } from './lenses/store.ts';
import { useBlood } from './blood/options.ts';
import type { BloodChoice } from './blood/options.ts';
import type { Gestures } from './gesture/controller.ts';
import { createFrameQueue } from './gesture/frame-queue.ts';

export const cel = new CelScene();

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
  /** The cards changed room (a card opened, the phone turned): move the room alone. */
  setRoom(room: Room, ms?: number): void { cel.rig.setRoom(room, performance.now(), ms); clock.invalidate('room'); },
  /** Glide the hand's zoom and pan home to the shot's own framing (a second tap on the active view, a Fit button). */
  refit(): void { gesturesRef.current?.refit(); clock.invalidate('refit'); },
  /** Catheter route advance 0..1 and balloon 0..1; the caller tweens them on the clock. */
  setCatheter(s: CatheterState): void { cel.setCatheter(s); clock.invalidate('catheter'); },
  /** Edge IDs the slide talks about; in flow-mark option A these (and the picked vessel) carry chevrons. */
  setNamedVessels(ids: readonly string[]): void { cel.setNamedVessels(ids); clock.invalidate('named-vessels'); },
  /** Pick a vessel by edge ID, or clear with null. */
  pick(id: string | null): void { cel.pick(id); usePick.setState({ picked: cel.highlight.picked }); clock.invalidate('pick'); },
  /** Option D: marks run for a few seconds after a change (a preset, a slider, a treatment). */
  flowPulse(): void { cel.flow.trigger(performance.now()); clock.invalidate('flow-pulse'); },
  /** Colour the veins by a lens (the Layers menu's ten, a slide's `system` or `since`, or 'neutral' for the plain anatomy). They crossfade in 420 ms. */
  setLens(lens: LensId, instant = false): void { useLens.setState({ lens }); cel.setLens(lens, performance.now(), instant); clock.invalidate('lens'); },
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

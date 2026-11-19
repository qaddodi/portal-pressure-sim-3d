// What the other threads call. The scene is one object (CelScene) for the whole page; this file is its handle and the few things that
// have to be asked of it by name. Every call asks the clock for a frame, so nothing here draws and nothing runs when nobody asked.
import { Vector3 } from 'three';
import { clock } from '../clock/frame.ts';
import { CelScene } from './scene.ts';
import type { Room } from './camera/room.ts';
import type { Shot, ShotName } from './camera/shots.ts';
import type { CatheterState } from './catheter.ts';
import { create } from 'zustand';

export const cel = new CelScene();

/** The vessel picked in free play (topology edge ID), for the data card. */
export const usePick = create<{ picked: string | null }>(() => ({ picked: null }));

export const sceneApi = {
  /** Fly the camera to a named shot, fitted into the room the cards leave free. One straight move from wherever it is (950 ms). */
  goTo(shot: ShotName | Shot, room: Room, ms?: number): void {
    cel.goTo(shot, room, performance.now(), ms);
    clock.invalidate('shot');
  },
  /** The cards changed room (a card opened, the phone turned): move the room alone. */
  setRoom(room: Room, ms?: number): void { cel.rig.setRoom(room, performance.now(), ms); clock.invalidate('room'); },
  /** Catheter route advance 0..1 and balloon 0..1; the caller tweens them on the clock. */
  setCatheter(s: CatheterState): void { cel.setCatheter(s); clock.invalidate('catheter'); },
  /** Edge IDs the slide talks about; in flow-mark option A these (and the picked vessel) carry chevrons. */
  setNamedVessels(ids: readonly string[]): void { cel.setNamedVessels(ids); clock.invalidate('named-vessels'); },
  /** Pick a vessel by edge ID, or clear with null. */
  pick(id: string | null): void { cel.pick(id); usePick.setState({ picked: cel.highlight.picked }); clock.invalidate('pick'); },
  /** Option D: marks run for a few seconds after a change (a preset, a slider, a treatment). */
  flowPulse(): void { cel.flow.trigger(performance.now()); clock.invalidate('flow-pulse'); },
  /** Scene point of a named place for tags, valid before and after the camera moves. */
  anchor: (name: Parameters<CelScene['anchor']>[0], out?: Vector3): Vector3 => cel.anchor(name, out),
  /** Where a scene point lands on the canvas now (CSS px), for tags written in the clock's tags phase. */
  project: (p: Vector3, out?: { x: number; y: number }): { x: number; y: number } => cel.rig.project(p, out),
  /** True while the camera is in flight; tags fade out meanwhile and back in 180 ms after it lands. */
  get cameraMoving(): boolean { return cel.rig.isMoving; },
};

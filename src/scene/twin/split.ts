// The split orbit's driver (docs/approved/split-orbit.md): the slides ask for it (`splitWant`), the twin figure is made once the page is quiet, drawn beside the page's scene, turned with it and
// disposed the moment the slide is left. Off for everyone until a slide in decks/split-slides.ts asks. Nothing here draws or keeps time of its own: the page's clock steps it.
import { create } from 'zustand';
import type { WebGLRenderer, WebGLRenderTarget } from 'three';
import { clock, type TimerId } from '../../clock/frame.ts';
import { whenQuiet, type QuietJob } from '../../clock/idle.ts';
import { easeArrive } from '../../clock/tween.ts';
import { engine } from '../../engine/boot.ts';
import { patient } from '../../engine/store.ts';
import type { LookId } from '../../looks/looks.ts';
import type { Room } from '../camera/room.ts';
import { SHOTS, type Shot, type ShotName } from '../camera/shots.ts';
import { reduced } from '../../ui/a11y/motion.ts';
import type { CelScene } from '../scene.ts';
import { cutShare, halveRoom, type Region } from './region.ts';
import { Twin, healthyFrame, type HealthyProfile } from './twin.ts';

/** The host's answer to `healthyProfile`. */
interface HealthyReply { type: 'healthy'; reqId: number; P: number[]; Q: number[]; D: number[]; metrics?: unknown; [k: string]: unknown }
export interface SplitWords { left: string; right: string }
/** What the labels over the two figures read: where they stand (CSS px) and the words; `on` eases their opacity. */
export const useSplitUi = create<{ on: boolean; left: string; right: string; lx: number; rx: number; y: number }>(() => ({ on: false, left: '', right: '', lx: 0, rx: 0, y: 0 }));

/** The wipe that brings the twin in: the cut sweeps from the left edge to its place, so the page's figure is never cut at once (no pop). */
export const WIPE_MS = 700;

interface Host { scene: CelScene; stage(): { w: number; h: number }; look(): LookId; phone(): boolean }
let host: Host | null = null;
let words: SplitWords | null = null;
let twin: Twin | null = null;
let job: QuietJob | null = null;
let building = false;
let offClock: (() => void) | null = null;
let last: { shot: ShotName | Shot; room: Room; ms: number | undefined } | null = null;
let lastRoom: Room | null = null;
let wipeAt = -1;
let fetchGen = 0;
let sweepTimers: TimerId[] = [];

/** The page's scene hands itself over once (Stage); nothing is built without it. */
export function bindSplit(h: Host | null): void { host = h; if (!h) leaveSplit(); }

/** Whether a twin is up and drawing now. */
export const splitActive = (): boolean => twin !== null && !twin.disposed && host?.scene.split != null;

/** A slide asks for the split (words), or none (null). Idempotent: the same ask again does nothing; a different slide's ask changes the words only. */
export function splitWant(w: SplitWords | null): void {
  if (!host) return;
  if (!w) { leaveSplit(); return; }
  const changed = !words || words.left !== w.left || words.right !== w.right;
  words = w;
  if (twin && !twin.disposed) { if (changed) showLabels(); return; }
  if (building || job || !host.scene.post.on) return;   // (the twin is drawn into the figure's anti-aliasing target: without that pass the page keeps the whole canvas)
  building = true;
  const gen = ++fetchGen;
  // the healthy patient at rest from the live host (a read: it touches no state), then the twin is made in a quiet slot, never inside a frame
  void engine().request<HealthyReply>({ type: 'healthyProfile' }).then((h) => {
    if (gen !== fetchGen || !host || !words) { building = false; return; }
    job = whenQuiet(() => { job = null; building = false; if (gen === fetchGen && host && words) enter(h); return true; }, { tag: 'split-twin', budgetMs: 40 });
  }, () => { building = false; });
}

function enter(h: HealthyProfile): void {
  if (!host) return;
  twin = new Twin(healthyFrame(h), patient.reference, { look: host.look(), phone: host.phone() });
  const { w, h: hh } = host.stage();
  twin.resize(w, hh);
  const t = twin;
  const draw = (gl: WebGLRenderer, into: WebGLRenderTarget, region: Region, dpr: number) => t.draw(gl, into, region, dpr);
  wipeAt = clock.now();
  host.scene.split = { get at() { return currentAt(); }, drawTwin: draw };
  offClock = clock.on('camera', (f) => { if (twin && twin.step(f.time)) clock.invalidate('twin'); if (wipeAt >= 0) { if (f.time - wipeAt < WIPE_MS) clock.invalidate('twin-wipe'); else wipeAt = -2; } }, 1);
  if (last) applyCamera(last.shot, last.room, last.ms);
  else if (lastRoom) applyRoom(lastRoom);
  // (the page's figure glides into the right half as the cut sweeps in, in the same time)
  if (lastRoom) host.scene.rig.setRoom(halveRoom(lastRoom).main, clock.now(), WIPE_MS, false, true, easeArrive);
  showLabels();
  startSweep();
  clock.invalidate('twin-built');
}

/** The share of the canvas the twin owns now: the cut's place, swept in from the left edge while the twin arrives. */
function currentAt(): number {
  if (!host || !lastRoom) return 0;
  const target = cutShare(lastRoom, host.stage().w);
  if (wipeAt === -2 || wipeAt < 0) return target;
  const k = Math.min(1, (clock.now() - wipeAt) / WIPE_MS);
  return target * easeArrive(k);
}

function showLabels(): void {
  if (!host || !words || !lastRoom) { useSplitUi.setState({ on: false }); return; }
  const r = halveRoom(lastRoom);
  useSplitUi.setState({ on: true, left: words.left, right: words.right, lx: r.twin.x + r.twin.w / 2, rx: r.main.x + r.main.w / 2, y: lastRoom.y });
}

/** The rooms the two cameras are fitted to while the split is up; the page's own room otherwise. */
function roomsFor(room: Room): { main: Room; twin: Room | null } {
  if (!twin || twin.disposed) return { main: room, twin: null };
  const r = halveRoom(room);
  return { main: r.main, twin: r.twin };
}

function applyCamera(shot: ShotName | Shot, room: Room, ms: number | undefined): void {
  if (!twin || twin.disposed) return;
  const r = halveRoom(room);
  twin.scene.goTo(shot, r.twin, clock.now(), ms);
}
function applyRoom(room: Room, ms?: number, ease?: (k: number) => number): void {
  if (!twin || twin.disposed) return;
  twin.scene.rig.setRoom(halveRoom(room).twin, clock.now(), ms, false, true, ease ?? null);
}

/** The page's `goTo`, asked what room to use and told the shot: with the split up the page's scene takes the right half of the room and the twin the left, the same shot and time. */
export function splitGoTo(shot: ShotName | Shot, room: Room, ms: number | undefined): Room {
  last = { shot, room, ms }; lastRoom = room;
  if (!twin || twin.disposed) return room;
  cancelSweep();
  applyCamera(shot, room, ms); showLabels();
  return roomsFor(room).main;
}
/** The page's `setRoom`, the same. */
export function splitSetRoom(room: Room, ms?: number, ease?: (k: number) => number): Room {
  lastRoom = room;
  if (!twin || twin.disposed) return room;
  applyRoom(room, ms, ease); showLabels();
  return roomsFor(room).main;
}

export function splitResize(w: number, h: number): void { twin?.resize(w, h); }
export function splitLook(look: LookId): void { twin?.scene.applyLook(look); }
export function splitPhone(phone: boolean): void { twin?.scene.setPhone(phone); }

/** Leaving the slide: the page's scene has all of the canvas again, the twin is let go. Safe at any time, any number of times. */
export function leaveSplit(): void {
  cancelSweep(); fetchGen++; words = null; building = false;
  job?.cancel(); job = null;
  offClock?.(); offClock = null;
  if (host?.scene.split) host.scene.split = null;
  const t = twin; twin = null; wipeAt = -1;
  t?.dispose();
  if (useSplitUi.getState().on) useSplitUi.setState({ on: false });
  clock.invalidate('twin-left');
}

/** For tests: the twin made at once, without the engine or a quiet slot. */
export const splitEnterNow = (h: HealthyProfile, w: SplitWords): void => { words = w; enter(h); };

/** For tests: the state without the page. */
export const splitDebug = (): { twin: boolean; building: boolean; job: boolean } => ({ twin: twin !== null, building, job: job !== null });

/** The room the page's camera is fitted to while a twin is up (the right half of `room`), else `room`: what `roomIs` compares against. */
export function splitMainRoom(room: Room): Room { return twin && !twin.disposed ? halveRoom(room).main : room; }

// The turn (the mock's three frames: about 49 degrees toward the patient's left, front, 49 the other way): both cameras are sent to the same turned shot together, in the same time, so the two
// livers turn as one. It plays once after the twin has come in and the page's own move has landed, then rests at the front; any camera call from the slide cancels what is left of it, and a viewer who
// asks for reduced motion gets the front only.
export const SWEEP_DEG = 49;
export const LEG_MS = 2000;
const SWEEP_AFTER_MS = WIPE_MS + 500;

/** The yaws of the legs, radians: left, right, home. Pure, for the test. */
export function sweepYaws(base: number, deg = SWEEP_DEG): number[] { const r = (deg * Math.PI) / 180; return [base - r, base + r, base]; }

function cancelSweep(): void { for (const t of sweepTimers) clock.cancel(t); sweepTimers = []; }

function startSweep(): void {
  cancelSweep();
  if (!host || !last || reduced()) return;
  const { shot, room } = last;
  const base = typeof shot === 'string' ? SHOTS[shot] : shot;
  const yaws = sweepYaws(base.yaw);
  yaws.forEach((yaw, i) => {
    sweepTimers.push(clock.after(() => {
      if (!host || !twin || twin.disposed) return;
      const turned: Shot = i === yaws.length - 1 ? base : { ...base, yaw };
      const r = halveRoom(room);
      twin.scene.goTo(turned, r.twin, clock.now(), LEG_MS);
      host.scene.goTo(turned, r.main, clock.now(), LEG_MS);
      clock.invalidate('twin-turn');
    }, SWEEP_AFTER_MS + i * LEG_MS, 'split-turn'));
  });
}

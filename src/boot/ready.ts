// The splash (index.html #boot) stays up until the app is actually ready, then eases away over the finished app: no part of it pops in behind a lifting cover (owner, 20 Nov:
// "do not show the view until we know things are loaded then fade in; keep the splash screen until then").
// Ready is: fonts and the first patient loaded (main.tsx awaits both before React mounts the app), the scene built and its FIRST FRAME drawn (Stage.tsx), and the labels placed AND faded fully in
// (LabelLayer.tsx calls `labelsShown()`; owner, 20 Nov: "labels should already be loaded, so we just fade into the figure with labels"). The cover then eases away (360 ms, even) while the figure's camera glides in from a
// little closer than rest, starting 120 ms later (the rig's own glide: Stage's reveal hooks, scene.playReveal). Only the main app's path holds the cover (`data-boot="wait"` on <html>); every other page
// (the crash and no-WebGL notes, the parity and debug pages) lifts it as soon as React has put something in #root, as before. A start that never gets there lifts it anyway.
import { clock, type TimerId } from '../clock/frame.ts';
import { stamp, stamps } from './timeline.ts';
import { armLateWatch } from './late-programs.ts';
import { startLongTasks } from './longtasks.ts';

/** The cover's failsafe is about progress, not the clock (22 Nov splash review, item 5; independent review F12): once the figure is DRAWN, it lifts when no stage of the start (engine, scene, compile, first draw, labels) has been stamped for this long.
 *  There is no total limit: a slow phone that keeps getting somewhere keeps the cover however long that takes, and a start that stops before its first picture is never lifted onto the bare ground. It keeps the cover and index.html's note
 *  says so ("Still loading…", with Reload and Keep waiting) after 15 s with nothing new. */
export const BOOT_STALL_MS = 5000;
const STALL_POLL_MS = 500;
/** A view with no labels to show (or labels that never settle) does not hold the cover for ever: this long after the first frame, or after the last time the labels came further in, it lifts. */
export const LABELS_GRACE_MS = 2500;
/** The reveal (splash plan A2/A6): the camera starts REVEAL_ZOOM times closer than rest, behind the cover, and glides home over REVEAL_MS, starting REVEAL_DELAY_MS after the cover begins to fade (so the eye follows the figure settling,
 *  not the cover clearing). It is the rig's own glide (scene.playReveal), drawn crisp at full resolution each frame, with the labels following by projection; there is no CSS scale of the canvas. */
export const REVEAL_ZOOM = 1.04, REVEAL_MS = 900, REVEAL_DELAY_MS = 120;
export interface RevealHooks { prime(zoom: number): void; play(ms: number): void }
let reveal: RevealHooks | null = null;
/** Stage gives the boot its two calls (put the closer view in under the cover; glide it home). */
export const setRevealHooks = (h: RevealHooks | null): void => { reveal = h; };
const FRAMES_AFTER_FIRST = 1;

type Lift = () => void;
let lift: Lift = () => { (window as unknown as { ppsBootLift?: Lift }).ppsBootLift?.(); };
let labelsAt = 0, labelSum = 0, labels = false, firstAt = 0, waiting = false, frames = -1, off: (() => void) | null = null, timer: TimerId | undefined, done = false, compiled = false, stallOff: (() => void) | null = null;

/** The start is getting somewhere without finishing a stage: the compile warm-up says so between its slices (materials/warm.ts). The cover's wait (index.html `ppsBootBeat`)
 *  and the stall watch both count it as progress,
 *  so a slow machine that is compiling is waited for, and one that is not is told. */
let beats = 0;
export function bootBeat(): void {
  beats++;
  (globalThis as { ppsBootBeat?: () => void }).ppsBootBeat?.();
}

/** The main app is about to mount: the splash waits for `figureDrawn()` (or the failsafe). */
export function holdSplash(lifter?: Lift): void {
  if (lifter) lift = lifter;
  waiting = true; done = false; frames = -1; labels = false; compiled = false; labelsAt = 0; labelSum = 0;
  document.documentElement.dataset.boot = 'wait';
  clock.cancel(timer); stallOff?.();
  // (only a start that HAS drawn its figure may be lifted for a quiet spell; one that has not drawn is never lifted by the watch: lifting onto an undrawn scene is the black ground, then the figure, then the labels, one after the other.
  //  The warm-up's own cap fires on the same quiet spell, so the two used to meet and the cover went up at the very moment the first frame was about to be drawn: 22 Nov, Mohammad.
  //  A start that never draws keeps the cover, and the cover says it is still coming and offers Reload: index.html `slow`, which counts the stages as progress too.)
  stallOff = watchStall(() => (frames >= 0 ? release() : false));
}

/** Calls `onStall()` when no boot stage has been stamped for `quietMs` of real time (the page clock's audit speed does not shorten it); never when `live()` turns false first. Only progress is watched, never the total time.
 *  A handler that returns `false` is not done: the watch goes on (a new quiet spell starts). Returns its canceller. */
export function watchStall(onStall: () => void | boolean, quietMs = BOOT_STALL_MS, live: () => boolean = () => waiting && !done): () => void {
  let next: TimerId | undefined;
  const progress = (): number => Object.keys(stamps()).length + beats;
  let seen = progress(), quiet = 0;
  const poll = (): void => {
    if (!live()) return;
    const n = progress();
    if (n !== seen) { seen = n; quiet = 0; } else quiet += STALL_POLL_MS;
    if (quiet >= quietMs && onStall() !== false) return;
    if (quiet >= quietMs) quiet = 0;
    next = clock.afterReal(poll, STALL_POLL_MS);
  };
  next = clock.afterReal(poll, STALL_POLL_MS);
  return () => clock.cancel(next);
}

/** True from holdSplash() until the cover is released or failed: the figure has not been drawn yet, so a lost context is a boot failure, not something to recover from. */
export const splashHeld = (): boolean => waiting && !done;

/** Every program the figure can ask for is compiled (Stage's warm-up under the splash: materials/prototypes.ts), or the warm-up's cap ran out. The cover never lifts before this, except by the failsafe: the
 *  splash is the one place allowed to be slow, and a program that compiles after the lift is a stall in front of the viewer (L3, 21 Nov). */
export function compileDone(): void {
  compiled = true;
  reveal?.prime(REVEAL_ZOOM);   // (the closer view is in BEFORE the first frame is drawn, so the labels are placed at the view they will be lifted over, and nothing about the camera changes between the first frame and the lift)
}
/** Whether the programs are compiled (tests, and Stage's first frame). */
export const programsCompiled = (): boolean => compiled;

/** The scene drew a frame. The first one starts the count; the frame after it has placed the labels, and the splash goes. A frame before `compileDone()` does not count. */
export function figureDrawn(): void {
  if (!waiting || done || !compiled) return;
  if (frames < 0) {
    frames = 0; firstAt = clock.now(); stamp('first-draw'); if (labels) stamp('labels');
    off = clock.on('tags', () => { if (++frames > FRAMES_AFTER_FIRST && (labels || clock.now() - Math.max(firstAt, labelsAt) > LABELS_GRACE_MS)) release(); else clock.invalidate('boot-ready'); }, 1e6);
    clock.invalidate('boot-ready');
  }
}

/** The renderer cannot produce the figure (its context was lost before the first picture): a terminal state, not a slow one. The splash says so with Reload and the 2D link (index.html `ppsBootRendererFail`); a start already released is left alone. */
export function rendererFailed(reason: string): void {
  if (done || !waiting) return;
  done = true; waiting = false;
  clock.cancel(timer); stallOff?.(); off?.(); off = null;
  (window as unknown as { ppsBootRendererFail?: (r: string) => void }).ppsBootRendererFail?.(reason);
}

/** The labels are on their way in: `sum` is how far in they all are together (the sum of their opacities). While it grows the grace period starts again, so labels that are still arriving are waited for and never lifted over;
 *  labels that stand part-way and stay there (it does not grow) are given up on after the grace. */
export function labelsProgress(sum: number): void { if (waiting && sum > labelSum + 0.002) { labelSum = sum; labelsAt = clock.now(); } }

/** Every label the figure shows is fully in (LabelLayer, each frame it is true). */
// (the labels are placed by projection and can be fully in before the first frame is drawn, on a slow machine: the 'labels' stage, which moves the cover's bar to "Almost
// there", is stamped only once the figure is drawn,
//  so the bar never says "Almost there" over a figure that has not drawn: the old computer sat at 96% with nothing drawn)
export function labelsShown(): void { if (waiting) { labels = true; if (frames >= 0) stamp('labels'); } }

export function release(): void {
  if (done || !waiting) return;
  done = true; waiting = false;
  clock.cancel(timer); stallOff?.(); off?.(); off = null;
  delete document.documentElement.dataset.boot;
  stamp('lift'); armLateWatch(); startLongTasks();   // (from here a program built, or a main-thread task over 50 ms, is counted and named: boot/late-programs.ts, boot/longtasks.ts)
  lift();
  const r = reveal;   // (the hooks this start had, not whatever is set when the timer fires)
  clock.after(() => r?.play(REVEAL_MS), REVEAL_DELAY_MS, 'boot-reveal');
}

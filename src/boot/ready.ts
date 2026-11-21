// The splash (index.html #boot) stays up until the app is actually ready, then eases away over the finished app: no part of it pops in behind a lifting cover (owner, 20 Nov:
// "do not show the view until we know things are loaded then fade in; keep the splash screen until then").
// Ready is: fonts and the first patient loaded (main.tsx awaits both before React mounts the app), the scene built and its FIRST FRAME drawn (Stage.tsx), and the labels placed AND faded fully in
// (LabelLayer.tsx calls `labelsShown()`; owner, 20 Nov: "labels should already be loaded, so we just fade into the figure with labels"). The cover then eases away while the figure settles in from a
// mild zoom (`html[data-reveal]`, global.css). Only the main app's path holds the cover (`data-boot="wait"` on <html>); every other page
// (the crash and no-WebGL notes, the parity and debug pages) lifts it as soon as React has put something in #root, as before. A start that never gets there lifts it anyway.
import { clock } from '../clock/frame.ts';

export const BOOT_FAILSAFE_MS = 8000;
/** A view with no labels to show (or labels that never settle) does not hold the cover for ever: this long after the first frame it lifts. */
export const LABELS_GRACE_MS = 2500;
/** How long `html[data-reveal]` stays on: the zoom-in that goes with the cover's fade. */
export const REVEAL_MS = 1000;
const FRAMES_AFTER_FIRST = 1;

type Lift = () => void;
let lift: Lift = () => { (window as unknown as { ppsBootLift?: Lift }).ppsBootLift?.(); };
let labels = false, firstAt = 0, waiting = false, frames = -1, off: (() => void) | null = null, timer: number | undefined, done = false;

/** The main app is about to mount: the splash waits for `figureDrawn()` (or the failsafe). */
export function holdSplash(lifter?: Lift): void {
  if (lifter) lift = lifter;
  waiting = true; done = false; frames = -1; labels = false;
  document.documentElement.dataset.boot = 'wait';
  clock.cancel(timer);
  timer = clock.after(release, BOOT_FAILSAFE_MS);
}

/** The scene drew a frame. The first one starts the count; the frame after it has placed the labels, and the splash goes. */
export function figureDrawn(): void {
  if (!waiting || done) return;
  if (frames < 0) {
    frames = 0; firstAt = clock.now();
    off = clock.on('tags', () => { if (++frames > FRAMES_AFTER_FIRST && (labels || clock.now() - firstAt > LABELS_GRACE_MS)) release(); else clock.invalidate('boot-ready'); }, 1e6);
    clock.invalidate('boot-ready');
  }
}

/** The renderer cannot produce the figure (its context was lost before the first picture): a terminal state, not a slow one. The splash says so with Reload and the 2D link (index.html `ppsBootRendererFail`); a start already released is left alone. */
export function rendererFailed(reason: string): void {
  if (done || !waiting) return;
  done = true; waiting = false;
  clock.cancel(timer); off?.(); off = null;
  (window as unknown as { ppsBootRendererFail?: (r: string) => void }).ppsBootRendererFail?.(reason);
}

/** Every label the figure shows is fully in (LabelLayer, each frame it is true). */
export function labelsShown(): void { if (waiting) labels = true; }

export function release(): void {
  if (done || !waiting) return;
  done = true; waiting = false;
  clock.cancel(timer); off?.(); off = null;
  delete document.documentElement.dataset.boot;
  const root = document.documentElement;
  root.dataset.reveal = '1';   // (the figure and its labels settle in from a mild zoom as the cover fades)
  clock.after(() => { delete root.dataset.reveal; }, REVEAL_MS);
  lift();
}

// The splash (index.html #boot) stays up until the app is actually ready, then eases away over the finished app: no part of it pops in behind a lifting cover (owner, 20 Nov:
// "do not show the view until we know things are loaded then fade in; keep the splash screen until then").
// Ready is: fonts and the first patient loaded (main.tsx awaits both before React mounts the app), the scene built and its FIRST FRAME drawn (Stage.tsx), and the labels placed
// (they are laid out in the clock's `tags` phase, so a second drawn frame has placed them). Only the main app's path holds the cover (`data-boot="wait"` on <html>); every other page
// (the crash and no-WebGL notes, the parity and debug pages) lifts it as soon as React has put something in #root, as before. A start that never gets there lifts it anyway.
import { clock } from '../clock/frame.ts';

export const BOOT_FAILSAFE_MS = 8000;
const FRAMES_AFTER_FIRST = 1;

type Lift = () => void;
let lift: Lift = () => { (window as unknown as { ppsBootLift?: Lift }).ppsBootLift?.(); };
let waiting = false, frames = -1, off: (() => void) | null = null, timer: ReturnType<typeof setTimeout> | undefined, done = false;

/** The main app is about to mount: the splash waits for `figureDrawn()` (or the failsafe). */
export function holdSplash(lifter?: Lift): void {
  if (lifter) lift = lifter;
  waiting = true; done = false; frames = -1;
  document.documentElement.dataset.boot = 'wait';
  clearTimeout(timer);
  timer = setTimeout(release, BOOT_FAILSAFE_MS);
}

/** The scene drew a frame. The first one starts the count; the frame after it has placed the labels, and the splash goes. */
export function figureDrawn(): void {
  if (!waiting || done) return;
  if (frames < 0) {
    frames = 0;
    off = clock.on('tags', () => { if (++frames > FRAMES_AFTER_FIRST) release(); else clock.invalidate('boot-ready'); }, 1e6);
    clock.invalidate('boot-ready');
  }
}

export function release(): void {
  if (done || !waiting) return;
  done = true; waiting = false;
  clearTimeout(timer); off?.(); off = null;
  delete document.documentElement.dataset.boot;
  lift();
}

import { clock } from '../clock/frame.ts';
// The figure's graphics context lost AFTER its first picture (iOS Safari drops it when a backgrounded tab is under memory pressure; a driver reset does too). Before the first picture it is a boot failure
// (boot/ready.ts rendererFailed). After it, the figure is kept and brought back:
//   lost      preventDefault (without it the browser never restores), pause the render phase, fade in "Redrawing the figure…", start the wait
//   restored  rebuild what three cannot (the warm-up of programs and geometry, the vessel data texture), resume drawing, fade the note out
//   5 s later with no restore: the note offers Reload (state kept); a restore after that still recovers.
// Pure: Stage.tsx hands it the canvas and the hooks, tests/context-loss.test.ts a fake canvas.
export const RESTORE_WAIT_MS = 5000;

export interface LossHooks {
  /** the context was lost after the first picture: stop the render phase and show the note */
  lost(): void;
  /** no restore within RESTORE_WAIT_MS: offer Reload */
  stuck(): void;
  /** the context is back: rebuild what three does not know to rebuild */
  rebuild(): void;
  /** drawing goes on and the note fades out */
  restored(): void;
  /** the first picture has not been drawn yet: not recoverable here, the splash says so */
  early?: () => boolean;
  onEarly?: () => void;
}
export interface Timers { set(fn: () => void, ms: number): unknown; clear(id: unknown): void }
const real: Timers = { set: (fn, ms) => clock.after(fn, ms), clear: (id) => clock.cancel(id as number) };

/** Watches one canvas; returns the function that stops watching. */
export function watchContext(el: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, h: LossHooks, timers: Timers = real): () => void {
  let isLost = false, timer: unknown = null;
  const onLost = (e: Event) => {
    if (h.early?.()) { h.onEarly?.(); return; }
    e.preventDefault();
    if (isLost) return;
    isLost = true;
    h.lost();
    timer = timers.set(() => { timer = null; if (isLost) h.stuck(); }, RESTORE_WAIT_MS);
  };
  const onRestored = () => {
    if (!isLost) return;
    isLost = false;
    if (timer !== null) { timers.clear(timer); timer = null; }
    h.rebuild();
    h.restored();
  };
  el.addEventListener('webglcontextlost', onLost);
  el.addEventListener('webglcontextrestored', onRestored);
  return () => { el.removeEventListener('webglcontextlost', onLost); el.removeEventListener('webglcontextrestored', onRestored); if (timer !== null) timers.clear(timer); };
}

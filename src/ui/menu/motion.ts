// How the menu moves what a finger or a let-go moves: always one number, written as `transform` or `opacity` by a clock system in the frame (never raw requestAnimationFrame, never
// the element's own timers). 2D drives the same moves with a held animation and Web Animations (num-move.js, menu.js swipeTabs, page-push.js); here the one clock does, so a frame is
// asked for only while something moves and the figure's own frames carry it.
import { clock } from '../../clock/frame.ts';
import { reduced } from '../a11y/motion.ts';

/** A number a finger holds: `set` it as the finger moves, and the clock's tween phase writes it (once per frame, and only when it changed). */
export function follow(apply: (v: number) => void, tag = 'menu-drag') {
  let v = NaN, w = NaN;
  const off = clock.on('tween', () => { if (v !== w) { w = v; apply(v); } }, -5);
  return {
    set(x: number) { v = x; clock.invalidate(tag); },
    /** Write the held number now (a let-go takes over in the same task, so no frame shows anything else). */
    flush() { if (v !== w && Number.isFinite(v)) { w = v; apply(v); } },
    stop() { off(); },
  };
}

export interface Glide { stop(): void }
/**
 * `apply(k)` for k = curve(u), u running 0..1 over `ms`, one call per clock frame, and `done()` after the last. Reduce Motion: it lands at once (a swipe or a page is a move, not a fade).
 * The frame loop is held for exactly as long as the glide runs (?perf names it).
 */
export function glide(o: { ms: number; curve: (u: number) => number; apply(k: number): void; done?(): void; tag?: string }): Glide {
  if (reduced() || !(o.ms > 0)) { o.apply(1); o.done?.(); return { stop() {} }; }
  const h = clock.hold(o.tag ?? 'menu-glide'), t0 = clock.now();
  let live = true;
  const off = clock.on('tween', (f) => {
    if (!live) return;
    const u = Math.min(1, (f.time - t0) / o.ms);
    o.apply(u >= 1 ? 1 : o.curve(u));
    if (u >= 1) { stop(); o.done?.(); }
  }, -4);
  function stop() { if (!live) return; live = false; off(); h.release(); }
  return { stop };
}

// Eased values on the one clock. A Tweened value holds a number; to() glides it to a new target from wherever it is now (a move that
// is interrupted retargets without a jump). While any value moves, the clock is held awake; when all have landed it is released.
import { clock, type Clock, type Hold } from './frame.ts';
import { EASE_ARRIVE } from '../ui/motion.ts';

export type Ease = (t: number) => number;

/** cubic-bezier(x1,y1,x2,y2) as a function of 0..1 (Newton on x, bisection when it stalls). Make it once, keep it. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t: number) => ((ax * t + bx) * t + cx) * t, Y = (t: number) => ((ay * t + by) * t + cy) * t;
  const dX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = X(t) - x;
      if (Math.abs(err) < 1e-6) return Y(t);
      const d = dX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 24; i++) { const v = X(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}

/** Motion scale (docs/look-and-feel.md section 7): one curve family, one set of times. */
export const MOTION = {
  /** camera shot to shot */ shotMs: 950,
  /** card enters */ cardInMs: 280,
  /** wallet swap */ walletMs: 280,
  /** tags fade back in after the camera lands */ tagBackMs: 180,
  /** number roll */ rollMs: 400,
} as const;
export const easeInOutCubic: Ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** 2D's --ease-arrive (tokens.css, ease.js EASE_ARRIVE), the one curve for what comes in: the CSS string and the function are the same curve. */
export const ARRIVE_CSS = EASE_ARRIVE;
export const easeArrive: Ease = cubicBezier(0.2, 0.8, 0.2, 1);
export const linear: Ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

interface Move { from: number; to: number; t0: number; ms: number; ease: Ease; done?: () => void }

/** A number that glides. Read `.value` anywhere (in a clock system, never from React render). */
export class Tweened {
  value: number;
  private move: Move | null = null;
  private hold: Hold | null = null;
  private off: (() => void) | null = null;
  private tag: string;
  private c: Clock;
  constructor(initial = 0, tag = 'tween', c: Clock = clock) { this.value = initial; this.tag = tag; this.c = c; }
  get target() { return this.move ? this.move.to : this.value; }
  get moving() { return this.move !== null; }
  /** Glide to `to` over `ms`. ms 0 jumps. `onDone` runs on landing (not when interrupted by another to()). */
  to(to: number, opts: { ms?: number; ease?: Ease; done?: () => void } = {}) {
    const { ms = MOTION.cardInMs, ease = easeInOutCubic, done } = opts;
    if (!(ms > 0) || to === this.value) {
      this.value = to; this.move = null; this.stop(); this.c.invalidate(this.tag); done?.();
      return this;
    }
    this.move = { from: this.value, to, t0: this.c.now(), ms, ease, done };
    if (!this.hold) {
      this.hold = this.c.hold(this.tag);
      this.off = this.c.on('tween', (f) => this.step(f.time), -10);
    }
    return this;
  }
  private step(now: number) {
    const m = this.move;
    if (!m) { this.stop(); return; }
    const k = Math.min(1, (now - m.t0) / m.ms);
    this.value = k >= 1 ? m.to : m.from + (m.to - m.from) * m.ease(k);
    if (k >= 1) { this.move = null; this.stop(); m.done?.(); }
  }
  private stop() { this.off?.(); this.off = null; this.hold?.release(); this.hold = null; }
  dispose() { this.move = null; this.stop(); }
}

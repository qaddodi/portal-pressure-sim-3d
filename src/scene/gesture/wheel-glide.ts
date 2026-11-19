// A mouse-wheel notch's zoom, glided (the 2D app's wheel-glide.js, same numbers). One notch runs over WHEEL_GLIDE_MS on the camera's own curve; a notch that comes while the
// last is still moving starts from where the zoom is and at the speed it has, so a run of notches reads as one continuous zoom. A trackpad stays direct.
import { CARRY_MAX, carried, easeMove } from './ease.ts';

export const WHEEL_GLIDE_MS = 100;

export interface WheelLike { deltaMode: number; deltaX: number; deltaY: number; wheelDeltaY?: number | null }

/** Whether a wheel event is a trackpad's scroll (many small deltas, a sideways delta, or none of the legacy wheelDeltaY a notch has). */
export function isPadWheel(ev: WheelLike): boolean {
  return ev.deltaMode === 0 && (ev.deltaX !== 0 || ev.wheelDeltaY == null || Math.abs(Math.abs(ev.wheelDeltaY) - Math.abs(ev.deltaY) * 3) < 1);
}

const easeSlope = (t: number): number => (t <= 0 || t >= 1 ? 0 : 30 * t * t * (1 - t) * (1 - t));

export interface WheelGlideOptions {
  ask(cb: (now: number) => void): number;
  cancel(id: number): void;
  /** Called each frame with what the zoom grows by (log of the factor) about the pointer (px, py). */
  apply(dlog: number, px: number, py: number): void;
  ms?: number;
}

export function createWheelGlide({ ask, cancel, apply, ms = WHEEL_GLIDE_MS }: WheelGlideOptions) {
  let id = 0, from = 0, to = 0, applied = 0, t0 = 0, c0 = 0, px = 0, py = 0;
  const raw = (now: number) => Math.min(1, Math.max(0, (now - t0) / ms));
  const posAt = (now: number) => { const r = raw(now); return from + (to - from) * carried(easeMove(r), r, c0); };
  const velAt = (now: number) => { const r = raw(now); return r >= 1 ? 0 : ((to - from) / ms) * (easeSlope(r) + (c0 > 0 ? Math.min(c0, CARRY_MAX) * (1 - r) * (1 - 3 * r) : 0)); };
  function step(now: number) {
    id = 0;
    const p = posAt(now), d = p - applied;
    applied = p;
    if (d !== 0) apply(d, px, py);
    if (raw(now) < 1) id = ask(step); else { from = to = applied = 0; c0 = 0; }
  }
  return {
    /** One notch: `d` the log of its zoom factor, about the pointer (x, y), at time `now`. */
    push(d: number, x: number, y: number, now: number) {
      if (!(d !== 0) || !Number.isFinite(d)) return;
      const running = id !== 0;
      const cur = running ? posAt(now) : 0, v = running ? velAt(now) : 0;
      if (running) { cancel(id); id = 0; }
      const owed = cur - applied;
      if (owed !== 0) { apply(owed, px, py); applied = cur; }
      const target = (running ? to : 0) + d;
      if (!running) applied = 0;
      from = cur; to = target; t0 = now; px = x; py = y;
      c0 = (to - from) * v > 0 ? (v * ms) / (to - from) : 0;
      id = ask(step);
    },
    /** The zoom still owed (log): where the glide ends less where it has got to. 0 when it is not running. */
    left(): number { return id ? to - applied : 0; },
    get active(): boolean { return id !== 0; },
    /** A hand or a button takes over: the glide stops where it is and owes nothing. */
    cancel() { if (id) cancel(id); id = 0; from = to = applied = 0; c0 = 0; },
  };
}

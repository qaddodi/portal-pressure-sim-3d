// The ONE fade of a lens change, for every view (owner, 26 Nov: the lens fade in the Lobule too, "one shared fade rule for every view"): what is showing eases into the new lens's colours over
// LENS_MS (the 2D app's surface time) on the one clock, by one curve. The vessels' crossfade (lenses/field.ts: the GPU mixes two textures by `mix`), the Lobule's vertex colours
// (micro3d/lobule3d.ts stepInk) and the Sinusoid's lumen and red cells (sinusoid/view.ts) all step a LensFade; none keeps a timer or a curve of its own.
// A new patient arriving under a lens fades the same way (field.ts onFrame jump). Reduced motion: the change lands at once.
import { easeInOutCubic } from '../../clock/tween.ts';

/** How long a lens change takes (ms). */
export const LENS_MS = 420;
/** The share of the new lens's colours at `t` (0..1 of LENS_MS): the one curve. */
export const lensMix = (t: number): number => easeInOutCubic(Math.min(1, Math.max(0, t)));
/** Whether the person asked for reduced motion (a lens change then lands at once). */
export const lensMotionReduced = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One view's lens fade: `start` at a change, `step` each frame for the share of the new colours (0 the old, 1 the new). A change during a fade starts again from what shows (the caller
 *  snapshots its colours as `from` before it calls `start`). */
export class LensFade {
  private t0 = -1;
  private k = 1;
  /** A lens change at `now`; `instant` (a slide's jump, reduced motion) lands it at once. */
  start(now: number, instant = lensMotionReduced()): void {
    if (instant) { this.t0 = -1; this.k = 1; } else { this.t0 = now; this.k = 0; }
  }
  /** The share of the new colours now; the fade ends (moving false) on the frame it reaches 1. */
  step(now: number): number {
    if (this.t0 < 0) return this.k;
    const t = (now - this.t0) / LENS_MS;
    this.k = lensMix(t);
    if (t >= 1) { this.t0 = -1; this.k = 1; }
    return this.k;
  }
  /** Whether a fade is running (the view asks for frames while it does). */
  get moving(): boolean { return this.t0 >= 0; }
  /** The share of the new colours as last stepped. */
  get mix(): number { return this.k; }
}

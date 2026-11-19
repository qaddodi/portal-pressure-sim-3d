// The slow eases of the 2D figure's organs (stage-diaphragm.js easeLiver / updateOrgans, stage-tubes.js, lesion-ease.js), on the one clock:
// the liver's shape, congestion and tint (an exponential, 0.4 s), the ascites (a critically damped spring on volume^0.6), the spleen (as the model's own size),
// a held step (a value that wavers inside a band never moves), and a clot's or narrowing's thickness (a moment, LESION_TAU). Frame-rate free: each step takes dt in seconds.
import { easeTo, fluidSpring, LIVER_TAU } from './copied/organ-ease.js';
import { fluidTarget } from './copied/fluid-step.js';
import type { BodyTargets } from './targets.ts';

export { easeTo, fluidSpring, LIVER_TAU, fluidTarget };

/** stage-diaphragm.js stepHeld: a value follows its target only on a clear move; an end (0 or 1) is reached at once and left only on a clear move. */
export const stepHeld = (prev: number | null, v: number, tol: number): number =>
  prev === null || Math.abs(v - prev) > ((prev === 0 || prev === 1) ? 2 * tol : tol) || (v === 0 && prev !== 0) || (v === 1 && prev !== 1) ? v : prev;

/** Lesions (clots, narrowings) follow their parameter in LESION_TAU = D_SMALL / 2400 = 0.1 s; within LESION_SNAP of it they land (lesion-ease.js). */
export const LESION_TAU = 240 / 2400;
export const LESION_SNAP = 0.004;
export function lesionStep(cur: number, goal: number, dt: number): number {
  if (cur === goal) return goal;
  const v = cur + (goal - cur) * (1 - Math.exp(-Math.max(0, dt) / LESION_TAU));
  return Math.abs(goal - v) < LESION_SNAP ? goal : v;
}

export interface LiverShown { cirrhosis: number; congestion: number; tint: number; scale: number }

/** The congestion's breath-free pressure (stage-diaphragm.js: low-passed over BREATH_TAU, a change past G_JUMP taken whole) and the held steps. */
const BREATH_TAU = 3000, G_JUMP = 0.12;

/** The liver's ease. `follow(t, dtSec, instant)` returns true while it is still moving. */
export class LiverFollow {
  private gLow: number | null = null;
  private gHeld: number | null = null;
  private tHeld: number | null = null;
  readonly shown: LiverShown = { cirrhosis: 0, congestion: 0, tint: 0, scale: 1 };
  private started = false;
  follow(t: BodyTargets, dt: number, instant: boolean): boolean {
    const raw = t.congestion;
    if (this.gLow === null || Math.abs(raw - this.gLow) > G_JUMP || instant) this.gLow = raw;
    else this.gLow += (raw - this.gLow) * -Math.expm1(-dt * 1000 / BREATH_TAU);
    this.gHeld = stepHeld(this.gHeld, this.gLow, 0.03);
    this.tHeld = stepHeld(this.tHeld, t.tint * 2, 0.1);   // (the 2D holds the unhalved 0..1 and halves it)
    const cT = t.cirrhosis, gT = this.gHeld, tT = (this.tHeld ?? 0) * 0.5;
    const s = this.shown;
    if (!this.started || instant) { s.cirrhosis = cT; s.congestion = gT; s.tint = tT; this.started = true; }
    else { s.cirrhosis = easeTo(s.cirrhosis, cT, dt); s.congestion = easeTo(s.congestion, gT, dt); s.tint = easeTo(s.tint, tT, dt); }
    return s.cirrhosis !== cT || s.congestion !== gT || s.tint !== tT;
  }
}

/** The ascites' shown volume: a spring to the model's volume, which the drawing takes in steps of 0.1 mL (fluid-step.js). */
export class FluidFollow {
  shown = 0;
  private vel = 0;
  private target: number | null = null;
  follow(volume: number, dt: number, instant: boolean): boolean {
    const target: number = fluidTarget(this.target, volume);
    this.target = target;
    if (instant) { this.shown = target; this.vel = 0; return false; }
    if (this.shown !== target) { const r = fluidSpring(this.shown, this.vel, target, Math.min(dt, 0.05)); this.shown = r.shown; this.vel = r.vel; }
    return this.shown !== target;
  }
}

/** A value that eases exponentially (the spleen's size between model frames, a varix's size, the bleed's fade). */
export class Eased {
  value: number;
  private tau: number;
  private snap: number;
  constructor(value: number, tau: number, snap = 0.002) { this.value = value; this.tau = tau; this.snap = snap; }
  to(goal: number, dt: number, instant = false): boolean {
    if (instant) { this.value = goal; return false; }
    const v = this.value + (goal - this.value) * -Math.expm1(-dt / this.tau);
    this.value = Math.abs(goal - v) < this.snap ? goal : v;
    return this.value !== goal;
  }
}

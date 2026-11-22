// ONE easing primitive (R7). Every eased value in the app is an `Ease`: it holds the clock awake itself while it is not at its goal (so no system returns "I am still
// moving" for it and no one has to remember to OR a flag into the frame's "needs another frame"), steps in the clock's tween phase, is listed by tag in `?perf` and the audit
// (`clock.stats().eases`), and can be jumped only by `snap()`, so every deliberate jump is greppable. All three modes are frame-rate independent (they read the clock's page time).
//
//   timed   { ms, curve }   from where it stands to the goal in `ms` on a curve (a card's move, a shot's blend); an interrupted move retargets from where it is
//   rate    { perMs }       a straight line at a fixed speed in units per ms (a 0..1 fade in 180 ms is perMs = 1 / 180): never faster, never overshoots
//   follow  { tauMs }       exponential approach with time constant tauMs (a size that follows a number that changes every model frame)
import { clock, type Clock, type Hold } from './frame.ts';
import { easeInOutCubic, MOTION, type Ease as Curve } from './tween.ts';

export type EaseSpec =
  | { ms: number; curve?: Curve; done?: () => void; /** the page time the move starts at (default: now): for an owner that is stepped by hand with its own `now` */ at?: number }
  | { perMs: number }
  | { tauMs: number; within?: number };

/** A step longer than this (a tab that was hidden, a long stall) is taken as this long, so a rate or follow ease never leaps over its own motion. */
const MAX_STEP_MS = 100;

/** Every live Ease, for the audit's generic pop detector: a value that moved more than half its range in one frame (`popped()`). */
const live = new Set<EaseBase>();
interface EaseBase { readonly tag: string; readonly value: number; readonly moving: boolean; lastStep: number; span: number }

export class Ease implements EaseBase {
  value: number;
  readonly tag: string;
  /** the largest change of `value` in one step since the last `takePops()` (the audit reads and clears it), and the distance the current move set out to cover */
  lastStep = 0;
  span = 0;
  private goal: number;
  private spec: EaseSpec | null = null;
  private from = 0;
  private t0 = 0;
  private tLast = 0;
  private hold: Hold | null = null;
  private off: (() => void) | null = null;
  private readonly c: Clock;
  private readonly onChange?: (value: number) => void;
  /** `onChange` runs whenever the value changes (in the clock's tween phase for a step, at once for a snap): the place to push the value to a uniform or an object. */
  constructor(initial: number, tag: string, onChange?: (value: number) => void, c: Clock = clock) {
    this.value = this.goal = initial; this.tag = tag; this.onChange = onChange; this.c = c;
    live.add(this);
  }
  get target(): number { return this.goal; }
  get moving(): boolean { return this.hold !== null; }

  /** Ease to `goal`. Asking for the goal it is already heading to (or already at) does nothing; a different goal retargets from where it stands, a different spec with it. */
  to(goal: number, spec: EaseSpec): this {
    if (goal === this.goal && (this.hold !== null || goal === this.value)) return this;
    this.goal = goal; this.spec = spec; this.span = Math.abs(goal - this.value);
    if (goal === this.value) { this.finish(); return this; }
    if ('ms' in spec) {
      if (!(spec.ms > 0)) { this.jump(goal); spec.done?.(); return this; }
      this.from = this.value; this.t0 = spec.at ?? this.c.now();
    }
    this.tLast = this.c.now();   // (the first step counts from here, not from the frame before: the clock's first frame after waking has dt 0)
    if (!this.hold) {
      this.hold = this.c.hold(this.tag);
      this.off = this.c.on('tween', (f) => this.step(f.time), -10);
    }
    return this;
  }
  /** The only way to jump: the value and the goal are `v` at once (and the pop detector counts it, as it should). `quiet`: the value's STARTING state (a part that has never been shown, a mix that begins at its goal), not a pop: the detector does not count it. */
  snap(v: number, quiet = false): this { this.spec = null; this.finish(); if (v !== this.value) { if (!quiet) this.span = Math.abs(v - this.value); this.jump(v, quiet); } this.goal = v; return this; }

  private jump(v: number, quiet = false): void { const was = this.value; this.value = v; this.goal = v; if (!quiet) this.lastStep = Math.max(this.lastStep, Math.abs(v - was)); this.onChange?.(v); this.c.invalidate(this.tag); }
  private finish(): void { this.off?.(); this.off = null; this.hold?.release(); this.hold = null; }

  /** One step to page time `now`. The clock calls it every frame while the ease moves; an owner that is driven by hand (a node test turning the scene's `update(now)`) may call it too: stepping twice to the same `now` changes nothing. */
  step(now: number): void {
    const s = this.spec, was = this.value;
    if (!this.hold) return;
    if (!s) { this.finish(); return; }
    const dt = Math.min(Math.max(0, now - this.tLast), MAX_STEP_MS);
    this.tLast = now;
    let v: number, landed = false;
    if ('ms' in s) {
      const k = Math.min(1, (now - this.t0) / s.ms);
      v = k >= 1 ? this.goal : this.from + (this.goal - this.from) * (s.curve ?? easeInOutCubic)(k); landed = k >= 1;
    } else if ('perMs' in s) {
      const d = this.goal - this.value, k = dt * s.perMs;
      v = Math.abs(d) <= k ? this.goal : this.value + Math.sign(d) * k; landed = v === this.goal;
    } else {
      const next = this.value + (this.goal - this.value) * -Math.expm1(-dt / s.tauMs);
      v = Math.abs(this.goal - next) < (s.within ?? 0.002) ? this.goal : next; landed = v === this.goal;
    }
    this.value = v;
    if (v !== was) { this.lastStep = Math.max(this.lastStep, Math.abs(v - was)); this.onChange?.(v); }
    if (landed) { this.finish(); (s as { done?: () => void }).done?.(); }
  }
  dispose(): void { this.finish(); live.delete(this); }
}

/** The eases that moved more than half the distance they set out to cover in one step since the last call, then cleared: a pop that nothing in the DOM shows (the audit's generic detector for the canvas). */
export function takePops(): { tag: string; step: number; span: number }[] {
  const out: { tag: string; step: number; span: number }[] = [];
  for (const e of live) { if (e.span > 0 && e.lastStep > 0.5 * e.span) out.push({ tag: e.tag, step: e.lastStep, span: e.span }); e.lastStep = 0; }
  return out;
}
/** The tags of the eases that are not at their goal now (for ?perf). */
export const movingEases = (): string[] => [...live].filter((e) => e.moving).map((e) => e.tag);

/** The scene's usual fade: a 0..1 value that takes `ms` end to end, at a straight rate. */
export const fadeRate = (ms: number): EaseSpec => ({ perMs: 1 / ms });
export { MOTION };

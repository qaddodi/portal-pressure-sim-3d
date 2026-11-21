// The HVPG catheter's tracing as a slide's data card (2D tool-hvpg.js + the monitor of hvpg-proc.js createHvpgMonitor): the one pressure monitor with three readings under it, FHVP, WHVP and HVPG, one for each
// Next. Stepped onto going forward it shows the free pressure and waits; each Next takes the next reading (the balloon up and the pressure riding it to the wedge, then the HVPG); Back takes them back. Jumped
// to, or gone back to, it shows the finished tracing at once. With `catheter: true` on a slide whose catheter is on the figure (cath: 'free' | 'wedge' | 'result') the card plays nothing of its own: it shows the
// step the catheter is at, the figure's balloon sets the pressure's rise (balloon), and the slide's readings are the ones the catheter's callouts print. The model changing on the slide eases the levels.
// One card at a time (a slide shows one instrument), so the controller is a module: the deck's Next/Back, the figure's catheter (reach, balloon, watch) and the pane (HvpgCard.tsx) all talk to it.
import { create } from 'zustand';
import { clock } from '../../../clock/frame.ts';
import { latest } from '../../../engine/index.ts';
import { newWave, syncWave, T, timeOfBalloon } from '../copied/hvpg-clock.copied.js';
import { reduceMotionMQ } from '../copied/motion.copied.js';
import { follow2, SHOWN_TAU } from '../fibro/copied/display-state.copied.js';
import { tenthGap } from '../../../engine/hales/core/gap.js';
import { SPAN, ORDER, STEPS as CATH_STEPS, KEYS, levelsOf as levelsOfJs } from './copied/hvpg-card.copied.js';
import { drawTrace } from '../ir/copied/hvpg-script.copied.js';
import { hvpgFrame } from '../ir/hvpg.ts';
import type { MonSource } from '../ir/Monitor.tsx';

export type Step = 'free' | 'wedge' | 'result';
export interface Levels { fhvp: number; whvp: number; hvpg: number }
type Fp = Record<string, unknown> | null | undefined;
type Span = Record<Step, [number, number]>;
const SPANS = SPAN as unknown as Span, ORD = ORDER as Step[];
export const CATH = CATH_STEPS as Step[];
export const levelsOf = levelsOfJs as (m: Fp) => Levels | null;
const REDUCED = (): boolean => !!reduceMotionMQ?.matches;

/** The card's own version: the pane re-renders (and the monitor redraws) only when this moves, never per frame. */
export const useHvpgCard = create<{ n: number; at: number; hidden: boolean; reading: '' | 'pending' }>(() => ({ n: 0, at: 2, hidden: false, reading: '' }));
const bump = () => useHvpgCard.setState((s) => ({ n: s.n + 1 }));

// ── the monitor (createHvpgMonitor): the tracing's own clock, and the balloon that sets the pressure's rise ──
class Tracing implements MonSource {
  id = 'slide-hvpg';
  private key = {};
  private wave = newWave();
  mode: Step | null = null;
  t = 0; private t1 = 0; private last = 0;
  fp: Levels | null = null;
  bal = 0;
  waiting = false;
  running = false;
  private hold: { release(): void } | null = null;
  private off: (() => void) | null = null;
  private st = { ph: 'idle', t: 0, v: null as Levels | null, blocked: false, running: true, wave: this.wave as unknown };
  private liveV: Levels = { fhvp: 0, whvp: 0, hvpg: 0 };
  label = () => 'Catheter pressure tracing, as on the monitor in the procedure room';
  /** The slide's own readings (the catheter's callouts and the tiles show the same), else the live model's. */
  private live(): Levels {
    const m = (this.fp ?? latest.frame?.metrics ?? {}) as Record<string, number>, v = this.liveV;
    v.fhvp = m.fhvp ?? 0; v.whvp = m.whvp ?? 0; v.hvpg = m.hvpg ?? 0;
    return v;
  }
  active = (): boolean => this.running;
  private phase = (): string => (this.t < T.inflate ? 'free' : this.t < T.result ? 'wedge' : 'result');
  // the balloon is the clock for the pressure's rise: the trace climbs exactly as far as the balloon is filled
  private rising = (): boolean => this.mode !== 'free' && this.bal < 1 && this.t <= T.wedge;
  private falling = (): boolean => this.mode === 'free' && this.bal > 0;
  frame(w: number, h: number, sweeping: boolean) {
    if (sweeping) this.advance(clock.now());
    const st = this.st;
    st.ph = this.waiting && !this.mode ? 'idle' : this.phase(); st.t = this.t; st.v = this.live();
    if (sweeping || !this.wave.on) syncWave(this.wave, latest.frame, this.t, clock.now());
    return hvpgFrame(this.key, st, w, h, this.label());
  }
  private advance(now: number): void {
    const dt = Math.max(0, Math.min(64, now - this.last)); this.last = now;
    if (this.falling()) { if (this.bal < 1) this.t = Math.min(this.t, timeOfBalloon(this.bal) as number); }
    else if (this.mode === 'free' && this.t >= T.inflate) this.t = SPANS.free[0];
    else if (this.rising()) this.t = this.bal > 0 ? (timeOfBalloon(this.bal) as number) : Math.min(this.t + dt, T.inflate);
    else this.t = Math.min(this.t1, this.t + dt);
    this.running = this.t < this.t1 || this.falling() || this.rising();
    if (!this.running) this.release();
  }
  private wake(): void {
    this.running = true;
    if (!this.hold) this.hold = clock.hold('hvpg-card');
    this.last = clock.now();
    clock.invalidate('hvpg-card');
    bump();
  }
  private release(): void { this.hold?.release(); this.hold = null; this.off?.(); this.off = null; bump(); }
  /** The tracing is at `m` (instant: finished at once, a slide jumped to or gone back to, or reduced motion). */
  set(m: Step, f: Levels | null = null, b = this.bal, instant = false): void {
    const span = SPANS[m];
    this.fp = f; this.bal = b; this.waiting = false;
    if (!span || (m === this.mode && (this.running || this.t >= this.t1))) { bump(); return; }
    const fwd = !!this.mode && ORD.indexOf(m) > ORD.indexOf(this.mode);
    if (!(m === 'free' && this.bal > 0) && !(fwd && this.t >= SPANS[this.mode!][0] && this.t <= span[0])) this.t = span[0];
    if (m !== 'free' && this.bal >= 1) this.t = Math.max(this.t, T.wedge);
    if (fwd && m === 'result') this.t = Math.max(this.t, span[0]);
    this.mode = m; this.t1 = span[1];
    if ((instant || REDUCED()) && !this.falling()) this.t = this.t1;
    this.wake();
  }
  /** The catheter's balloon (0..1), every frame: the one value the pressure follows. */
  balloon(b: number): void {
    if (b === this.bal) return;
    this.bal = b;
    if (this.mode) this.wake();
  }
  /** The catheter has not reached the hepatic vein: the monitor stands empty (a trace already begun is left alone). */
  holdEmpty(): boolean { if (this.mode) return false; this.waiting = true; bump(); return true; }
  started = (): boolean => !!this.mode;
  reset(): void { this.mode = null; this.t = 0; this.t1 = 0; this.bal = 0; this.waiting = false; this.running = false; this.fp = null; this.key = {}; this.release(); }
}

// ── the card (createHvpgCard): the readings, one for each Next ──
const KEY2 = KEYS as ('fhvp' | 'whvp')[];
export const tracing = new Tracing();
let target: Levels | null = null, cur: Levels | null = null, curW = { fhvp: 0, whvp: 0 }, curWOn = false, pending: 'steps' | 'result' | null = 'result';
let step: Step | null = null, shown = false, kept: Fp = null, reached = false, wedged = false;
let at = 2, stepped = false, bal = 0, token = 0;
let watcher: ((b: number) => void) | null = null;
let followHold: { release(): void } | null = null, followOff: (() => void) | null = null;
let lastF = 0;

const tell = (b: number): void => { bal = b; watcher?.(b); };
function paintReading(): void {
  const pend = step ? !(step === 'result' && reached && wedged) : pending === 'steps' || (!!cur && !doneNow());
  const v = pend ? 'pending' : '';
  if (useHvpgCard.getState().reading !== v) useHvpgCard.setState({ reading: v });
}
let done = false;
const doneNow = (): boolean => done;
function paintSteps(): void { paintReading(); useHvpgCard.setState({ at, hidden: !!step }); bump(); }

/** The levels ease to the target on the shown state's filter (display-state.js follow2): the bar's and the figure's one clock. */
function tween(): void {
  if (!cur || !target) { stopFollow(); return; }
  const now = clock.now(), dt = Math.min(0.1, Math.max(0, (now - lastF) / 1000)); lastF = now;
  let moving = false;
  if (!curWOn) { curW = { fhvp: cur.fhvp, whvp: cur.whvp }; curWOn = true; }
  for (const key of KEY2) {
    if (REDUCED()) { cur[key] = curW[key] = target[key]; continue; }
    const r = follow2(cur[key], curW[key], target[key], dt, SHOWN_TAU, 0.02) as { v: number; w: number };
    cur[key] = r.v; curW[key] = r.w;
    if (r.v !== target[key] || r.w !== target[key]) moving = true;
  }
  cur.hvpg = tenthGap(cur.whvp, cur.fhvp, target.hvpg) as number;
  tracing.fp = cur;
  if (done) tracing.set('result', cur, 1);
  bump();
  if (!moving) stopFollow();
}
function follow(): void {
  if (followOff || !cur || !target) return;
  lastF = clock.now();
  followHold = clock.hold('hvpg-card-levels');
  followOff = clock.on('tween', tween);
}
function stopFollow(): void { followOff?.(); followOff = null; followHold?.release(); followHold = null; }

/** The balloon from a to b on the procedure's clock, the trace riding it and the figure's balloon told each frame. */
function ride(my: number, a: number, b: number): void {
  const t0 = clock.now(), len = T.wedge - T.inflate;
  const off = clock.on('tween', () => {
    if (my !== token || !shown) { off(); h.release(); return; }
    const k = REDUCED() ? 1 : Math.min(1, Math.max(0, (clock.now() - t0) / len)), e = k * k * (3 - 2 * k), v = a + (b - a) * e;
    tracing.balloon(v); tell(v);
    if (k >= 1) { off(); h.release(); }
  });
  const h = clock.hold('hvpg-card-ride');
}
function start(how: 'steps' | 'result'): void {
  token++;
  cur = { ...target! }; curWOn = false; tracing.fp = cur;
  stepped = how === 'steps';
  if (stepped) { done = false; at = 0; tell(0); tracing.set('free', cur, 0); }
  else { done = true; at = 2; tracing.set('result', cur, 1, true); tell(1); }
  paintSteps();
}

export function canStep(dir: 1 | -1): boolean {
  if (step || !shown || !cur || !target) return false;
  return dir > 0 ? at < 2 : stepped && at > 0;
}
/** Next (dir 1) or Back (-1) on the slide: the next reading or the last one taken back (true), or nothing left to step (false: the slide moves on). */
export function stepBy(dir: 1 | -1): boolean {
  if (!canStep(dir)) return false;
  if (dir > 0) {
    if (at === 0) { at = 1; tracing.set('wedge', cur, 0); ride(++token, 0, 1); } else { at = 2; token++; done = true; tracing.set('result', cur, 1); tell(1); }
  } else if (at === 2) { at = 1; token++; done = false; tracing.set('wedge', cur, 1, true); tell(1); }
  else { at = 0; tracing.set('free', cur, 1); ride(++token, 1, 0); }
  paintSteps();
  return true;
}

export const hvpgCard = {
  /** The slide's options: with catheter: true, the step of the slide's catheter (cath) is the one the card shows. */
  configure(t: { catheter?: boolean } | null | undefined, cath: unknown): void {
    step = t?.catheter && CATH.includes(cath as Step) ? (cath as Step) : null; shown = true;
    paintSteps();
  },
  /** The slide is shown: forward onto it from the slide before (and the card was not already this one's), the tracing starts at the free pressure and each Next takes a reading; otherwise it is finished. */
  arrive({ forward = false, again = false } = {}): void { pending = forward && !again ? 'steps' : 'result'; if (!step) bal = pending === 'steps' ? 0 : 1; paintReading(); },
  /** The slide's settled readings (the tiles' numbers, eased as the model changes): the levels take them. */
  pin(fp: Fp): void {
    const lv = levelsOf(fp);
    if (!lv) return;
    if (step) { kept = fp; if (shown) { if (reached || tracing.started()) tracing.set(step, lv); else tracing.holdEmpty(); } return; }
    target = lv;
    if (pending) { const how = pending; pending = null; start(how); return; }
    follow();
  },
  /** The card has left the screen (another slide's instrument, or none): it draws nothing more. */
  park(): void { shown = false; watcher = null; token++; wedged = false; stopFollow(); },
  step: stepBy, canStep,
  /** Tell fn the tracing's balloon each time it moves (the catheter on the figure beside this card); null stops. Returns the balloon now. */
  watch(fn: ((b: number) => void) | null): number { watcher = typeof fn === 'function' ? fn : null; return bal; },
  /** The catheter on the figure is parked in the hepatic vein (true) or on its way / gone (false): the tracing starts only then (a trace already begun carries on). */
  reach(b: boolean): void {
    if (b === reached) return;
    reached = b;
    if (step && shown && b && kept && !tracing.started()) tracing.set(step, levelsOf(kept));
    paintReading();
  },
  /** The catheter's balloon (0 down … 1 wedged), every frame the figure moves it: the trace rides it. */
  balloon(b: number): void { if (!step || !shown) return; tracing.balloon(b); const up = b >= 0.999; if (up !== wedged) { wedged = up; paintReading(); } },
  /** A new presentation or patient: the card starts afresh. */
  reset(): void { token++; stopFollow(); tracing.reset(); target = cur = null; curWOn = false; pending = 'result'; step = null; shown = false; kept = null; reached = false; wedged = false; at = 2; stepped = false; bal = 0; done = false; watcher = null; paintSteps(); },
  /** Which steps are done now (for the strip): 0 FHVP, 1 WHVP, 2 HVPG. */
  at: (): number => at,
};
export { drawTrace };

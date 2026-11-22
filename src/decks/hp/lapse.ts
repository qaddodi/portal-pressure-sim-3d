// A time-lapse slide (2D `lapse`: days played on the live figure, "Day 12 of 60", or "from → to"): the live model runs the slide's days on the engine's disease clock
// ('lapse', eased ramp and all) from the slide before's state, the counter under the words follows, and when the days are done the figure eases to the slide's computed end.
// The clock is the engine's own; here only the counter and the hand-over. Leaving the slide stops it. Next runs what is left of the days in 600 ms (ui/deck/lapse-next.ts) and the
// camera's slow push (lapse-push.ts) rides with them.
import { create } from 'zustand';
import { engine } from '../../engine/boot.ts';
import { daysAt, setLapseSkip, skipPace, skipSpeed, SKIP_MS, type Pace } from '../../ui/deck/lapse-next.ts';
import type { CopiedSlide } from './types.ts';

import { clock, type TimerId } from '../../clock/frame.ts';
/** The counter's state: which slide it belongs to, the days played, the days in all, and whether the days are done. */
export const useLapse = create<{ key: string; d: number; n: number; done: boolean }>(() => ({ key: '', d: 0, n: 0, done: false }));

const words = (n: number) => (n >= 60 && n % 30 === 0 ? `${n / 30} months` : `${n} days`);
/** The counter's words (2D lapseText). */
export function lapseText(s: { lapse?: { from?: string; to?: string } | null }, d: number, n: number, done: boolean): string {
  const l = s.lapse;
  return l?.to ? (done ? l.to : `${l.from} → ${l.to}`) : done ? `${words(n)} later` : `Day ${Math.round(d)} of ${n}`;
}

/** Whether a slide plays its days on the live figure from the slide before's state: a time-lapse of days with no patient of its own to load first. */
export const playsLapse = (s: CopiedSlide | undefined, i: number): s is CopiedSlide => !!s && !!s.lapse && typeof s.days === 'number' && s.days > 0 && !s.preset && i > 0;

const SETTLE_MS = 650, TICK_MS = 150, FAST_TICK_MS = 50, LAND_MS = 600, TAIL_MS = 150;
/** The camera's slow push for a lapse (lapse-push.ts `pushFor`; handed in, so this file never reaches the scene): begin it to end at `endAt`, bring it to its end in `ms`, drop one not begun. */
export interface Push { start(endAt: number): void; end(ms?: number): void; cancel(): void }

/** The lapse under way: its slide's days, where the counter's line in time is, and what it hands over to. */
interface Run { days: number; secs: number; ramp: unknown; bedside: boolean; end: unknown; push: Push | null; landed: () => void; phase: 'settle' | 'days' | 'fast' | 'landing'; pace: Pace | null; endAt: number }
let run: Run | null = null;
let timers: TimerId[] = [];
let ticker: TimerId | null = null;
let playing = false;
const send = (m: unknown) => { try { engine().send(m as never); } catch { /* the engine is not up yet */ } };
const after = (ms: number, fn: () => void) => { timers.push(clock.after(fn, ms)); };
const clearTimers = () => { for (const t of timers) clock.cancel(t); timers = []; };

export function stopLapse(): void {
  clearTimers();
  run?.push?.cancel();
  if (ticker) { clock.cancel(ticker); ticker = null; }
  run = null;
  setLapseSkip(null);
  if (playing) { playing = false; send({ type: 'lapse', days: 0 }); }
}

/** The counter follows the pace (the days' line in time), so Next's fast run carries on from the day it was at and never jumps. */
const tick = (r: Run, every: number) => {
  if (ticker) clock.cancel(ticker);
  ticker = clock.every(() => { if (r.pace) useLapse.setState({ d: daysAt(r.pace, clock.now()) }); }, every);
};

/** The days end: the counter and the figure ease to the slide's own end state, and the slide is told. */
function land(r: Run): void {
  if (ticker) { clock.cancel(ticker); ticker = null; }
  r.phase = 'landing';
  setLapseSkip(null);
  playing = false; send({ type: 'lapse', days: 0 });
  useLapse.setState({ d: r.days, done: true });
  send({ type: 'morph', snap: r.end, ms: LAND_MS });
  run = null;
  r.landed();
}

/** The days begin on the engine: at the slide's own pace, or (`fast`, a Next before they began) in the time Next gives them. */
function begin(r: Run, fast: boolean): void {
  const ms = fast ? SKIP_MS : r.secs * 1000, now = clock.now();
  r.phase = fast ? 'fast' : 'days';
  playing = true;
  send({ type: 'lapse', days: r.days, speed: r.days / (ms / 1000), ramp: r.ramp ?? null, bedside: r.bedside });
  r.pace = { t0: now, d0: 0, rate: r.days / ms, days: r.days };
  r.endAt = now + ms;
  tick(r, fast ? FAST_TICK_MS : TICK_MS);
  if (r.push) { if (fast) r.push.end(SKIP_MS); else r.push.start(r.endAt); }
  after(ms + TAIL_MS, () => land(r));
}

/**
 * Next while days run (2D skipLapse): what is left of them runs in SKIP_MS (the clock speeds up, the ramp is unchanged) and stops on the end; the counter, the camera's push and the
 * figure's own landing carry on from where they are. True the first time; false once it has been done (the next Next moves on) or when no days run.
 */
function skip(): boolean {
  const r = run;
  // (a Next while the days are only being set up does not run them out: it moves on, so a quick Next-Next never stops on a lapse slide, 2D V-SLIDE-5)
  if (!r || r.phase === 'settle' || r.phase === 'fast' || r.phase === 'landing') return false;
  const now = clock.now();
  clearTimers();
  if (!r.pace) { begin(r, true); return true; }
  const d = daysAt(r.pace, now), left = Math.max(0, r.days - d);
  r.phase = 'fast';
  if (r.bedside) send({ type: 'lapseFast', ms: SKIP_MS }); else send({ type: 'run', speed: skipSpeed(left) });
  r.pace = skipPace(r.days, d, now);
  r.endAt = now + SKIP_MS;
  tick(r, FAST_TICK_MS);
  r.push?.end(SKIP_MS);
  after(SKIP_MS + TAIL_MS, () => land(r));
  return true;
}

/**
 * Plays a slide's days: ease the figure to the start (the slide before's state), run the days, then ease to the end (`end`, the slide's own state) and call `landed`. `push`: the camera's slow
 * push while they run (lapse-push.ts), or null. Next runs the days out (lapse-next.ts); a position change stops them (`stopLapse`).
 */
export function playLapse(key: string, s: CopiedSlide, start: unknown, end: unknown, landed: () => void, reduce = false, push: Push | null = null, settled = false): void {
  stopLapse();
  const days = s.days as number, secs = Math.max(1, (s.lapse as { seconds?: number }).seconds ?? 8);
  const bedside = (s.lapse as { clock?: string }).clock === 'seconds';
  useLapse.setState({ key, d: 0, n: days, done: false });
  if (reduce) {   // (Reduce Motion: no days played; the camera still takes its one short move to where they end)
    send({ type: 'morph', snap: end, ms: 0 }); useLapse.setState({ d: days, done: true });
    push?.end(300);
    landed(); return;
  }
  const r: Run = { days, secs, ramp: s.ramp ?? null, bedside, end, push, landed, phase: 'settle', pace: null, endAt: 0 };
  run = r;
  setLapseSkip(skip);   // (the days are set up first: a Next meanwhile moves on, see skip)
  // (`settled`: the figure was eased to the start at the press and the slide has landed since: the days begin at once, no second settle)
  if (start && !settled) send({ type: 'morph', snap: start, ms: SETTLE_MS });
  after(start && !settled ? SETTLE_MS : 0, () => begin(r, false));
}

/** A slide whose days will play once it has landed (2D paintLapse at the press): the counter stands at day 0 and not done, so the tiles and the words show where the days begin. */
export function readyLapse(key: string, s: CopiedSlide): void {
  stopLapse();
  useLapse.setState({ key, d: 0, n: s.days as number, done: false });
}

/** A slide whose days are not played (arrived by Back or a jump back, 2D `back`): the counter reads them done. (The camera's part is lapse-push.ts `showPushEnd`.) */
export function showLapseEnd(key: string, s: CopiedSlide): void {
  stopLapse();
  useLapse.setState({ key, d: s.days as number, n: s.days as number, done: true });
}

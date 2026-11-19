// A time-lapse slide (2D `lapse`: days played on the live figure, "Day 12 of 60", or "from → to"): the live model runs the slide's days on the engine's disease clock
// ('lapse', eased ramp and all) from the slide before's state, the counter under the words follows, and when the days are done the figure eases to the slide's computed end.
// The clock is the engine's own; here only the counter and the hand-over. Leaving the slide stops it.
import { create } from 'zustand';
import { engine } from '../../engine/boot.ts';
import type { CopiedSlide } from './types.ts';

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

const SETTLE_MS = 650, TICK_MS = 150;
let timers: ReturnType<typeof setTimeout>[] = [];
let ticker: ReturnType<typeof setInterval> | null = null;
let playing = false;
const send = (m: unknown) => { try { engine().send(m as never); } catch { /* the engine is not up yet */ } };

export function stopLapse(): void {
  for (const t of timers) clearTimeout(t);
  timers = [];
  if (ticker) { clearInterval(ticker); ticker = null; }
  if (playing) { playing = false; send({ type: 'lapse', days: 0 }); }
}

/** Plays a slide's days: ease the figure to the start (the slide before's state), run the days, then ease to the end (`end`, the slide's own state) and call `landed`. */
export function playLapse(key: string, s: CopiedSlide, start: unknown, end: unknown, landed: () => void, reduce = false): void {
  stopLapse();
  const days = s.days as number, secs = Math.max(1, (s.lapse as { seconds?: number }).seconds ?? 8);
  const bedside = (s.lapse as { clock?: string }).clock === 'seconds';
  useLapse.setState({ key, d: 0, n: days, done: false });
  if (reduce) { send({ type: 'morph', snap: end, ms: 0 }); useLapse.setState({ d: days, done: true }); landed(); return; }
  if (start) send({ type: 'morph', snap: start, ms: SETTLE_MS });
  timers.push(setTimeout(() => {
    playing = true;
    send({ type: 'lapse', days, speed: days / secs, ramp: s.ramp ?? null, bedside });
    const t0 = performance.now();
    ticker = setInterval(() => useLapse.setState({ d: Math.min(days, (days * (performance.now() - t0)) / (secs * 1000)) }), TICK_MS);
  }, start ? SETTLE_MS : 0));
  timers.push(setTimeout(() => {
    if (ticker) { clearInterval(ticker); ticker = null; }
    playing = false; send({ type: 'lapse', days: 0 });
    useLapse.setState({ d: days, done: true });
    send({ type: 'morph', snap: end, ms: 600 });
    landed();
  }, (start ? SETTLE_MS : 0) + secs * 1000 + 150));
}

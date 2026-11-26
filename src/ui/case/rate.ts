// The ascites balance a case's card reads (mL a day), from the course's days and not from the running model. The live rate swings with every breath and beat (balance-hold.js: "2200 to 1500
// mL/day within a second on diuretics") and what a pane held of it depended on when it was opened: capture 0bc14020, cardiac day 20, the same stop said down 1,700, down 1,000 and Steady on
// the three devices. The case's balance is the day-scale trend, the litres the course has the belly gain or lose in the day after the stop (a stop is the day's end, so a tap or a drug has
// done its work and what follows is what the patient does next); at the last day there is none after, so the day before. Pure.
import { valueAt, type Series } from '../bigtime/record.ts';
import { useCase } from './store.ts';

/** The belly's litres along the baked days, as they were baked (the day record's own points, a step's two on its day: the later wins at it). The story's series are calmed for the chart, which
 *  spreads a change over weeks (diuretics at cardiac day 20: 6.138 L, 5.802 L a day on, but 6.041 L on the calmed lane), so the balance is read from the days themselves. */
export function ascDays(days: readonly { day: number; v: Record<string, number> }[]): Series {
  const x: number[] = [], y: number[] = [];
  for (const d of days) { const v = d.v.asc; if (typeof v === 'number' && Number.isFinite(v)) { x.push(d.day); y.push(v); } }
  return { x, y };
}

/** mL a day, from a series of litres: null when there are no readings. */
export function dayRate(asc: Series | null | undefined, day: number, lastDay: number): number | null {
  if (!asc || !asc.x.length) return null;
  const from = day < lastDay ? day : day - 1, to = from + 1;
  const a = valueAt(asc, from), b = valueAt(asc, to);
  return a == null || b == null ? null : (b - a) * 1000;
}

/** The balance the Ascites card says while a case is at a stop or on the way (the day the bar says);
 *  null when no case plays, or it has been left (the patient is then the learner's own, live). */
export function caseBalance(): number | null {
  const s = useCase.getState();
  if (s.phase !== 'stop' && s.phase !== 'travel') return null;
  return s.story && s.asc ? dayRate(s.asc, s.day, s.story.full[1]) : null;
}

// The way from one stop to the next (docs/approved/play-the-case.md): the days run on the engine's own time-lapse (the worker's 'lapse', the slides' time-lapse: a day at a time,
// silent, the course's ramps eased over them), paced so a short leg is not a blink and a long one is not a wait, and the figure eases onto the next stop's kept model at the end.
// Pure: the numbers of a leg; ui/case/run.ts drives it.
import type { CaseRamp } from './types.ts';
import { SKIP_MS } from '../deck/lapse-next.ts';
export { daysAt, skipPace, skipSpeed, type Pace } from '../deck/lapse-next.ts';

/** A course ramp's value on a day (the generator's own rule, histories/play.ts: linear from `from` to `to`, held either side). */
export function rampValue(r: CaseRamp, day: number): number {
  const k = Math.min(1, Math.max(0, (day - r.from) / Math.max(1, r.to - r.from)));
  return r.a + (r.b - r.a) * k;
}

/** The worker's ramp for a leg from day `a` to day `b` ({ key: [from, to] }, eased over the leg's days): only the ramps that move between them. Null when none does. */
export function legRamp(ramps: readonly CaseRamp[] | undefined, a: number, b: number): Record<string, [number, number]> | null {
  const out: Record<string, [number, number]> = {};
  for (const r of ramps ?? []) {
    const va = rampValue(r, a), vb = rampValue(r, b);
    if (Math.abs(vb - va) > 1e-9) out[r.key] = [va, vb];
  }
  return Object.keys(out).length ? out : null;
}

/** A leg's length on screen: a little time for the leg itself and a little more for each day, never under LEG_MIN_MS nor over LEG_MAX_MS (a year runs in the same 6 s as two months). */
export const LEG_BASE_MS = 1400, LEG_DAY_MS = 55, LEG_MIN_MS = 1800, LEG_MAX_MS = 6000;
export const legMs = (days: number): number => Math.round(Math.min(LEG_MAX_MS, Math.max(LEG_MIN_MS, LEG_BASE_MS + LEG_DAY_MS * Math.max(0, days))));
/** Next stop while the days run: what is left of them runs in this long (the slides' own Next during a time-lapse). */
export const RUSH_MS = SKIP_MS;
/** The figure eases onto the stop's kept model in this long once the days are done (the slides' lapse landing, decks/hp/lapse.ts LAND_MS). */
export const LAND_MS = 600;
/** The camera sets off for the stop's shot this long before the days are done, so it lands with them (the mock's "in the last second before a stop"). */
export const CAMERA_LEAD_MS = 1000;

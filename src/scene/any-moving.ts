import { clock } from '../clock/frame.ts';
/** "Is anything still moving?" over step results. Every flag is already computed when this is called, so no step is skipped
 *  (a chained `a() || b()` stops at the first true and never runs b: the cava, shadow, feeders, circuit skins and catheter cards stopped easing). */
export const anyMoving = (...flags: boolean[]): boolean => flags.some(Boolean);

/** Per-system frame cost: `lap(name)` adds the time since the last lap to that system's running total (ms). */
export function lapTimer(totals: Record<string, number>, now: () => number = () => clock.now()): (name: string) => void {
  let t = now();
  return (name) => { const n = now(); totals[name] = (totals[name] ?? 0) + (n - t); t = n; };
}

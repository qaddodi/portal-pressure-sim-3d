// A word's width as Inter sets it, in CSS px, from the advance widths copied from the 2D app (no canvas, no page): the layout of a chart's words is
// decided from these, in the browser and in a test alike. Tabular figures share one advance, so a number is as wide as its digits say.
import { ADVANCE } from './metrics.generated.ts';

const WEIGHTS = [400, 500, 600, 700];
const nearest = (w: number) => WEIGHTS.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
const cache = new Map<string, number>();

/** The width of `s` set in Inter at `size` px and `weight` (the nearest of 400, 500, 600, 700). */
export function measure(s: string, size: number, weight = 500): number {
  const w = nearest(weight), key = `${w}|${s}`;
  let em = cache.get(key);
  if (em === undefined) {
    const t = ADVANCE[w]!;
    em = 0;
    for (const ch of s) em += t[ch] ?? t['?'] ?? 0.6;
    if (cache.size > 4000) cache.clear();
    cache.set(key, em);
  }
  return em * size;
}

// A measure's readings along the days, and how they are read at one day. Pure.
export interface Series { x: readonly number[]; y: readonly number[] }

/** The reading at `day`: the last point at or before it (a step has two points on one day and the later wins), the first point's when the day is earlier, null for no points. */
export function valueAt(s: Series | null | undefined, day: number): number | null {
  const n = s ? s.x.length : 0;
  if (!s || !n) return null;
  if (day <= s.x[0]!) return s.y[0]!;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s.x[mid]! <= day) lo = mid; else hi = mid - 1; }
  const a = lo, b = Math.min(n - 1, a + 1), xa = s.x[a]!, xb = s.x[b]!;
  if (b === a || day >= xb) return s.y[b]!;
  return s.y[a]! + (s.y[b]! - s.y[a]!) * (day - xa) / (xb - xa);
}

/** The points of a series from `a` to `b` as [x, y, x, y, …] through `X` and `Y`: what a lane draws. The two ends are the readings at `a` and `b` themselves (the line runs to the edge of the plot, never past it). */
export function pointsIn(s: Series, a: number, b: number, X: (d: number) => number, Y: (v: number) => number): number[] {
  const n = s.x.length, out: number[] = [];
  if (!n || b < s.x[0]! || a > s.x[n - 1]!) return out;
  const lo = Math.max(a, s.x[0]!), hi = Math.min(b, s.x[n - 1]!);
  out.push(X(lo), Y(valueAt(s, lo)!));
  for (let i = 0; i < n; i++) { const x = s.x[i]!; if (x > lo && x < hi) out.push(X(x), Y(s.y[i]!)); }
  if (hi > lo) out.push(X(hi), Y(valueAt(s, hi)!));
  return out;
}

/** the series' largest reading over the whole run (a lane's scale does not move while the window does) */
export const maxOf = (s: Series | null | undefined): number => { let m = 0; if (s) for (const v of s.y) if (v > m) m = v; return m; };

/** the nearest of a few round steps that keeps `per` px or more between ticks */
export function tickStep(span: number, px: number, per = 44): number {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (px * s / Math.max(1e-9, span) >= per) return s;
  return 1000;
}

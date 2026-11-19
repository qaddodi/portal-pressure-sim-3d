// Scales and tick marks, the numbers every plot shares. Pure.

/** A linear map from a domain to a range (a range may run backwards: a y axis). */
export function linear(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = (v: number) => r0 + (v - d0) * k;
  f.inv = (p: number) => (k === 0 ? d0 : d0 + (p - r0) / k);
  f.d = [d0, d1] as const; f.r = [r0, r1] as const;
  return f;
}
export type Scale = ReturnType<typeof linear>;

/** "Nice" tick values covering [lo, hi]: 1, 2, 2.5 or 5 times a power of ten, about `count` of them, all inside the range. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo) || count < 1) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** A domain that fits the plotted values with a little air, expanded to nice numbers ("axes fit the plotted data", the owner's chart rule). */
export function fitDomain(values: readonly number[], opts: { pad?: number; zero?: boolean; min?: number; max?: number; count?: number } = {}): [number, number] {
  const v = values.filter(Number.isFinite);
  let lo = v.length ? Math.min(...v) : 0, hi = v.length ? Math.max(...v) : 1;
  if (opts.zero && lo > 0) lo = 0;
  if (hi === lo) { hi = lo + (Math.abs(lo) || 1); }
  const pad = (hi - lo) * (opts.pad ?? 0.06);
  lo -= pad; hi += pad;
  const t = niceTicks(lo, hi, opts.count ?? 5);
  const step = t.length > 1 ? t[1]! - t[0]! : hi - lo;
  let a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
  if (opts.zero && a > 0) a = 0;
  if (opts.min !== undefined) a = Math.max(a, opts.min);
  if (opts.max !== undefined) b = Math.min(b, opts.max);
  return [+a.toFixed(10), +b.toFixed(10)];
}

/** A number as a tick or a reading shows it: no trailing zeros past `d` decimals, a real minus sign. */
export function fmtNum(v: number, d = 1): string {
  if (!Number.isFinite(v)) return '—';
  const s = (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(/\.?0+$/, '');
  return (s === '-0' ? '0' : s).replace('-', '−');
}

/** A series as a path: points [x0, y0, x1, y1, …] from data through two scales, skipping gaps (NaN breaks the line into runs). */
export function seriesRuns(xs: readonly number[], ys: readonly number[], X: Scale, Y: Scale): number[][] {
  const runs: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i]!;
    if (!Number.isFinite(y) || !Number.isFinite(xs[i]!)) { if (cur.length) runs.push(cur); cur = []; continue; }
    cur.push(X(xs[i]!), Y(y));
  }
  if (cur.length) runs.push(cur);
  return runs;
}

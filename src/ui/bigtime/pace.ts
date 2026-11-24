// The event-paced day axis (docs/approved/timeline-chart.md, picked 24 Nov 2026 from mock o2): the days are cut into pieces, each with one constant scale
// set by how many events it holds, so a busy stretch gets room and a quiet one is folded. Inside a piece the scale never changes, so slopes stay true.
// Pure: the pieces come from the whole run's event days, so zooming only looks through a window onto the same axis.
export interface Piece { a: number; b: number; w: number }
export interface Pace {
  pieces: readonly Piece[];
  /** true when every piece has the same scale (an axis with nothing to fold) */
  flat: boolean;
  /** the axis position of a day, in scaled days (monotonic, piecewise linear) */
  at(day: number): number;
  /** the day at an axis position */
  day(pos: number): number;
}

/** the scale of a cluster of `n` events over `len` days: busier per day opens wider (×1 for a loose few, up to ×10 for a crowd); a run of days with none folds to a third */
export const scaleFor = (n: number, len: number): number => {
  if (n === 0 || len <= 0) return 1 / 3;
  const dens = n / len;
  return n >= 4 && dens >= 2 ? 10 : n >= 4 && dens >= 1 ? 6 : n >= 3 && dens >= 0.5 ? 3 : 1;
};

/** a short word for a scale, as the axis row says it */
export const scaleWord = (w: number): string => (w < 0.5 ? '⅓ scale' : w < 1.5 ? '1× scale' : `${Math.round(w)}× scale`);

export function paceOf(days: readonly number[], full: readonly [number, number]): Pace {
  const [f0, f1] = full, span = Math.max(1e-6, f1 - f0), gap = span / 16;
  const ds = days.filter((d) => d >= f0 - 1e-9 && d <= f1 + 1e-9).sort((a, b) => a - b);
  // events that follow each other within a sixteenth of the run are one cluster; a piece starts and ends ON its first and last event day (never on a bin edge), the days between clusters fold
  const clusters: { a: number; b: number; n: number }[] = [];
  for (const d of ds) { const c = clusters[clusters.length - 1]; if (c && d - c.b <= gap) { c.b = d; c.n++; } else clusters.push({ a: d, b: d, n: 1 }); }
  const raw: Piece[] = [];
  let at0 = f0;
  for (const c of clusters) {
    if (c.b - c.a <= 1e-9) continue;   // one day (or one event): no piece of its own, it sits in the folded days
    if (c.a > at0 + 1e-9) raw.push({ a: at0, b: c.a, w: scaleFor(0, c.a - at0) });
    raw.push({ a: c.a, b: c.b, w: scaleFor(c.n, c.b - c.a) }); at0 = c.b;
  }
  if (f1 > at0 + 1e-9 || !raw.length) raw.push({ a: at0, b: f1, w: raw.length ? scaleFor(0, f1 - at0) : 1 });
  const pieces: Piece[] = [];
  for (const q of raw) { const l = pieces[pieces.length - 1]; if (l && l.w === q.w) l.b = q.b; else pieces.push({ ...q }); }
  const flat = pieces.every((p) => p.w === pieces[0]!.w);
  const cum: number[] = [0];
  for (const p of pieces) cum.push(cum[cum.length - 1]! + (p.b - p.a) * p.w);
  const at = (d: number): number => {
    if (d <= f0) return d - f0 < 0 ? (d - f0) * pieces[0]!.w : 0;
    if (d >= f1) return cum[cum.length - 1]! + (d - f1) * pieces[pieces.length - 1]!.w;
    let lo = 0, hi = pieces.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pieces[m]!.a <= d) lo = m; else hi = m - 1; }
    return cum[lo]! + (d - pieces[lo]!.a) * pieces[lo]!.w;
  };
  const day = (pos: number): number => {
    if (pos <= 0) return f0 + pos / pieces[0]!.w;
    const tot = cum[cum.length - 1]!;
    if (pos >= tot) return f1 + (pos - tot) / pieces[pieces.length - 1]!.w;
    let lo = 0, hi = pieces.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m]! <= pos) lo = m; else hi = m - 1; }
    return pieces[lo]!.a + (pos - cum[lo]!) / pieces[lo]!.w;
  };
  return { pieces, flat, at, day };
}

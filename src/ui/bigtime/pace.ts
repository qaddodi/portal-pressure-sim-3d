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

/** the scale of a piece by its event count, ×1 for a few events; quiet days fold to a third, a crowd opens up to six times */
export const scaleFor = (n: number): number => (n === 0 ? 1 / 3 : n <= 2 ? 1 : n <= 5 ? 3 : 6);

/** a short word for a scale, as the axis row says it */
export const scaleWord = (w: number): string => (w < 0.5 ? '⅓ scale' : w < 1.5 ? '1× scale' : `${Math.round(w)}× scale`);

export function paceOf(days: readonly number[], full: readonly [number, number]): Pace {
  const [f0, f1] = full, span = Math.max(1e-6, f1 - f0);
  const bin = Math.max(1, span / 24), nb = Math.max(1, Math.ceil(span / bin));
  const count = new Array<number>(nb).fill(0);
  for (const d of days) if (d >= f0 - 1e-9 && d <= f1 + 1e-9) count[Math.min(nb - 1, Math.max(0, Math.floor((d - f0) / bin)))]!++;
  // events shown once per word are still events: the same day twice counts twice, that is the crowd
  const ws = count.map(scaleFor), pieces: Piece[] = [];
  for (let i = 0; i < nb; i++) {
    const a = f0 + i * bin, b = Math.min(f1, f0 + (i + 1) * bin), last = pieces[pieces.length - 1];
    if (last && last.w === ws[i]) last.b = b; else pieces.push({ a, b, w: ws[i]! });
  }
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

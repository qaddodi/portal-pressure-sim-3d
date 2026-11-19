// The circuit's courses are SVG path text (M, L, Q, C: anatomy.js route() and metroPath()). These sample them to points, as the 2D stage's
// sample() does, and resample a polyline at even steps of arc length, the one parameter the body course and the map course share (s = 0 to 1).

export type Pt = readonly [number, number];

/** Flattens an SVG path of M, L, Q and C commands to a polyline, `steps` pieces to a curve. */
export function flatten(d: string, steps = 12): [number, number][] {
  const t = d.match(/[MLQC]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!t) throw new Error(`empty path: ${d.slice(0, 30)}`);
  const out: [number, number][] = [];
  let i = 0, cmd = '', cx = 0, cy = 0;
  const num = () => Number(t[i++]);
  while (i < t.length) {
    if (/^[MLQC]$/.test(t[i]!)) cmd = t[i++]!;
    if (cmd === 'M' || cmd === 'L') { cx = num(); cy = num(); out.push([cx, cy]); }
    else if (cmd === 'Q') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num();
      for (let s = 1; s <= steps; s++) { const u = s / steps, v = 1 - u; out.push([v * v * cx + 2 * v * u * x1 + u * u * x2, v * v * cy + 2 * v * u * y1 + u * u * y2]); }
      cx = x2; cy = y2;
    } else if (cmd === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
      for (let s = 1; s <= steps; s++) {
        const u = s / steps, v = 1 - u;
        out.push([v * v * v * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3]);
      }
      cx = x3; cy = y3;
    } else throw new Error(`unsupported path command ${cmd} in ${d.slice(0, 30)}`);
  }
  return out;
}

/** The polyline's length, and the running length at each point. */
export function cumulative(p: readonly Pt[]): { cum: number[]; total: number } {
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]));
  return { cum, total: cum[cum.length - 1]! };
}

/** n points at even arc length along the polyline, the first and last its own ends. */
export function resample(p: readonly Pt[], n: number): [number, number][] {
  const { cum, total } = cumulative(p);
  const out: [number, number][] = [];
  let k = 1;
  for (let i = 0; i < n; i++) {
    const want = n === 1 ? 0 : (total * i) / (n - 1);
    while (k < p.length - 1 && cum[k]! < want) k++;
    const span = cum[k]! - cum[k - 1]!;
    const u = span > 1e-9 ? Math.min(1, Math.max(0, (want - cum[k - 1]!) / span)) : 0;
    out.push([p[k - 1]![0] + (p[k]![0] - p[k - 1]![0]) * u, p[k - 1]![1] + (p[k]![1] - p[k - 1]![1]) * u]);
  }
  return out;
}

/** A course's polyline from its path text, dropping points that repeat. */
export function courseOf(d: string, steps = 12): [number, number][] {
  const pts = flatten(d, steps);
  return pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1]![0], q[1] - pts[i - 1]![1]) > 1e-6);
}

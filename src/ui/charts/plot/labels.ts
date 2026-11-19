// Where the first values of the over-time charts stand (2D: flow-time-labels.js). Each first value is a box that may stand over its start ring, under it, or beside it; it must
// be wholly inside the area, clear of every ring, every line, the axis numbers and the other first value; of the places that are clear the nearest to its own ring wins. Pure.
export type Box = readonly [number, number, number, number];
const BAD = 1e4, OUT = 1e6;
const hits = (a: Box, b: Box, m: number) => a[0] < b[1] + m && b[0] < a[1] + m && a[2] < b[3] + m && b[2] < a[3] + m;
const nearCircle = (b: Box, [cx, cy, r]: readonly [number, number, number], m: number) => { const dx = Math.max(b[0] - cx, 0, cx - b[1]), dy = Math.max(b[2] - cy, 0, cy - b[3]); return dx * dx + dy * dy < (r + m) * (r + m); };
/** The points of a polyline taken every 3 px or less. */
export function dense(pts: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    out.push([pts[i]![0], pts[i]![1]]);
    if (i + 1 < pts.length) { const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3); for (let k = 1; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]); }
  }
  return out;
}
export interface PlaceArgs { f: number; area: Box; texts: readonly string[]; own: readonly (readonly [number, number, number])[]; circles: readonly (readonly [number, number, number])[]; lines: readonly (readonly (readonly [number, number])[])[]; rects?: readonly Box[]; soft?: readonly Box[]; width: (t: string) => number }
export interface Placed { x: number; y: number; box: Box }
export function placeStarts({ f, area, texts, own, circles, lines, rects = [], soft = [], width }: PlaceArgs): Placed[] {
  const pts = lines.flatMap((l) => dense(l)), up = 0.78 * f, down = 0.25 * f, gap = 2, line = 2.6;
  const boxOf = (x: number, y: number, w: number): Box => [x, x + w, y - up, y + down];
  type Cand = Placed & { cost: number };
  const cands: Cand[][] = texts.map((t, i) => {
    const [cx, cy, r] = own[i]!, w = width(t), out: Cand[] = [];
    const add = (x: number, y: number) => {
      const box = boxOf(x, y, w);
      let cost = 0;
      if (box[0] < area[0] || box[1] > area[1] || box[2] < area[2] || box[3] > area[3]) cost += OUT;
      for (const c of circles) if (nearCircle(box, c, gap)) cost += BAD;
      for (const q of rects) if (hits(box, q, gap)) cost += BAD;
      for (const q of soft) if (hits(box, q, 0)) cost += 30;
      let n = 0; for (const p of pts) if (p[0] > box[0] - line && p[0] < box[1] + line && p[1] > box[2] - line && p[1] < box[3] + line) n++;
      if (n) cost += BAD + n;
      const mx = (box[0] + box[1]) / 2, my = (box[2] + box[3]) / 2;
      cost += 0.4 * Math.abs(x - cx) + Math.abs(my - cy);
      for (let j = 0; j < own.length; j++) if (j !== i && Math.hypot(mx - own[j]![0], my - own[j]![1]) < Math.hypot(mx - cx, my - cy)) cost += 60;
      out.push({ x, y, box, cost });
    };
    for (const dx of [-3, r + 3, 2 * f, 4 * f, 6 * f, 9 * f]) {
      for (let k = 0; k < 10; k++) { add(cx + dx, cy - r - gap - 0.5 - down - k * 0.35 * f); add(cx + dx, cy + r + gap + 0.5 + up + k * 0.35 * f); }
      for (let k = -3; k <= 3; k++) add(cx + dx, cy + 0.35 * f + k * 0.35 * f);
    }
    return out.sort((a, b) => a.cost - b.cost).slice(0, 48);
  });
  let best: { cost: number; chosen: Cand[] } | null = null;
  const walk = (i: number, chosen: Cand[], cost: number) => {
    if (best && cost >= best.cost) return;
    if (i === cands.length) { best = { cost, chosen: chosen.slice() }; return; }
    for (const c of cands[i]!) {
      let extra = c.cost;
      for (const o of chosen) if (hits(c.box, o.box, gap)) extra += BAD;
      chosen.push(c); walk(i + 1, chosen, cost + extra); chosen.pop();
    }
  };
  walk(0, [], 0);
  return (best as { chosen: Cand[] } | null)!.chosen.map(({ x, y, box }) => ({ x, y, box }));
}

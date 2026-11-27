// Where the Circuit's map cuts each vein, and where each collateral, shunt and tributary joins it: read from the engine's junction table
// (topology.js JUNCTIONS and JUNCTION_PIECES), not copied piece by piece from the retired 2D app (27 Nov, Brief C of docs/real-junctions:
// "where a vessel meets another is defined twice", and a new row in the table had no map course, so build() threw).
//
// The rule, from first principles. A vein that something joins part-way along is ONE vein on the map: its whole course (the copy's pieces of it
// joined in order, skipping a piece the copy has no course for: the copy is older than the table) is cut at each junction into the table's
// pieces, in the table's order (from the vein's own start). Each cut stands where the 2D drawing put that junction (JUNCTION_CIRCUIT, the point
// its lanes were drawn to) while that drawing has one, else at the table's `at` (the share of the course from its start). The first is the map's
// own choice, kept so nothing on the map moves when the pin does (MAP_JUNCTIONS has both shares: `share` and `table`); the second is how every
// junction the 2D drawing never had gets its place. A joiner's end that is not at its junction (a vessel that, in 2D, joined the vein's end
// station) is carried to it (`reEnd`): the last run of the lane slides along, or ramps in, and its other corners stay as the 2D router made them.
//
// Nothing here names a piece, a vein or a vessel: the table, the copy and the 2D junction points are arguments (`cutMap`), so a test adds a row
// to the table and the map still builds.
import { CIRCUIT_D, JUNCTION_CIRCUIT } from './data.copied.ts';
import { courseOf, cumulative, type Pt } from './paths.ts';
import { JUNCTIONS, JUNCTION_PIECES } from '../../engine/hales/portal/topology.js';
import { route as routeText } from './router.copied.js';

type P = [number, number];
/** One row of the engine's table: [node, host edge, at, label, [[joiner edge, 'from' | 'to'], ...]] (the engine copy is untyped JS, so a row is read, not cast). */
export interface JunctionRow { node: string; host: string; at: number; joiners: readonly (readonly [string, string])[] }
export const rowOf = (r: readonly unknown[]): JunctionRow => ({
  node: String(r[0]), host: String(r[1]), at: Number(r[2]),
  joiners: (r[4] as readonly (readonly unknown[])[]).map((j) => [String(j[0]), String(j[1])] as const),
});

/** Closer than this (map units) is the same point. */
export const SAME = 0.5;

export interface MapJunction {
  node: string;
  host: string;
  /** where on the host's whole map course (0 its start, 1 its end), and the point there */
  share: number;
  at: P;
  /** the table's own share of the host, and whether the map's stands elsewhere because the 2D drawing placed this junction */
  table: number;
  own: boolean;
}
export interface MapCuts {
  /** every edge's map course as path text: the copy's, with each divided vein's pieces and each joiner's end replaced */
  d: Record<string, string>;
  junctions: Map<string, MapJunction>;
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The point at arc length s of a polyline, and the index of the segment it lies on. */
function pointAt(p: readonly Pt[], cum: readonly number[], s: number): { pt: P; seg: number } {
  let k = 1;
  while (k < p.length - 1 && cum[k]! < s) k++;
  const span = cum[k]! - cum[k - 1]!, u = span > 1e-9 ? Math.min(1, Math.max(0, (s - cum[k - 1]!) / span)) : 0;
  return { pt: [p[k - 1]![0] + (p[k]![0] - p[k - 1]![0]) * u, p[k - 1]![1] + (p[k]![1] - p[k - 1]![1]) * u], seg: k - 1 };
}

/** Where a point lies along a polyline (arc length of its nearest point), and how far off it is. */
function project(p: readonly Pt[], cum: readonly number[], q: Pt): { s: number; off: number } {
  let best = Infinity, s = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!, b = p[i]!, dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const u = Math.min(1, Math.max(0, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L)), ex = a[0] + dx * u - q[0], ey = a[1] + dy * u - q[1], d = Math.hypot(ex, ey);
    if (d < best) { best = d; s = cum[i - 1]! + u * (cum[i]! - cum[i - 1]!); }
  }
  return { s, off: best };
}

/** The polyline between arc lengths s0 and s1, as path text (every point of it, so the shape is the host's own). */
function slice(p: readonly Pt[], cum: readonly number[], s0: number, s1: number): string {
  const a = pointAt(p, cum, s0), b = pointAt(p, cum, s1);
  const pts: P[] = [a.pt];
  for (let i = a.seg + 1; i <= b.seg; i++) pts.push([p[i]![0], p[i]![1]]);
  pts.push(b.pt);
  const keep = pts.filter((q, i) => i === 0 || dist(q, pts[i - 1]!) > 1e-6);
  const f = (v: number) => Number(v.toFixed(4));
  return `M${f(keep[0]![0])} ${f(keep[0]![1])}${keep.slice(1).map((q) => ` L ${f(q[0])} ${f(q[1])}`).join('')}`;
}

/**
 * The corners of a lane's path text: its start, each rounded corner's control point, its plain vertices and its end (the tangent points of a
 * rounded corner are not corners). `r` is the roundest corner's reach.
 */
export function cornersOf(d: string): { pts: P[]; r: number } {
  const t = d.match(/[MLQ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!t) throw new Error(`empty path: ${d.slice(0, 30)}`);
  const cmds: { c: string; q: P; p: P }[] = [];
  let i = 0, cmd = '';
  const num = () => Number(t[i++]);
  while (i < t.length) {
    if (/^[MLQ]$/.test(t[i]!)) cmd = t[i++]!;
    if (cmd === 'M' || cmd === 'L') { const p: P = [num(), num()]; cmds.push({ c: cmd, q: p, p }); }
    else if (cmd === 'Q') { const q: P = [num(), num()], p: P = [num(), num()]; cmds.push({ c: 'Q', q, p }); }
    else throw new Error(`unsupported path command ${cmd} in ${d.slice(0, 30)}`);
  }
  const pts: P[] = [];
  let r = 0, last: P = cmds[0]!.p;
  cmds.forEach((m, k) => {
    if (m.c === 'M') pts.push(m.p);
    else if (m.c === 'Q') { r = Math.max(r, dist(last, m.q), dist(m.q, m.p)); pts.push(m.q); }
    else if (cmds[k + 1]?.c !== 'Q') pts.push(m.p);
    last = m.p;
  });
  return { pts, r: r || 16 };
}

/** The unit direction of a leg snapped to the eight the 2D router draws in. */
function snap(a: Pt, b: Pt): P {
  const dx = b[0] - a[0], dy = b[1] - a[1], ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return [Math.cos(ang), Math.sin(ang)];
}
const meet = (a: Pt, da: Pt, b: Pt, db: Pt): { x: P; ta: number } | null => {
  const den = da[0] * db[1] - da[1] * db[0];
  if (Math.abs(den) < 1e-6) return null;
  const ta = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den;
  return { x: [a[0] + da[0] * ta, a[1] + da[1] * ta], ta };
};

/** How much of a lane runs on top of another (samples every 2 units within `NEAR` of one), not counting the stretch at `to` where it meets its host. */
const NEAR = 5;
function overlap(text: string, to: Pt, others: readonly (readonly Pt[])[]): number {
  const c = courseOf(text);
  let n = 0;
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1]!, b = c[i]!, steps = Math.max(1, Math.ceil(dist(a, b) / 2));
    for (let k = 0; k < steps; k++) {
      const q: Pt = [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
      if (dist(q, to) < 3 * NEAR + 20) continue;
      if (others.some((o) => o.some((_, j) => j > 0 && segDist(q, o[j - 1]!, o[j]!) < NEAR))) n++;
    }
  }
  return n;
}
function segDist(q: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, u = Math.min(1, Math.max(0, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L));
  return Math.hypot(a[0] + dx * u - q[0], a[1] + dy * u - q[1]);
}

/**
 * A lane's corners with its LAST end carried to `to`. Two ways, the one that runs on top of the other lanes least wins (the slide when they tie):
 * the slide keeps the last leg's direction and moves the run before it to meet it; the ramp keeps that run and the leg's line and joins `to` by a 45 degree ramp.
 * The lane's other corners stay as the 2D router made them. With one corner to spare the last corner joins `to` straight.
 */
export function reEnd(pts: readonly P[], to: P, rad: number, others: readonly (readonly Pt[])[]): P[] {
  const n = pts.length;
  if (n < 3) return [pts[0]!, to];
  const q2 = pts[n - 3]!, q1 = pts[n - 2]!, q0 = pts[n - 1]!, w = snap(q1, q0), u: P = [q1[0] - q2[0], q1[1] - q2[1]];
  const cands: P[][] = [];
  const m = meet(q2, u, to, w);
  // (the slid corner must stay on the run's own side of the corner before it: a run is never turned back on itself)
  if (m && m.ta > SAME) cands.push([...pts.slice(0, n - 2), m.x, to]);
  // the ramp: down the leg's line from q1 until a 45 degree ramp reaches `to`
  if (Math.abs(w[0]) < 1e-6 || Math.abs(w[1]) < 1e-6) {
    const alongX = Math.abs(w[0]) > 0.5, off = alongX ? Math.abs(to[1] - q1[1]) : Math.abs(to[0] - q1[0]), sgn = alongX ? Math.sign(q1[0] - to[0]) : Math.sign(q1[1] - to[1]);
    const r: P = alongX ? [to[0] + sgn * off, q1[1]] : [q1[0], to[1] + sgn * off];
    // (the ramp must start between the corner and `to`, not past either)
    const room = alongX ? Math.abs(q1[0] - to[0]) : Math.abs(q1[1] - to[1]);
    if (off > SAME && room > off + SAME) cands.push([...pts.slice(0, n - 1), r, to]);
  }
  cands.push([...pts.slice(0, n - 1), to]);
  let best = cands[0]!, bs = Infinity;
  for (const c of cands) { const sc = overlap(routeText(c, rad), to, others); if (sc < bs) { bs = sc; best = c; } }
  return best;
}

export interface CutInput {
  rows: readonly (readonly unknown[])[];
  pieces: Readonly<Record<string, readonly string[]>>;
  d: Readonly<Record<string, string>>;
  own: Readonly<Record<string, readonly [number, number]>>;
}
/**
 * Every vein's map course cut at the table's junctions, and every joiner's end at its junction. A pure function of the table (`rows`, `pieces`),
 * the copied courses (`d`) and the 2D drawing's junction points (`own`).
 */
export function cutMap(input: CutInput): MapCuts {
  const { pieces, d, own } = input;
  const rows = input.rows.map(rowOf);
  const out: Record<string, string> = { ...d };
  const junctions = new Map<string, MapJunction>();
  const byHost = new Map<string, JunctionRow[]>();
  for (const r of rows) (byHost.get(r.host) ?? byHost.set(r.host, []).get(r.host)!).push(r);
  for (const [host, list] of byHost) {
    // (the table's order: by `at`, as the engine cuts the host, so piece i is the stretch between cut i-1 and cut i)
    list.sort((a, b) => a.at - b.at);
    const ids = pieces[host];
    if (!ids || ids.length !== list.length + 1) throw new Error(`junctions on ${host}: ${list.length} rows but pieces ${ids ? ids.join(',') : 'none'}`);
    let whole: P[] = [];
    for (const id of ids) {
      if (!d[id]) continue;
      const c = courseOf(d[id]!);
      if (whole.length && dist(whole[whole.length - 1]!, c[0]!) > SAME) throw new Error(`${host}: the map piece ${id} does not start where the one before it ends`);
      whole = whole.concat(whole.length ? c.slice(1) : c);
    }
    if (whole.length < 2) throw new Error(`no circuit course for ${host}`);
    const { cum, total } = cumulative(whole);
    const cuts: number[] = [0];
    for (const r of list) {
      const o = own[r.node];
      let s = r.at * total;
      if (o) {
        const pr = project(whole, cum, o);
        if (pr.off > SAME) throw new Error(`${r.node}: the 2D drawing's junction point is ${pr.off.toFixed(1)} units off ${host}`);
        s = pr.s;
      }
      cuts.push(s);
      junctions.set(r.node, { node: r.node, host, share: s / total, at: pointAt(whole, cum, s).pt, table: r.at, own: !!o });
    }
    cuts.push(total);
    const order = `${list.map((r) => r.node).join(', ')} at ${cuts.slice(1, -1).map((c) => (c / total).toFixed(3)).join(', ')}`;
    for (let i = 1; i < cuts.length; i++) if (cuts[i]! - cuts[i - 1]! < 1) throw new Error(`${host}: the map's cuts are not in the table's order (${order})`);
    ids.forEach((id, i) => { out[id] = slice(whole, cum, cuts[i]!, cuts[i + 1]!); });
  }
  // every joiner's end lands at its junction
  for (const r of rows) {
    const j = junctions.get(r.node)!;
    for (const [edge, end] of r.joiners) {
      const text = out[edge];
      if (!text) continue;
      const { pts, r: rad } = cornersOf(text);
      const moved = end === 'to' ? pts : pts.slice().reverse();
      if (dist(moved[moved.length - 1]!, j.at) <= SAME) continue;
      const others = Object.entries(out).filter(([id]) => id !== edge).map(([, t]) => courseOf(t));
      const done = reEnd(moved, j.at, rad, others);
      out[edge] = routeText(end === 'to' ? done : done.reverse(), rad);
    }
  }
  return { d: out, junctions };
}

/** The engine's table cut on the map, as the page uses it. */
export const MAP_CUTS: MapCuts = cutMap({ rows: JUNCTIONS as readonly (readonly unknown[])[], pieces: JUNCTION_PIECES as Record<string, string[]>, d: CIRCUIT_D, own: JUNCTION_CIRCUIT });

/** Every edge's map course (SVG path text): the copy's, with the divided veins cut at the table's junctions and the joiners landed there. The one place the page reads a lane's course from. */
export const CIRCUIT_COURSE_D: Readonly<Record<string, string>> = MAP_CUTS.d;
/** Each junction node's place on the map. */
export const MAP_JUNCTIONS: ReadonlyMap<string, MapJunction> = MAP_CUTS.junctions;

// The lobule's dust routes (Mohammad, 20 Nov: "also same streaks in lobule view please"; the lymph and the bile too, "the same kind of streaks we use for blood"): the Anatomy's route table (blood/routes.ts) for the lobule's own network, built once. The blood runs from the inlet
// venules along the lobule's edges into the first sinusoids, which merge pairwise twice toward the central vein. Every particle keeps one identity on the way:
//   a sinusoid leaving an inlet's SIDE takes a strip of the inlet's lanes on that side, as wide a share of the half still unclaimed as its flow is of what still leaves there (its own and every later one's),
//   carried on from the inlet's arc at the branch point;
//   two sinusoids merging at a node lie side by side in the next (the stream function round the node, as the Anatomy's merges);
//   an anastomosis or an arteriole's twig carries its own particles.
// All the lobule's blood shares one flow (uFlowT), so B is 1 everywhere: a particle keeps its pace through every joint.
import { buildRoutes, type RouteEdge, type Seg } from '../blood/routes.ts';

export interface LobuleRouteCourse {
  /** the course's column of the route table */
  col: number;
  kind: string;
  /** its points in the plate's own units (x, y of the 3D points: the arc and the lanes are measured in them), start to end with the blood */
  path: readonly (readonly [number, number])[];
  /** its built radius (local units): the lattice's pitch when it is a root */
  radius: number;
}

const near = (a: readonly [number, number], b: readonly [number, number], tol: number): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
const arcs = (p: readonly (readonly [number, number])[]): number[] => { const a = [0]; for (let i = 1; i < p.length; i++) a.push(a[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1])); return a; };

/** The same, one family at a time (each family is joined only to itself, so they are independent: the blood with its inlets, each lymph channel, the twigs, the bile): each `yield` is a place a slice may end. */
export function* lobuleRoutesSteps(courses: readonly LobuleRouteCourse[], tol: number): Generator<void, Map<number, Seg[]>> {
  const groups = new Map<string, LobuleRouteCourse[]>();
  for (const c of courses) { const f = famOf(c.kind) === 'in' ? 'sin' : famOf(c.kind); (groups.get(f) ?? groups.set(f, []).get(f)!).push(c); }
  const out = new Map<number, Seg[]>();
  for (const g of groups.values()) { for (const [col, segs] of lobuleRoutes(g, tol)) out.set(col, segs); yield; }
  return out;
}

const famOf = (k: string): string => (k === 's0' || k === 's1' || k === 's2' || k === 'an' ? 'sin' : k === 'in' ? 'in' : k.startsWith('bile') ? 'bile' : k);

/** The route segments of every course (by column). `tol`: how close two ends must be to be one node (local units). */
export function lobuleRoutes(courses: readonly LobuleRouteCourse[], tol: number): Map<number, Seg[]> {
  // each family is joined only to itself (a bile channel's end beside a sinusoid's is no joint): the blood's sinusoids, the arterioles' twigs, the lymph, the bile. The inlets are roots the sinusoids leave from the side
  const sin = courses.filter((c) => famOf(c.kind) !== 'in');
  const inlets = courses.filter((c) => c.kind === 'in');
  // nodes: the ends that meet, within a family (a merge's inflows end where the next begins)
  const nodes: { p: readonly [number, number]; f: string }[] = [];
  const nodeOf = (p: readonly [number, number], f: string): string => { let i = nodes.findIndex((q) => q.f === f && near(p, q.p, tol)); if (i < 0) { nodes.push({ p, f }); i = nodes.length - 1; } return `n${i}`; };
  const ends = new Map(sin.map((c) => [c.col, { from: nodeOf(c.path[0]!, famOf(c.kind)), to: nodeOf(c.path[c.path.length - 1]!, famOf(c.kind)) }]));
  // each course's flow: a first one 1, a merged one the sum of what runs into it
  const q = new Map<number, number>();
  const flowOf = (c: LobuleRouteCourse, seen = new Set<number>()): number => {
    const got = q.get(c.col);
    if (got != null) return got;
    if (seen.has(c.col)) return 1;
    seen.add(c.col);
    const from = ends.get(c.col)!.from;
    const ins = sin.filter((o) => o !== c && ends.get(o.col)!.to === from);
    const v = ins.length ? ins.reduce((t, o) => t + flowOf(o, seen), 0) : 1;
    q.set(c.col, v);
    return v;
  };
  for (const c of sin) flowOf(c);
  // the seeds: each first sinusoid off its inlet's side
  const seed = new Map<number, Seg[]>();
  const firsts = sin.filter((c) => c.kind === 's0');
  const branch = new Map<number, { inlet: LobuleRouteCourse; arc: number; side: number }>();
  for (const c of firsts) {
    const p = c.path[0]!;
    let best: { inlet: LobuleRouteCourse; arc: number; side: number; d: number } | null = null;
    for (const il of inlets) {
      const a = arcs(il.path);
      for (let i = 0; i < il.path.length; i++) {
        const d = Math.hypot(il.path[i]![0] - p[0], il.path[i]![1] - p[1]);
        if (best && d >= best.d) continue;
        const j0 = Math.max(0, i - 1), j1 = Math.min(il.path.length - 1, i + 1);
        const tx = il.path[j1]![0] - il.path[j0]![0], ty = il.path[j1]![1] - il.path[j0]![1];
        const dq = c.path[Math.min(3, c.path.length - 1)]!, dx = dq[0] - p[0], dy = dq[1] - p[1];
        best = { inlet: il, arc: a[i]!, side: tx * dy - ty * dx >= 0 ? 1 : -1, d };   // (side +1: the sinusoid leaves to the inlet's left, its lanes y > 0)
      }
    }
    if (best) branch.set(c.col, best);
  }
  // each side of each inlet, in the order its sinusoids leave it: the first takes the wall's lanes, each one as wide a share of what is still left of that half as its flow is of what still leaves there
  const groups = new Map<string, LobuleRouteCourse[]>();
  for (const c of firsts) { const b = branch.get(c.col); if (!b) continue; const key = `${b.inlet.col}:${b.side}`; (groups.get(key) ?? groups.set(key, []).get(key)!).push(c); }
  for (const g of groups.values()) {
    g.sort((x, y) => branch.get(x.col)!.arc - branch.get(y.col)!.arc);
    let left = g.reduce((t, o) => t + (q.get(o.col) ?? 1), 0), edge = 1;   // (edge: the half's lanes still unclaimed run 0..edge)
    for (const c of g) {
      const b = branch.get(c.col)!, f = Math.min(1, (q.get(c.col) ?? 1) / Math.max(left, 1e-9)), w = f * edge;
      seed.set(c.col, [{ y0: -1, y1: 1, root: b.inlet.col, c0: b.side * (edge - w / 2), c1: w / 2, A: b.arc, B: 1 }]);
      edge -= w; left -= q.get(c.col) ?? 1;
    }
  }
  const list: RouteEdge[] = sin.map((c) => {
    const e = ends.get(c.col)!, len = arcs(c.path).at(-1)!;
    return { k: c.col, from: e.from, to: e.to, path: c.path, len, fwd: true, m: 1, q: q.get(c.col) ?? 1 };
  });
  const out = buildRoutes(list, undefined, seed);
  // a channel that ends on the SIDE of another of its family (a bile canal into a duct partway along, no node there): it carries the host's own particles on a strip of the host's lanes on that side, at the host's
  // place along it, so at the join each particle runs on into the host where the host carries it (the host's segments composed, so a host that is itself a merge hands on its roots). Only a channel nothing runs into
  for (const c of sin) {
    if (famOf(c.kind) === 'sin') continue;
    const e = ends.get(c.col)!, f = famOf(c.kind);
    if (sin.some((o) => o !== c && ends.get(o.col)!.from === e.to) || sin.some((o) => o !== c && ends.get(o.col)!.to === e.from)) continue;
    const P = c.path[c.path.length - 1]!;
    let best: { host: LobuleRouteCourse; arc: number; side: number; d: number } | null = null;
    for (const h of sin) {
      if (h === c || famOf(h.kind) !== f) continue;
      const a = arcs(h.path), reach = Math.max(tol, 1.5 * h.radius + c.radius);
      for (let i = 0; i < h.path.length - 1; i++) {
        const p0 = h.path[i]!, p1 = h.path[i + 1]!, bx = p1[0] - p0[0], by = p1[1] - p0[1], bb = bx * bx + by * by;
        const t = bb > 0 ? Math.min(1, Math.max(0, ((P[0] - p0[0]) * bx + (P[1] - p0[1]) * by) / bb)) : 0;
        const d = Math.hypot(P[0] - p0[0] - t * bx, P[1] - p0[1] - t * by);
        if (d > reach || (best && d >= best.d)) continue;
        const arc = a[i]! + t * Math.sqrt(bb), L = a.at(-1)!;
        if (arc < tol || L - arc < tol) continue;   // (at the host's end: a node, handled above)
        const q = c.path[Math.max(0, c.path.length - 4)]!;
        best = { host: h, arc, side: bx * (q[1] - p0[1]) - by * (q[0] - p0[0]) >= 0 ? 1 : -1, d };
      }
    }
    if (!best) continue;
    const len = arcs(c.path).at(-1)!, w = 0.35, cm = best.side * (1 - w / 2), cw = w / 2;
    const segs: Seg[] = [];
    for (const g of out.get(best.host.col) ?? []) {
      // the channel's lanes y whose host lane cm + cw y lies in this segment
      let y0 = (g.y0 - cm) / cw, y1 = (g.y1 - cm) / cw;
      y0 = Math.max(-1, y0); y1 = Math.min(1, y1);
      if (y1 - y0 < 1e-6) continue;
      segs.push({ y0, y1, root: g.root, c0: g.c0 + g.c1 * cm, c1: g.c1 * cw, A: g.A + g.B * (best.arc - len), B: g.B });
    }
    if (segs.length) { segs[0]!.y0 = -1; segs[segs.length - 1]!.y1 = 1; out.set(c.col, segs); }
  }
  return out;
}

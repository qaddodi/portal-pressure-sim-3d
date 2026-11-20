// The lobule's dust routes (Mohammad, 20 Nov: "also same streaks in lobule view please"): the Anatomy's route table (blood/routes.ts) for the lobule's own network, built once. The blood runs from the inlet
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

/** The route segments of every course (by column). `tol`: how close two ends must be to be one node (local units). */
export function lobuleRoutes(courses: readonly LobuleRouteCourse[], tol: number): Map<number, Seg[]> {
  const sin = courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2');
  const inlets = courses.filter((c) => c.kind === 'in');
  // nodes: the sinusoids' ends that meet (a merge's two inflows end where the next begins)
  const nodes: (readonly [number, number])[] = [];
  const nodeOf = (p: readonly [number, number]): string => { let i = nodes.findIndex((q) => near(p, q, tol)); if (i < 0) { nodes.push(p); i = nodes.length - 1; } return `n${i}`; };
  const ends = new Map(sin.map((c) => [c.col, { from: nodeOf(c.path[0]!), to: nodeOf(c.path[c.path.length - 1]!) }]));
  // each sinusoid's flow: a first one 1, a merged one the sum of what runs into it
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
  return out;
}

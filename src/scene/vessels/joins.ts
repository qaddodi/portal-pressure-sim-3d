// Where one vessel runs on into the next, the 2D figure redraws the last samples either side of the join as one smooth cubic through it, following each course's own direction,
// so the tube bends through the join instead of kinking (vein-joins.js smoothRunOn). Which pairs run on is the 2D rule (fork-joins.js, copied whole by scripts/copy-b3-data.mjs):
// at each node the most nearly head-on pair, and only a nearly straight one in a fork. This is that pass on the course samples, run once on the whole network (the figure does it
// on the vessels drawn; a collateral never takes a place in the choice at a node of main vessels, so what is drawn does not change who runs on into whom).
import { newJoinAnswer, nodeJoinsInto } from './fork-joins.copied.js';

export type Pt2 = readonly [number, number];
export interface JoinEdge { id: string; from: string; to: string; art: boolean; kind: string; path: readonly Pt2[] }
export interface RunOn { a: string; ia: 0 | 1; b: string; ib: 0 | 1; fork: boolean }

const CLUSTER = 20;   // 2D units: ends of one node that lie within this of the first are one join (vein-joins.js veinJoins)
const E = 10, RUN_ON_MISS = 2;

interface End { id: string; i: 0 | 1; q: Pt2; kind: string }

/** The pairs that run on into one another at a node, by the 2D rule. */
export function findRunOns(list: readonly JoinEdge[]): RunOn[] {
  const by = new Map<string, End[]>();
  for (const e of list) {
    if (e.kind === 'shunt' && !e.art) continue;   // a procedure's shunt is drawn only while it is made: it takes no place in the choice
    for (const i of [0, 1] as const) {
      const node = i ? e.to : e.from, q = e.path[i ? e.path.length - 1 : 0]!;
      const key = `${node}|${e.art ? 1 : 0}`;
      const a = by.get(key) ?? [];
      a.push({ id: e.id, i, q, kind: e.kind });
      by.set(key, a);
    }
  }
  const path = new Map(list.map((e) => [e.id, e.path]));
  const out: RunOn[] = [];
  const answer = newJoinAnswer();
  for (const group of by.values()) {
    let rest = group;
    while (rest.length) {
      const [first] = rest, near: End[] = [], far: End[] = [];
      for (const e of rest) (e === first || Math.hypot(e.q[0] - first!.q[0], e.q[1] - first!.q[1]) < CLUSTER ? near : far).push(e);
      rest = far;
      if (near.length < 2) continue;
      // a collateral takes no part where main vessels meet (it opens and closes); a node of collaterals alone, or of one vessel and a collateral, is judged with them
      const mains = near.filter((e) => e.kind !== 'collateral');
      const ends = mains.length >= 2 ? mains : near;
      const dirs = ends.map((e) => {
        const P = path.get(e.id)!, n = P.length, a = e.i ? P[n - 1]! : P[0]!, b = e.i ? P[Math.max(0, n - 4)]! : P[Math.min(n - 1, 3)]!;
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return { dir: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] as [number, number], strand: false, soft: false };
      });
      nodeJoinsInto(dirs, dirs.length, answer);
      if (answer.ra >= 0) {
        const A = ends[answer.ra]!, B = ends[answer.rb]!;
        if (A.id !== B.id) out.push({ a: A.id, ia: A.i, b: B.id, ib: B.i, fork: ends.length > 2 });
      }
    }
  }
  return out;
}

const runOnMiss = (p0x: number, p0y: number, p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number, jx: number, jy: number): number => {
  let m = Infinity;
  for (let k = 0; k <= 10; k++) {
    const t = 0.25 + 0.05 * k, u = 1 - t;
    const x = u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x;
    const y = u * u * u * p0y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * p3y;
    const d = (x - jx) * (x - jx) + (y - jy) * (y - jy);
    if (d < m) m = d;
  }
  return Math.sqrt(m);
};

/** The courses with every run-on pair redrawn smooth (vein-joins.js smoothRunOn): the pairs' courses are new arrays, every other course is returned as it was. */
export function smoothRunOns(paths: ReadonlyMap<string, readonly Pt2[]>, runOns: readonly RunOn[]): Map<string, Pt2[]> {
  const out = new Map<string, number[][]>();
  const own = (id: string): number[][] => {
    let c = out.get(id);
    if (!c) { c = paths.get(id)!.map((p) => [p[0], p[1]]); out.set(id, c); }
    return c;
  };
  for (const { a, ia, b, ib } of runOns) {
    if (!paths.has(a) || !paths.has(b)) continue;
    const PA = own(a), PB = own(b);
    if (PA.length < 2 * E + 2 || PB.length < 2 * E + 2) continue;
    const ea = ia ? PA[PA.length - 1]! : PA[0]!, eb = ib ? PB[PB.length - 1]! : PB[0]!;
    const jx = (ea[0]! + eb[0]!) / 2, jy = (ea[1]! + eb[1]!) / 2;
    let e = E, n = e, p0x = 0, p0y = 0, p1x = 0, p1y = 0, p2x = 0, p2y = 0, p3x = 0, p3y = 0;
    for (;;) {
      n = e;
      const a0 = ia ? PA[PA.length - 1 - n]! : PA[n]!, a1 = ia ? PA[PA.length - 1 - (n + 1)]! : PA[n + 1]!;
      const b0 = ib ? PB[PB.length - 1 - n]! : PB[n]!, b1 = ib ? PB[PB.length - 1 - (n + 1)]! : PB[n + 1]!;
      p0x = a0[0]!; p0y = a0[1]!; p3x = b0[0]!; p3y = b0[1]!;
      const L = Math.hypot(p3x - p0x, p3y - p0y) / 3;
      const tax = p0x - a1[0]!, tay = p0y - a1[1]!, tbx = p3x - b1[0]!, tby = p3y - b1[1]!;
      const na = Math.hypot(tax, tay) || 1, nb = Math.hypot(tbx, tby) || 1;
      p1x = p0x + (tax / na) * L; p1y = p0y + (tay / na) * L; p2x = p3x + (tbx / nb) * L; p2y = p3y + (tby / nb) * L;
      if (e <= 2 || runOnMiss(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, jx, jy) <= RUN_ON_MISS) break;
      e = Math.max(2, Math.round(e * 0.6));
    }
    for (let i = 0; i <= n; i++) {
      const t = 0.5 * (1 - i / n), u = 1 - t, d = PA[ia ? PA.length - 1 - i : i]!;
      d[0] = u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x;
      d[1] = u * u * u * p0y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * p3y;
    }
    for (let i = 0; i <= n; i++) {
      const t = 0.5 + 0.5 * (i / n), u = 1 - t, d = PB[ib ? PB.length - 1 - i : i]!;
      d[0] = u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x;
      d[1] = u * u * u * p0y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * p3y;
    }
  }
  return out as unknown as Map<string, Pt2[]>;
}

// Real flow through junctions (Mohammad, 20 Nov: "the streaks still break between vessels"; "it has to be real, not like chevrons"): every particle keeps one identity (its root, its lane in the root, its arc along the
// root's stream) through the network, so it is drawn in the next vessel exactly where it left the last. These tests pin the lane table (blood/routes.ts) on small networks and on the app's own figure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoutes, nodeArms, structure, tidy, turnsFor, SEG_MAX, type RouteEdge, type Seg } from '../src/scene/blood/routes.ts';
import { ROUTE_INFO } from '../src/scene/blood/routes.ts';

const E = (k: number, from: string, to: string, path: [number, number][], q: number, m = 10, fwd = true): RouteEdge => {
  let len = 0; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return { k, from, to, path, len, fwd, m: fwd ? m : -m, q };
};
const segAt = (s: readonly Seg[], y: number): Seg => s.find((g) => y >= g.y0 && y <= g.y1)!;
/** A particle's identity seen from vessel `e` at lane y and arc s: (root, root lane, root arc). */
const ident = (r: Map<number, Seg[]>, k: number, y: number, s: number): [number, number, number] => { const g = segAt(r.get(k)!, y); return [g.root, g.c0 + g.c1 * y, g.A + g.B * s]; };
const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b}`);

test('a fork: the parent\'s lanes are split by the branches\' flow, each branch takes the lanes on its own side, and a particle is the same one on both sides of the joint', () => {
  // trunk runs right along x to J; branch U leaves up-right (2D y down: up is -y), branch D down-right; U takes 30 percent
  const r = buildRoutes([E(0, 'S', 'J', [[0, 0], [100, 0]], 10), E(1, 'J', 'U', [[100, 0], [180, -60]], 3), E(2, 'J', 'D', [[100, 0], [180, 60]], 7)]);
  assert.equal(structure(r.get(0)!), '0+');
  for (const k of [1, 2]) assert.equal(r.get(k)!.length, 1, 'one source each');
  const [u, d] = [r.get(1)![0]!, r.get(2)![0]!];
  // the trunk's left (its course's rot90 in 2D coordinates, y down: toward -y... the side U leaves by) must be U's: U's lanes map to one end of the trunk's, D's to the other, meeting at the dividing streamline
  const uR = [u.c0 - u.c1, u.c0 + u.c1].sort((a, b) => a - b), dR = [d.c0 - d.c1, d.c0 + d.c1].sort((a, b) => a - b);
  near(uR[1]! - uR[0]!, 2 * 0.3, 1e-9, 'U gets 30 percent of the lanes'); near(dR[1]! - dR[0]!, 2 * 0.7, 1e-9, 'D gets 70 percent');
  assert.ok(Math.abs(uR[0]! + 1) < 1e-9 || Math.abs(uR[1]! - 1) < 1e-9, 'U is at one wall'); near(Math.min(Math.abs(uR[0]! - dR[1]!), Math.abs(uR[1]! - dR[0]!)), 0, 1e-9, 'they meet: no lane is lost or doubled');
  // U leaves toward -y in 2D: the trunk's left in 2D coordinates (rot90 of +x = +y) is the other side, so U takes the trunk's RIGHT lanes (y < 0)
  assert.ok(uR[1]! <= 1e-9, `U takes the trunk's right lanes: ${uR}`);
  // the joint: a particle at the end of the trunk is the one at the start of the branch (same root, lane, arc)
  for (const y of [-0.9, -0.5, 0.2, 0.8]) {
    const [, yr, se] = ident(r, 2, y, 0); const t = ident(r, 0, yr, 100);
    near(t[1], yr, 1e-9, 'lane'); near(t[2], se, 1e-9, 'arc');
  }
  // no lane crosses: the branches keep their order (U's wall that faces D meets D's wall that faces U)
  assert.equal(nodeArms([E(0, 'S', 'J', [[0, 0], [100, 0]], 10), E(1, 'J', 'U', [[100, 0], [180, -60]], 3), E(2, 'J', 'D', [[100, 0], [180, 60]], 7)]).get('J')!.length, 3);
});

test('a merge: the inflows lie side by side by flow (portal streaming), each with its own root, and the merged vessel\'s arc carries each one on', () => {
  const r = buildRoutes([E(0, 'A', 'J', [[0, -60], [100, 0]], 4, 10), E(1, 'B', 'J', [[0, 60], [100, 0]], 6, 12), E(2, 'J', 'P', [[100, 0], [200, 0]], 10, 15)]);
  const p = r.get(2)!;
  assert.equal(p.length, 2, 'two sources'); assert.deepEqual(p.map((g) => g.root).sort(), [0, 1]);
  const w = (root: number) => { const g = p.find((x) => x.root === root)!; return g.y1 - g.y0; };
  near(w(0), 0.8, 1e-9, 'A: 40 percent of the lanes'); near(w(1), 1.2, 1e-9, 'B: 60 percent');
  for (const g of p) {
    const src = g.root, sEnd = 100 * Math.hypot(1, 0.6);
    near(g.B, (src === 0 ? 10 : 12) / 15, 1e-9, 'B: the root\'s speed over the vessel\'s');
    near(g.A + g.B * 0, (r.get(src)![0]!.A + r.get(src)![0]!.B * sEnd), 1e-6, 'the arc runs on at the joint');
    for (const y of [g.y0 + 0.01, 0.5 * (g.y0 + g.y1), g.y1 - 0.01]) { const yr = g.c0 + g.c1 * y; assert.ok(yr >= -1 - 1e-9 && yr <= 1 + 1e-9, 'every lane maps inside its source'); }
  }
  // the inflow coming from -y (A, the 2D top) lies on the merged vessel's... side by the angles: either way the two never overlap and cover the lanes
  assert.equal(p[0]!.y0, -1); assert.equal(p[p.length - 1]!.y1, 1); near(p[0]!.y1, p[1]!.y0, 1e-12, 'no gap');
});

test('a merge then a split (SMV + SV, then the portal vein\'s two branches): each branch carries the sources whose lanes fall on its side, composed through both joints', () => {
  const r = buildRoutes([
    E(0, 'A', 'J', [[0, -60], [100, 0]], 5), E(1, 'B', 'J', [[0, 60], [100, 0]], 5), E(2, 'J', 'K', [[100, 0], [200, 0]], 10),
    E(3, 'K', 'L', [[200, 0], [280, -80]], 5), E(4, 'K', 'R', [[200, 0], [280, 80]], 5),
  ]);
  for (const k of [3, 4]) { const s = r.get(k)!; assert.equal(s.length, 1, `branch ${k}: one source (an even split puts the dividing streamline on the merge line)`); }
  assert.notEqual(r.get(3)![0]!.root, r.get(4)![0]!.root, 'each branch gets one of the two sources');
  // a 70/30 split puts some of the other source into the larger branch
  const r2 = buildRoutes([
    E(0, 'A', 'J', [[0, -60], [100, 0]], 5), E(1, 'B', 'J', [[0, 60], [100, 0]], 5), E(2, 'J', 'K', [[100, 0], [200, 0]], 10),
    E(3, 'K', 'L', [[200, 0], [280, -80]], 3), E(4, 'K', 'R', [[200, 0], [280, 80]], 7),
  ]);
  assert.equal(r2.get(4)!.length, 2, 'the bigger branch carries both sources'); assert.equal(r2.get(3)!.length, 1);
  // continuity at the second joint, lane by lane
  for (const k of [3, 4]) for (const g of r2.get(k)!) for (const t of [0.1, 0.5, 0.9]) {
    const y = g.y0 + t * (g.y1 - g.y0), yr = g.c0 + g.c1 * y;
    const trunk = r2.get(2)!.find((h) => h.root === g.root)!;
    const yt = (yr - trunk.c0) / trunk.c1;   // the trunk's lane holding that root lane
    assert.ok(yt >= trunk.y0 - 1e-9 && yt <= trunk.y1 + 1e-9, 'the particle was in the trunk, on that source\'s lanes');
    near(g.A, trunk.A + trunk.B * 100 - g.B * 0, 1e-6, 'arc');
  }
});

test('reversed flow: the joint is the vessel\'s start, its arc runs back, and a branch fed backwards still lines up', () => {
  // the trunk drawn J -> S but blood runs S -> J (fwd false); the branch takes it on from J
  const r = buildRoutes([E(0, 'J', 'S', [[100, 0], [0, 0]], 10, 10, false), E(1, 'J', 'U', [[100, 0], [200, 0]], 10, 5)]);
  const g = r.get(1)![0]!;
  assert.equal(g.root, 0); near(g.B, -10 / 5, 1e-9, 'the root runs backward along its own course');
  near(g.A, 0 + 1 * 0 - g.B * 0, 1e-9, 'the root leaves at its arc 0');
  near(Math.abs(g.c1), 1, 1e-9, 'straight on: the lanes run on one to one');
});

test('tidy: at most SEG_MAX segments, no slivers, the lanes covered from wall to wall with no gap; structure says which roots', () => {
  const many: Seg[] = Array.from({ length: 7 }, (_, i) => ({ y0: -1 + (2 * i) / 7, y1: -1 + (2 * (i + 1)) / 7 - 0.01, root: i, c0: 0, c1: 1, A: 0, B: 1 }));
  many.push({ y0: 0.5, y1: 0.505, root: 9, c0: 0, c1: 1, A: 0, B: 1 });
  const t = tidy(many, 99);
  assert.ok(t.length <= SEG_MAX); assert.equal(t[0]!.y0, -1); assert.equal(t[t.length - 1]!.y1, 1);
  for (let i = 1; i < t.length; i++) assert.equal(t[i - 1]!.y1, t[i]!.y0);
  assert.ok(!t.some((g) => g.root === 9), 'the sliver is gone');
  assert.equal(structure(tidy([], 5)), '5+', 'nothing: its own particles');
});

test('the swirl turns a whole number of times over a vessel (so every particle is back on its lane at a joint), at least one where it shows, none where it is faint', () => {
  assert.equal(turnsFor(0, 300, 20), 0); assert.equal(turnsFor(0.01, 300, 200), 0);
  assert.equal(turnsFor(0.2, 100, 50), 1, 'a short stenosis still turns once'); assert.equal(turnsFor(1, 300, 40), 8);
  for (const h of [0.1, 0.3, 0.77]) assert.ok(Number.isInteger(turnsFor(h, 250, 33)));
});

test('EVERY JOINT of the app\'s own figure (Mohammad, 20 Nov: "can we do everywhere please"), forward and with every other vessel reversed: each lane a vessel takes from a source is that source\'s particle, at the same lane and the same place on its stream, where it leaves the vessel upstream', () => {
  for (const flip of [false, true]) {
    const list: RouteEdge[] = [];
    ROUTE_INFO.forEach((inf, k) => { if (inf) { const fwd = !(flip && k % 3 === 1); list.push({ k, from: inf.from, to: inf.to, path: inf.path, len: inf.len, fwd, m: fwd ? 10 + (k % 4) : -(10 + (k % 4)), q: 1 + (k % 5) }); } });
    assert.ok(list.length > 40, `${list.length} vessels with a course`);
    for (const id of ['IVC_IS', 'IVC_IS_1']) assert.ok(list.some((e) => ROUTE_INFO[e.k]!.id === id), `${id}: the cava's stretches are routed too`);
    const byK = new Map(list.map((e) => [e.k, e]));
    const dropped = new Set<number>();
    const r = buildRoutes(list, dropped);
    assert.ok(dropped.size <= list.length / 10, `${dropped.size} vessels had to give a sliver of lanes to a neighbour`);
    let joints = 0;
    for (const e of list) {
      const s = r.get(e.k)!;
      assert.ok(s.length >= 1 && s.length <= SEG_MAX, e.k + ''); assert.equal(s[0]!.y0, -1); assert.equal(s[s.length - 1]!.y1, 1);
      for (const g of s) assert.ok(Number.isFinite(g.A) && Number.isFinite(g.B) && Number.isFinite(g.c0) && Number.isFinite(g.c1) && g.c1 !== 0, `finite ${e.k}`);
      const node = e.fwd ? e.from : e.to, s0 = e.fwd ? 0 : e.len;
      for (const g of s) {
        if (g.root === e.k || dropped.has(e.k)) continue;
        for (const t of [0.15, 0.5, 0.85]) {
          const y = g.y0 + t * (g.y1 - g.y0), yr = g.c0 + g.c1 * y, se = g.A + g.B * s0;
          if (Math.abs(yr) > 1) continue;   // (a lane a neighbour took over from a dropped sliver)
          const ok = list.some((p) => {
            if (p === e || (p.fwd ? p.to : p.from) !== node) return false;
            const sj = p.fwd ? p.len : 0;
            return r.get(p.k)!.some((h) => { if (h.root !== g.root) return false; const yp = (yr - h.c0) / h.c1; return yp >= h.y0 - 1e-6 && yp <= h.y1 + 1e-6 && Math.abs(h.A + h.B * sj - se) < 1e-6 * (1 + Math.abs(se)); });
          });
          assert.ok(ok, `${ROUTE_INFO[e.k]!.id} lane ${y.toFixed(2)}: its particle of ${ROUTE_INFO[g.root]!.id} is where it leaves a vessel upstream${flip ? ' (some reversed)' : ''}`);
          joints++;
        }
      }
      assert.ok(byK.get(e.k));
    }
    assert.ok(joints > 30, `${joints} lanes checked across joints`);
  }
});

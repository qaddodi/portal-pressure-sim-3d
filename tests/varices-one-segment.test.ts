// Mohammad, 22 Nov: the varices as ONE segment, coronary vein to azygos, "opens and closes as one", in the Anatomy and in the Circuit; the columns drawn as the gastrorenal shunt's braid (mock B2, variation V2: the strands open one after another).
// The root: the engine cuts one collateral route in two edges (C1a, C1b: one `code`), and the drawing treated them as two vessels (two collaterals were never paired, so a round cap and a width step stood at the station, and each opened on its own diameter).
// Node only: the real network. Run: node --test tests/varices-one-segment.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID, SEGMENT_OF, collateralOpen, recruitFrac, sameSegment, type PresenceFrame } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, strandOpen, BANDED_CORD } from '../src/scene/vessels/shape.ts';
import { SMOOTH } from '../src/scene/vessels/smooth-joins.ts';
import { CIRCUIT_MATES } from '../src/scene/circuit/mates.ts';
import { WEAVE, weave } from '../src/scene/vessels/coil.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';

const edges = EDGES as { id: string; kind: string; code?: string; dMax?: number }[];
const idx = (id: string) => edges.findIndex((e) => e.id === id);
const frame = (D: Record<string, number>, Q: Record<string, number> = {}): PresenceFrame => {
  const d = new Float64Array(edges.length), q = new Float64Array(edges.length);
  for (const [k, v] of Object.entries(D)) d[idx(k)] = v;
  for (const [k, v] of Object.entries(Q)) q[idx(k)] = v;
  return { D: d, Q: q };
};

test('the engine\'s one route code makes the coronary vein and the varices\' drain to the azygos one segment, and nothing else is', () => {
  assert.deepEqual(SEGMENT_OF.get('C1a'), ['C1a', 'C1b']);
  assert.deepEqual(SEGMENT_OF.get('C1b'), ['C1a', 'C1b']);
  assert.deepEqual([...SEGMENT_OF.keys()].sort(), ['C1a', 'C1b']);
  assert.ok(sameSegment('C1a', 'C1b') && !sameSegment('C1a', 'C2') && !sameSegment('C1a', 'C1a'));
});

test('a segment opens and closes as one: whichever half the engine has grown opens both, and both are shut together', () => {
  const lo = (id: string) => edges[idx(id)]!, dmax = lo('C1a').dMax!;
  const shut = frame({ C1a: 0.1, C1b: 0.1 }), a = frame({ C1a: dmax, C1b: 0.1 }), b = frame({ C1a: 0.1, C1b: dmax });
  assert.equal(collateralOpen('C1a', shut), false);
  assert.equal(collateralOpen('C1b', shut), false);
  for (const f of [a, b]) {
    assert.equal(collateralOpen('C1a', f), true);
    assert.equal(collateralOpen('C1b', f), true);
    assert.equal(recruitFrac('C1a', f), recruitFrac('C1b', f), 'one recruitment for both halves');
  }
  // (flow opens it too, as it does any collateral, and for both halves)
  const q = frame({ C1a: 0.1, C1b: 0.1 }, { C1b: 5 });
  assert.equal(collateralOpen('C1a', q), true);
  // (a collateral of another route is its own: C2 does not open C1)
  assert.equal(collateralOpen('C1a', frame({ C2: edges[idx('C2')]!.dMax! })), false);
});

test('the two halves meet as one vessel at their station: no round cap, live widths eased to one, on the body and on the Circuit\'s map', () => {
  setSmoothJoins(true);
  const a = SMOOTH.get('C1a')!, b = SMOOTH.get('C1b')!;
  assert.equal(a.mate[1], 'C1b', 'C1a carries on into C1b');
  assert.equal(b.mate[0], 'C1a', 'and C1b comes from C1a');
  assert.equal(a.joined[1], true, 'no cap on C1a at the station');
  assert.equal(b.joined[0], true, 'no cap on C1b at the station');
  assert.equal(CIRCUIT_MATES.get('C1a')![1]?.id, 'C1b', 'the map carries C1a on into C1b');
  assert.equal(CIRCUIT_MATES.get('C1b')![0]?.id, 'C1a');
  // (the other ends are not mated: the coronary vein is a vein, the azygos is one, they meet them as they did)
  assert.equal(a.mate[0] === 'C1b' || b.mate[1] === 'C1a', false);
});

test('the varices\' strands are woven: they cross over and under each other, in depth as well as across, and gather again into one vein at both ends', () => {
  setSmoothJoins(true);
  const v = NETWORK_BY_ID.get('C1a')!, cs = coursesOf(v, { ...REST, strandsOn: true }).filter((c) => c.radius > 0);
  assert.equal(cs.length, 3);
  const n = cs[0]!.pts.length;
  // (laterally ordered strands change order along the course: they cross; and where two of them cross they are a tube apart in depth, one over the other)
  const order = (i: number) => cs.map((c, k) => [k, c.pts[i]![0]] as const).sort((p, q) => p[1] - q[1]).map((p) => p[0]).join('');
  const orders = new Set<string>(); for (let i = Math.round(n * 0.3); i < Math.round(n * 0.7); i++) orders.add(order(i));
  assert.ok(orders.size >= 3, `the lateral order of the strands changes along the weave (${[...orders].join(' ')})`);
  let over = 0;
  for (let i = 1; i < n; i++) for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const A = cs[a]!, B = cs[b]!, d0 = A.pts[i - 1]![0] - B.pts[i - 1]![0], d1 = A.pts[i]![0] - B.pts[i]![0];
    if (d0 * d1 < 0 && Math.abs(A.pts[i]![1] - B.pts[i]![1]) < 0.02) { over++; assert.ok(Math.abs(A.pts[i]![2] - B.pts[i]![2]) > A.radius * 0.8, 'at a crossing one strand is over the other, not through it'); }
  }
  assert.ok(over >= 3, `strands cross at least three times (${over})`);
  // (the winding is eased to nothing at both ends: the three strands start together and end together)
  for (const i of [0, n - 1]) for (const c of cs) for (let k = 0; k < 3; k++) assert.ok(Math.abs(c.pts[i]![k]! - cs[0]!.pts[i]![k]!) < 1e-6, 'the strands gather into one vein at the ends');
});

test('weave: the offset across and in depth are one winding (a quarter turn apart), eased to nothing at both ends', () => {
  const base: [number, number][] = Array.from({ length: 61 }, (_, i) => [0, -i * 5]);
  const w = weave(base, 9, 1, 0, 0.2);
  assert.ok(Math.abs(w.pts[0]![0]) < 1e-9 && Math.abs(w.pts[60]![0]) < 1e-9 && Math.abs(w.dz[0]!) < 1e-9 && Math.abs(w.dz[60]!) < 1e-9);
  for (let i = 0; i <= 60; i++) assert.ok(Math.hypot(w.pts[i]![0], w.dz[i]!) <= 9 + 1e-9, 'never more than the reach round the axis');
  assert.ok(Math.max(...w.pts.map((p) => Math.abs(p[0]))) > 8, 'the winding reaches nearly the full reach');
  assert.ok(WEAVE.C1a!.turns > 0.5 && WEAVE.C1a!.turns < 1.5, 'less than two full turns (Mohammad: less spirally than the first mock)');
});

test('the strands open one after another as the varix grows (V2), the one the bands close first the last to open, and a full varix has all of them open', () => {
  const n = 3;
  for (let i = 0; i < n; i++) { assert.equal(strandOpen(i, n, 0.55), 0, 'a resting vein: every strand shut'); assert.equal(strandOpen(i, n, 1), 1, 'a full varix: all open'); }
  for (let s = 0.55; s < 1; s += 0.05) for (let i = 0; i + 1 < n; i++) assert.ok(strandOpen(i, n, s) <= strandOpen(i + 1, n, s) + 1e-12, 'strand 0 is the last to open');
  const mid = [0, 1, 2].map((i) => strandOpen(i, n, 0.75));
  assert.ok(mid[2]! > mid[1]! && mid[1]! > mid[0]!, `half way up they are at three different stages (${mid.map((m) => m.toFixed(2)).join(' ')})`);
  // (in the drawn tubes: a half grown varix has its strands at three widths, none thinner than a cord)
  setSmoothJoins(true);
  const v = NETWORK_BY_ID.get('C1a')!, r = coursesOf(v, { ...REST, spr: 0.75, strandsOn: true }).filter((c) => c.radius > 0).map((c) => c.radius);
  assert.equal(r.length, 3);
  assert.ok(r[2]! > r[1]! && r[1]! > r[0]!, `three widths (${r.map((x) => x.toFixed(4)).join(' ')})`);
  const full = coursesOf(v, { ...REST, strandsOn: true }).filter((c) => c.radius > 0).map((c) => c.radius);
  for (let i = 0; i < 3; i++) assert.ok(r[i]! >= full[i]! * BANDED_CORD - 1e-12, 'never thinner than a cord');
  assert.ok(full[0]! > 0 && Math.abs(full[0]! - full[1]!) < full[0]! * 0.3, 'at rest the strands are about one width');
});

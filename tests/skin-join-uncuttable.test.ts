// J6, J7, J8 and the bake's speed (28 Nov review): the planner's three honest-reporting rules, each pinned on synthetic tubes (no scene) and, for the cache, on the real network.
//  J7  what joinUncuttable merges is decided by the TYPED failure (SkinBuildError.reason and .vesselId), never by the words of its message.
//  J6  a seam cut under the clearance slack (CLEAR_SLACK) says so on its cut (`SkinCut.slack`), and a seam that kept the full clearance carries none.
//  J8  a bounded planner loop that runs out of rounds is named in `SkinPlans.unsettled`, never silent; and settleRounds (src/scene/settle.ts) says whether a loop settled.
//  J14 judging a junction once and only the junction a join makes anew (the bake restarted every cut search after each join) gives the very same plans.
// Run: node --test tests/skin-join-uncuttable.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { CLEAR_SLACK, MAX_JOINS, MERGE_PASSES, chooseCuts, joinUncuttable, planSkins, type ArmTube, type HullOk } from '../src/scene/vessels/skin/cuts.ts';
import { SkinBuildError, type SkinArm, type SkinJunction, type Vec3 } from '../src/scene/vessels/skin/types.ts';
import { TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';
import { settleRounds } from '../src/scene/settle.ts';

const R = 0.02;
/** A straight tube from `p0` along unit `d`, `len` long, `tubular` segments, ring k's vertex j at position index k * (RADIAL + 1) + j (buildTubes' layout). */
function tube(p0: Vec3, d: Vec3, len: number, tubular: number): ArmTube {
  const a: Vec3 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const n1: Vec3 = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]], l1 = Math.hypot(...n1);
  const u: Vec3 = [n1[0] / l1, n1[1] / l1, n1[2] / l1], v: Vec3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const pos: number[] = [];
  for (let k = 0; k <= tubular; k++) for (let j = 0; j <= TUBE_RADIAL; j++) {
    const t = (len * k) / tubular, th = (2 * Math.PI * j) / TUBE_RADIAL, c = Math.cos(th) * R, s = Math.sin(th) * R;
    for (let q = 0; q < 3; q++) pos.push(p0[q]! + d[q]! * t + u[q]! * c + v[q]! * s);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return { geometry: g, tubular };
}
const arm = (vesselId: string, end: 0 | 1, extra: Partial<SkinArm> = {}): SkinArm => ({ vesselId, end, courseIndex: 0, dataIndex: 0, lensIndex: 0, baseD: 1, widthKind: 0, restR: R, ...extra });

/**
 * A vein cut into `n + 1` pieces H0..Hn in series along x, a node Ni between H(i) and H(i+1), the pieces `gap` long (in x) between neighbouring nodes: junction Ni has the two pieces that meet there as arms. A piece is an arm at TWO
 * nodes (its start and its end), the shape the cava's pieces have.
 */
function chain(n: number, gap = 0.4) {
  const tubes = new Map<string, ArmTube>();
  for (let i = 0; i <= n; i++) tubes.set(`H${i}`, tube([(i - 1) * gap, 0, 0], [1, 0, 0], gap, 40));
  const js: SkinJunction[] = [];
  for (let i = 0; i < n; i++) js.push({ node: `N${i}`, J: [i * gap, 0, 0], arms: [arm(`H${i}`, 1), arm(`H${i + 1}`, 0)] });
  return { tubes, js };
}
/** A hull whose verdict for junction `j` is `throwFor(j)`'s error (if any), the way chooseCuts meets the typed failures of the cut search. */
const hullThrowing = (throwFor: (j: SkinJunction) => SkinBuildError | null) => (j: SkinJunction): HullOk => {
  const ok: HullOk = () => { const e = throwFor(j); if (e) throw e; return true; };
  return ok;
};
/** The vessel a junction shares with another one, as a vessel it cannot be cut on (the junction's first arm that is also an arm of another junction in `all`). */
const sharedWith = (j: SkinJunction, all: readonly SkinJunction[]): string | undefined => j.arms.find((a) => all.some((q) => q !== j && q.arms.some((b) => b.vesselId === a.vesselId)))?.vesselId;

test('J7: the vessel to merge on is read from the typed failure, so rewording the message does not stop the merge', () => {
  const { tubes, js } = chain(2);
  const reworded = hullThrowing((j) => { const v = sharedWith(j, js); return v && j.node === 'N0' ? new SkinBuildError(j.node, 'words nobody matches anywhere', { reason: 'no-ring', vesselId: v }) : null; });
  const r = joinUncuttable(js, tubes, reworded);
  assert.equal(r.js.length, 1, 'N0 and N1 are one skin although the message says nothing of a ring');
  assert.match(r.js[0]!.node, /N0/);
  assert.match(r.js[0]!.node, /N1/);
  assert.deepEqual(r.carry.get(r.js[0]!.node), ['H1'], 'the shared piece is hidden whole');
});

test('J7: the old words without the typed reason merge nothing: the message is for people, not a contract', () => {
  const { tubes, js } = chain(2);
  const words = hullThrowing((j) => { const v = sharedWith(j, js); return v && j.node === 'N0' ? new SkinBuildError(j.node, `${v} has no ring that clears the blend within 85 % of its length`) : null; });
  const r = joinUncuttable(js, tubes, words);
  assert.deepEqual(r.js.map((j) => j.node), ['N0', 'N1'], 'untyped: not merged');
});

test('J7: a failure of the cut search itself is typed (reason no-ring, the vessel with no ring)', () => {
  // an arm whose tube has too few rings to clear the blend: the search names it
  const { tubes, js } = chain(1, 0.05);
  const j: SkinJunction = { ...js[0]!, arms: [...js[0]!.arms, arm('G', 0, { grow: true })] };
  tubes.set('G', tube([0, 0, 0], [0, 1, 0], 0.01, 2));
  let err: unknown = null;
  try { chooseCuts(j, tubes, () => true); } catch (e) { err = e; }
  assert.ok(err instanceof SkinBuildError, 'it fails');
  assert.equal((err as SkinBuildError).reason, 'no-ring');
  assert.ok(j.arms.some((a) => a.vesselId === (err as SkinBuildError).vesselId), 'and names the arm');
});

test('J6: a seam cut under the clearance slack records it on its cut; a seam that kept the full clearance carries none', () => {
  // a Y: the trunk H0/H1 along x and a branch G leaving at 40 degrees; scale the clearance asked until the full one fails on some arm and a slack share still holds
  const L = 0.4, tubes = new Map<string, ArmTube>([
    ['H0', tube([-L, 0, 0], [1, 0, 0], L, 40)], ['H1', tube([0, 0, 0], [1, 0, 0], L, 40)], ['G', tube([0, 0, 0], [Math.cos(0.7), 0, Math.sin(0.7)], L, 40)],
  ]);
  const j: SkinJunction = { node: 'Y', J: [0, 0, 0], arms: [arm('H0', 1), arm('H1', 0), arm('G', 0, { grow: true })] };
  const seen = new Set<number>();
  let withSlack = 0, without = 0;
  for (let scale = 0.6; scale <= 200; scale *= 1.02) {
    let cuts;
    try { cuts = chooseCuts(j, tubes, () => true, { k: 1 * scale, r: 0.5 * scale }); } catch { continue; }
    for (const c of cuts) {
      if (c.slack === undefined) { without++; continue; }
      withSlack++; seen.add(c.slack);
      assert.ok((CLEAR_SLACK as readonly number[]).includes(c.slack), `slack ${c.slack} is one of ${CLEAR_SLACK.join(', ')}`);
    }
  }
  assert.ok(without > 0, 'at a small clearance every seam keeps it in full');
  assert.ok(withSlack > 0, 'as the clearance asked grows, some seams stand under slack and say so');
  assert.ok(seen.size > 0);
});

test('J8: planSkins names a join that is still needed after MAX_JOINS joins, instead of stopping quietly', () => {
  const { tubes, js } = chain(MAX_JOINS + 2);
  // every junction fails on the vessel it shares with a neighbour, so every join is needed: MAX_JOINS + 1 of them for MAX_JOINS + 2 junctions
  const need = (all: readonly SkinJunction[]) => hullThrowing((j) => { const v = sharedWith(j, all); return v ? new SkinBuildError(j.node, 'no ring', { reason: 'no-ring', vesselId: v }) : null; });
  const r = joinUncuttable(js, tubes, need(js));
  assert.ok(r.unsettled.length > 0, 'named');
  assert.match(r.unsettled[0]!, /join/);
  // ...and the same chain with room for every join settles with nothing named
  const short = chain(MAX_JOINS);
  const ok = joinUncuttable(short.js, short.tubes, need(short.js));
  assert.deepEqual(ok.unsettled, []);
});

test('J8: the real planner settles: no merge pass or join ran out on the cluster of a real vein (MERGE_PASSES, MAX_JOINS are not the limit)', () => {
  const { tubes, js } = chain(3);
  const res = planSkins(js, tubes, () => () => true);
  assert.deepEqual(res.unsettled, []);
  assert.ok(MERGE_PASSES >= 1 && MAX_JOINS >= 1);
});

test('J8: settleRounds says whether a loop settled: a round that changed nothing, or running out', () => {
  assert.equal(settleRounds(5, (r) => r < 2), true);
  assert.equal(settleRounds(5, () => true), false);
  assert.equal(settleRounds(0, () => true), false, 'no rounds: nothing proved');
});

test('J14: judging each junction once (the cache) gives the very same plans as judging all again each round, with fewer cut searches', () => {
  const { tubes, js: linked } = chain(5);
  // three junctions that need nothing come FIRST in the list: without the cache each is judged again in every round (one per join and one more)
  const calm: SkinJunction[] = [0, 1, 2].map((i) => ({ node: `P${i}`, J: [0, 1 + i, 0], arms: [arm(`Q${2 * i}`, 1), arm(`Q${2 * i + 1}`, 0)] }));
  for (let i = 0; i < 6; i++) tubes.set(`Q${i}`, tube([i, 1, 0], [1, 0, 0], 0.4, 40));
  const js = [...calm, ...linked];
  const need = (all: readonly SkinJunction[]) => {
    let calls = 0;
    const hull = hullThrowing((j) => { calls++; const v = sharedWith(j, all); return v && j.node.split('+').length < 3 ? new SkinBuildError(j.node, 'x', { reason: 'no-ring', vesselId: v }) : null; });
    return { hull, calls: () => calls };
  };
  const a = need(js), b = need(js);
  const cached = joinUncuttable(js, tubes, a.hull), plain = joinUncuttable(js, tubes, b.hull, { cache: false });
  assert.deepEqual(cached.js.map((j) => [j.node, j.J, j.arms.map((x) => `${x.vesselId}:${x.end}`)]), plain.js.map((j) => [j.node, j.J, j.arms.map((x) => `${x.vesselId}:${x.end}`)]));
  assert.deepEqual([...cached.carry], [...plain.carry]);
  assert.deepEqual(cached.unsettled, plain.unsettled);
  assert.ok(a.calls() < b.calls(), `cached ${a.calls()} cut searches against ${b.calls()} without`);
});

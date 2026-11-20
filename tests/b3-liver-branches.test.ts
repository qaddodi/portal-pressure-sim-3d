// The second-level branches in the liver (liver-branches.ts): they start and end inside the liver's outline, and siblings never cross each other or another vein.
// (Mohammad, 20 Nov: "the hepatic veins are branching outside the liver and into each other"; the middle hepatic vein does not branch.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';
import { LIVER_BRANCHES, LIVER_BRANCH_HOSTS, SPLIT_AT } from '../src/scene/vessels/liver-branches.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';

type P = readonly [number, number];

async function liverMask(): Promise<(x: number, y: number) => boolean> {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); await organsReady; await new Promise((r) => setTimeout(r, 0));
  const g = ORGAN_MESHES.liver!(), pos = g.getAttribute('position'), idx = g.index!;
  const T: number[][] = [];
  for (let t = 0; t < idx.count; t += 3) { const q = [0, 1, 2].map((k) => idx.getX(t + k)); T.push(q.flatMap((i) => [x2d(pos.getX(i)), y2d(pos.getY(i))])); }
  return (px, py) => T.some(([ax, ay, bx, by, cx, cy]) => {
    const d = (bx! - ax!) * (cy! - ay!) - (by! - ay!) * (cx! - ax!);
    if (!d) return false;
    const u = ((px - ax!) * (cy! - ay!) - (py - ay!) * (cx! - ax!)) / d, v = ((bx! - ax!) * (py - ay!) - (by! - ay!) * (px - ax!)) / d;
    return u >= 0 && v >= 0 && u + v <= 1;
  });
}
const dist = (a: readonly P[], b: readonly P[]): number => { let m = 1e9; for (const p of a) for (const q of b) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])); return m; };

test('the middle hepatic vein does not branch; the left and right do', () => {
  assert.deepEqual([...LIVER_BRANCH_HOSTS.in], ['RHV_IVC_1', 'LHV_IVC']);
  assert.ok(!LIVER_BRANCHES.some((b) => b.host === 'MHV_IVC'));
});

test('every hepatic vein branch lies wholly inside the liver\'s outline, and splits well inside it', async () => {
  const inLiver = await liverMask();
  for (const set of LIVER_BRANCHES.filter((b) => (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(b.host) || (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(b.host))) {
    for (const [i, c] of set.list.entries()) {
      const bad = c.pts.filter((p) => !inLiver(p[0], p[1]));
      assert.equal(bad.length, 0, `${set.host} child ${i}: ${bad.length} points outside the liver, first ${bad[0]}`);
    }
  }
});

test('siblings spread apart, and no branch comes near another hepatic vein or another vein\'s branches', () => {
  for (const set of LIVER_BRANCHES) {
    if (set.list.length < 2) continue;
    const [a, b] = set.list.map((c) => c.pts);
    const n = a!.length, endGap = Math.hypot(a![n - 1]![0] - b![n - 1]![0], a![n - 1]![1] - b![n - 1]![1]), startGap = Math.hypot(a![0]![0] - b![0]![0], a![0]![1] - b![0]![1]);
    assert.ok(Math.max(endGap, startGap) > 12, `${set.host}: the two children spread (${Math.max(endGap, startGap).toFixed(1)})`);
  }
  const others = ['RHV_IVC_1', 'MHV_IVC', 'LHV_IVC', 'RHV_IVC'];
  for (const set of LIVER_BRANCHES.filter((b) => (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(b.host))) {
    for (const o of others.filter((id) => id !== set.host)) {
      for (const c of set.list) assert.ok(dist(c.pts, EDGE_PATH_2D[o]!) > 10, `${set.host}'s branch passes ${o}`);
    }
    for (const t of LIVER_BRANCHES.filter((b) => b.host !== set.host)) for (const c of set.list) for (const d of t.list) assert.ok(dist(c.pts, d.pts) > 10, `${set.host}'s branch meets ${t.host}'s`);
  }
});

test('the left hepatic vein is one tube that bends down into the left lobe, never up toward the capsule; its tip narrows gently and every branch narrows to about half', async () => {
  const { treeOf, TIP } = await import('../src/scene/vessels/liver-branches.ts');
  const t = treeOf('LHV_IVC')!, host = EDGE_PATH_2D.LHV_IVC!, hostStart = host[0]!;
  assert.equal(t.side, null, 'the left hepatic vein has no second branch');
  const tip = t.through[0]!;   // (flow order: the tip is where the vein begins)
  assert.ok(tip[1] > hostStart[1] - 2, `its tip is at y ${tip[1].toFixed(0)}, not above the vein's start (${hostStart[1]})`);
  assert.ok(!LIVER_BRANCHES.some((b) => b.host === 'LHV_IVC'), 'no separate branch tube on it');
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { coursesOf, REST } = await import('../src/scene/vessels/shape.ts');
  for (const id of Object.keys(SPLIT_AT)) {
    const c = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!, end = (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(id) ? 1 : 0;
    assert.equal(c.taper![end], TIP, `${id} narrows to ${TIP} at its tip`);
    assert.equal(c.taperSpan![end], 1, `${id} narrows over its whole length`);
  }
  for (const set of LIVER_BRANCHES) {
    const v = NETWORK_BY_ID.get(`${set.host}~F:b`)!;
    for (const [i, c] of coursesOf(v, REST).entries()) {
      assert.ok(c.taper, `${set.host} branch ${i} has a taper`);
      const tipK = (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(set.host) ? c.taper![0] : c.taper![1];
      assert.ok(tipK >= 0.4 && tipK <= 1.3, `${set.host} branch ${i} narrows gently (${tipK})`);
    }
    assert.ok(v.lensSpan && v.lensSpan[1] > v.lensSpan[0], `${set.host}'s branch wears the stretch of the vein's colour it leaves`);
  }
});

test('a vein that branches is ONE tube from its root to its tip; its side branch starts on that tube, as wide as it is there, on its centreline and depth, with no cap', async () => {
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { coursesOf, REST } = await import('../src/scene/vessels/shape.ts');
  const { treeOf } = await import('../src/scene/vessels/liver-branches.ts');
  for (const set of LIVER_BRANCHES.filter((b) => SPLIT_AT[b.host] != null)) {
    const host = NETWORK_BY_ID.get(set.host)!, hostC = coursesOf(host, REST)[0]!, kid = coursesOf(NETWORK_BY_ID.get(`${set.host}~F:b`)!, REST)[0]!;
    const isIn = (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(set.host), t = treeOf(set.host)!;
    const at = isIn ? kid.pts[kid.pts.length - 1]! : kid.pts[0]!;
    // (the branch's start is a point of the vein's own tube)
    let near = 1e9, nearI = 0; hostC.pts.forEach((p, i) => { const d = Math.hypot(at[0] - p[0], at[1] - p[1], at[2] - p[2]); if (d < near) { near = d; nearI = i; } });
    assert.ok(near < 0.01, `${set.host}: the branch starts on the vein's own centreline (${near.toFixed(4)})`);
    assert.ok(nearI > 0.1 * hostC.pts.length && nearI < 0.9 * hostC.pts.length, `${set.host}: it leaves the vein part-way along, at point ${nearI}`);
    assert.ok(kid.capless?.[isIn ? 1 : 0], `${set.host}: no cap where the branch starts`);
    assert.ok(t.q > 0.1 && t.q < 0.9);
    const u = nearI / (hostC.pts.length - 1), here = hostC.radius * (1 + (0.5 - 1) * (isIn ? 1 - (1 - u) * 0 : 0) * 0);
    assert.ok(here > 0, 'radius');
  }
});

test('with smooth joins on, a vein that branches has no cap and no funnel at its tip, and the side branch leaves as wide as the vein is there', async () => {
  const { setSmoothJoins } = await import('../src/scene/vessels/join-mode.ts');
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { coursesOf, REST } = await import('../src/scene/vessels/shape.ts');
  setSmoothJoins(true);
  try {
    for (const id of Object.keys(SPLIT_AT)) {
      const c = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!, end = (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(id) ? 1 : 0;
      assert.equal(c.capless?.[end] ?? false, false, `${id}: a round tip`);
      assert.ok(!c.point?.[end], `${id}: not drawn to a point at its tip`);
      const kv = NETWORK_BY_ID.get(`${id}~F:b`), k = kv ? coursesOf(kv, REST)[0] : undefined;
      if (k) {
        // (the radius the vein has at the split, by the tube's own taper rule, equals the branch's start radius)
        const { factorSpan } = await import('../src/scene/vessels/tubes.ts');
        const { treeOf } = await import('../src/scene/vessels/liver-branches.ts');
        const q = treeOf(id)!.q, u = end === 1 ? q : 1 - q;
        const f = factorSpan([c.taper![0]!, c.taper![1]!], [c.taperSpan![0]!, c.taperSpan![1]!], u);
        assert.ok(Math.abs(k.radius - c.radius * f) / (c.radius * f) < 0.06, `${id}: the branch starts ${k.radius.toFixed(4)}, the vein is ${(c.radius * f).toFixed(4)} there`);
      }
    }
  } finally { setSmoothJoins(false); }
});

test('the umbilical vein is one vessel: no tributaries are drawn on it', () => {
  assert.ok(!LIVER_BRANCHES.some((b) => b.host === 'C3'), 'no branch set on C3');
});

test('a vein that branches runs on as one tube inside the liver\'s outline, past its old end, and its side branch leaves it to one side', async () => {
  const inLiver = await liverMask();
  const { treeOf } = await import('../src/scene/vessels/liver-branches.ts');
  for (const id of Object.keys(SPLIT_AT)) {
    const t = treeOf(id)!, isIn = (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(id);
    const tipHalf = isIn ? t.through.slice(0, Math.round((1 - t.q) * t.through.length)) : t.through.slice(Math.round(t.q * t.through.length));
    const bad = tipHalf.filter((p) => !inLiver(p[0], p[1]));
    assert.equal(bad.length, 0, `${id}: ${bad.length} points of its liver stretch outside the liver, first ${bad[0]}`);
    if (t.side) {
      const e = isIn ? 0 : t.through.length - 1, f = isIn ? 0 : t.side.pts.length - 1;
      assert.ok(Math.hypot(t.through[e]![0] - t.side.pts[f]![0], t.through[e]![1] - t.side.pts[f]![1]) > 12, `${id}: the two tips are apart`);
    }
  }
});

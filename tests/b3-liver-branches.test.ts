// The second-level branches in the liver (liver-branches.ts): they start and end inside the liver's outline, and siblings never cross each other or another vein.
// (Mohammad, 20 Nov: "the hepatic veins are branching outside the liver and into each other"; the middle hepatic vein does not branch.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';
import { LIVER_BRANCHES, LIVER_BRANCH_HOSTS } from '../src/scene/vessels/liver-branches.ts';
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

test('the left hepatic vein branches downward into the left lobe (both children below its line, away from the capsule); every branch narrows toward its tip', async () => {
  const lhv = LIVER_BRANCHES.find((b) => b.host === 'LHV_IVC')!;
  const host = EDGE_PATH_2D.LHV_IVC!, hostStart = host[0]!;
  for (const c of lhv.list) {
    const tip = c.pts[0]!;   // (flow order: a hepatic vein's branch runs from its tip toward the host)
    assert.ok(tip[1] > hostStart[1] - 2, `a child ends at y ${tip[1].toFixed(0)}, not above the vein's start (${hostStart[1]})`);
  }
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { coursesOf, REST } = await import('../src/scene/vessels/shape.ts');
  for (const set of LIVER_BRANCHES) {
    const v = NETWORK_BY_ID.get(`${set.host}~F:b`)!;
    for (const [i, c] of coursesOf(v, REST).entries()) {
      assert.ok(c.taper, `${set.host} child ${i} has a taper`);
      const tip = (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(set.host) ? c.taper![0] : c.taper![1];
      assert.ok(tip >= 0.4 && tip <= 0.6, `${set.host} child ${i} narrows gently (to about half) to ${tip} at its tip`);
    }
    assert.ok(v.lensSpan && v.lensSpan[1] > v.lensSpan[0], `${set.host}'s children wear the stretch of the host's colour they leave`);
  }
});

test('a vein that branches is drawn only up to its split, and each child leaves it as wide as it is, on its own centreline and depth (one shape, no tubes laid over one another)', async () => {
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { coursesOf, REST } = await import('../src/scene/vessels/shape.ts');
  const { SPLIT_AT } = await import('../src/scene/vessels/liver-branches.ts');
  for (const set of LIVER_BRANCHES.filter((b) => SPLIT_AT[b.host] != null)) {
    const host = NETWORK_BY_ID.get(set.host)!, hostC = coursesOf(host, REST)[0]!, kids = coursesOf(NETWORK_BY_ID.get(`${set.host}~F:b`)!, REST);
    const isIn = (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(set.host);
    const hostEnd = isIn ? hostC.pts[0]! : hostC.pts[hostC.pts.length - 1]!;   // (the cut end: where the children leave it)
    for (const [i, k] of kids.entries()) {
      const at = isIn ? k.pts[k.pts.length - 1]! : k.pts[0]!;
      assert.ok(Math.hypot(at[0] - hostEnd[0], at[1] - hostEnd[1], at[2] - hostEnd[2]) < 0.01, `${set.host} child ${i} starts on the host's cut end`);
      assert.ok(Math.abs(k.radius - hostC.radius) / hostC.radius < 0.15, `${set.host} child ${i} starts as wide as the host (${k.radius.toFixed(4)} against ${hostC.radius.toFixed(4)})`);
      assert.ok(k.taper && Math.min(...k.taper) >= 0.4 && Math.min(...k.taper) <= 0.6, `${set.host} child ${i} narrows gently to about half at its tip`);
      assert.ok(k.capless?.some(Boolean), `${set.host} child ${i} has no cap at the join`);
    }
  }
});

test('the umbilical vein is one vessel: no tributaries are drawn on it', () => {
  assert.ok(!LIVER_BRANCHES.some((b) => b.host === 'C3'), 'no branch set on C3');
});

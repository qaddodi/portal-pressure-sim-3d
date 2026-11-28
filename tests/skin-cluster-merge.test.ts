// A cluster of junctions down ONE vein (the left portal vein's umbilical and Meso-Rex landings, LPV_U and LPV_X, a piece apart; any mid-vein cluster the engine's junction table makes) is one skin: the vein's two outer pieces are the
// run-on pair, the piece between them is hidden whole, and the growers (collaterals, shunts) land on it. Two permanent arms are a skin when a growing arm lands on them (inventory.ts findSkinJunctions says so of one node); the merge used
// to refuse it ("2 permanent arms"), and even allowed it had no plain trunk for the closed state (plain.ts wanted three arms), so a skin that hides a vessel whole had nothing to show of the vein while the growers were closed.
// The general rule is pinned twice: on synthetic tubes (the planner and the plain trunk) and on the real network (every merged skin that hides a vessel and carries growers has a plain trunk of the arms that stay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Group, type Object3D } from 'three';
import { planSkins, MIN_RUN_ON_ARMS, type ArmTube } from '../src/scene/vessels/skin/cuts.ts';
import { PLAIN_MIN_ARMS, partOf } from '../src/scene/vessels/skin/plain.ts';
import { type SkinArm, type SkinJunction, type Vec3 } from '../src/scene/vessels/skin/types.ts';
import { TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { foldedTriangles } from '../src/scene/vessels/skin/mesh.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

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

/** A vein H0, H1, H2 in series along x (H1 a short piece, five radii, between the two nodes N1 and N2), a grower G1 leaving N1 and G2 leaving N2, each leaning away from the piece between (as the left portal vein's umbilical and Meso-Rex ends do). */
function cluster() {
  const L = 5 * R, lean = 0.5, s = Math.sqrt(1 - lean * lean);
  const tubes = new Map<string, ArmTube>([
    ['H0', tube([-0.4, 0, 0], [1, 0, 0], 0.4, 80)], ['H1', tube([0, 0, 0], [1, 0, 0], L, Math.round(L / 0.005))], ['H2', tube([L, 0, 0], [1, 0, 0], 0.4, 80)],
    ['G1', tube([0, 0, 0], [-lean, 0, s], 0.2, 40)], ['G2', tube([L, 0, 0], [lean, 0, -s], 0.2, 40)],
  ]);
  const js = (growers: boolean): SkinJunction[] => [
    { node: 'N1', J: [0, 0, 0], arms: [arm('H0', 1), arm('H1', 0), ...(growers ? [arm('G1', 0, { grow: true })] : [])] },
    { node: 'N2', J: [L, 0, 0], arms: [arm('H1', 1), arm('H2', 0), ...(growers ? [arm('G2', 0, { grow: true })] : [])] },
  ];
  return { js, tubes };
}

test('a cluster of junctions down one vein merges to the vein\'s two outer pieces and the growers, the piece between hidden', () => {
  const { js, tubes } = cluster();
  const { plans, failures } = planSkins(js(true), tubes, () => () => true);
  assert.deepEqual(failures, [], `no failure: ${failures.map((f) => f.message).join('; ')}`);
  assert.equal(plans.length, 1, 'one skin');
  const p = plans[0]!;
  assert.deepEqual(p.merged, ['N1', 'N2']);
  assert.deepEqual(p.hidden, ['H1'], 'the piece between the nodes is the skin\'s alone');
  assert.deepEqual(p.junction.arms.filter((a) => !a.grow).map((a) => a.vesselId).sort(), ['H0', 'H2'], 'the vein\'s outer pieces stay as arms');
  assert.deepEqual(p.junction.arms.filter((a) => a.grow).map((a) => a.vesselId).sort(), ['G1', 'G2']);
  assert.equal(MIN_RUN_ON_ARMS, 2);
});

test('a cluster\'s merged skin has a plain trunk of the two outer pieces: with the growers closed the skin is the vein', () => {
  const { js, tubes } = cluster();
  const p = planSkins(js(true), tubes, () => () => true).plans[0]!;
  const plain = partOf(p, []);
  assert.ok(plain, 'a skin that hides a vessel whole keeps a plain trunk of two arms');
  assert.deepEqual(plain.junction.arms.map((a) => a.vesselId).sort(), ['H0', 'H2']);
  // ...and only then: with nothing hidden two arms simply run on, the tubes carry it (every other skin keeps its three-arm rule)
  assert.equal(partOf({ junction: p.junction, cuts: p.cuts }, []), null, 'no vessel hidden: no two-arm plain trunk');
  assert.equal(PLAIN_MIN_ARMS, 3);
});

test('a merge of two permanent arms and no grower is still refused (that is two tubes running on, not a skin)', () => {
  const { js, tubes } = cluster();
  const { plans, failures } = planSkins(js(false), tubes, () => () => true);
  assert.deepEqual(plans, []);
  assert.ok(failures.some((f) => /permanent arms/.test(f.message)), 'named');
});

test('the real network: every merged skin that hides a vessel whole and carries growers has a plain trunk, and the left portal vein\'s cluster is one of them', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const warnings: string[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => new SkinObject(mesh, arms[0]!, axes, arms),
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: (m) => warnings.push(m),
  });
  set.build(2);
  assert.deepEqual(warnings, [], 'no skin falls back to the old join');
  const merged = set.nodes.filter((n) => set.hiddenOf(n).length > 0);
  assert.ok(merged.includes('LPV_U+LPV_X'), `the left portal vein's cluster is one skin (merged: ${merged.join(', ')})`);
  for (const n of merged) {
    const skin = set.skinOf(n)!;
    if (!skin.junction.arms.some((a) => a.grow)) continue;
    const plain = set.plainOf(n);
    assert.ok(plain, `${n}: hides ${set.hiddenOf(n).join(', ')} and has growers, so it needs a plain trunk to show the vein with them closed`);
    assert.ok(plain.junction.arms.every((a) => !a.grow), `${n}: the plain trunk is the arms that stay`);
  }
  assert.deepEqual(set.hiddenOf('LPV_U+LPV_X'), ['PVH_L_1']);
  const lpv = set.skinOf('LPV_U+LPV_X')!;
  assert.deepEqual(lpv.junction.arms.filter((a) => a.grow).map((a) => a.vesselId).sort(), ['C3', 'REX'], 'the umbilical vein and the Meso-Rex bypass are both arms of it');
  // the plain trunk of the cluster is the vein with both growers closed: no fold, and every edge on two faces but the two seam rings' (it is the only thing that draws the vein between the outer pieces)
  const plain = set.plainOf('LPV_U+LPV_X')!;
  assert.deepEqual(plain.junction.arms.map((a) => a.vesselId).sort(), ['PVH_L', 'PVH_L_2']);
  const open = (m: SkinMesh): number => {
    const dir = new Map<number, number>();
    for (let i = 0; i < m.index.length; i += 3) for (let k = 0; k < 3; k++) { const a = m.index[i + k]!, b = m.index[i + (k + 1) % 3]!; dir.set(a * 1e7 + b, (dir.get(a * 1e7 + b) ?? 0) + 1); }
    let n = 0;
    for (const [key, v] of dir) { const a = Math.floor(key / 1e7), b = key % 1e7; assert.equal(v, 1); if (!dir.has(b * 1e7 + a)) n++; }
    return n;
  };
  for (const [name, m] of [['welded skin', lpv], ['plain trunk', plain]] as const) {
    assert.equal(foldedTriangles(m.position, m.normal, m.index).length, 0, `${name}: no fold`);
    assert.equal(open(m), m.seamVerts.length * 14, `${name}: open only at its ${m.seamVerts.length} seam rings`);
  }
  assert.ok(!set.dropped.some((d) => /^LPV_[UXA]:/.test(d)), `none of the cluster's growers is dropped: ${set.dropped.join(' ')}`);
});

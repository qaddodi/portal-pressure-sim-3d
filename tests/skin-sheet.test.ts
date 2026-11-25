// The intrahepatic forks are welded into their hosts (21 Nov, "whole network yes"): PVH_R_2 and the TIPS on RPV_T, PVH_L_1 on LPV_A, RHV_IVC_1's side branch mid-host. Their hosts are 10 to 17 radii long and the forks
// leave at about 30 degrees from a start tucked behind the host's node, so the hull of the seam rings that starts every other skin is far from the surface and folds under the remesh. Root cause: the starting sheet.
// These skins start from the union's own surface (skin/sheet.ts: surface nets of the arms' smooth union, zipped to the seam rings) and mesh on the last rung of the pace ladder. Node only. Run: node --test tests/skin-sheet.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { PACES, foldedTriangles } from '../src/scene/vessels/skin/mesh.ts';
import { findSkinJunctions, isLiverBranch } from '../src/scene/vessels/skin/inventory.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

// (the placed anatomy's liver branches: the right portal vein's second branch on RPV_T and the right hepatic vein's mid-host fork. The 2D figure's left portal fork (PVH_L_1~F:b on LPV_A) is not in it: the placed left portal vein runs to its tip
//  unbranched, so LPV_A is no liver-branch junction)
const LIVER_NODES = ['RPV_T', 'RHV_IVC_1~F:b'];

function build(): { set: SkinSet; meshes: Map<string, SkinMesh>; warnings: string[]; done(): void } {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const meshes = new Map<string, SkinMesh>(), warnings: string[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh) => { meshes.set(mesh.junction.node, mesh); return { mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() { meshes.delete(mesh.junction.node); } } as never; },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: (m) => warnings.push(m),
  });
  set.build(2);
  return { set, meshes, warnings, done: () => { scene.dispose(); setSmoothJoins(was); } };
}

test('the junction inventory holds the liver branches: a fork child is an arm of the node it starts at, or of a virtual node on its host when it leaves mid-run', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  try {
    const js = findSkinJunctions();
    for (const n of LIVER_NODES) assert.ok(js.some((j) => j.node === n), `${n} is a junction`);
    const arms = (n: string) => js.find((j) => j.node === n)!.arms;
    assert.ok(arms('RPV_T').some((a) => a.vesselId === 'PVH_R_2~F:b'), 'the right portal vein\'s second branch is an arm of RPV_T');
    assert.ok(!NETWORK_BY_ID.has('PVH_L_1~F:b') && !js.some((j) => j.node === 'LPV_A'), 'the placed left portal vein has no fork, so no LPV_A junction');
    const v = arms('RHV_IVC_1~F:b');
    assert.equal(v.filter((a) => a.side).length, 2, 'the virtual node on the hepatic vein: two side arms (the host, either side of the branch)');
    assert.ok(v.some((a) => isLiverBranch(NETWORK_BY_ID.get(a.vesselId)!)), 'and the branch');
    for (const j of js) for (const a of j.arms) if (isLiverBranch(NETWORK_BY_ID.get(a.vesselId)!)) assert.ok(a.restR > 0);
  } finally { setSmoothJoins(was); }
});

test('every liver-branch junction builds a skin from the surface sheet: closed, no fold, no warning, and on the last rung of the pace ladder', () => {
  const b = build();
  try {
    assert.deepEqual(b.warnings, [], 'nothing falls back');
    for (const n of LIVER_NODES) {
      const m = b.meshes.get(n);
      assert.ok(m, `${n} has a skin (fell back: ${b.set.fellBack.join(', ')})`);
      assert.deepEqual(foldedTriangles(m!.position, m!.normal, m!.index), [], `${n}: no fold`);
      // closed manifold apart from the seam rings: every edge is shared by two faces, the ring edges by one
      const edges = new Map<string, number>();
      for (let i = 0; i < m!.index.length; i += 3) for (let s = 0; s < 3; s++) {
        const a = m!.index[i + s]!, c = m!.index[i + (s + 1) % 3]!, k = a < c ? `${a}-${c}` : `${c}-${a}`;
        edges.set(k, (edges.get(k) ?? 0) + 1);
      }
      let open = 0, bad = 0;
      for (const c of edges.values()) { if (c === 1) open++; else if (c !== 2) bad++; }
      assert.equal(bad, 0, `${n}: no edge on three faces`);
      const ringEdges = m!.junction.arms.length * (m!.seamVerts[0]!.length);
      assert.equal(open, ringEdges, `${n}: the only open edges are the ${ringEdges} of the seam rings`);
      assert.equal((b.set as unknown as { paces: Map<string, number> }).paces.get(n), PACES.length - 1, `${n}: meshed on the last rung`);
    }
    assert.deepEqual(b.set.fellBack, [], 'no node keeps the old join');
    for (const n of ['SIN_R', 'SIN_L']) assert.ok(b.meshes.has(n), `${n}: the liver bed is welded to the portal venule, the sinusoid and the hepatic arteriole`);
  } finally { b.done(); }
});

test('the skins that stand together on one vessel are planned together: LPV_A and PVH_L cross no seams, and RPV_T keeps its TIPS arm', () => {
  const b = build();
  try {
    assert.ok(b.set.nodes.includes('RPV_T') && b.set.nodes.some((n) => n.split('+').includes('PVH')));   // (no LPV_A in the placed anatomy: LIVER_NODES)
    assert.ok(!b.set.dropped.includes('RPV_T:TIPS'), 'the TIPS arm of RPV_T is kept');
    for (const n of LIVER_NODES) {
      const m = b.meshes.get(n)!;
      for (const c of m.cuts) assert.ok(c.u >= 0 && c.u <= 1, `${n}: ${c.vesselId} cut at ${c.u}`);
    }
  } finally { b.done(); }
});

test('the right hepatic artery runs on to its liver bed: the arteriole ends at the bed\'s node, arrives off the venule\'s heading, and the bed is a junction of venule, sinusoid and arteriole', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  try {
    for (const [bed, art, ven, sin] of [['SIN_R', 'A_HR', 'PRE_R', 'SIN_RR'], ['SIN_L', 'A_HL', 'PRE_L', 'SIN_LL']] as const) {
      const j = findSkinJunctions().find((x) => x.node === bed)!;
      assert.deepEqual(j.arms.map((a) => a.vesselId).sort(), [art, ven, sin].sort(), `${bed}'s arms`);
      const a = NETWORK_BY_ID.get(art)!.pts, v = NETWORK_BY_ID.get(ven)!.pts, aEnd = a[a.length - 1]!, vEnd = v[v.length - 1]!;
      assert.ok(Math.hypot(aEnd[0] - vEnd[0], aEnd[1] - vEnd[1]) < 0.005, `${art} ends at the bed's node (${bed})`);
      // it arrives at an angle to the venule, not along it (arms nearly parallel have no seam rings that clear one another), and on the side of it that crosses no vein
      const dir = (p: readonly (readonly number[])[], i: number): [number, number] => { const l = Math.hypot(p[i]![0] - p[i - 3]![0], p[i]![1] - p[i - 3]![1]) || 1; return [(p[i]![0] - p[i - 3]![0]) / l, (p[i]![1] - p[i - 3]![1]) / l]; };
      const da = dir(a, a.length - 1), dv = dir(v, v.length - 1), ang = (Math.acos(Math.max(-1, Math.min(1, da[0] * dv[0] + da[1] * dv[1]))) * 180) / Math.PI;
      assert.ok(ang > 25 && ang < 75, `${art} arrives ${ang.toFixed(0)} degrees off ${ven}`);
    }
  } finally { setSmoothJoins(was); }
});

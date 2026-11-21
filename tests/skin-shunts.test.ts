// The shunts' nodes (FINAL-WELD-PLAN option A, 21 Nov 2026): the distal splenorenal shunt's two ends and the TIPS on the hepatic vein are STATIC full-size arms of their node's skin; the DIPS at the portal vein's hepatic end is too (its seam clearance ignores the growing arm that runs along PVH_R).
// Node only, the real network. Run: node --test tests/skin-shunts.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { foldedTriangles } from '../src/scene/vessels/skin/mesh.ts';
import { capStrayLoops, strayLoops } from '../src/scene/vessels/skin/sheet-caps.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

function built() {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' }), parent = new Group(), warnings: string[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, ax, arms) => new SkinObject(mesh, arms[0]!, ax, arms),
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: (m) => warnings.push(m),
  });
  set.build(2);
  return { scene, set, warnings, done: () => { scene.dispose(); setSmoothJoins(was); } };
}
const armsOf = (m: SkinMesh | undefined) => (m ? m.junction.arms.map((a) => `${a.vesselId}:${a.end}`) : []);

test('S_DSR is welded at both ends (SVD, LRV_S): a static full-size arm, no fold, nothing dropped for it; the TIPS at the hepatic vein is still named', () => {
  const b = built();
  try {
    assert.deepEqual(b.warnings, []);
    for (const d of ['SVD:S_DSR', 'LRV_S:S_DSR']) assert.ok(!b.set.dropped.includes(d), `${d} is not dropped`);
    const svd = b.set.skinOf('SVD'), lrv = b.set.skinOf('LRV_S');
    assert.ok(armsOf(svd).includes('S_DSR:0'), 'S_DSR is an arm of SVD');
    assert.ok(armsOf(lrv).includes('S_DSR:1') && armsOf(lrv).includes('C6:1'), 'S_DSR and C6 are arms of LRV_S, running along one axis');
    for (const [name, m] of [['SVD', svd], ['LRV_S', lrv]] as const) {
      assert.equal(m!.grow.length, 0, `${name}: no growth morph, one static shape`);
      assert.equal(foldedTriangles(m!.position, m!.normal, m!.index).length, 0, `${name}: no folds`);
    }
    for (const n of ['SVD', 'LRV_S']) assert.equal(b.set.plainOf(n), undefined, `${n}: the tubes' cut ends carry the weld`);
    assert.ok(b.set.dropped.includes('RHV_T:TIPS'), 'RHV_T:TIPS stays flared and named');
  } finally { b.done(); }
});

test('PVH:DIPS is a welded static full-size arm of the portal vein\'s hepatic node, though it lies 12 degrees from PVH_R: the arms that stay are judged without it (cuts.ts growAlong)', () => {
  const b = built();
  try {
    assert.ok(!b.set.dropped.includes('PVH:DIPS'));
    assert.ok(armsOf(b.set.skinOf('PVH')).includes('DIPS:0'));
  } finally { b.done(); }
});

test('a hole of the sampled sheet at no seam is closed by a fan, the seams\' loops are kept', () => {
  // a seam of radius 1 at the origin (loop of 8 round it) and a small stray loop of 5 far from it
  const pos: number[] = [], seam: number[] = [], stray: number[] = [];
  for (let i = 0; i < 8; i++) { seam.push(pos.length / 3); pos.push(Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4), 0); }
  for (let i = 0; i < 5; i++) { stray.push(pos.length / 3); pos.push(10 + 0.3 * Math.cos(i * 2 * Math.PI / 5), 0.3 * Math.sin(i * 2 * Math.PI / 5), 0); }
  const cen = [[0, 0, 0] as const], rad = [1];
  assert.deepEqual(strayLoops([seam, stray], pos, cen, rad), [stray]);
  const tris: number[] = [], before = pos.length / 3;
  const left = capStrayLoops([seam, stray], tris, pos, cen, rad);
  assert.deepEqual(left, [seam]);
  assert.equal(tris.length, 15, 'five triangles');
  assert.equal(pos.length / 3, before + 1, 'one vertex at the loop\'s mean');
  assert.ok(Math.abs(pos[3 * before]! - 10) < 1e-9 && Math.abs(pos[3 * before + 1]!) < 1e-9);
  assert.deepEqual(capStrayLoops([seam], [], pos, cen, rad), [seam], 'a sheet with only its seams\' loops is untouched');
});

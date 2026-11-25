// The shunts' nodes (FINAL-WELD-PLAN option A, 21 Nov 2026): the distal splenorenal shunt's two ends and the TIPS on the hepatic vein are STATIC full-size arms of their node's skin; the DIPS at the portal vein's hepatic end is not (and says why).
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
    // (placed anatomy: C6's renal end lands on the renal vein's side, past SKIN_REACH of LRV_S, so it is the wall skin's arm on LRV_IVC and not LRV_S's, as the 2D figure had it beside S_DSR)
    assert.ok(armsOf(lrv).includes('S_DSR:1'), 'S_DSR is an arm of LRV_S');
    assert.ok(armsOf(b.set.skinOf('wall:LRV_IVC:C61')).includes('C6:1') && !armsOf(lrv).includes('C6:1'), 'C6\'s renal end is welded on the renal vein\'s wall');
    for (const [name, m] of [['SVD', svd], ['LRV_S', lrv]] as const) {
      assert.equal(foldedTriangles(m!.position, m!.normal, m!.index).length, 0, `${name}: no folds`);
    }
    for (const n of ['SVD', 'LRV_S']) assert.equal(b.set.plainOf(n), undefined, `${n}: the tubes' cut ends carry the weld`);
    // (placed anatomy: the TIPS lands on the right hepatic vein where it builds, a static full-size arm; the 2D figure's crotch dropped it, flared and named)
    assert.ok(!b.set.dropped.includes('RHV_T:TIPS') && armsOf(b.set.skinOf('RHV_T')).includes('TIPS:1'), 'the TIPS is welded at RHV_T');
    assert.equal(foldedTriangles(b.set.skinOf('RHV_T')!.position, b.set.skinOf('RHV_T')!.normal, b.set.skinOf('RHV_T')!.index).length, 0, 'RHV_T: no folds');
  } finally { b.done(); }
});

test('PVH:DIPS is welded at both ends in the placed anatomy (PVH and IVC_D): a static full-size arm, no fold, nothing dropped for it', () => {
  // (the 2D figure's PVH_R was shorter than the DIPS lay over it, so no ring cleared the blend and the DIPS stayed flared and named (rule 1); the placed right portal vein is long enough, and the DIPS builds at both of its nodes)
  const b = built();
  try {
    assert.ok(!b.set.dropped.includes('PVH:DIPS') && !b.set.why['PVH:DIPS']);
    for (const [n, end] of [['PVH', 0], ['IVC_D', 1]] as const) {
      const m = b.set.skinOf(n);
      assert.ok(armsOf(m).includes(`DIPS:${end}`), `the DIPS is an arm of ${n}`);
      assert.equal(foldedTriangles(m!.position, m!.normal, m!.index).length, 0, `${n}: no folds`);
    }
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

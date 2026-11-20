// The HVPG's amber column is a tint on the vessels themselves (20 Nov 2026: "highlight everything beyond the wedge including all branches of the right hepatic vein and fade out with them"): every vessel
// upstream of the balloon in the vein the tip is in, never a separate tube that can leave the vein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';

test('wedged: the vein beyond the tip and its branches are tinted, the stretch behind the balloon is not', () => {
  const sc = new CelScene();
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 1);
  const w = sc.procs.wedgeTint()!;
  assert.ok(w && w.amount > 0.99);
  assert.ok(w.pieces.has('RHV_IVC_1'), 'the outer piece of the right hepatic vein');
  const outer = w.pieces.get('RHV_IVC_1')!;
  assert.ok(outer.cut > 0.3 && outer.cut < 0.9, `the tint stops at the balloon, ${outer.cut}`);
  assert.ok(w.pieces.has('POST_R_RHV') || [...w.pieces.keys()].some((k) => k.includes('~F')), 'the branches are tinted too');
  for (const [id, p] of w.pieces) if (id.includes('~F') || id === 'POST_R_RHV') assert.ok(p.fade > 0, `${id} thins toward its tip`);
  assert.ok(!w.pieces.has('IVC_IS'), 'the cava is not tinted');
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 0);
  assert.equal(sc.procs.wedgeTint(), null, 'no column, no tint');
  sc.dispose();
});

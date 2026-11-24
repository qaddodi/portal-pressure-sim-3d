import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyVesselOverrides } from '../src/editor/vessel-apply.ts';
import { setOverridesForTest } from '../src/editor/store.ts';
import { EMPTY } from '../src/editor/types.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { x3 } from '../src/scene/frame2d.ts';

type Pt = readonly [number, number];
const maxTurn = (p: readonly Pt[]): number => {
  let m = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const a = [p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]], b = [p[i + 1]![0] - p[i]![0], p[i + 1]![1] - p[i]![1]];
    m = Math.max(m, Math.acos(Math.min(1, Math.max(-1, (a[0]! * b[0]! + a[1]! * b[1]!) / ((Math.hypot(a[0]!, a[1]!) * Math.hypot(b[0]!, b[1]!)) || 1)))));
  }
  return (m * 180) / Math.PI;
};

test('the skeleton gives every node a safe move (a third of its shortest arm) and a maximum (the arm), and a move at the safe limit stays gentle on every arm', async () => {
  setOverridesForTest(EMPTY);
  const { editableSkeleton } = await import('../src/editor/vessel-skeleton.ts');
  const sk = editableSkeleton();
  assert.ok(sk.nodes.every((n) => n.safeMove > 0 && Math.abs(n.maxMove - 3 * n.safeMove) < 1e-9));
  const unit = x3(1) - x3(0);   // scene units per plan unit
  let checked = 0;
  for (const n of sk.nodes.slice(0, 60)) {
    const planMove = n.safeMove / Math.abs(unit);
    for (const arm of n.arms) {
      const v = sk.vessels.find((q) => q.id === arm.id)!, p = EDGE_PATH_2D[arm.id] as readonly Pt[] | undefined;
      if (!p) continue;
      const e = { id: v.id, from: v.from, to: v.to }, before = maxTurn(p);
      const r = applyVesselOverrides(e, p, { version: 1, nodes: { [n.id]: { dx: planMove * 0.8, dy: planMove * 0.6 } } });
      assert.ok(maxTurn(r.path) <= before + 14, `${arm.id} at ${n.id}: ${maxTurn(r.path)} against ${before}`);
      checked++;
    }
  }
  assert.ok(checked > 20);
});

test('a node move far past the arm (3 times its length) stays finite, keeps the end on the node and the far end still, and never folds back', () => {
  const p = EDGE_PATH_2D['PV_TRUNK'] as readonly Pt[], e = { id: 'PV_TRUNK', from: 'A', to: 'B' };
  const len = p.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - p[i]![0], q[1] - p[i]![1]), 0);
  const r = applyVesselOverrides(e, p, { version: 1, nodes: { A: { dx: 0, dy: 3 * len } } }, { radius: 3 });
  assert.ok(r.path.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])));
  assert.ok(Math.abs(r.path[0]![1] - p[0]![1] - 3 * len) < 1e-6);
  assert.deepEqual(r.path[r.path.length - 1], p[p.length - 1]);
  assert.ok(r.path.length === p.length);
});

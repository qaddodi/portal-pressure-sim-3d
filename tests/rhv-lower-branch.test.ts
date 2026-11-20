// The right hepatic vein's upper branch is re-routed (Mohammad, 20 Nov: "change the upper branch to be below, kinda like the red marking I made, and make it go towards us a little in z").
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the right hepatic vein\'s side branch leaves the underside of the vein and runs down the figure, toward the viewer (Mohammad, 20 Nov), starting on the vein\'s own line', async () => {
  const { treeOf, SIDE_SHAPE } = await import('../src/scene/vessels/liver-branches.ts');
  assert.ok(SIDE_SHAPE.RHV_IVC_1);
  const t = treeOf('RHV_IVC_1')!, side = t.side!;
  const join = side.pts[side.pts.length - 1]!, tip = side.pts[0]!;   // (flow order: tip first, the join last)
  const through = t.through, k = Math.round(t.q * (through.length - 1)), at = through[k]!;
  assert.ok(Math.hypot(join[0] - at[0], join[1] - at[1]) < 6, 'it starts on the vein\'s own line at the split');
  assert.ok(tip[1] - join[1] > 60, `its tip lies well below the join: ${tip[1] - join[1]}`);
  assert.ok(tip[1] > through[0]![1] + 30, 'and below the vein\'s own tip, not beside it');
  for (const p of side.pts) assert.ok(p[1] >= join[1] - 1.5, 'every point lies on or below the join: it never rises over the vein');
  assert.ok(side.dz[0]! > 0.04, `it comes toward the viewer: ${side.dz[0]}`);
  assert.ok(Math.min(...side.dz) >= -0.021 && side.dz[side.dz.length - 1]! < 0, 'it starts tucked behind the vein, so its wall hides the start');
  let prev = 0;
  for (let i = 1; i < side.pts.length - 1; i++) { const a = side.pts[i - 1]!, b = side.pts[i]!, c = side.pts[i + 1]!; const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]); const d = Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1))); assert.ok(d < 0.12, `smooth: turn ${d} at ${i}`); prev = Math.max(prev, d); }
});

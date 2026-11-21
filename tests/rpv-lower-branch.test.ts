// The right portal vein's second branch goes below its through branch (Mohammad, 21 Nov, his sketch: the upper branch crossed out, a second one drawn under the first), the way the right hepatic vein's does.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the right portal vein\'s side branch leaves its underside and runs down the figure, toward the viewer, starting on the vein\'s own line', async () => {
  const { treeOf, SIDE_SHAPE } = await import('../src/scene/vessels/liver-branches.ts');
  assert.ok(SIDE_SHAPE.PVH_R_2);
  const t = treeOf('PVH_R_2')!, side = t.side!;
  const join = side.pts[0]!, tip = side.pts[side.pts.length - 1]!;   // (a portal branch is in flow order, root first: the join first, the tip last)
  const through = t.through, k = Math.round(t.q * (through.length - 1)), at = through[k]!;
  assert.ok(Math.hypot(join[0] - at[0], join[1] - at[1]) < 6, 'it starts on the vein\'s own line at the split');
  assert.ok(tip[1] - join[1] > 40, `its tip lies well below the join: ${tip[1] - join[1]}`);
  assert.ok(tip[1] > through[through.length - 1]![1] + 20, 'and below the through branch\'s own tip, not above it');
  for (const p of side.pts) assert.ok(p[1] >= join[1] - 1.5, 'every point lies on or below the join: it never rises over the vein');
  assert.ok(side.dz[side.dz.length - 1]! > 0.04, 'it comes toward the viewer');
  assert.ok(Math.min(...side.dz) >= -0.021 && side.dz[0]! < 0, 'it starts tucked behind the vein');
});

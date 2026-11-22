import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSystems, type FrameSystem } from '../src/scene/frame-systems.ts';

// R6: the scene's frame is a list of systems. The runner runs ALL of them, in order, and times each by its id.
test('runSystems runs every system even when an earlier one is moving, ORs the answers and times each by id', () => {
  const ran: string[] = []; let t = 0;
  const sys: FrameSystem<{ n: number }>[] = [
    { id: 'a', step: () => { ran.push('a'); t += 5; return true; } },
    { id: 'b', step: () => { ran.push('b'); t += 2; return false; } },
    { id: 'c', step: (c) => { ran.push('c'); c.n++; t += 1; return false; } },
  ];
  const totals: Record<string, number> = {}, ctx = { n: 0 };
  assert.equal(runSystems(sys, ctx, totals, () => t), true);
  assert.deepEqual(ran, ['a', 'b', 'c']); assert.equal(ctx.n, 1);
  assert.deepEqual(totals, { a: 5, b: 2, c: 1 });
  runSystems(sys, ctx, totals, () => t);
  assert.deepEqual(totals, { a: 10, b: 4, c: 2 });
  assert.equal(runSystems([{ id: 'x', step: () => false }], ctx, {}, () => 0), false);
});

test('importing scene/api.ts builds no scene; the first use of `cel` or `scene()` builds exactly one', async () => {
  const api = await import('../src/scene/api.ts');
  assert.equal(api.sceneBuilt(), false, 'nothing is constructed at import');
  const a = api.scene();
  assert.equal(api.sceneBuilt(), true);
  assert.equal(api.scene(), a, 'one scene');
  assert.equal(api.cel.rig, a.rig, 'the handle reads the same scene');
  assert.equal(typeof api.cel.update, 'function');
  a.dispose();
});

test('the frame order is pinned: the ids of the scene\'s systems, in the order they run', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const s = new CelScene();
  assert.deepEqual([...s.systemIds], ['camera', 'circuit', 'highlight', 'flow', 'lens+dust', 'cells', 'presence', 'shapes', 'skins', 'micro', 'procedures', 'disease', 'probes']);
  s.update(0); s.update(16);
  for (const id of s.systemIds) assert.ok(id in s.systemMs, `${id} is timed in systemMs`);
  s.dispose();
});

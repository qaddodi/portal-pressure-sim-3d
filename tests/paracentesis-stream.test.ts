// The paracentesis fluid (approved mock B, docs/approved/ascites-stream.md): it flows exactly while the model drains, and its geometry is the mock's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DRAIN_MS, paracentesisFluidAt } from '../src/scene/procedures/instrument-frames.ts';
import { INSTRUMENT_SPECS } from '../src/scene/procedures/instrument-specs.ts';
import { FLUID } from '../src/scene/devices/paracentesis.ts';

test('the drain length is the engine morph\'s (procs-link MORPH_MS)', () => {
  assert.match(readFileSync(new URL('../src/ui/deck/procs-link.ts', import.meta.url), 'utf8'), new RegExp(`MORPH_MS = ${DRAIN_MS},`));
});

test('the fluid is dry before the drain, flowing through it, and gone after it, never jumping', () => {
  const a = INSTRUMENT_SPECS.paracentesis!.T.apply, b = a + DRAIN_MS;
  assert.deepEqual(paracentesisFluidAt(0), { on: 0, reach: 0 });
  assert.equal(paracentesisFluidAt(a).on, 0);
  const mid = paracentesisFluidAt((a + b) / 2);
  assert.equal(mid.on, 1); assert.equal(mid.reach, 1);
  assert.ok(paracentesisFluidAt(b + 1000).on === 0, 'gone a second after the drain');
  let last = 0;
  for (let t = 0; t <= b + 800; t += 20) { const o = paracentesisFluidAt(t).on; assert.ok(Math.abs(o - last) < 0.15, `no jump at ${t}`); last = o; }
});

test('the stream thins as it falls and the ripple is flat (mock B)', () => {
  assert.ok(FLUID.streamFoot < FLUID.streamTop && FLUID.coreR < FLUID.streamTop);
  assert.ok(FLUID.ripple[1] < FLUID.ripple[0] / 4, 'a flat ripple');
});

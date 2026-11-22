// THE KEYS ON WORKER THREADS (plan owner, 22 Nov): a bake keys its regions on several threads; the keys are the serial ones, bit for bit, in the same order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh } from '../src/scene/vessels/net/mesh.ts';
import { fixtures } from './net-lib.ts';

test('keys baked on worker threads equal the serial keys, in the same order', () => {
  let regions = 0;
  for (const fx of fixtures()) {
    const E = fx.skel.edges.length, states = [0.4, 0.7, 1.15].map((x) => Array.from({ length: E }, (_, e) => x * (1 + 0.05 * (e % 3))));
    const serial = buildNetMesh(fx.skel, undefined, { states, maps: true }).mesh.keys, threaded = buildNetMesh(fx.skel, undefined, { states, maps: true, workers: 3 }).mesh.keys;
    assert.ok(serial && threaded, `${fx.name}: keyed`);
    regions += serial.length;
    assert.deepEqual(threaded, serial, `${fx.name}: the same keys`);
  }
  assert.ok(regions > 2, 'several regions were keyed (a single one is never spread)');
});

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

// A WORKER THAT DIES MUST FAIL THE BAKE AT ONCE (plan owner, 22 Nov): the caller sleeps in Atomics.wait and cannot hear a worker's 'exit', so the pool's supervisor does and wakes it.
for (const fault of ['exit', 'throw']) {
  test(`a worker that ${fault === 'exit' ? 'exits without a word' : 'throws'} makes the build throw straight away, not after the wait's limit`, { timeout: 60000 }, () => {
    const fx = fixtures().find((f) => { const E = f.skel.edges.length; return (buildNetMesh(f.skel, undefined, { states: [Array(E).fill(0.5), Array(E).fill(1.1)], maps: true }).mesh.keys?.length ?? 0) > 1; })!;
    assert.ok(fx, 'a fixture with several regions');
    const E = fx.skel.edges.length, states = [Array(E).fill(0.5), Array(E).fill(1.1)], was = process.env.PPS_KEYS_FAULT;
    process.env.PPS_KEYS_FAULT = fault;
    try {
      const t0 = performance.now();   // (test code: the one-time rule is for src/)
      assert.throws(() => buildNetMesh(fx.skel, undefined, { states, maps: true, workers: 2 }), /key worker failed/);
      assert.ok(performance.now() - t0 < 20000, 'it failed within seconds');
    } finally { if (was === undefined) delete process.env.PPS_KEYS_FAULT; else process.env.PPS_KEYS_FAULT = was; }
  });
}

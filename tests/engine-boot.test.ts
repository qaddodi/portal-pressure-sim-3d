import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { bootEngine, engine } from '../src/engine/boot.ts';
import { useEngine, patient, latest } from '../src/engine/store.ts';
import type { WorkerLike } from '../src/engine/client.ts';

// The worker host running on this thread behind the same interface as a real Worker.
function inThread(): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    postMessage(msg) { setTimeout(() => { void core.handle(msg as never); }, 0); },
    terminate() { core.dispose(); },
  };
  const core = createCore((m: unknown) => { setTimeout(() => w.onmessage?.({ data: m as never }), 0); });
  return w;
}

test('boot loads the slice patient, keeps its params and the healthy reference, then shows numbers', async () => {
  const worker = inThread();
  try {
  await bootEngine(worker, 'csph');
  assert.equal(useEngine.getState().presetId, 'csph');
  assert.ok(patient.params && typeof patient.params === 'object', 'params kept from presetLoaded');
  assert.ok(patient.reference, 'healthy reference kept');
  assert.ok(patient.reference!.hepLymph == null || patient.reference!.hepLymph > 0);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(useEngine.getState().status, 'ready');
  assert.ok(latest.frame && latest.frame.metrics.hvpg >= 10, 'a frame of the CSPH patient arrived');
  assert.equal(patient.reference!.P.length, latest.frame!.P.length, 'a pressure per node');
  assert.equal(patient.reference!.Q.length, latest.frame!.Q.length, 'a flow per edge');
  } finally { engine().dispose(); }
});

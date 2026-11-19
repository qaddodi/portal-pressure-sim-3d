// A worker that fails never leaves anything waiting: an error event, an unreadable message, the worker's own crash message and a worker that never answers each
// reject every pending request and set the status 'crashed' with the reason, so the boot ends (main.tsx then shows BootCrash with Reload) instead of a stuck page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EngineClient, type WorkerLike } from '../src/engine/client.ts';
import { bootEngine } from '../src/engine/boot.ts';
import { useEngine } from '../src/engine/store.ts';

/** A worker that takes messages and answers nothing until the test makes it fail. */
function deaf(): WorkerLike & { sent: unknown[]; ended: boolean } {
  return { onmessage: null, onerror: null, onmessageerror: null, sent: [], ended: false, postMessage(m) { this.sent.push(m); }, terminate() { this.ended = true; } };
}
const fresh = () => useEngine.setState({ status: 'booting', presetId: null, crash: null });
const client = (w: WorkerLike, crashes: string[]) => new EngineClient(w, { onFrame: () => undefined, onCrash: (m) => crashes.push(m) });

test('a worker error event rejects every pending request, tells the app once, and refuses later requests at once', async () => {
  const w = deaf(), crashes: string[] = [];
  const c = client(w, crashes);
  const a = c.request({ type: 'preset', id: 'csph' }), b = c.request({ type: 'healthyProfile' }), s = c.sequence([{ preset: 'csph' }]);
  let prevented = false;
  w.onerror!({ message: 'Failed to fetch worker script', preventDefault() { prevented = true; } });
  for (const p of [a, b, s]) await assert.rejects(p, /simulation worker failed: Failed to fetch worker script/);
  assert.deepEqual(crashes, ['The simulation worker failed: Failed to fetch worker script']);
  assert.ok(prevented);
  w.onerror!({ message: 'again' });
  assert.equal(crashes.length, 1, 'one crash, said once');
  const before = w.sent.length;
  await assert.rejects(c.request({ type: 'metrics' }), /simulation worker failed/);
  c.send({ type: 'init' });
  assert.equal(w.sent.length, before, 'nothing more is posted to a dead worker');
});

test('an error event with no message, a message the page cannot read and the worker\'s own crash message are crashes too', async () => {
  for (const fail of [
    (w: WorkerLike) => w.onerror!({}),
    (w: WorkerLike) => w.onmessageerror!({}),
    (w: WorkerLike) => w.onmessage!({ data: { type: 'crash', message: 'a clock threw' } as never }),
  ]) {
    const w = deaf(), crashes: string[] = [];
    const p = client(w, crashes).request({ type: 'metrics' });
    fail(w);
    await assert.rejects(p);
    assert.equal(crashes.length, 1);
    assert.ok(crashes[0]!.length > 10, 'the reason is words, not "undefined"');
    assert.doesNotMatch(crashes[0]!, /undefined|\[object/);
  }
});

test('boot: a worker that fails to load ends the boot with status crashed and the reason', async () => {
  fresh();
  const w = deaf();
  const boot = bootEngine(w, 'csph');
  setTimeout(() => w.onerror!({ message: 'net::ERR_FAILED' }), 5);
  await assert.rejects(boot, /net::ERR_FAILED/);
  const s = useEngine.getState();
  assert.equal(s.status, 'crashed');
  assert.match(s.crash ?? '', /net::ERR_FAILED/);
  assert.equal(s.presetId, null, 'no patient was shown');
});

test('boot: a worker that never answers is given up on after the wait, not waited for for ever', async () => {
  fresh();
  const w = deaf();
  await assert.rejects(bootEngine(w, 'csph', 20), /did not answer/);
  assert.equal(useEngine.getState().status, 'crashed');
  assert.match(useEngine.getState().crash ?? '', /did not answer/);
});

test('boot: where a worker cannot be made at all the status is crashed with the reason', async () => {
  fresh();
  const had = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: class { constructor() { throw new Error('blocked by the browser'); } } });
  try { await assert.rejects(bootEngine(), /could not start: blocked by the browser/); }
  finally { if (had) Object.defineProperty(globalThis, 'Worker', had); else delete (globalThis as { Worker?: unknown }).Worker; }
  assert.equal(useEngine.getState().status, 'crashed');
});

test('the boot screen shows the crash with Reload instead of the app', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const crash = main.indexOf('<BootCrash'), app = main.indexOf('<App />');
  assert.ok(crash > 0 && crash < app, 'main.tsx renders BootCrash before it would render the app');
  assert.match(main, /status === 'crashed' \|\| !eng\.presetId/);
  const screen = readFileSync(new URL('../src/ui/shell/BootCrash.tsx', import.meta.url), 'utf8');
  assert.match(screen, /role="alert"/);
  assert.match(screen, /location\.reload\(\)/);
  assert.match(screen, /BOOT_CRASH\.reload/);
});

// R8: one place starts the simulation workers and owns their failure rules (engine/pool.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Second, SECOND_WAIT_MS, type SecondMessage } from '../src/engine/pool.ts';
import type { WorkerLike } from '../src/engine/client.ts';

function fake() {
  const made: (WorkerLike & { sent: SecondMessage[]; ended: boolean })[] = [];
  const start = () => { const w = { onmessage: null, onerror: null, onmessageerror: null, sent: [] as SecondMessage[], ended: false, postMessage(m: unknown) { this.sent.push(m as SecondMessage); }, terminate() { this.ended = true; } } as WorkerLike & { sent: SecondMessage[]; ended: boolean }; made.push(w); return w; };
  return { made, start };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a second engine starts on its first message, paused, and not before', () => {
  const f = fake(), s = new Second(f.start, 1000);
  assert.equal(f.made.length, 0);
  s.post({ type: 'sequence', reqId: 1 });
  assert.equal(f.made.length, 1);
  assert.deepEqual(f.made[0]!.sent.map((m) => m.type), ['init', 'run', 'sequence']);
  assert.equal(f.made[0]!.sent[1]!.running, false, 'no live clock on a model nobody looks at');
  s.dispose();
});

test('a worker error ends it: the listener hears one crash, and the next message starts a fresh worker', () => {
  const f = fake(), s = new Second(f.start, 1000), heard: SecondMessage[] = [];
  s.subscribe((m) => heard.push(m));
  s.post({ type: 'sequence', reqId: 1 });
  f.made[0]!.onerror!({ message: 'boom', preventDefault() {} });
  assert.equal(heard.length, 1); assert.equal(heard[0]!.type, 'crash'); assert.match(String(heard[0]!.message), /boom/);
  assert.ok(f.made[0]!.ended);
  s.post({ type: 'sequence', reqId: 2 });
  assert.equal(f.made.length, 2, 'a fresh worker');
  s.dispose();
});

test('a worker that never answers is dropped after the wait, and one that has answered is left alone', async () => {
  const f = fake(), s = new Second(f.start, 30), heard: SecondMessage[] = [];
  s.subscribe((m) => heard.push(m));
  s.post({ type: 'sequence', reqId: 1 });
  await wait(80);
  assert.deepEqual(heard.map((m) => m.type), ['crash']);
  assert.match(String(heard[0]!.message), /did not answer/);
  s.post({ type: 'whatIf', reqId: 2 });
  f.made[1]!.onmessage!({ data: { type: 'whatIf', reqId: 2 } as never });   // answered
  s.idle();
  await wait(80);
  assert.equal(heard.length, 2, 'the answer only; no crash for a worker that has nothing to answer');
  assert.ok(!f.made[1]!.ended);
  s.dispose();
});

test('a stop is silent and the wait is generous', () => {
  const f = fake(), s = new Second(f.start, 1000), heard: SecondMessage[] = [];
  s.subscribe((m) => heard.push(m));
  s.post({ type: 'sequence', reqId: 1 }); s.dispose();
  assert.deepEqual(heard, []); assert.ok(f.made[0]!.ended);
  assert.ok(SECOND_WAIT_MS >= 60000);
});

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
test('one file starts the simulation worker, and the engine has no entry in the 2D app', () => {
  const starters = files('src').filter((f) => /new Worker\([^)]*engine\/worker\.ts|new Worker\(new URL\('\.\/worker\.ts'/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(starters, ['src/engine/pool.ts']);
  const pinned = JSON.parse(readFileSync('src/engine/PINNED.json', 'utf8'));
  assert.ok(!('host' in pinned));
});

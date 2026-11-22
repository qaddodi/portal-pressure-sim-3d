import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mark, marksIn, resetMarks, watchBlocks, type BlockEnv, type Block } from '../src/clock/blocks.ts';

// A fake clock the test drives: `later` queues the tick, `run(t)` advances to t and runs it.
function fake(): { env: BlockEnv; run(t: number): void } {
  let t = 0, q: (() => void) | null = null;
  return { env: { now: () => t, later: (fn) => { q = fn; } }, run(to: number) { t = to; const f = q; q = null; f?.(); } };
}

test('a timer that is late by over 50 ms is a block, and it carries the marks left inside it', () => {
  resetMarks();
  let q: (() => void) | null = null;
  const got: Block[] = [];
  watchBlocks((b) => got.push(b), { now: () => performance.now(), later: (fn) => { q = fn; } });
  const tick = () => { const f = q; q = null; f?.(); };
  tick();                                   // on time
  mark('talk:open-deck');
  const t = performance.now(); while (performance.now() - t < 70) { /* the main thread held */ }
  mark('deck-ui:committed');
  tick();                                   // the late one
  assert.equal(got.length, 1);
  assert.ok(got[0]!.ms >= 60 && got[0]!.ms < 200);
  assert.deepEqual(got[0]!.marks.map((m) => m.replace(/@\+\d+$/, '')), ['talk:open-deck', 'deck-ui:committed']);
});

test('a tick on time, or late by under 50 ms, is no block', () => {
  const f = fake(), got: Block[] = [];
  watchBlocks((b) => got.push(b), f.env);
  f.run(4); f.run(8); f.run(8 + 4 + 49); f.run(61 + 4 + 49);
  assert.equal(got.length, 0);
  f.run(114 + 4 + 51);
  assert.equal(got.length, 1);
});

test('marksIn lists the marks inside a window with their offsets, and the last one before it with a ^', () => {
  resetMarks();
  mark('step hvpg:0');
  const a = performance.now();
  mark('talk:open-deck'); mark('deck-ui:committed');
  const b = performance.now();
  const m = marksIn(a - 0.0001, b + 1);
  assert.deepEqual(m.map((x) => x.replace(/@\+\d+$/, '')), ['^step hvpg:0', 'talk:open-deck', 'deck-ui:committed']);
  assert.match(m[1]!, /@\+\d+$/);
});

test('stop() ends the watch', () => {
  const f = fake(), got: Block[] = [];
  const stop = watchBlocks((b) => got.push(b), f.env);
  f.run(4); stop(); f.run(500);
  assert.equal(got.length, 0);
});

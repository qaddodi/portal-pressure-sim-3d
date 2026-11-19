// The recorder keeps a ring of numbers, packs them in the 2D history form, and the motion rules judge what it holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder, type Sources } from '../src/ui/debug/watch/recorder.ts';
import { decodeHistory } from '../src/ui/debug/core/history.copied.js';

let shown = 1;
const src: Sources = {
  camera: () => [1, 100, 100],
  labels: () => [['Portal vein', 10, 10, 80, 18, 1]],
  cards: () => ({ K: [['teach', 16, 400, 358, 300, shown]], W: [1] }),
};

test('it keeps the last 20 seconds and drops what is older', () => {
  const r = createRecorder(src, { now: () => 0 });
  for (let i = 0; i < 2000; i++) r.sample(i * 16);
  const s = r.samples();
  assert.ok(s[s.length - 1]!.t - s[0]!.t <= 20000 + 16, 'a ring of 20 s');
  assert.ok(s.length < 1300);
});

test('a source that throws is a null part, never a lost frame', () => {
  const r = createRecorder({ ...src, labels: () => { throw new Error('layout'); } }, { now: () => 0 });
  r.sample(0);
  assert.equal(r.samples()[0]!.L, null);
  assert.deepEqual(r.samples()[0]!.c, [1, 100, 100]);
});

test('the packed history is the 2D form and decodes to the same samples', () => {
  const r = createRecorder(src, { now: () => 0 });
  r.event('view', { to: 'lobule' }, 5);
  for (let i = 0; i < 100; i++) r.sample(i * 16);
  const h = r.exportHistory(5);
  assert.equal(h.v, 1);
  assert.ok(h.events.some((e: { k: string }) => e.k === 'view'));
  const d = decodeHistory(h);
  assert.equal(d.samples.length, h.samples.length);
  assert.ok(d.samples.every((s: { K: unknown[] }) => s.K.length === 1));
});

test('a card that blinks while the recorder watches is a finding of the flash rule; a steady page has none', () => {
  const steady = createRecorder(src, { now: () => 0 });
  for (let i = 0; i < 60; i++) steady.sample(i * 16);
  assert.deepEqual(steady.findings(), []);
  const r = createRecorder(src, { now: () => 0 });
  for (let i = 0; i < 60; i++) { shown = i >= 20 && i < 24 ? 0 : 1; r.sample(i * 16); }
  shown = 1;
  assert.ok(r.findings().some((f) => f.rule === 'flash'));
  r.clear();
  assert.equal(r.samples().length, 0);
});

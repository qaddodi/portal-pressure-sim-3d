// The scene reads its patient through a source (src/scene/model-source.ts): the page's is the engine store, a twin's is its own frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedSource, liveSource } from '../src/scene/model-source.ts';
import { latest, patient } from '../src/engine/store.ts';

test('the live source reads the engine store', () => {
  assert.equal(liveSource.frame(), latest.frame);
  assert.equal(liveSource.reference(), patient.reference);
  assert.equal(liveSource.params(), patient.params);
});

test('a fixed source keeps its own patient and ignores the store', () => {
  const f = { P: [1], Q: [2], running: true } as never;
  const src = fixedSource(f, { a: 1 }, null);
  assert.equal(src.frame(), f);
  assert.equal(src.liveFrame(), f);
  assert.deepEqual(src.shown(), { a: 1 });
  const g = { P: [3] } as never;
  src.set(g);
  assert.equal(src.frame(), g);
  assert.deepEqual(src.params(), { a: 1 });
});

test('the scene takes the source it is given and reads no engine global of its own', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8').replace(/typeof latest\.frame/g, '');
  assert.ok(!/\blatest\.frame\b|\blive\.frame\b|\bshownParams\(|\bpatient\.(reference|params)\b/.test(text));
  assert.ok(/this\.src = opts\.source \?\? liveSource/.test(text));
});

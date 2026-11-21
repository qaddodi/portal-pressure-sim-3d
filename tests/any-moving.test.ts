import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anyMoving, lapTimer } from '../src/scene/any-moving.ts';

test('anyMoving ORs already-computed flags', () => {
  assert.equal(anyMoving(false, true, false), true);
  assert.equal(anyMoving(false, false), false);
});
test('a later step still runs when an earlier one is moving', () => {
  let ran = 0;
  const step = (r: boolean) => { ran++; return r; };
  assert.equal(anyMoving(step(true), step(true), step(false)), true);
  assert.equal(ran, 3);
});
test('lapTimer totals per system', () => {
  let t = 0; const tot: Record<string, number> = {};
  const lap = lapTimer(tot, () => t);
  t = 5; lap('a'); t = 12; lap('b'); t = 14; lap('a');
  assert.deepEqual(tot, { a: 7, b: 7 });
});

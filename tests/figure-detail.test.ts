import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figureDpr } from '../src/scene/quality.ts';
import { FIGURE_DETAIL } from '../src/state/settings.ts';

test('Figure detail caps the canvas pixel ratio at 1x, 1.5x and 2x, never above the screen', () => {
  assert.deepEqual(FIGURE_DETAIL.map((d) => figureDpr(FIGURE_DETAIL.indexOf(d), true, false, 3)), [1, 1.5, 2]);
  assert.equal(figureDpr(2, true, false, 1.25), 1.25);
  assert.equal(figureDpr(2, true, false, 1), 1);
});
test('Sharp while moving off draws at 1x while a gesture or a camera move runs, sharp again once it settles', () => {
  assert.equal(figureDpr(2, false, true, 2), 1);
  assert.equal(figureDpr(2, false, false, 2), 2);
  assert.equal(figureDpr(2, true, true, 2), 2);
});
test('a bad detail index falls back into range', () => {
  assert.equal(figureDpr(-4, true, false, 2), 1);
  assert.equal(figureDpr(9, true, false, 3), 2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useDeck } from '../src/state/deck.ts';

test('a deck opens on its title, walks forward and back, and stops at both ends', () => {
  const d = useDeck;
  d.getState().open('hvpg', 5);
  assert.equal(d.getState().slide, 0);
  assert.equal(d.getState().back(), false);
  for (let i = 1; i <= 5; i++) { assert.equal(d.getState().next(), true); assert.equal(d.getState().slide, i); assert.equal(d.getState().dir, 1); }
  assert.equal(d.getState().next(), false);
  assert.equal(d.getState().back(), true); assert.equal(d.getState().dir, -1);
  assert.equal(d.getState().goto(0), true);
  d.getState().close();
  assert.equal(d.getState().mode, 'free');
  assert.equal(d.getState().next(), false);
});

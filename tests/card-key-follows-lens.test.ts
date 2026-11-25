// Capture 84496815, Two inflows 3 with Oxygen pressed: the data card's first row still said "Origin" over the oxygen colours. Root: the card's key was asked of the slide's own lens (cardKeyAt), never of the lens a
// lens button put on the figure (pickCompare sets the labels' key). Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardKeyFollows } from '../src/scene/labels/deck-link.ts';

test('a lens button that puts a dock lens on the figure takes the card key row away; Origin pressed again brings it back', () => {
  assert.equal(cardKeyFollows('origin', true, null), 'origin', 'nothing pressed: the slide\'s own key');
  assert.equal(cardKeyFollows('origin', true, 'oxygen'), null, 'Oxygen pressed: its key is the dock\'s');
  assert.equal(cardKeyFollows('origin', true, 'origin'), 'origin', 'Origin pressed again');
  assert.equal(cardKeyFollows('firstpass', true, 'pressure'), null);
});
test('a slide without lens buttons, or without a card key, is untouched', () => {
  assert.equal(cardKeyFollows('origin', false, 'oxygen'), 'origin');
  assert.equal(cardKeyFollows(null, true, 'oxygen'), null);
  assert.equal(cardKeyFollows('pressure', true, 'oxygen'), null, 'a dock lens is never a card key');
});
test('the card layer asks with the labels\' live key', () => {
  const src = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(src, /const liveKey = useLabels\(\(s\) => s\.key\)/);
  assert.match(src, /cardKeyAt\(stops, here\?\.from \?\? pos\.stop, liveKey\)/);
});

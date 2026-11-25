// Capture 84496815, Ascites 13: "7.7 L removed, Albumin 46 to 62 g" under words that say the LVP drains the whole 5.9 L. The removed count was the most the belly held since the PANE mounted (kept from the slide before),
// not since the procedure began. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tapPeak, tapWords } from '../src/ui/tests/abdomen/model.ts';

test('the count starts when the procedure does: an earlier, higher reading is not litres taken off', () => {
  let peak = 0;
  for (const l of [3, 6, 7.7]) peak = tapPeak(peak, l, false);   // the slide before: the belly filling
  assert.equal(peak, 7.7);
  peak = tapPeak(peak, 5.9, true);                                  // the procedure begins at 5.9 L
  assert.equal(peak, 5.9);
  for (const l of [4.2, 2, 0]) peak = tapPeak(peak, l, false);
  assert.equal(peak, 5.9);
  assert.equal(tapWords(Math.max(0, peak - 0)).removed, '5.9 L removed');
  assert.equal(tapWords(5.9).dose, 'Albumin 35 to 47 g (6 to 8 g per liter)');
});
test('no reading leaves the peak as it was; a reading that rises while draining raises it', () => {
  assert.equal(tapPeak(5.9, NaN, false), 5.9);
  assert.equal(tapPeak(5.9, NaN, true), 5.9);
  assert.equal(tapPeak(5.9, 6.1, false), 6.1);
});
test('the pane counts from the procedure\'s start', () => {
  const src = readFileSync(new URL('../src/ui/tests/abdomen/AbdomenPane.tsx', import.meta.url), 'utf8');
  assert.match(src, /peak\.current = tapPeak\(peak\.current, litres, tapping && !wasTapping\.current\)/);
});

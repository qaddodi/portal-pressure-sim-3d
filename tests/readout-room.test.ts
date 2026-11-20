// Eyes, 20 Nov (phone, Lobule): the strip's number boxes were 57.9 px wide against 2D's 39.9. Root cause: the tile reserved room for 3 digits and a decimal point at every strip
// (a literal `3ch + 0.26em`), where 2D's tile-el.js reserves two whole digits and the tile's own decimals: 62 has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roomFor } from '../src/ui/shell/lobule-strip.ts';

test('a reading keeps room for two whole digits and its own decimals', () => {
  assert.equal(roomFor(1), 'round(up, calc(3ch + 0.26em), 1px)');
  assert.equal(roomFor(0), 'round(up, calc(2ch), 1px)');
  assert.ok(!/3ch \+ 0\.26em/.test(readFileSync('src/ui/shell/PlayBar.tsx', 'utf8')), 'no literal room left in a tile');
});

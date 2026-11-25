// Capture 84496815 (iPad 834x1108): the © was missing on Circuit 10 and Choose treatment 12, the two slides whose one card is a chart. The run on the capture's own conditions logged the floating line as `covered` for as long as
// either slide stood, with the card's box (bottom 945 and 886), the pill (424..696 x 1024..1068) and the line (8..218 x 1089..1106) nowhere near each other. The judge also counts every word and picture found under a card
// (cardContent), by their own boxes, wherever they stand; so something under the chart's card that is drawn outside the card (a card clips it) was an obstacle in the credit's own corner. A card's content now counts only
// where the card shows it (clipTo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clipTo, footClear } from '../src/ui/shell/credit-foot.ts';

test('what lies outside its card is not an obstacle; what lies inside counts, cut to the card', () => {
  const card = { l: 125, t: 107, r: 709, b: 945 };
  assert.equal(clipTo({ l: 8, t: 1085, r: 218, b: 1106 }, card), null, 'a box parked in the screen\'s foot corner, outside the card');
  assert.deepEqual(clipTo({ l: 100, t: 900, r: 300, b: 1000 }, card), { l: 125, t: 900, r: 300, b: 945 }, 'a box that crosses the card\'s edge keeps the part inside');
  assert.deepEqual(clipTo({ l: 200, t: 300, r: 400, b: 340 }, card), { l: 200, t: 300, r: 400, b: 340 });
  assert.deepEqual(clipTo({ l: 1, t: 2, r: 3, b: 4 }, null), { l: 1, t: 2, r: 3, b: 4 }, 'no card, nothing to clip to');
});

test('the logged geometry: the credit is clear once the content outside the card is dropped', () => {
  const at = { x: 8, y: 1089 }, w = 210, h = 17;
  const card = { l: 125, t: 107, r: 709, b: 945 }, pill = { l: 424, t: 1024, r: 696, b: 1068 };
  assert.ok(footClear(at, w, h, [card, pill]), 'card and pill alone leave the corner clear');
  const stray = { l: 8, t: 1085, r: 218, b: 1106 };
  assert.ok(!footClear(at, w, h, [card, pill, stray]), 'a box standing in the corner covers it (the old judgement)');
  assert.ok(footClear(at, w, h, [card, pill, ...[clipTo(stray, card)].filter((q) => q !== null)]), 'clipped to the card it is nothing');
});

test('cardContent clips every word and picture to the card that holds it, and the card\'s own edge to nothing', () => {
  const src = readFileSync('src/ui/shell/Credit.tsx', 'utf8');
  assert.match(src, /clipTo\(\{ l: r\.left, t: r\.top, r: r\.right, b: r\.bottom \}, shows\)/);
  assert.match(src, /card\.classList\.contains\('dk-card'\) \? \{ l: c\.left, t: c\.top, r: c\.right, b: c\.bottom \} : null/);
});

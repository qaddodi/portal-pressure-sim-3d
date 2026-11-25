// A card that pages is one height on every page (Mohammad, 25 Nov: a card never changes size on screen; Carvedilol 10 on an iPhone: page 2 of 2 was a line longer and the card grew 30 px on the turn).
// The layer walks the pages out of sight before the card lands (CardLayer `surveying`) and gives the plan the tallest. The walk's two rules are pure (pages.ts); the wiring is pinned from the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextToMeasure, tallestPage } from '../src/ui/cards/pages.ts';

const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');

test('the walk visits every page once, in order, and ends', () => {
  assert.equal(nextToMeasure(undefined, 1), undefined, 'a card of one page has nothing to walk');
  assert.equal(nextToMeasure(undefined, 3), 0);
  assert.equal(nextToMeasure([298], 3), 1);
  assert.equal(nextToMeasure([298, 328], 3), 2);
  assert.equal(nextToMeasure([298, 328, 300], 3), undefined);
  assert.equal(nextToMeasure([undefined, 300], 2), 0);
});

test('every page takes the tallest page\'s height (298 then 328: both 328)', () => {
  assert.equal(tallestPage([298, 328], 2), 328);
  assert.equal(tallestPage([298], 2), 298, 'a partial walk is the floor so far');
  assert.equal(tallestPage(undefined, 2), 0);
  assert.equal(tallestPage([300, 400], 1), 0, 'a card of one page is its own height');
});

test('the layer walks before it lands, gives the plan the tallest, and holds the cards while it walks', () => {
  assert.match(layer, /const surveying = nextPage !== undefined && liveWords\.current !== wordsKey && surveyLate !== pagesKey/);
  assert.match(layer, /const at = surveying \? nextPage! : clampPage\(page, pages\)/);
  assert.match(layer, /h: h\(wordsKey\) > 0 \? Math\.max\(h\(wordsKey\), pageMax\) : 0/);
  assert.match(layer, /\|\| tightens \|\| surveying;/);
  // a card on screen is never walked under the reader's eyes, and the walk gives up with the cards' own give-up
  assert.match(layer, /useEffect\(\(\) => \{ if \(go && view\) liveWords\.current = wordsKey; \}\);/);
  assert.match(layer, /clock\.afterReal\(\(\) => setSurveyLate\(pagesKey\), GIVE_UP_CARDS_MS\)/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stopsOf } from '../src/ui/deck/presenter-machine.ts';
import { dataKeys, keepData } from '../src/ui/cards/keep.ts';
import { loadBuiltin } from '../src/decks/registry.ts';

// Mohammad, 20 Nov: in the Circulation deck the instrument card must persist from one slide to the next that shares it (2D card-keep.js keepData), and only the words card change.
test('the card the 2D app keeps is one card here: the same key on both slides', async () => {
  const deck = (await loadBuiltin('circulation'))!;
  const stops = stopsOf(deck);
  const keys = dataKeys(deck, stops);
  const at = (id: string) => stops.findIndex((s) => s.kind === 'slide' && s.slide.id === id);
  const key = (id: string) => keys[at(id)]?.key;
  assert.equal(key('series'), key('ladder'), 'series to ladder: the same profile instrument stays');
  assert.notEqual(key('inflow'), key('series'), 'the flows card is another instrument');
  // (Mohammad 20 Nov: a slide with no instrument of its own keeps the card on screen, once Circulation 5 after 4; since a9d9a7a1 that slide has its own "Across the lobule" card, so the keep left is 3 to 4)
  assert.equal(keys[at('ladder')]?.from, at('ladder'), 'the card shows the slide whose instrument it is (the ladder\'s, shared with the series slide before it)');
  assert.notEqual(key('lobule'), key('ladder'), 'the lobule slide brings its own card now');
  assert.notEqual(key('wall'), key('lobule'), 'a slide with an instrument of its own brings its own card');
  assert.equal(keys[at('flowres')]?.key, 'table:flowres', 'a summary panel brings its own card');
  const slides = stops.flatMap((s) => (s.kind === 'slide' ? [s.slide] : []));
  assert.equal(keepData(slides[1] as never, slides[2] as never), true);
});

test('a card shows the words it came in with: the slide a change has not yet reached the stack for never rewrites the card still standing', () => {
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /e\.phase === 'in' && \(e\.key === wordsKey \|\| e\.key === dataKey\)\) snaps\[e\.key\] = now/);
});

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
  assert.equal(key('lobule'), key('ladder'), 'a slide with no instrument of its own keeps the card on screen (Mohammad, 20 Nov: 4 to 5)');
  assert.equal(keys[at('lobule')]?.from, at('ladder'), 'and the card shows the slide whose instrument it is');
  assert.notEqual(key('wall'), key('lobule'), 'a slide with an instrument of its own brings its own card');
  assert.equal(keys[at('flowres')]?.key, 'table:flowres', 'a summary panel brings its own card');
  const slides = stops.flatMap((s) => (s.kind === 'slide' ? [s.slide] : []));
  assert.equal(keepData(slides[1] as never, slides[2] as never), true);
});

test('a card shows the words it came in with: the slide a change has not yet reached the stack for never rewrites the card still standing', () => {
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /e\.phase === 'in' && \(e\.key === wordsKey \|\| e\.key === dataKey\)\) snaps\[e\.key\] = now/);
});

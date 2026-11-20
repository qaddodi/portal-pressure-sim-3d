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
  assert.equal(keys[at('series')], keys[at('ladder')], 'series to ladder: the same profile instrument stays');
  assert.notEqual(keys[at('inflow')], keys[at('series')], 'the flows card is another instrument');
  assert.notEqual(keys[at('ladder')], keys[at('wall')], 'a slide with no instrument between them clears it');
  const slides = stops.flatMap((s) => (s.kind === 'slide' ? [s.slide] : []));
  assert.equal(keepData(slides[1] as never, slides[2] as never), true);
});

test('a card shows the words it came in with: the slide a change has not yet reached the stack for never rewrites the card still standing', () => {
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /e\.phase === 'in' && \(e\.key === wordsKey \|\| e\.key === dataKey\)\) snaps\[e\.key\] = now/);
});

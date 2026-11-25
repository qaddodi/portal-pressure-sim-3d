// Next bleed 11 (iPhone, capture f23a4c59) showed the Outflow table's six names over grey bars: the table's rows are stored under the deck's id and the slide's id, and many decks have a slide called
// "summary". The card that was leaving as the talk changed still held the previous deck's slide but drew it with the new deck, so the new deck's key was filled with rows that were not its own,
// and the right ones were never asked for again. A table is only ever worked out for a slide of the deck it is asked with, and a leaving card keeps its own deck as it keeps its own slide.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBuiltin } from '../src/decks/registry.ts';
import type { Deck, Slide } from '../src/decks/schema.ts';
import { resolveTable, slideOfDeck, useTables } from '../src/ui/talk/table-rows.ts';

const deckOf = async (id: string): Promise<Deck> => { const d = await loadBuiltin(id); assert.ok(d, `${id} loads`); return d; };
const summary = (d: Deck): Slide => { const s = d.slides.find((x) => x.id === 'summary'); assert.ok(s, 'it has a summary'); return s; };

test('a slide is its own deck\'s, and no other deck\'s even when they share the slide\'s name', async () => {
  const nb = await deckOf('next-bleed'), out = await deckOf('outflow');
  assert.ok(summary(nb).table && summary(out).table, 'both decks end in a table called "summary"');
  assert.ok(slideOfDeck(nb, summary(nb)));
  assert.ok(!slideOfDeck(nb, summary(out)), 'Outflow\'s summary is not Next bleed\'s');
});

test('a table asked for with the wrong deck is not worked out, and leaves the right deck\'s key empty', async () => {
  const nb = await deckOf('next-bleed'), out = await deckOf('outflow');
  resolveTable(nb, summary(out));
  assert.equal(useTables.getState().rows['next-bleed:summary'], undefined, 'nothing is stored under Next bleed for Outflow\'s rows');
});

test('a card that leaves keeps its own deck with its own slide (every card of CardLayer draws with the snapshot\'s deck)', () => {
  const src = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('switch (e.id) {'), src.indexOf('const labelOf'));
  assert.match(src, /const now: Snap = \{ deck,/, 'the snapshot holds the deck');
  assert.ok(!/deck=\{deck\}|deckId=\{deck\.id\}/.test(body), 'no card takes the live deck');
});

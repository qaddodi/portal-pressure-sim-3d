// Plan 45: every set of words a compare button can put on a card is rendered into the card before it shows, so a press never changes its height. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { variantWords, speaks } from '../src/decks/controls.ts';
import { variantsOf } from '../src/ui/cards/variants.ts';
import type { Deck } from '../src/decks/schema.ts';

const decks: Deck[] = [];
for (const d of UI.decks) { const deck = await loadBuiltin(d.id); if (deck) decks.push(deck); }
const idOf = (w: { title: string; line: string }) => `${w.title}\u0001${w.line}`;

test('for every slide with a speaking compare row, every option that brings words is among the variants the card holds', () => {
  let rows = 0, extra = 0;
  for (const deck of decks) for (const s of deck.slides) {
    const opts = s.controls?.compare?.opts ?? [];
    const list = variantsOf(s, deck);
    assert.equal(idOf(list[0]!), idOf(s), `${deck.id}/${s.id}: the slide's own words come first`);
    if (!speaks(opts)) { assert.equal(list.length, 1, `${deck.id}/${s.id}: no speaking button, one set of words`); continue; }
    rows++;
    for (const o of opts) {
      if (o.how === 'lens' || o.gate || o.tool) continue;
      const at = o.slide ? deck.slides.find((x) => x.id === o.slide) ?? null : null;
      const w = variantWords(s, o, at);
      assert.ok(list.some((x) => idOf(x) === idOf(w)), `${deck.id}/${s.id}: "${o.label}" is not reserved`);
    }
    assert.equal(new Set(list.map(idOf)).size, list.length, `${deck.id}/${s.id}: no duplicate`);
    extra += list.length - 1;
  }
  assert.ok(rows >= 5, `slides with a speaking compare row (${rows})`);
  assert.ok(extra >= 5, `variants reserved beyond the slide's own (${extra})`);
});

test('TeachingCard renders them in one grid cell, the shown one on, the rest hidden, inert and out of the reading order', () => {
  const tc = readFileSync('src/ui/cards/TeachingCard.tsx', 'utf8');
  assert.match(tc, /className="pz-vars"/);
  assert.match(tc, /data-var=\{on \? 'on' : 'off'\}/);
  assert.match(tc, /'aria-hidden': true, inert: true/);
  assert.match(tc, /titles\('h1'\)/, 'the panel form too');
  assert.match(tc, /titles\('h2', kick\)/);
  const css = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(css, /\.pz-vars \{ display: grid; \}/);
  assert.match(css, /\.pz-vars > \* \{ grid-area: 1 \/ 1;/);
  assert.match(css, /\.pz-vars > \[data-var="off"\] \{ opacity: 0; visibility: hidden;/);
  assert.doesNotMatch(css.slice(css.indexOf('.pz-vars'), css.indexOf('/* One tag per card')), /display: none/, 'a reserved variant keeps its room: opacity and visibility only');
});

test('every title the card holds is judged for "long" the same way, so the reserve is the tallest one\'s', () => {
  const cf = readFileSync('src/ui/cards/CardFrame.tsx', 'utf8');
  assert.match(cf, /querySelectorAll<HTMLElement>\('\.pz-h'\)\.forEach/);
});

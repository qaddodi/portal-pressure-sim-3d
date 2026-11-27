// Owner's ruling L7 (27 Nov 2026, review 3531bdfa B-D4 and Q-L6): a compare button keeps THIS slide's title and changes only the numbers, the figure and the line's readings to its arm.
// Pinned over EVERY compare button of EVERY deck (not Landmark trials 4, 7, 9, 13, 14 alone): the words a button puts on the card never carry another title, and the card holds one title only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { variantWords } from '../src/decks/controls.ts';
import { variantsOf } from '../src/ui/cards/variants.ts';
import type { Deck } from '../src/decks/schema.ts';

const decks: Deck[] = [];
for (const d of UI.decks) { const deck = await loadBuiltin(d.id); if (deck) decks.push(deck); }

test('no compare button of any deck brings a title: the words it puts on the card carry the slide\'s own', () => {
  let buttons = 0, other = 0;
  for (const deck of decks) for (const s of deck.slides) for (const o of s.controls?.compare?.opts ?? []) {
    if (o.how === 'lens' || o.gate || o.tool) continue;
    const at = o.slide ? deck.slides.find((x) => x.id === o.slide) ?? null : null;
    const w = variantWords(s, o, at);
    assert.equal(w.title, s.title, `${deck.id}/${s.id} "${o.label}": the title stays the slide's`);
    buttons++;
    if (o.slide || o.title) other++;
  }
  assert.ok(buttons >= 100, `${buttons} compare buttons`);
  assert.ok(other >= 20, `${other} buttons that name another slide or carry a title of their own (the cases this pins)`);
});

test('the card holds one title for every button of a slide (a press changes numbers and figure, never the heading), and Landmark trials 4, 7, 9, 13, 14 are among them', () => {
  for (const deck of decks) for (const s of deck.slides) {
    const titles = new Set(variantsOf(s, deck).map((w) => w.title));
    assert.deepEqual([...titles], [s.title], `${deck.id}/${s.id}`);
  }
  const lt = decks.find((d) => d.id === 'landmark-trials')!;
  for (const id of ['predesci-arms', 'transfusion-arms', 'earlytips', 'covered-arms', 'rifaximin']) {
    const s = lt.slides.find((x) => x.id === id)!;
    const named = (s.controls?.compare?.opts ?? []).filter((o) => o.slide);
    assert.ok(named.length >= 1, `${id} has a button that names another slide`);
    for (const o of named) assert.notEqual(variantWords(s, o, lt.slides.find((x) => x.id === o.slide)).title, lt.slides.find((x) => x.id === o.slide)!.title, `${id} "${o.label}" does not bring that slide's headline`);
  }
});

test('a button that names another slide still takes that arm\'s numbers: the press works the state out from that slide', () => {
  const src = readFileSync(new URL('../src/ui/talk/controls-run.ts', import.meta.url), 'utf8');
  assert.match(src, /const j = o\.slide \? deck\.slides\.findIndex\(\(s\) => s\.id === o\.slide\) : i;/);
  assert.match(src, /variantStateOf\(seq, picked, \{ slideKey: key \}, o, stateOf\(deck, i\), stateOf\(deck, j\)\)/, 'the state is the named slide\'s');
});

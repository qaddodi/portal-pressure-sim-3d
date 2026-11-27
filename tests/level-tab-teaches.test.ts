// Owner's ruling L8 (27 Nov 2026, review 3531bdfa B-D12 and F-D8): the level tab stands only on a slide that teaches a level; every other slide of the deck shows the deck's name tab.
// A slide's `site` makes its tab (card-fields.ts siteTag): decks 09 (Meso-Rex) and 14 (Ascites) had set it on every slide of the block, so a frailty or a diuretics slide read "SINUSOIDAL".
// Pinned as a rule over every deck: where a deck mixes teaching slides and management slides, the slides that teach are listed here, and no other slide of that deck claims a level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { tabOf, SITE_TAGS } from '../src/ui/cards/card-fields.ts';
import { tabName } from '../src/decks/outline.ts';
import type { Deck } from '../src/decks/schema.ts';

const decks: Deck[] = [];
for (const d of UI.decks) { const deck = await loadBuiltin(d.id); if (deck) decks.push(deck); }
const byId = (id: string) => decks.find((d) => d.id === id)!;

/** The slides that teach a level, by deck, with the level each one teaches. Everything else in these decks is treatment, procedure, test or summary. */
const TEACHES: Record<string, Record<string, string>> = {
  'meso-rex': { child: 'pre', cavernoma: 'pre', gradients: 'pre', stiff: 'pre' },
  ascites: { start: 'sin', lymph: 'sin', fill: 'sin', overrun: 'sin', balance: 'sin', hf: 'cardiac', bc: 'post' },
};

test('in Meso-Rex and Ascites the level tab stands on the slides that teach a level and on no other', () => {
  for (const [id, lessons] of Object.entries(TEACHES)) {
    const deck = byId(id);
    for (const s of deck.slides) {
      const tab = tabOf(deck, s);
      if (s.id in lessons) {
        assert.ok(tab, `${id}/${s.id} teaches the ${lessons[s.id]} level and shows its tab`);
        assert.equal(tab!.site, lessons[s.id], `${id}/${s.id}`);
      } else assert.equal(tab, null, `${id}/${s.id} does not teach a level, so it shows the deck's tab (it showed ${tab?.name})`);
    }
  }
});

test('a slide with no level tab shows the deck\'s name tab (these decks have one)', () => {
  for (const id of Object.keys(TEACHES)) assert.ok(tabName(byId(id), (UI.decks as readonly { id: string; head?: string | null }[]).find((d) => d.id === id)?.head ?? null), `${id} has a name tab`);
});

test('a level tab claims only a level the slide is about: it never stands over a slide of management, test or summary', () => {
  // (the management words a title carries; a slide with a level tab and one of these in its title is claiming a level for a treatment)
  const MANAGEMENT = /\b(albumin|paracentesis|diuretic|carvedilol|TIPS|frailty|sarcopenia|bypass|shunt|monitor|refractory|algorithm)\b/i;
  const found: string[] = [];
  for (const id of Object.keys(TEACHES)) {
    const deck = byId(id);
    for (const s of deck.slides) if (tabOf(deck, s) && MANAGEMENT.test(s.title) && !(s.id in TEACHES[id]!)) found.push(`${id}/${s.id}: ${s.title}`);
  }
  assert.deepEqual(found, []);
  for (const id of Object.keys(TEACHES)) for (const lvl of Object.values(TEACHES[id]!)) assert.ok(SITE_TAGS[lvl], `${lvl} is a level`);
});

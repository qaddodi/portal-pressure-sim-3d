// Mohammad, 28 Nov: a slide that only changes the view and keeps the same teaching card must not let that card swipe out and bounce back. Every move of every deck: a card the place
// it goes to shows again stays put under the finger; a card that changes follows it. And the card layer hands the drag exactly that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stopsOf, viewAt, lastSlideShot, apply, samePos, type Move, type Pos } from '../src/ui/deck/presenter-machine.ts';
import { dataKeys } from '../src/ui/cards/keep.ts';
import { keptByMove } from '../src/ui/cards/swipe-keeps.ts';
import { phoneView } from '../src/ui/cards/phone-panel.ts';
import { wordsCardKey, cardKey } from '../src/ui/cards/card-key.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { UI } from '../src/ui/strings.generated.ts';
const DECK_IDS = UI.decks.map((d) => d.id);

test('in every deck, a beat of the same slide leaves the words card in place, and a change of slide lets it go', async () => {
  let beats = 0, slides = 0;
  for (const id of DECK_IDS) {
    const deck = await loadBuiltin(id); if (!deck) continue;
    const stops = stopsOf(deck), dataAt = dataKeys(deck, stops);
    for (const sideways of [false, true]) for (let stop = 0; stop < stops.length; stop++) for (let beat = 0; ; beat++) {
      const pos = { stop, beat };
      const to0 = apply(stops, pos, 'next');
      if (beat > 0 && to0.stop === stop && to0.beat === beat) break;
      const here = dataAt[stop] ?? null;
      const v = phoneView(viewAt(stops, pos, lastSlideShot(stops)), sideways, here?.kind);
      const wordsNow = wordsCardKey(deck.id, v.words, v.slide?.id), dataNow = v.data && here ? cardKey(deck.id, here.key) : null;
      for (const m of ['next', 'back'] as Move[]) {
        const to: Pos = apply(stops, pos, m); if (samePos(to, pos)) continue;
        const k = keptByMove(deck.id, stops, pos, m, dataAt, wordsNow, dataNow, sideways);
        const v2 = phoneView(viewAt(stops, to, lastSlideShot(stops)), sideways, dataAt[to.stop]?.kind);
        const same: boolean = wordsCardKey(deck.id, v2.words, v2.slide?.id) === wordsNow;
        assert.equal(k.words, same, `${id} ${stop}.${beat} ${m}: the words card is kept exactly when the next place shows the same one`);
        if (to.stop === stop && v2.words === v.words) { assert.equal(k.words, true, `${id} ${stop}.${beat} ${m}: a beat of this slide keeps its words card`); beats++; }
        else if (to.stop !== stop && v2.slide?.id !== v.slide?.id) { assert.equal(k.words, false, `${id} ${stop}.${beat} ${m}: another slide's card is not kept`); slides++; }
      }
      if (to0.stop !== stop) break;
    }
  }
  assert.ok(beats > 10 && slides > 100, `walked ${beats} beats and ${slides} slide changes`);
});

test('the card layer hands the drag the words card\'s keep as well as the data card\'s, and the drag filters each by its own', () => {
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /keptByMove\(deck\.id, stops, pos,/);
  const drag = readFileSync(new URL('../src/ui/cards/useCardDrag.ts', import.meta.url), 'utf8');
  assert.match(drag, /filter\(\(c\) => !\(c\.data \? keep\.data : keep\.words\)\)/);
});

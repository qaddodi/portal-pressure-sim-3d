// Capture 84496815 (Two inflows 3, Oxygen pressed: the card still said "Origin" over the oxygen colours) and 28 Nov, Lobule 3 "Dual supply" on iPhone: Oxygen pressed took the Origin key away, Origin pressed again drew TWO
// (one in the instrument card, one floating pill). Root: pickCompare wrote the pressed lens to the dock's key whatever its place, so a stream lens stood in the card (cardKeyFollows) and in the dock at once. keyHomes
// (deck-link.ts) now decides the one place for the lens the figure wears. Pinned here over every slide of every talk with lens buttons, in every press order. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyHomes, cardKeyAt, labelsAt } from '../src/scene/labels/deck-link.ts';
import { KEY_LENSES } from '../src/scene/labels/key.ts';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf } from '../src/ui/deck/presenter-machine.ts';
import { dataKeys } from '../src/ui/cards/keep.ts';

test('keyHomes: one place per lens state, in every combination', () => {
  const one = (r: { card: string | null; dock: string | null }) => (r.card ? 1 : 0) + (r.dock ? 1 : 0);
  for (const own of [null, 'origin', 'firstpass', 'pressure', 'oxygen'])
    for (const buttons of [true, false]) for (const pressed of [null, 'origin', 'oxygen', 'firstpass', 'pressure', 'neutral'])
      for (const cardStands of [true, false]) {
        const r = keyHomes({ own, buttons, pressed, cardStands });
        assert.ok(one(r) <= 1, `${own}/${buttons}/${pressed}/${cardStands}: card ${r.card} and dock ${r.dock}`);
        const lens = buttons && pressed !== null ? (KEY_LENSES.includes(pressed) ? pressed : null) : own;
        assert.equal(one(r), lens ? 1 : 0, `${own}/${buttons}/${pressed}/${cardStands}: a lens with a key has one home`);
      }
  assert.deepEqual(keyHomes({ own: 'origin', buttons: true, pressed: null, cardStands: true }), { card: 'origin', dock: null });
  assert.deepEqual(keyHomes({ own: 'origin', buttons: true, pressed: 'oxygen', cardStands: true }), { card: null, dock: 'oxygen' });
  assert.deepEqual(keyHomes({ own: 'origin', buttons: true, pressed: 'origin', cardStands: true }), { card: 'origin', dock: null }, 'Origin pressed again: the card only');
  assert.deepEqual(keyHomes({ own: 'pressure', buttons: true, pressed: 'origin', cardStands: true }), { card: 'origin', dock: null });
  assert.deepEqual(keyHomes({ own: 'origin', buttons: true, pressed: 'origin', cardStands: false }), { card: null, dock: 'origin' }, 'no data card to hold it: the dock does');
  assert.deepEqual(keyHomes({ own: 'origin', buttons: false, pressed: 'oxygen', cardStands: true }), { card: 'origin', dock: null }, 'a slide without lens buttons ignores a stale press');
});

test('every slide of every talk, at every beat, in every press of its lens buttons: exactly one key, and never one that is not the lens on the figure', async () => {
  let judged = 0, presses = 0;
  for (const { id } of UI.decks) {
    const d = (await loadBuiltin(id))!, stops = stopsOf(d), data = dataKeys(d, stops);
    stops.forEach((st, i) => {
      if (st.kind !== 'slide') return;
      const lensOpts = (st.slide.controls?.compare?.opts ?? []).filter((o) => o.how === 'lens');
      for (const beat of st.slide.vignette || st.slide.question ? [0, 1] : [0]) {
        const stands = data[i]?.kind === 'ladder', at = labelsAt(stops, { stop: i, beat }, id, data);
        const card = stands ? cardKeyAt(stops, i, null, true) : null;
        assert.ok(!(at.key && card), `${id}/${st.slide.id}: two keys at rest (${at.key}, ${card})`);
        judged++;
        // press every lens button, in a row, back and forth: the key follows the last one, in one place
        const row = [...lensOpts, ...lensOpts.slice().reverse(), ...lensOpts];
        for (const o of row) {
          const lens = o.own ? null : o.lens ?? null;
          if (!lens) continue;
          presses++;
          const h = keyHomes({ own: null, buttons: true, pressed: lens, cardStands: stands }), c = cardKeyAt(stops, i, lens, stands);
          assert.equal(c, h.card, `${id}/${st.slide.id}: the card follows keyHomes`);
          assert.ok(!(h.card && h.dock), `${id}/${st.slide.id}/${lens}: two keys`);
          if (KEY_LENSES.includes(lens)) assert.equal(h.card ?? h.dock, lens, `${id}/${st.slide.id}/${lens}: its key is shown once`);
        }
      }
    });
  }
  assert.ok(judged > 300 && presses > 20, `slides ${judged}, presses ${presses}`);
});

test('the layers use it: the card asks keyHomes, a press goes through pressLens, the pressed lens is dropped with every move of the talk', () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  assert.match(read('src/ui/cards/CardLayer.tsx'), /cardKeyAt\(stops, pos\.stop, pressedLens, here\?\.kind === 'ladder'\)/);
  assert.match(read('src/ui/talk/controls-run.ts'), /pressLens\(lens\)/);
  assert.doesNotMatch(read('src/ui/talk/controls-run.ts'), /useLabels\.getState\(\)\.set\(\{ key:/, 'no press writes the dock key on its own');
  assert.match(read('src/scene/labels/deck-link.ts'), /key, pressed: null/);
});

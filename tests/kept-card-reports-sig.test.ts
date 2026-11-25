// Circulation 5 (25 Nov 2026, Mohammad, iPhone: "this slide did not zoom into lobule like it should have"). Root cause: the camera's slide move waits for the cards' FINAL room, which CardLayer publishes
// only when every card of the slide has reported its height at THIS slide's signature (`measuredNow`). A KEPT data card (the instrument carried across slides, keep.ts) is judged by CardFrame as an
// observer's measure when only the slide changes (`sameStepPass`, fresh = false), the lock swallows it, and the swallowed measure told the layer only when `fresh`: so the kept card's recorded signature stayed
// the previous slide's, the room was never final, and the move waited out the layer's 8 s crash net. It hit EVERY slide that follows a kept instrument card, in every deck.
// Pure parts are run (box-lock.ts tellsLayer, keep.ts dataKeys over every built-in deck); the wiring is held to its source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boxOf, tellsLayer, BOX_START } from '../src/ui/cards/box-lock.ts';

test('a swallowed measure tells the layer on a card\'s first pass for a slide: a new card\'s (fresh) and a kept card\'s slide change (sameStepPass), never an observer\'s later one', () => {
  assert.equal(tellsLayer(true, false, 300), true, 'a new card');
  assert.equal(tellsLayer(false, true, 300), true, 'a kept data card whose slide changed');
  assert.equal(tellsLayer(false, false, 300), false, 'a chart built or a font swapped after landing is only a note');
  assert.equal(tellsLayer(false, true, 0), false, 'no height yet: nothing to tell');
});

test('the kept card\'s slide-change measure is swallowed by the lock (the height stands) and yet reports its locked height', () => {
  const K = 'tool:series|390|1|0||';
  let s = boxOf(BOX_START, { t: 'measure', key: K, h: 320, fresh: true, shown: false }).state;
  s = boxOf(s, { t: 'show', key: K }).state;
  // the slide changes: same lock key (the step part only), judged as an observer's measure, a shorter or taller height
  for (const h of [280, 320, 400]) {
    const o = boxOf(s, { t: 'measure', key: K, h, fresh: false, shown: true });
    assert.equal(o.report, false, `${h}: the box stands`);
    assert.equal(o.state.h, 320);
    assert.equal(tellsLayer(false, true, o.state.h), true, `${h}: and the layer is still told, at the height it stands`);
  }
});

test('CardFrame passes the kept card\'s slide-change pass to it', () => {
  const cf = readFileSync('src/ui/cards/CardFrame.tsx', 'utf8');
  assert.match(cf, /if \(tellsLayer\(fresh, sameStepPass, box\.current\.h\)\) onHeight\(/);
  assert.match(cf, /sameStepPass = sameStep; report\(true, !sameStep\); sameStepPass = false;/, 'the slide-change pass is the one that sets sameStepPass');
});

test('every slide that follows a kept instrument card, in every deck, gets the report (Circulation 5, the lobule slide, is one)', async () => {
  const { stopsOf } = await import('../src/ui/deck/presenter-machine.ts');
  const { dataKeys } = await import('../src/ui/cards/keep.ts');
  const { loadBuiltin } = await import('../src/decks/registry.ts');
  const { UI } = await import('../src/ui/strings.generated.ts');
  let kept = 0, lobuleKept = false;
  for (const d of UI.decks as readonly { id: string }[]) {
    const deck = (await loadBuiltin(d.id))!, stops = stopsOf(deck), at = dataKeys(deck, stops);
    stops.forEach((st, i) => {
      const a = at[i], b = at[i - 1];
      if (st.kind !== 'slide' || !a || !b || a.key !== b.key) return;   // (the same card key as the stop before: the card is kept, not replaced)
      kept++;
      assert.equal(tellsLayer(false, true, 300), true, `${d.id} ${st.slide.id}`);
      if (d.id === 'circulation' && st.slide.id === 'lobule') lobuleKept = true;
    });
  }
  assert.ok(kept > 5, `kept instrument cards are common (${kept})`);
  assert.ok(lobuleKept, 'Circulation 5 (the lobule) carries the pressure card from the slide before it, the case this pins');
});

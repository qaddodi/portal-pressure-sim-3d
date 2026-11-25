// A card's readiness waits (its height standing still, the crash net that lets it in as it is) are waits on the page's REAL work: a layout, a measure, a font, the second engine.
// Root cause of cards that "grew after they landed" in the audit's captures (49141fb9: Carvedilol 5, Stiffness 13, TIPS complete 4, Landmark 4, Treatment 4 ...): the waits were in page time,
// which the audit's speed mode runs 60 times faster, so the 120 ms "stood still" check was 2 ms and the 8 s net was 133 ms: the card was let in on its first measure, before a row, a chart or the
// compare buttons had come, and its box locked without them (box 224, content 319: the 75 px of buttons). In REAL time the card is let in on the same terms at any speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, type Env } from '../src/clock/frame.ts';

test('the clock tells real time whatever the audit speed', () => {
  let t = 1000;
  const env: Env = { raf: () => 0, cancel: () => {}, now: () => t };
  const c = createClock(env);
  c.setScale(60);
  t += 100;
  assert.equal(c.nowReal(), 1100);
  assert.equal(Math.round(c.now() - 1000), 6000);   // (page time ran 60 times as far)
});

// (That the layer waits and reads time on the real clock only is the lint rule `card-wait-page-time` in scripts/lint-rules.mjs.)

import { rekeyed } from '../src/ui/cards/box-lock.ts';

// A data card that grew past its locked box (content that came after it was let in: Carvedilol 5 on a short Mac window landed 76 px tall and its chart grew to 190 inside it, clipped for good)
// is replaced by a fresh card at its final size, twice at most.
test('a card that outgrew its box is replaced, at most twice', () => {
  let m = rekeyed({}, 'tool:hvpg', 2);
  assert.deepEqual(m, { 'tool:hvpg': 1 });
  m = rekeyed(m, 'tool:hvpg~1', 2);
  assert.deepEqual(m, { 'tool:hvpg': 2 });
  assert.deepEqual(rekeyed(m, 'tool:hvpg~2', 2), { 'tool:hvpg': 2 }, 'the third time the lock stands');
  assert.deepEqual(rekeyed(m, 'tool:other', 2), { 'tool:hvpg': 2, 'tool:other': 1 }, 'another card has its own count');
});

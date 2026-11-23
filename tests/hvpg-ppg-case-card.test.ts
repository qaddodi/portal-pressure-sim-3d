// HVPG slide 8 (the PPG, portal vein thrombosis) opens on its own case card, as the cirrhosis and schistosomiasis slides do (Mohammad, 23 Nov 2026:
// "slide 8/15 in HVPG PPG is missing a case card?" then "sure" to the drafted words). Root cause: the 2D deck gave this slide no vignette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HVPG_DECK } from '../src/decks/hvpg.ts';

test('the PPG slide carries the portal vein thrombosis case card, in the approved words', () => {
  const s = HVPG_DECK.slides.find((x) => x.id === 'ppg');
  assert.ok(s, 'the ppg slide exists');
  assert.equal(s.vignette, 'A 41-year-old man has had variceal bleeding. His liver tests are normal, and imaging shows a chronic portal vein thrombus.');
});

test('the heart and Budd-Chiari slides are left as they were (no case card asked for)', () => {
  for (const id of ['heart', 'bc']) assert.ok(!HVPG_DECK.slides.find((x) => x.id === id)?.vignette, id);
});

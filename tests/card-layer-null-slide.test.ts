// A card that is leaving falls back to the view now when it has no snapshot, and the title and the quick check have no slide: no card may take that slide with a `!`.
// (Mac play-test, 20 Nov 2026: Back from slide 2 of the HVPG deck threw "Cannot read properties of null (reading 'vignette')" and emptied the page.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('CardLayer never asserts a snapshot slide is there', () => {
  const src = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.ok(!/sn\.slide!/.test(src), 'sn.slide! can be null on a leaving card');
});

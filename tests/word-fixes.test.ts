// A 3D-side wording of a 2D deck line (plan.ts WORD_FIXES) is kept only while the 2D text it replaces is still the 2D text: when 2D is fixed and copied again, this fails and the entry goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORD_FIXES, buildDeck } from '../src/decks/rw/plan.ts';
import { VARICES } from '../src/decks/rw/copied/varices.ts';
import { plainText } from '../src/decks/rw/numbers.ts';

test('every wording fix replaces text the copied decks still hold', () => {
  const all = JSON.stringify(VARICES);
  for (const k of Object.keys(WORD_FIXES)) assert.ok(all.includes(JSON.stringify(k).slice(1, -1)), `2D no longer says: ${k.slice(0, 60)}`);
});

test('Collaterals and varices, check 4: the NSBB response is ≥10% or to ≤12 mmHg (Baveno VIII)', () => {
  const a = plainText(buildDeck(VARICES).checks[3]!.a, null);
  assert.match(a, /≥10% and to ≤12 mmHg \(either meets the Baveno VIII response\)/);
  assert.ok(!a.includes('>10%'));
});

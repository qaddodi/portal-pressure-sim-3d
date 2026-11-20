import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownsPress } from '../src/ui/wallet/useSwipe.ts';

// The wallet strip is a <button> with the gesture handlers on it; the old test dropped every press whose target was inside a button, so a touch or click on the strip did nothing.
test('a press on the strip itself is the gesture; a press on a control inside a card is the control\'s', () => {
  const strip = { closest: () => strip } as unknown as Element;
  const inner = { closest: () => inner } as unknown as Element;
  const plain = { closest: () => null } as unknown as Element;
  assert.equal(ownsPress(strip, strip), false, 'the strip\'s own press is the swipe or tap');
  assert.equal(ownsPress(inner, strip), true, 'a button inside keeps its press');
  assert.equal(ownsPress(plain, strip), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inputsIn, GIVE_UP_MS } from '../src/ui/cards/inputs-in.ts';

// A card never shows before its content: the circuit's profile and meal-chart cards stood as a header with an empty body (20 Nov) while the second engine had not yet given their slide's numbers.
test('a chart card waits for its slide\'s numbers', () => {
  assert.equal(inputsIn(-1, undefined), true, 'no instrument, nothing to wait for');
  assert.equal(inputsIn(1, undefined), false, 'the deck\'s states are not started');
  assert.equal(inputsIn(1, [{}]), false, 'only slide 0 is in');
  assert.equal(inputsIn(1, [{}, {}]), true);
  assert.ok(GIVE_UP_MS >= 5000 && GIVE_UP_MS <= 15000, 'a stalled engine never hides the talk for good');
});
test('the card layer holds the slide for the numbers, and a failed run asks again', () => {
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /const go = fonts && !growing && \(numbers \|\| gaveUp/);
  assert.match(layer, /ensureStates\(c\)/);
  const calc = readFileSync(new URL('../src/decks/hp/calc.ts', import.meta.url), 'utf8');
  assert.match(calc, /retries\.set\(deck\.id, n \+ 1\)/);
});

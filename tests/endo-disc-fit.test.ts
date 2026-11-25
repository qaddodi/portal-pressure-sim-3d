import test from 'node:test';
import assert from 'node:assert/strict';
import { discSquare, DISC_MIN } from '../src/ui/tests/endo/disc-fit.ts';

// Capture 52ef8e63, Endoscopy 3 (iPad): the card's room was 280 px, the readings, button and EUS-PPG took ~125 and the disc asked for 220: it ran off the card's foot.
test('the disc takes what the room leaves, never more than asked, never under the minimum', () => {
  assert.equal(discSquare(280, 125, 220, 22), 133);
  assert.equal(discSquare(600, 125, 220, 22), 220);
  assert.equal(discSquare(150, 125, 220, 22), DISC_MIN);
  assert.equal(discSquare(0, 125, 220), 220);
});
test('the pane reads the room and fits the disc only when the readings stand under it', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/tests/endo/EndoPane.tsx', import.meta.url), 'utf8');
  assert.match(src, /useToolRoomValue\(\)/);
  assert.match(src, /discSquare\(room, rest, wide, label\)/);
  assert.match(src, /stacked/);
});

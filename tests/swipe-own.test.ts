// One recogniser for the whole slide (Mohammad, 20 Nov): the axis of a touch is decided once, in its first few pixels; the sideways and vertical recognisers never both take a touch;
// and only real controls are left alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { axisStart, axisOf, axisEnd, AXIS_AT } from '../src/ui/cards/swipe-own.ts';

test('the axis is undecided under 8 px, then sideways when further across than up, else vertical, and it stays', () => {
  axisStart(1);
  assert.equal(axisOf(1, 5, 3), null);
  assert.equal(axisOf(1, AXIS_AT + 2, 4), 'x');
  assert.equal(axisOf(1, 10, 60), 'x', 'a touch that went sideways first stays sideways');
  axisStart(2);
  assert.equal(axisOf(2, 3, -9), 'y');
  assert.equal(axisOf(2, 80, -10), 'y');
  axisEnd(2);
  assert.equal(axisOf(2, 9, 1), 'x', 'a new touch with the same id starts again');
});

test('the sideways recogniser listens on the window for touches (the figure, either card and the space between), the vertical one asks the same axis', () => {
  const card = readFileSync(new URL('../src/ui/cards/useCardDrag.ts', import.meta.url), 'utf8');
  const dock = readFileSync(new URL('../src/ui/cards/useDockSwipe.ts', import.meta.url), 'utf8');
  assert.match(card, /window\.addEventListener\(n, h as EventListener, \{ capture: true/);
  assert.match(card, /axisOf\(g\.id, dx, dy\) !== 'x'/);
  assert.match(dock, /axisOf\(g\.id, dx, dy\) !== 'y'/);
  assert.match(card, /isPrimary/, 'a second finger gives the swipe up');
});

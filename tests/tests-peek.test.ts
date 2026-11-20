// The Tests sheet's third stop, Peek (owner, 20 Nov: "swipe up the instrument panel so we can zoom in and view more of the figure"): the head row only, and the figure re-framed into the room it frees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testsPlace, roomWith, PEEK_H, HEAD_H } from '../src/ui/tests/place.ts';

const vp = { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } } as never;
const room = { x: 0, y: 47, w: 390, h: 700 };

test('Peek is a head row high, lower than Half and Full, and frees the figure\'s room', () => {
  const [half, full, peek] = [0, 1, 2].map((n) => testsPlace(vp, 'phone-portrait', { sheetSize: n as 0 | 1 | 2 }));
  assert.equal(peek.rect.h, PEEK_H);
  assert.ok(PEEK_H >= HEAD_H, 'the tabs and the handle stay');
  assert.ok(peek.rect.h < half.rect.h && half.rect.h < full.rect.h, 'Peek < Half < Full');
  const rooms = [half, full, peek].map((p) => roomWith(room, p).h);
  assert.ok(rooms[2] > rooms[0] && rooms[0] > rooms[1], 'the figure has the most room at Peek, the least at Full');
});

test('Peek overrides a measured content height (a short instrument must not keep the sheet tall)', () => {
  const p = testsPlace(vp, 'phone-portrait', { sheetSize: 2, contentH: 400 });
  assert.equal(p.rect.h, PEEK_H);
});

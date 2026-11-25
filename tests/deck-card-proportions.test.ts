import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutHeight } from '../src/ui/charts/profile/model.ts';

// Mohammad, 20 Nov, Sites and causes on a Mac: "the title is too big; the instrument card that has the ladder should be given more height so it displays properly";
// "always fix the root cause, apply it everywhere". Two rules of 2D's were missing in 3D: markLong (a title over 2.4 lines takes the smaller step) and the ladder's
// own height in a wide layout (app-11 --prof-h, the window's height to itself) where 3D used the stacked phone's flat 270 px cap.
test('the ladder\'s height is 2D\'s per layout: a wide screen takes the window\'s height, a phone stacked keeps the model default', () => {
  const pzh = 9, w = 585, f = 12;   // a 900 px high window, a 585 px card
  assert.equal(layoutHeight(w, f, 'wide', false, pzh), Math.round(Math.min(Math.max(0.62 * w, 28 * pzh), 40 * pzh) - 1.6 * f));
  assert.ok(layoutHeight(w, f, 'wide', false, pzh)! > Math.min(w * 0.74, 270) - 1.6 * f, 'taller than the stacked card\'s flat 270 px cap');
  assert.equal(layoutHeight(390, f, 'stack', false, 8.44), undefined);
  assert.equal(layoutHeight(500, f, 'short', true, 3.9), Math.round(Math.min(0.62 * 500, Math.max(170, 48 * 3.9)) - 1.6 * f));
});

test('every words card marks a long title as 2D does, in the one place every card is measured', () => {
  const frame = readFileSync(new URL('../src/ui/cards/CardFrame.tsx', import.meta.url), 'utf8');
  assert.match(frame, /export function markLong/); assert.match(frame, /offsetHeight > lh \* 2\.4/);
  assert.match(frame, /markLong\(innerRef\.current,/);
  assert.match(readFileSync(new URL('../src/ui/styles/app-05-presenter-cards.css', import.meta.url), 'utf8'), /\.pz-h\.long \{ font-size: var\(--s-big\)/);
});

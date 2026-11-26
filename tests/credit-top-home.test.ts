// B11 (capture 0bc14020, iPhone, a case playing): the © hopped from y 57 to y 330 between stops and landed on "IVC 4.8". Where the band under the bottom bar cannot hold it (no home indicator: an iPhone SE,
// a phone with no safe area, the capture's 390 x 844), the credit hunted for bare figure among names that were still moving. Its home is now one fixed place, read from the screen's chrome only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topHome, underDock, footClear } from '../src/ui/shell/credit-foot.ts';

const w = 206, h = 16.8, gap = 10, inset = 12;
// the top bar of the capture's phone (390 x 844, no safe area): the case picker at the left, the pressure key at the right, 8 px in, 42 px high
const chips = [{ l: 0, t: 0, r: 390, b: 50 }, { l: 8, t: 8, r: 127, b: 50 }, { l: 190, t: 8, r: 382, b: 50 }];

test('the home stands under the top bar\'s chips at the figure\'s left, one gap clear of them', () => {
  const at = topHome({ left: 0, top: 0, inset, gap, w, h, chips });
  assert.equal(at.x, inset);
  assert.equal(at.y, 50 + gap, 'under the chips that stand over its width');
  assert.ok(footClear(at, w, h, chips, 4), 'no chip touches it');
});

test('the home is the same at every stop: it reads the chrome, never the figure\'s names or a card, so a case\'s stops cannot move it', () => {
  const first = topHome({ left: 0, top: 0, inset, gap, w, h, chips });
  // (the names of the figure, the stop's card and the tests sheet are not inputs: whatever stands now, the answer is the one place)
  for (let stop = 0; stop < 8; stop++) assert.deepEqual(topHome({ left: 0, top: 0, inset, gap, w, h, chips: [...chips] }), first);
});

test('a chip that does not stand over the line\'s width does not push it down; the safe area and the inset set its least height', () => {
  const far = [{ l: 300, t: 8, r: 382, b: 90 }];
  assert.equal(topHome({ left: 0, top: 0, inset, gap, w, h, chips: far }).y, inset, 'nothing over it: the inset from the top');
  assert.equal(topHome({ left: 0, top: 47, inset, gap, w, h, chips: [] }).y, 47 + inset, 'under the notch');
  assert.equal(topHome({ left: 47, top: 0, inset, gap, w, h, chips: [] }).x, 47 + inset, 'beside a sideways notch');
});

test('the under-the-dock band still comes first where a phone has the room; the home is for where it has none', () => {
  const vw = 390, vh = 844, dock = { l: 6, t: vh - 40 - 105, r: vw - 6, b: vh - 40 };
  assert.ok(underDock({ vw, vh, dock, h, w, others: [] }), 'a phone with a home indicator keeps the band');
  assert.equal(underDock({ vw, vh, dock: { ...dock, b: vh - 6 }, h, w, others: [] }), null, 'no home indicator: no band, so the fixed home');
});

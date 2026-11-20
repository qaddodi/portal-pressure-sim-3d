// Opening a FibroScan (or the Doppler) on the spleen must not push the figure hard left (owner, 20 Nov 2026: "the centering of fit with spleen fibroscan is insane"). Root cause: the shell moved the figure until the
// probe stood in the MIDDLE of what the Tests card leaves, whatever the figure's shape; the spleen is at the figure's right, so the whole figure was dragged left, cut off, with an empty middle. The figure now stays centred
// in the free part (panRoom) and moves only as far as the probe needs to clear the card's edge strip (place.ts probeShift).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROBE_MARGIN, PROBE_SHIFT_MAX, panRoom, probeShift, roomWith, testsPlace } from '../src/ui/tests/place.ts';
import { deviceClass } from '../src/ui/layout/device.ts';
import { freeRoom } from '../src/ui/shell/room.ts';

const safe = { top: 0, right: 0, bottom: 0, left: 0 };
const mac = { w: 1000, h: 621, safe }, dev = deviceClass(mac.w * 2, mac.h * 2);
const big = { w: 2000, h: 1242, safe }, bigDev = deviceClass(big.w, big.h);

test('a probe already in the free part moves nothing: the spleen on a Mac keeps the figure where it is centred', () => {
  const base = freeRoom(big, bigDev), place = testsPlace(big, bigDev), cut = roomWith(base, place);
  // where the probe stands with the figure centred in the free part: well inside it, as the spleen is in the screenshot (a bit past the middle of the free part)
  const focus = { x: cut.x + cut.w * 0.72, y: cut.y + cut.h * 0.3 };
  assert.deepEqual(probeShift(base, place, focus, { x: 0, y: 0 }), { x: 0, y: 0 });
  // and a stale shift (the liver's, a card ago) goes: the probe as the shift put it is judged where it would stand with none
  assert.deepEqual(probeShift(base, place, { x: focus.x - 300, y: focus.y }, { x: -300, y: 0 }), { x: 0, y: 0 });
});

test('a probe under or at the card\'s edge is brought clear by the least move, never centred', () => {
  const base = freeRoom(big, bigDev), place = testsPlace(big, bigDev), cut = roomWith(base, place);
  const hi = cut.x + cut.w * (1 - PROBE_MARGIN);
  const under = { x: place.rect.x + 40, y: cut.y + cut.h / 2 };
  const s = probeShift(base, place, under, { x: 0, y: 0 });
  assert.ok(s.x < 0 && s.y === 0);
  assert.ok(Math.abs(under.x + s.x - hi) < 1e-6 || -s.x >= PROBE_SHIFT_MAX * base.w - 1e-6, 'brought to the margin, not to the middle');
  assert.ok(under.x + s.x > cut.x + cut.w / 2, 'it is nowhere near centred');
  // the same on the left side (the liver's far end)
  const left = probeShift(base, place, { x: cut.x + 5, y: 300 }, { x: 0, y: 0 });
  assert.ok(left.x > 0 && left.x < PROBE_SHIFT_MAX * base.w + 1e-6);
});

test('the figure is never moved further than the limit, and no card or no probe means no shift', () => {
  const base = freeRoom(mac, dev), place = testsPlace(mac, dev);
  const s = probeShift(base, place, { x: base.w * 3, y: 100 }, { x: 0, y: 0 });
  assert.ok(Math.abs(s.x) <= PROBE_SHIFT_MAX * base.w + 1e-6);
  assert.deepEqual(probeShift(base, null, { x: 1, y: 1 }, { x: 5, y: 5 }), { x: 0, y: 0 });
  assert.deepEqual(probeShift(base, place, null, { x: 5, y: 5 }), { x: 0, y: 0 });
  void panRoom;
});

test('on a phone\'s sheet it moves up and down only', () => {
  const ph = { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, d = deviceClass(ph.w, ph.h);
  const base = freeRoom(ph, d), place = testsPlace(ph, d);
  assert.equal(place.kind, 'sheet');
  const s = probeShift(base, place, { x: 200, y: place.rect.y + 20 }, { x: 0, y: 0 });
  assert.equal(s.x, 0); assert.ok(s.y < 0, 'a probe under the sheet is lifted clear');
});

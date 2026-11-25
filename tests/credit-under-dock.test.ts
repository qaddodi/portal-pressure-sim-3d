// Mohammad, 25 Nov (iPhone, free play): "Put the (C) copyright at the bottom here, all the way under the timeline bar." The line stood at the top left under the case picker (the hunt's first free corner). On an iPhone held
// upright it now stands in the empty band between the bottom bar and the home indicator, whatever the view; where that band is too thin it keeps the hunt, so the © is never lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { underDock, footClear, takesFootBand, HOME_BAR_CLEAR } from '../src/ui/shell/credit-foot.ts';

// the screenshot's phone: 440 x 956 points, home indicator (34 px safe area); the dock stands safe-bottom + 6 px off the foot, 105 px tall
const vw = 440, vh = 956, h = 16.8, w = 206;
const dock = { l: 6, t: vh - 40 - 105, r: vw - 6, b: vh - 40 };

test('an iPhone with a home indicator: the line stands under the dock, above the indicator, clear of both', () => {
  const at = underDock({ vw, vh, dock, h, w, others: [] });
  assert.ok(at, 'the 40 px band holds the line');
  assert.equal(at.x, Math.round((dock.l + dock.r - w) / 2), 'centred under the dock');
  assert.equal(at.x + w / 2, vw / 2, 'and so on the screen\'s middle line');
  assert.ok(at.y >= dock.b + 2, 'under the dock with air');
  assert.ok(at.y + h <= vh - HOME_BAR_CLEAR, 'above the home indicator');
  assert.ok(at.y > vh - 34 - 6 - 1 && at.y + h < vh, 'inside the screen');
  assert.ok(footClear(at, w, h, [dock], 1), 'the dock does not cover it');
});

test('where the band is too thin the line keeps the hunt: no home indicator, an upright iPad', () => {
  assert.equal(underDock({ vw, vh, dock: { ...dock, b: vh - 6 }, h, w, others: [] }), null, 'a phone with no home indicator (dock 6 px off the foot)');
  assert.equal(underDock({ vw: 834, vh: 1194, dock: { l: 20, t: 1000, r: 814, b: 1194 - 26 }, h, w, others: [] }), null, 'an upright iPad (band 26 px)');
  assert.equal(underDock({ vw: 200, vh, dock: { ...dock, r: 194 }, h, w, others: [] }), null, 'a screen too narrow for the line');
});

test('something standing in the band keeps the line out of it (the hunt then shows it elsewhere)', () => {
  const band = { l: 100, t: vh - 36, r: 300, b: vh - 10 };
  assert.equal(underDock({ vw, vh, dock, h, w, others: [band] }), null);
  assert.ok(underDock({ vw, vh, dock, h, w, others: [dock, { l: 0, t: 100, r: 440, b: 200 }] }), 'the dock itself and boxes above its foot edge do not count');
});

test('free play on a phone held upright takes the band; the talk, a landscape layout and the frame-rate counter leave the line to the hunt', () => {
  const on = { talk: false, thumb: true, fps: false, lay: 'stack' };
  assert.equal(takesFootBand(on), true);
  assert.equal(takesFootBand({ ...on, lay: 'tab' }), true);
  for (const off of [{ talk: true }, { thumb: false }, { fps: true }, { lay: 'side' }]) assert.equal(takesFootBand({ ...on, ...off }), false, JSON.stringify(off));
});

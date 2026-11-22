// The device frame page (?debug=frame, the 2D app's ?gallery=frame): its pure halves, and that it starts no app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameRequest, frameSrc, framePageUrl, fitScale, FRAME_DEVICES, DEFAULT_FRAME, isFrameRequest } from '../src/ui/debug/frame/frame.ts';
import { DEVICES, GALLERY_DEVICES, deviceOf } from '../src/ui/debug/devices.ts';
import { debugPage } from '../src/ui/debug/flags.ts';

test('the frame offers the 2D app\'s gallery devices, each turnable one way back', () => {
  assert.deepEqual(Object.keys(FRAME_DEVICES), ['mac', 'mac-short', 'ipad', 'ipad-portrait', 'iphone', 'iphone-landscape']);
  assert.equal(FRAME_DEVICES.iphone!.w, 390); assert.equal(FRAME_DEVICES.iphone!.h, 844);
  assert.equal(FRAME_DEVICES.ipad!.w, 1180); assert.equal(FRAME_DEVICES['ipad-portrait']!.h, 1180);
  for (const d of GALLERY_DEVICES) if (d.turn) assert.equal(deviceOf(d.turn)!.turn, d.id, `${d.id} turns to ${d.turn} and back`);
  assert.ok(DEVICES.find((d) => d.id === 'mac-xl' && !d.gallery), 'the full-screen Mac is a size only some tools want');
});

test('?debug=frame (and the old ?gallery=frame) asks for the frame page; ?debug alone does not', () => {
  assert.ok(isFrameRequest('?debug=frame&device=ipad'));
  assert.ok(isFrameRequest('?gallery=frame'));
  assert.ok(!isFrameRequest('?debug')); assert.ok(!isFrameRequest('?debug=check')); assert.ok(!isFrameRequest(''));
  assert.equal(debugPage('?debug=frame'), 'frame');
});

test('the request names a device (the default for an unknown one) and keeps the rest of the address in order', () => {
  assert.deepEqual(frameRequest('?debug=frame&device=ipad&look=navy&preset=csph'), { device: 'ipad', rest: 'look=navy&preset=csph' });
  assert.deepEqual(frameRequest('?debug=frame&device=toaster'), { device: DEFAULT_FRAME, rest: '' });
  assert.deepEqual(frameRequest(''), { device: DEFAULT_FRAME, rest: '' });
});

test('the page inside the frame is the app with the debug panel, the hash (a state link) kept; the outer address names the device', () => {
  const loc = { pathname: '/portal-pressure-sim-3d/preview/', search: '?debug=frame&device=iphone&look=navy', hash: '#x=abc' };
  assert.equal(frameSrc(loc), '/portal-pressure-sim-3d/preview/?debug&look=navy#x=abc');
  assert.equal(framePageUrl(loc, 'ipad'), '/portal-pressure-sim-3d/preview/?debug=frame&device=ipad&look=navy#x=abc');
  assert.ok(!/frame/.test(frameSrc(loc)), 'the inner page is not itself a frame');
});

test('the frame is drawn smaller to fit and never blown up', () => {
  assert.equal(fitScale(390, 844, 1200, 800), 800 / 844);
  assert.equal(fitScale(390, 844, 2000, 2000), 1);
  assert.ok(fitScale(1440, 900, 10, 10) >= 0.1);
});

test('the entry opens the frame before the app (its engine, fonts and React) is even fetched, and only on the preview copy', () => {
  const src = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8');
  const at = src.indexOf('isFrameRequest(location.search)');
  assert.ok(at > 0 && at < src.lastIndexOf("import('./main.tsx')"), 'the frame request is answered before the app is fetched');
  assert.match(src.slice(at - 40, at), /isPreview\(\) &&/);
});

// The devices are drawn over the labels: each body's outline cuts the label layer (clip-path), grown from nothing with the device's opacity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addCover, beginCover, coverClip, coverCount } from '../src/scene/labels/probe-cover.ts';
import { ringsOutline } from '../src/scene/devices/probes/cover.ts';
import { Vector3 } from 'three';

const sq = [0, 0, 10, 0, 10, 10, 0, 10];
test('no device, no clip', () => { beginCover(); assert.equal(coverClip(), 'none'); });
test('an outline becomes an even-odd hole, eased by opacity', () => {
  beginCover(); addCover(sq, 1);
  assert.equal(coverCount(), 1);
  assert.match(coverClip(), /^polygon\(evenodd,/);
  assert.ok(coverClip().includes('0px 0px') || coverClip().includes('0 0'));
  beginCover(); addCover(sq, 0.5);
  const half = coverClip(); beginCover(); addCover(sq, 1);
  assert.notEqual(half, coverClip());
  beginCover(); addCover(sq, 0.005); assert.equal(coverCount(), 0);   // (a device not there cuts nothing)
});
test('rings outline: left side out, right side back, radius in px minus the inset', () => {
  const env = { project: (p: Vector3, o: { x: number; y: number }) => { o.x = p.x; o.y = p.y; return o; } } as never;
  const rings = [0, 1, 2].map((i) => ({ c: new Vector3(i * 10, 0, 0), t: new Vector3(1, 0, 0), r: 5 }));
  const out = ringsOutline(env, [{ rings, from: 0, to: 2 }], 1, []);
  assert.equal(out.length, 12);
  assert.ok(out.slice(0, 6).every((v, i) => (i % 2 ? Math.abs(Math.abs(v) - 4) < 1e-6 : true)));
});

// Camera rest eye (ascites package C): restEye is the eye with the shot's own yaw and pitch only; offRest is the turn off it, 0 at rest to 1 at 25°.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraRig } from '../src/scene/camera/rig.ts';

const room = { x: 0, y: 0, w: 1440, h: 900 };
function rig(shot: 'play' | 'title' = 'play') {
  const r = new CameraRig(shot, room); r.resize(1440, 900); r.goTo(shot, room, 0, 0); r.update(0);
  return r;
}
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('at zero turn restEye is the eye and offRest is 0', () => {
  const r = rig();
  assert.ok(dist(r.restEye, r.camera.position) < 1e-9);
  assert.equal(r.offRest, 0);
});

test('offRest is the turn over 25° (the drag soft limit reaches about 1), continuous over a turn, and the eye leaves restEye while restEye stays', () => {
  const r = rig(), rest = r.restEye.clone();
  let prev = 0;
  for (let d = 0; d <= 25; d += 0.5) {
    r.setOrbit((d * Math.PI) / 180); r.update(1);
    assert.ok(dist(r.restEye, rest) < 1e-9, 'restEye does not move with the turn');
    assert.ok(r.offRest >= prev - 1e-9 && r.offRest - prev < 0.03, `continuous at ${d}°`);
    prev = r.offRest;
  }
  assert.ok(r.offRest > 0.9 && r.offRest <= 1, `offRest at the limit ${r.offRest}`);
  const q = rig(); q.setOrbit((10 * Math.PI) / 180); q.update(1);
  assert.ok(Math.abs(q.offRest - 0.4) < 0.01, `10° is 0.4 of the limit: ${q.offRest}`);
});

test('the hand\'s zoom and pan do not move restEye or offRest', () => {
  const r = rig(); r.setOrbit(0.2); r.update(1);
  const e = r.restEye.clone(), o = r.offRest;
  r.setHand({ k: 2.5, x: 120, y: -40 }); r.update(2);
  assert.ok(dist(r.restEye, e) < 1e-9);
  assert.ok(Math.abs(r.offRest - o) < 1e-9);
});

test('a shot change moves restEye on the rig\'s easing, with no jump between frames', () => {
  const r = rig('title'), start = r.restEye.clone();
  r.goTo('play', room, 0, 1000);
  let last = start.clone(), maxStep = 0, total = 0;
  for (let t = 16; t <= 1100; t += 16) { r.update(t); maxStep = Math.max(maxStep, dist(r.restEye, last)); last = r.restEye.clone(); }
  total = dist(last, start);
  assert.ok(total > 0.01, 'it moved');
  assert.ok(maxStep < total * 0.2, `largest frame step ${maxStep} of ${total}`);
  assert.ok(dist(r.restEye, r.camera.position) < 1e-6, 'settled: rest eye is the eye');
});

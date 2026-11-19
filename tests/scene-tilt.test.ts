import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { fullRoom } from '../src/scene/camera/room.ts';
import {
  DEVICE_DEAD, DEVICE_RANGE, DeviceBase, TILT_EPS, TILT_PITCH_MAX, TILT_YAW_MAX, Tilt, deviceUnit, pointerUnit, tiltTarget, worthAFrame,
} from '../src/scene/camera/tilt.ts';

const deg = (r: number) => (r * 180) / Math.PI;

test('the largest tilt is a few degrees: at most 4 of yaw, 3 of pitch', () => {
  assert.ok(deg(TILT_YAW_MAX) <= 4 && deg(TILT_YAW_MAX) >= 3);
  assert.ok(deg(TILT_PITCH_MAX) <= 3 && deg(TILT_PITCH_MAX) >= 2);
  for (const u of [{ x: 9, y: -9 }, { x: -9, y: 9 }, { x: 1, y: 1 }]) {
    const t = tiltTarget(u, true, false, false);
    assert.ok(Math.abs(t.yaw) <= TILT_YAW_MAX + 1e-12 && Math.abs(t.pitch) <= TILT_PITCH_MAX + 1e-12);
  }
});

test('the pointer: the middle is square, the edges are the limits, and it is clamped', () => {
  assert.deepEqual(pointerUnit(400, 300, 800, 600), { x: 0, y: 0 });
  assert.deepEqual(pointerUnit(800, 0, 800, 600), { x: 1, y: -1 });
  assert.deepEqual(pointerUnit(-50, 900, 800, 600), { x: -1, y: 1 });
  assert.deepEqual(pointerUnit(5, 5, 0, 0), { x: 0, y: 0 });
});

test('the figure turns toward the pointer the way a drag turns it (yaw down as x goes up); a pointer below tips the top toward the viewer', () => {
  const r = tiltTarget({ x: 1, y: 0 }, true, false, false), l = tiltTarget({ x: -1, y: 0 }, true, false, false);
  assert.ok(r.yaw < 0 && l.yaw > 0 && r.pitch === 0);
  assert.ok(tiltTarget({ x: 0, y: 1 }, true, false, false).pitch > 0);
});

test('no tilt when the switch is off, Reduce Motion is on, a gesture or move holds it, or there is no input', () => {
  const u = { x: 1, y: 1 };
  assert.deepEqual(tiltTarget(u, false, false, false), { yaw: 0, pitch: 0 });
  assert.deepEqual(tiltTarget(u, true, true, false), { yaw: 0, pitch: 0 });
  assert.deepEqual(tiltTarget(u, true, false, true), { yaw: 0, pitch: 0 });
  assert.deepEqual(tiltTarget(null, true, false, false), { yaw: 0, pitch: 0 });
});

test('easing: approaches the target without overshoot, arrives, and stops asking for frames', () => {
  const t = new Tilt();
  t.set({ x: 1, y: 1 });
  let now = 1000, frames = 0, prev = 0;
  while (t.step(now, true, false, false) && frames < 1000) {
    assert.ok(Math.abs(t.yaw) >= Math.abs(prev) - 1e-15 && Math.abs(t.yaw) <= TILT_YAW_MAX + 1e-12);
    prev = t.yaw; now += 16; frames++;
  }
  assert.ok(frames > 10 && frames < 200, `frames ${frames}`);
  assert.equal(t.yaw, -TILT_YAW_MAX);
  assert.equal(t.pitch, TILT_PITCH_MAX);
  assert.equal(t.step(now + 16, true, false, false), false);
});

test('a lock (gesture, shot) eases it back to exactly zero, quicker than it came', () => {
  const t = new Tilt();
  t.set({ x: 1, y: -1 });
  let now = 0, inFrames = 0, outFrames = 0;
  while (t.step(now += 16, true, false, false)) inFrames++;
  while (t.step(now += 16, true, false, true)) outFrames++;
  assert.equal(t.yaw, 0); assert.equal(t.pitch, 0);
  assert.ok(outFrames < inFrames);
});

test('Reduce Motion: no tilt at all and no easing, even from a tilted state', () => {
  const t = new Tilt();
  t.set({ x: 1, y: 1 });
  for (let i = 0; i < 100; i++) t.step(i * 16, true, false, false);
  assert.ok(t.yaw !== 0);
  assert.equal(t.step(2000, true, true, false), false);
  assert.equal(t.yaw, 0); assert.equal(t.pitch, 0);
  t.set({ x: 1, y: 1 });
  assert.equal(t.step(2016, true, true, false), false);
  assert.equal(t.yaw, 0);
});

test('switch off: square at once, no frames asked', () => {
  const t = new Tilt();
  t.set({ x: -1, y: 1 });
  for (let i = 0; i < 100; i++) t.step(i * 16, true, false, false);
  assert.equal(t.step(5000, false, false, false), false);
  assert.equal(t.yaw, 0); assert.equal(t.pitch, 0);
});

test('a long gap between frames does not jump past the target', () => {
  const t = new Tilt();
  t.set({ x: 1, y: 0 });
  t.step(0, true, false, false);
  t.step(60000, true, false, false);
  assert.ok(Math.abs(t.yaw) <= TILT_YAW_MAX + 1e-12);
});

test('a small change of input does not wake the clock', () => {
  assert.equal(worthAFrame({ x: 0, y: 0 }, { x: 0.005, y: 0 }), false);
  assert.equal(worthAFrame({ x: 0, y: 0 }, { x: 0.05, y: 0 }), true);
  assert.equal(worthAFrame({ x: 0.5, y: 0 }, null), true);
  assert.equal(worthAFrame(null, null), false);
  const t = new Tilt();
  assert.equal(t.set({ x: 0.5, y: 0 }), true);
  assert.equal(t.set({ x: 0.502, y: 0 }), false);
});

test('device orientation: a dead zone, a full tilt at the range, and the axes follow the screen turn', () => {
  assert.deepEqual(deviceUnit(0, 0), { x: 0, y: 0 });
  assert.deepEqual(deviceUnit(DEVICE_DEAD * 0.9, -DEVICE_DEAD * 0.9), { x: 0, y: 0 });
  assert.deepEqual(deviceUnit(0, 90), { x: 1, y: 0 });
  assert.equal(deviceUnit(DEVICE_RANGE, 0).y, 1);
  // portrait: gamma is the screen's x, beta its y; a quarter turn swaps them with the right signs
  assert.deepEqual(deviceUnit(0, DEVICE_RANGE, 0), { x: 1, y: 0 });
  assert.deepEqual(deviceUnit(DEVICE_RANGE, 0, 90), { x: -1, y: 0 });
  assert.deepEqual(deviceUnit(0, DEVICE_RANGE, 90), { x: 0, y: 1 });
  assert.deepEqual(deviceUnit(0, DEVICE_RANGE, 180), { x: -1, y: 0 });
  assert.deepEqual(deviceUnit(DEVICE_RANGE, 0, 270), { x: 1, y: 0 });
  assert.deepEqual(deviceUnit(0, DEVICE_RANGE, 270), { x: 0, y: -1 });
  assert.deepEqual(deviceUnit(0, DEVICE_RANGE, 450), deviceUnit(0, DEVICE_RANGE, 90));
});

test('the held position is where the phone first sits, then follows a steady hand slowly', () => {
  const b = new DeviceBase();
  assert.deepEqual(b.read(50, 5, 0), { db: 0, dg: 0 });
  const d = b.read(60, 5, 16);
  assert.ok(Math.abs(d.db - 10) < 0.1 && d.dg === 0);
  let last = d.db;
  for (let t = 1000; t < 20000; t += 1000) { const r = b.read(60, 5, t); assert.ok(r.db <= last + 1e-9); last = r.db; }
  assert.ok(last < 0.2, `settled ${last}`);
  b.reset();
  assert.deepEqual(b.read(10, 10, 99999), { db: 0, dg: 0 });
});

// ---- in the rig -------------------------------------------------------------------------------------------------------------------------

const rigWith = (gate: CameraRig['tiltGate'], reduceMotion = false) => {
  const rig = new CameraRig('title', fullRoom(800, 600), reduceMotion);
  rig.resize(800, 600);
  rig.goTo('title', fullRoom(800, 600), 0);
  rig.tiltGate = gate;
  rig.update(0);
  return rig;
};
const settle = (rig: CameraRig, from = 16) => { let now = from; while (rig.update(now) && now < from + 20000) now += 16; return now; };
const open = { on: () => true, locked: () => false };

test('no gate or the switch off: the camera is exactly the rest camera', () => {
  const rest = rigWith(null).camera.matrixWorld.toArray();
  const rig = rigWith({ on: () => false, locked: () => false });
  rig.tilt.set({ x: 1, y: 1 });
  settle(rig);
  assert.deepEqual(rig.camera.matrixWorld.toArray(), rest);
  assert.deepEqual(rig.camera.projectionMatrix.toArray(), rigWith(null).camera.projectionMatrix.toArray());
});

test('with the switch on, the pointer turns the camera a few degrees about the target and the rig asks for frames only while it eases', () => {
  const rest = rigWith(null), rig = rigWith(open);
  rig.tilt.set({ x: 1, y: 0 });
  assert.equal(rig.update(16), true);
  const end = settle(rig);
  assert.equal(rig.update(end + 16), false, 'at rest: no frame wanted');
  const a = rest.camera.position, b = rig.camera.position, t = rest.pose.shot.target;
  const turned = Math.abs(Math.atan2(b.x - t[0], b.z - t[2]) - Math.atan2(a.x - t[0], a.z - t[2]));
  assert.ok(Math.abs(deg(turned) - 3.5) < 0.01, `turned ${deg(turned)}`);
  assert.ok(Math.abs(b.distanceTo({ x: t[0], y: t[1], z: t[2] } as never) - a.distanceTo({ x: t[0], y: t[1], z: t[2] } as never)) < 1e-9, 'the distance is the same');
  // what the rig keeps is untouched: the viewer's turn, the hand's view and the pose
  assert.equal(rig.orbitAngle, 0);
  assert.deepEqual({ ...rig.handView }, { k: 1, x: 0, y: 0 });
  assert.equal(rig.pose.shot.yaw, rest.pose.shot.yaw);
});

test('the fit is measured without the tilt, and project() agrees with the tilted camera', () => {
  const rest = rigWith(null), rig = rigWith(open);
  const r0 = rest.fitRect();
  rig.tilt.set({ x: 1, y: 1 });
  settle(rig);
  const before = rig.camera.matrixWorld.toArray();
  assert.deepEqual(rig.fitRect(), r0);
  assert.deepEqual(rig.camera.matrixWorld.toArray(), before, 'the camera is back to the tilted pose after the measure');
  assert.notDeepEqual(before, rest.camera.matrixWorld.toArray());
});

test('Reduce Motion (the rig built with it): no tilt', () => {
  const rest = rigWith(null, true).camera.matrixWorld.toArray();
  const rig = rigWith(open, true);
  rig.tilt.set({ x: 1, y: 1 });
  assert.equal(rig.update(16), false);
  assert.deepEqual(rig.camera.matrixWorld.toArray(), rest);
});

test('a lock (a gesture, another view) brings it back to the exact rest camera, and Fit-style resets never need to know about it', () => {
  const rest = rigWith(null).camera.matrixWorld.toArray();
  let locked = false;
  const rig = rigWith({ on: () => true, locked: () => locked });
  rig.tilt.set({ x: -1, y: 1 });
  settle(rig);
  assert.notDeepEqual(rig.camera.matrixWorld.toArray(), rest);
  locked = true;
  settle(rig, 30000);
  assert.deepEqual(rig.camera.matrixWorld.toArray(), rest);
});

test('a camera move locks the tilt: it is square before the shot lands, and picks the pointer up again afterwards', () => {
  const rest = rigWith(null);
  rest.goTo('wedge', fullRoom(800, 600), 1000); settle(rest, 1016);
  const rig = rigWith(open);
  rig.tilt.set({ x: 1, y: 1 });
  settle(rig);
  assert.ok(rig.tilt.yaw !== 0);
  rig.goTo('wedge', fullRoom(800, 600), 1000);
  for (let now = 1016; now <= 1600; now += 16) rig.update(now);
  assert.ok(Math.abs(rig.tilt.yaw) < TILT_YAW_MAX * 0.03 && rig.isMoving, 'still flying, and already square');
  rig.tilt.set(null);   // (the pointer left)
  settle(rig, 1616);
  assert.equal(rig.tilt.yaw, 0);
  assert.deepEqual(rig.camera.matrixWorld.toArray(), rest.camera.matrixWorld.toArray());
});

test('tilt never uses requestAnimationFrame or React state, and the rig keeps it out of the orbit and the hand', () => {
  for (const f of ['src/scene/camera/tilt.ts', 'src/scene/camera/tilt-input.ts']) {
    const text = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/requestAnimationFrame|useState|setState/.test(text), f);
  }
  const rig = readFileSync('src/scene/camera/rig.ts', 'utf8');
  assert.ok(!/this\.orbit\s*=[^=].*tilt/.test(rig) && !/hand\.[kxy]\s*=[^=].*tilt/.test(rig));
});

test('the arrival threshold is under a pixel on the figure', () => {
  assert.ok(deg(TILT_EPS) < 0.02);
});

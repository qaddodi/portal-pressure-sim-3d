import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';
import { sceneSource } from './helpers/scene-source.ts';

test('the lobule is liver-scale small (owner, 20 Nov: ~1/1500 of the scene)', () => { assert.ok(LOBULE_SCALE <= 1 / 1000); });
test('the dive frame is never switched on at setView: only fadeBody shows it, once the body dissolves', () => {
  const s = sceneSource();
  assert.ok(!/this\.dive\.visible = true/.test(s));
});
test('in a dive the room moves with the aim (one clock), never on its own', () => {
  const s = readFileSync('src/scene/camera/rig.ts', 'utf8');
  assert.match(s, /diveRoomShare\(a\.shot\.r, b\.shot\.r, r\)/);
});
test('blendPose runs for a plain move and for a dive (a throw here freezes every camera move)', async () => {
  const { blendPose } = await import('../src/scene/camera/rig.ts');
  const room = { x: 0, y: 0, w: 800, h: 600 };
  const shot = (r: number) => ({ yaw: 0, pitch: 0, r, target: [0, 0, 0] as [number, number, number], half: [r, r] as [number, number] });
  for (const rb of [1.2, 0.001]) for (const k of [0, 0.5, 1]) assert.ok(Number.isFinite(blendPose({ shot: shot(1), room }, { shot: shot(rb), room: { ...room, x: 100 } }, k, 0).room.x));
});
test('a retarget carries only the speed that heads to the new framing, along the straight way (no zigzag)', () => {
  const s = readFileSync('src/scene/camera/rig.ts', 'utf8');
  assert.match(s, /hv = \{ x: dx \* f, y: dy \* f, lh: dl \* f \}/);
});
test('the dive never opens a circular cut-out in the liver (owner, 20 Nov)', () => {
  assert.match(sceneSource(), /cutUniform\(Infinity,/);
});
test('cards arriving mid-dive (lobule -> sinusoid) never make the picture jump or zoom back out: the on-screen size of the place dived to only grows', async () => {
  const { CameraRig } = await import('../src/scene/camera/rig.ts');
  const { lobuleShot, sinusoidShot } = await import('../src/scene/lobule/shots.ts');
  const { Vector3 } = await import('three');
  const full = { x: 0, y: 0, w: 1000, h: 700 };
  const rig = new CameraRig('play', full); rig.resize(1000, 700);
  rig.goTo(lobuleShot('lobule'), full, 0); rig.update(0);
  const to = sinusoidShot();
  rig.goTo(to, full, 0, 1100);
  const p = new Vector3(...to.target), q = new Vector3(to.target[0] + to.half[0], to.target[1], to.target[2]);
  let last = 0, lastX = NaN;
  const rooms = [{ x: 0, y: 0, w: 700, h: 700 }, { x: 0, y: 0, w: 600, h: 700 }, { x: 0, y: 0, w: 520, h: 700 }];
  for (let t = 16; t <= 1200; t += 16) {
    if (t === 304 || t === 512 || t === 720) rig.setRoom(rooms[[304, 512, 720].indexOf(t)]!, t);
    rig.update(t);
    const a = rig.project(p), b = rig.project(q), size = Math.hypot(b.x - a.x, b.y - a.y);
    assert.ok(size >= last * 0.999, `the place grows on screen every frame (t ${t}: ${last.toFixed(2)} -> ${size.toFixed(2)})`);
    if (!Number.isNaN(lastX)) assert.ok(Math.abs(a.x - lastX) < 40, `no jump sideways (t ${t})`);
    last = size; lastX = a.x;
  }
});
test('the way out of the sinusoid to the lobule with the room widening: the sinusoid moves one way on screen and only shrinks (no zigzag)', async () => {
  const { CameraRig } = await import('../src/scene/camera/rig.ts');
  const { lobuleShot, sinusoidShot } = await import('../src/scene/lobule/shots.ts');
  const { Vector3 } = await import('three');
  for (const [r0, r1] of [[{ x: 0, y: 0, w: 560, h: 700 }, { x: 0, y: 0, w: 1000, h: 700 }], [{ x: 0, y: 0, w: 1000, h: 700 }, { x: 0, y: 0, w: 560, h: 700 }]] as const) {
    for (const out of [true, false]) {
      const rig = new CameraRig('play', r0); rig.resize(1000, 700);
      const sin = sinusoidShot(), lob = lobuleShot('lobule');
      rig.goTo(out ? sin : lob, r0, 0); rig.update(0); rig.goTo(out ? lob : sin, r1, 0, 1100);
      const p = new Vector3(...sin.target), q = new Vector3(sin.target[0] + 0.001, sin.target[1], sin.target[2]);
      let dx0 = 0, lastX = rig.project(p).x, lastS = NaN;
      for (let t = 16; t <= 1200; t += 16) {
        rig.update(t); const a = rig.project(p), b = rig.project(q), sz = Math.hypot(b.x - a.x, b.y - a.y), dx = a.x - lastX;
        if (Math.abs(dx) > 0.05) { if (dx0 && Math.sign(dx) !== Math.sign(dx0)) assert.fail(`x reversed at ${t} ms (out ${out})`); dx0 = dx; }
        if (!Number.isNaN(lastS)) assert.ok(out ? sz <= lastS + 1e-6 : sz >= lastS - 1e-6);
        lastX = a.x; lastS = sz;
      }
    }
  }
});
test('the lobule at its fit stays whole inside the free room on a phone, a tablet and a Mac (every corner of its box)', async () => {
  const { CameraRig } = await import('../src/scene/camera/rig.ts');
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const { lobuleCorners } = await import('../src/scene/scene.ts');
  const { Vector3 } = await import('three');
  for (const [w, h, room] of [[390, 844, { x: 0, y: 60, w: 390, h: 520 }], [844, 390, { x: 0, y: 0, w: 844, h: 390 }], [1440, 900, { x: 420, y: 0, w: 1020, h: 900 }]] as const) {
    const rig = new CameraRig('play', room); rig.resize(w, h);
    rig.setSubject(lobuleCorners());
    rig.goTo(lobuleShot('lobule'), room, 0); rig.update(0);
    for (const c of lobuleCorners()) {
      const p = rig.project(new Vector3(...c));
      assert.ok(p.x >= room.x && p.x <= room.x + room.w && p.y >= room.y && p.y <= room.y + room.h, `${w}x${h}: corner at ${p.x.toFixed(0)},${p.y.toFixed(0)} outside the room`);
    }
  }
});
test('a card or sheet changing the room only pans: the camera distance (the zoom) stays; a refit (the screen changed) may change it', async () => {
  const { CameraRig } = await import('../src/scene/camera/rig.ts');
  const full = { x: 0, y: 0, w: 390, h: 700 };
  const rig = new CameraRig('play', full); rig.resize(390, 844); rig.goTo('play', full, 0); rig.update(0);
  const d0 = rig.camera.position.distanceTo(new (await import('three')).Vector3(...rig.pose.shot.target));
  for (const room of [{ x: 0, y: 0, w: 390, h: 300 }, { x: 0, y: 0, w: 200, h: 700 }, full]) {
    rig.setRoom(room, 100); for (let t = 100; t < 2000; t += 16) rig.update(t);
    const d = rig.camera.position.distanceTo(new (await import('three')).Vector3(...rig.pose.shot.target));
    assert.ok(Math.abs(d - d0) < d0 * 1e-6, `zoom kept (${d0.toFixed(4)} -> ${d.toFixed(4)})`);
  }
});
test('the Tests card never squeezes the room the instruments frame in (cutRoom keeps the size, moves the centre)', async () => {
  const { cutRoom, useTestsRoom } = await import('../src/ui/tests/room.ts');
  useTestsRoom.setState({ place: { kind: 'bottom', rect: { x: 0, y: 400, w: 390, h: 444 } } as never });
  const r = cutRoom({ x: 0, y: 50, w: 390, h: 700 });
  assert.equal(r.w, 390); assert.equal(r.h, 700);
  useTestsRoom.setState({ place: null });
});
test('Lobule <-> Sinusoid in the app rooms: the camera distance changes smoothly every 100 ms (no 2x step as the sinusoid lands or leaves)', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const { lobuleShot, sinusoidShot } = await import('../src/scene/lobule/shots.ts');
  const { viewRoom } = await import('../src/ui/shell/room.ts');
  const vp = { w: 1440, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } } as never;
  const s = new CelScene(); s.resize(1440, 900);
  while (!(s as unknown as { microStep(): boolean }).microStep()) { /* the micro views built and primed first, as the slot does: a dive into them waits for that (scene.goTo, tests/dive-never-black.test.ts) */ }
  const lr = viewRoom('lobule', vp, 'desktop'), sr = viewRoom('sinusoid', vp, 'desktop');
  s.rig.goTo('play', lr, 0); s.update(0);
  s.setView('lobule', 10); s.goTo(lobuleShot('lobule'), lr, 10, 1500);
  let t = 10; for (; t < 2000; t += 16) s.update(t);
  const dist = () => { const c = s.rig.camera.position, T = s.rig.pose.shot.target; return Math.hypot(c.x - T[0], c.y - T[1], c.z - T[2]); };
  for (const [view, shot, room] of [['sinusoid', sinusoidShot(false, sr.h), sr], ['lobule', lobuleShot('lobule'), lr]] as const) {
    s.setView(view, t); s.goTo(shot, room, t, 1800);
    let last = dist();
    for (const t0 = t; t < t0 + 2000; t += 100) { s.update(t); const d = dist(), k = Math.max(d / last, last / d); assert.ok(k < 1.5, `${view} at ${t - t0} ms: the distance stepped ${k.toFixed(2)}x`); last = d; }
  }
  s.dispose();
});

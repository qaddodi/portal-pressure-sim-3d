import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';

test('the lobule is liver-scale small (owner, 20 Nov: ~1/1500 of the scene)', () => { assert.ok(LOBULE_SCALE <= 1 / 1000); });
test('the dive frame is never switched on at setView: only fadeBody shows it, once the body dissolves', () => {
  const s = readFileSync('src/scene/scene.ts', 'utf8');
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
  assert.match(readFileSync('src/scene/scene.ts', 'utf8'), /cutUniform\(Infinity,/);
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

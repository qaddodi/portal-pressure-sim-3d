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
  assert.match(s, /lerp\(a\.room\.x, b\.room\.x, q\)/);
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

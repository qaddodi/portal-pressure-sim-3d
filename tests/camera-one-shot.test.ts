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

// The chase camera (docs/approved/camera-chase.md): from 4.2 to 0.75 from the tip as the catheter advances, swinging to the outside of the vein's bend by at most 32 degrees, on a 20 degree lens,
// a pure function of the advance, and wired into the deck's scene link only (never free play).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chaseAt, hvpgChase, CHASE_FAR, CHASE_NEAR, CHASE_SWING, CHASE_FOV } from '../src/scene/camera/chase.ts';

test('the real HVPG route: far and square at the start, near and swung at the vein, never past 32 degrees, distance only closes', () => {
  const a = hvpgChase(0)!, z = hvpgChase(1)!;
  assert.ok(a && z);
  assert.ok(Math.abs(a.dist - CHASE_FAR) < 1e-6 && Math.abs(z.dist - CHASE_NEAR) < 1e-6);
  assert.ok(Math.abs(a.yaw) < 1e-6, `starts square on: ${a.yaw}`);
  assert.ok(Math.abs(z.yaw) > 0.3 && Math.abs(z.yaw) <= CHASE_SWING + 1e-9, `ends swung: ${z.yaw}`);
  assert.equal(z.fov, CHASE_FOV);
  let d = Infinity, y = 0;
  for (let i = 0; i <= 100; i++) {
    const p = hvpgChase(i / 100)!;
    assert.ok(p.dist <= d + 1e-9, 'the camera only closes in'); d = p.dist;
    assert.ok(Math.abs(p.yaw) <= CHASE_SWING + 1e-9);
    assert.ok(Math.abs(p.yaw - y) < 0.12, `no jump in the swing at ${i}: ${y} to ${p.yaw}`); y = p.yaw;
    assert.ok(p.target.every(Number.isFinite));
  }
});

test('it is the deck\'s scene link that drives it, and only on a body slide with a catheter', () => {
  const link = readFileSync(new URL('../src/ui/deck/scene-link.ts', import.meta.url), 'utf8');
  assert.match(link, /chaseNow = view === 'body' && !v\.slide\?\.visual && at !== null/);
  assert.match(link, /setChase\(null\)/);
  const other = ['src/ui/tests/ir/run.ts', 'src/scene/gesture/controller.ts'].map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('');
  assert.doesNotMatch(other, /setChase|hvpgChase/);
});

test('a straight route does not swing', () => {
  const line = { tipD: (u: number) => u * 10, point: (d: number, o?: any) => (o ?? { x: 0, y: 0, z: 0, set() {} }).set ? (o.set(0, -d, 0), o) : o, dir: (_d: number, o?: any) => (o.set(0, -1, 0), o) };
  const p = chaseAt(line as never, 0.7);
  assert.ok(Math.abs(p.yaw) < 1e-9);
});

// The chase camera (docs/approved/camera-chase.md): from 4.2 to 0.75 from the tip as the catheter advances, swinging to the outside of the vein's bend by at most 32 degrees, on a 20 degree lens,
// a pure function of the advance, and wired into the deck's scene link only (never free play).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHASE_KEYS, hvpgChase } from '../src/scene/camera/chase.ts';

test('the five approved frames of the mock (move4-A-camera-values.md) are hit exactly: distance, yaw, pitch, lens 20', () => {
  for (const k of CHASE_KEYS) {
    const p = hvpgChase(k.u)!;
    assert.ok(Math.abs(p.dist - k.d) < 1e-9 && Math.abs(p.yaw - k.yaw) < 1e-9 && Math.abs(p.pitch - k.pitch) < 1e-9, `frame at ${k.u}: ${p.dist} ${p.yaw} ${p.pitch}`);
    assert.equal(p.fov, 20);
  }
  assert.deepEqual(CHASE_KEYS.map((k) => [k.u, k.d, k.yaw, k.pitch]), [[0.62, 4.2, 0, 0.05], [0.74, 2.6, -0.12, 0.06], [0.82, 1.7, -0.3, 0.1], [0.92, 1.35, -0.45, 0.14], [0.995, 1.0, -0.55, 0.16]]);
});

test('between the frames the camera only closes in and swings one way, with no jump; before the first it holds, after the last it stays', () => {
  let d = Infinity, y = 0, p0 = 0;
  for (let i = 0; i <= 200; i++) {
    const p = hvpgChase(i / 200)!;
    assert.ok(p.dist <= d + 1e-9, `closes in at ${i}`); d = p.dist;
    assert.ok(p.yaw <= y + 1e-9 && p.yaw >= -0.55 - 1e-9, `swings one way at ${i}: ${p.yaw}`); y = p.yaw;
    assert.ok(Math.abs(p.pitch - p0) < 0.01 || i === 0, `no jump in pitch at ${i}`); p0 = p.pitch;
    assert.ok(p.target.every(Number.isFinite));
  }
  assert.equal(hvpgChase(0)!.dist, 4.2);
  assert.equal(hvpgChase(1)!.dist, 1.0);
});

test('it is the deck\'s scene link that drives it, and only on a body slide with a catheter', () => {
  const link = readFileSync(new URL('../src/ui/deck/scene-link.ts', import.meta.url), 'utf8');
  assert.match(link, /chaseNow = view === 'body' && !v\.slide\?\.visual && at !== null/);
  assert.match(link, /setChase\(null\)/);
  const other = ['src/ui/tests/ir/run.ts', 'src/scene/gesture/controller.ts'].map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('');
  assert.doesNotMatch(other, /setChase|hvpgChase/);
});

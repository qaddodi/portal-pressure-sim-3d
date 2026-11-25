// The chase camera (docs/approved/camera-chase.md): from 4.2 to 0.75 from the tip as the catheter advances, swinging to the outside of the vein's bend by at most 32 degrees, on a 20 degree lens,
// a pure function of the advance, and wired into the deck's scene link only (never free play).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import { CHASE_TILT, CHASE_KEYS, CHASE_AHEAD_RADII, CHASE_BEHIND_RADII, hvpgChase } from '../src/scene/camera/chase.ts';
import { AHEAD_RADII, BEHIND_RADII, tipCloseShot } from '../src/ui/deck/cath-shot.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';

test('the keyframes are the mock\'s yaw, pitch and lens 20 (move4-A-camera-values.md), the distances pulled back at Mohammad\'s word (24 Nov, twice)', () => {
  for (const k of CHASE_KEYS) {
    const p = hvpgChase(k.u)!;
    assert.ok(Math.abs(p.dist - k.d) < 1e-9 && Math.abs(p.yaw - (CHASE_TILT ? k.yaw : 0)) < 1e-9 && Math.abs(p.pitch - (CHASE_TILT ? k.pitch : 0)) < 1e-9, `frame at ${k.u}: ${p.dist} ${p.yaw} ${p.pitch}`);
    assert.equal(p.fov, 20);
  }
  assert.deepEqual(CHASE_KEYS.map((k) => [k.u, k.d, k.yaw, k.pitch]), [[0.62, 4.2, 0, 0.05], [0.74, 3.5, -0.12, 0.06], [0.82, 3.0, -0.3, 0.1], [0.92, 2.7, -0.45, 0.14], [0.995, 2.4, -0.55, 0.16]]);
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
  assert.equal(hvpgChase(1)!.dist, 2.4);
});

test('it is the deck\'s scene link that drives it, and only on a body slide with a catheter', async () => {
  // (what the camera is asked for at a talk's step is camera-ask.ts's: the chase is on on a body slide with the catheter out, never on a visual, a case card or another view)
  const { cameraAsk } = await import('../src/ui/deck/camera-ask.ts');
  const cath = { advance: 0.5, balloon: 0, column: 0 } as never, slide = {} as never;
  const v = (o: Record<string, unknown>) => ({ words: 'teach', data: null, slide, shot: 'free', scene: null, cath: null, number: 2, of: 9, ...o }) as never;
  assert.equal(cameraAsk(v({}), cath).chase, true);
  assert.equal(cameraAsk(v({}), null).chase, false);
  assert.equal(cameraAsk(v({ slide: { visual: {} } }), cath).chase, false);
  assert.equal(cameraAsk(v({ words: 'case' }), cath).chase, false);
  assert.equal(cameraAsk(v({ scene: { view: 'lobule', shot: 'free' } }), cath).chase, false);
  const link = readFileSync(new URL('../src/ui/deck/scene-link.ts', import.meta.url), 'utf8');
  assert.match(link, /setChase\(null\)/);
  const other = ['src/ui/tests/ir/run.ts', 'src/scene/gesture/controller.ts'].map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('');
  assert.doesNotMatch(other, /setChase|hvpgChase/);
});

test('the wedge frame holds the tip, the balloon behind it and the vein AHEAD where the WHVP is read, on a phone in portrait (the WHVP leader ran to a dot off the screen edge at 0.75 to 1.0)', () => {
  assert.equal(CHASE_AHEAD_RADII, AHEAD_RADII); assert.equal(CHASE_BEHIND_RADII, BEHIND_RADII);
  assert.ok(tipCloseShot('tip'));
  const r3 = route3d('hvpg')!, d = r3.tipD(1), R = r3.lumen(r3.route.free) * UNITS_PER_SCENE;
  // (where the figure hangs the wedged reading: proc-catheter.ts aheadAt, 6.4 radii of the free vein on, held to 0.6 of what is left of the vein the tip is in)
  const end = r3.route.parts.find((q) => q.id && d <= q.d1 + 1e-6 && d >= q.d0 - 1e-6)?.d1 ?? r3.route.total, aheadD = d + Math.min(R * AHEAD_RADII, (end - d) * 0.6);
  const p = hvpgChase(1)!;
  const cam = new PerspectiveCamera(p.fov, 390 / 844, 0.01, 100);
  const pitch = p.pitch, c = Math.cos(pitch);
  cam.position.set(p.target[0] + Math.sin(p.yaw) * c * p.dist, p.target[1] + Math.sin(pitch) * p.dist, p.target[2] + Math.cos(p.yaw) * c * p.dist);
  cam.lookAt(p.target[0], p.target[1], p.target[2]); cam.updateMatrixWorld();
  for (const [name, at] of [['tip', d], ['ahead', aheadD], ['balloon end', d - R * BEHIND_RADII]] as const) {
    const v = r3.point(Math.min(r3.route.total, Math.max(0, at)), new Vector3()).project(cam);
    // (the free room is about the middle half of the screen's height; keep a margin for the tags)
    assert.ok(Math.abs(v.x) < 0.8 && Math.abs(v.y) < 0.55, `${name} at ${v.x.toFixed(2)}, ${v.y.toFixed(2)}`);
  }
});

test('the swing and tilt are shelved (Mohammad, 24 Nov): the chase is square on while the flag is off', () => {
  assert.equal(CHASE_TILT, false);
  for (let i = 0; i <= 20; i++) { const p = hvpgChase(i / 20)!; assert.equal(p.yaw, 0); assert.equal(p.pitch, 0); }
});

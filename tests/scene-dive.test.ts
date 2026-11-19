// The dive: the lobule stands INSIDE the liver and the sinusoid inside the lobule (owner, 19 Nov), the camera goes in one straight move, and the hand's
// pan and zoom are limited by the lobule's own box, not the body plate (the lobule "flung out of place" when panned or zoomed).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { ORGANS } from '../src/scene/anatomy/placeholder.ts';
import { CameraRig, DIVE_RATIO, blendPose } from '../src/scene/camera/rig.ts';
import { SHOTS } from '../src/scene/camera/shots.ts';
import { bodyFade, lobuleCorners, sinusoidCorners, DIVE_IN, DIVE_OUT } from '../src/scene/scene.ts';
import { LIVER_2D, LIVER_POINT, LOBULE_SCALE, SIN_POINT, SIN_SCALE, liver2d, lobuleWorld } from '../src/scene/lobule/frames.ts';
import { lobuleShot, sinusoidShot, LOBULE_R, LOBULE_T } from '../src/scene/lobule/shots.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';

const room = { x: 0, y: 0, w: 1000, h: 700 };

test('the lobule stands inside the right lobe of the liver, and the sinusoid inside the lobule', () => {
  const liver = ORGANS.find((o) => o.id === 'liver-right')!;
  const inside = (p: readonly number[], pad = 0) => {
    // the placeholder lobe is an ellipsoid (radii 1.35, 0.95, 0.85) turned about z; the artist's mesh replaces it, and moves LIVER_2D if it differs
    const c = Math.cos(-liver.rotation![2]!), s = Math.sin(-liver.rotation![2]!);
    const dx = p[0]! - liver.position![0]!, dy = p[1]! - liver.position![1]!, dz = p[2]! - liver.position![2]!;
    const x = dx * c - dy * s, y = dx * s + dy * c;
    return (x / (1.35 - pad)) ** 2 + (y / (0.95 - pad)) ** 2 + (dz / (0.85 - pad)) ** 2 < 1;
  };
  assert.ok(inside(LIVER_POINT, 0.4), 'the place is well inside the lobe');
  for (const c of lobuleCorners()) assert.ok(inside(c), 'every corner of the lobule\'s box is inside the liver');
  // the shared 2D frame: the place is a point of the 2D figure, and maps back to it
  assert.ok(Math.abs(x3(LIVER_2D.x) - LIVER_POINT[0]) < 1e-12 && Math.abs(y3(LIVER_2D.y) - LIVER_POINT[1]) < 1e-12);
  assert.ok(Math.abs(liver2d().x - LIVER_2D.x) < 1e-9 && Math.abs(liver2d().y - LIVER_2D.y) < 1e-9);
  // the sinusoid's box is inside the lobule's slab
  const lo = lobuleWorld([-LOBULE_R, -LOBULE_R, -LOBULE_T / 2]), hi = lobuleWorld([LOBULE_R, LOBULE_R, LOBULE_T / 2]);
  for (const c of sinusoidCorners()) for (let i = 0; i < 2; i++) assert.ok(c[i]! > lo[i]! && c[i]! < hi[i]!, `sinusoid corner axis ${i} inside the lobule`);
  assert.ok(SIN_SCALE < LOBULE_SCALE && LOBULE_SCALE < 0.05);
  assert.ok(SIN_POINT[0] < LIVER_POINT[0], 'the sinusoid station is toward the portal corner');
});

test('a dive goes by the same ratio every moment, keeps the place dived to in the middle of the picture, and lands exactly', () => {
  const a = { shot: SHOTS.play, room }, b = { shot: lobuleShot('lobule'), room };
  assert.ok(a.shot.r / b.shot.r > DIVE_RATIO);
  assert.deepEqual(blendPose(a, b, 0).shot.r, a.shot.r);
  assert.ok(Math.abs(blendPose(a, b, 1).shot.r - b.shot.r) < 1e-12);
  assert.deepEqual(blendPose(a, b, 1).shot.target.map((v) => +v.toFixed(12)), b.shot.target.map((v) => +v.toFixed(12)));
  const rs = [0, 0.25, 0.5, 0.75, 1].map((k) => blendPose(a, b, k).shot.r);
  for (let i = 2; i < rs.length; i++) assert.ok(Math.abs(rs[i]! / rs[i - 1]! - rs[i - 1]! / rs[i - 2]!) < 1e-9, 'geometric: the same ratio per step');
  // the picture never leaves the place: its offset from the aim, against the distance, stays far inside the half field of view (tan 15° = 0.27)
  for (let k = 0; k <= 1; k += 0.05) {
    const p = blendPose(a, b, k).shot, off = new Vector3(...p.target).distanceTo(new Vector3(...b.shot.target));
    assert.ok(off / p.r < 0.12, `k=${k.toFixed(2)}: the place is ${(off / p.r).toFixed(3)} of a distance off the aim`);
  }
  // the framing is scaled with it
  assert.ok(Math.abs(blendPose(a, b, 0.5).shot.half[0] / blendPose(a, b, 0.25).shot.half[0] - blendPose(a, b, 0.75).shot.half[0] / blendPose(a, b, 0.5).shot.half[0]) < 1e-9);
  // lobule to sinusoid is a dive too; two body shots are not (the linear blend stays)
  assert.ok(lobuleShot('lobule').r / sinusoidShot().r > DIVE_RATIO);
  assert.ok(SHOTS.play.r / SHOTS.hvpg.r < DIVE_RATIO);
});

test('the body dissolves with the camera\'s distance to the lobule and is whole in every body shot', () => {
  assert.equal(bodyFade(DIVE_OUT), 1); assert.equal(bodyFade(DIVE_IN), 0); assert.equal(bodyFade(0), 0); assert.equal(bodyFade(50), 1);
  let last = -1;
  for (let d = 0; d <= 2.2; d += 0.05) { const f = bodyFade(d); assert.ok(f >= last - 1e-12, 'never grows back while going in'); last = f; }
  for (const shot of Object.values(SHOTS)) {
    const dist = Math.hypot(shot.target[0] - LIVER_POINT[0], shot.target[1] - LIVER_POINT[1], shot.target[2] - LIVER_POINT[2]);
    assert.ok(Math.max(shot.r, 0) > DIVE_OUT || dist > DIVE_OUT, 'a body shot keeps the camera outside the dissolve');
  }
});

test('the camera\'s near and far follow its distance: the sinusoid is not clipped and the body keeps its depth', () => {
  const rig = new CameraRig('play');
  rig.resize(1000, 700);
  rig.goTo(sinusoidShot(), room, 0);
  rig.update(0);
  assert.ok(rig.camera.near < 1e-3 && rig.camera.far > rig.camera.near * 1000 && rig.camera.far < 5);
  rig.goTo(SHOTS.play, room, 10, 0); rig.update(10);
  assert.ok(rig.camera.near > 0.05 && rig.camera.far > 100);
});

test('the hand\'s limits are the lobule\'s own box: panning or zooming it keeps it in the picture instead of pulling it toward the body plate', () => {
  const rig = new CameraRig('play');
  rig.resize(1000, 700);
  rig.goTo(lobuleShot('lobule'), room, 0); rig.update(0);
  const plate = rig.fitRect();   // (measured on the plate: the lobule's place is a hundred times smaller than it)
  rig.setSubject(lobuleCorners());
  const r = rig.fitRect();
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  assert.ok(Math.abs(cx - 500) < 150 && Math.abs(cy - 350) < 150, `the lobule's box is round the middle of the room (${cx.toFixed(0)}, ${cy.toFixed(0)})`);
  assert.ok(r.x1 - r.x0 > 300 && r.x1 - r.x0 < 1100, 'and about the size of the room');
  assert.ok((plate.x1 - plate.x0) / (r.x1 - r.x0) > 5, 'the plate stands many times larger on screen than the lobule when the camera is in the liver: its limits would drag the lobule off');
  rig.setSubject(sinusoidCorners());
  rig.goTo(sinusoidShot(), room, 10, 0); rig.update(10);
  const s = rig.fitRect();
  assert.ok(Math.abs((s.x0 + s.x1) / 2 - 500) < 150);
});

// Plan 30: the dive goes into the liver where the viewer is looking; the place dived to moves one way only (no lurch) and the way back out lands on the view he left.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { ORGAN_MESHES, setOrganData } from '../src/scene/organs/meshes.ts';
import { DEFAULT_DIVE_PLACE, LIVER_POINT, LIVER_Z, SIN_POINT, chooseDivePlace, lobuleWorld, resetDivePlace, setDivePlace, sinusoidWorld } from '../src/scene/lobule/frames.ts';
import { lobuleShot } from '../src/scene/lobule/shots.ts';

const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const lg = ORGAN_MESHES.liver!(); lg.computeBoundingBox();
const box = { minX: lg.boundingBox!.min.x, maxX: lg.boundingBox!.max.x, minY: lg.boundingBox!.min.y, maxY: lg.boundingBox!.max.y };

const SIZES = { mac: [1200, 800], phone: [390, 780] } as const;
const HANDS = [{ k: 3, x: 260, y: 120 }, { k: 3, x: -300, y: -60 }, { k: 3, x: 0, y: 200 }, { k: 3, x: -500, y: 300 }];

/** What scene.placeDive does: the ray through the room's centre meets the liver's plane; the place goes there (or to the nearest inside the liver). Returns the shot built on it, and where the viewer looked. */
function place(rig: CameraRig, room: { x: number; y: number; w: number; h: number }, w: number, h: number) {
  const cam = rig.camera, a = new Vector3(((room.x + room.w / 2) / w) * 2 - 1, -((room.y + room.h / 2) / h) * 2 + 1, 0.5).unproject(cam), o = cam.position;
  const t = (LIVER_Z - o.z) / (a.z - o.z), look = { x: o.x + (a.x - o.x) * t, y: o.y + (a.y - o.y) * t }, to = chooseDivePlace(look.x, look.y, box);
  setDivePlace(to.x, to.y);
  return { shot: lobuleShot('lobule'), look, to };
}
const bodyRig = (w: number, h: number, hand: { k: number; x: number; y: number }) => {
  const room = { x: 0, y: 0, w, h }, rig = new CameraRig('play', room); rig.resize(w, h); rig.goTo('play', room, 0); rig.update(0); rig.setHand(hand); rig.update(1);
  return { rig, room };
};

for (const [name, [w, h]] of Object.entries(SIZES)) test(`${name}: the place dived to moves one way in small steps, and the spot he looks at stays under the room's centre`, () => {
  HANDS.forEach((hand, hi) => {
    resetDivePlace();
    const { rig, room } = bodyRig(w, h, hand), { shot, look, to } = place(rig, room, w, h);
    const lookIn = Math.abs(look.x - to.x) < 1e-9 && Math.abs(look.y - to.y) < 1e-9;
    const p = new Vector3(...shot.target), look3 = new Vector3(look.x, look.y, LIVER_Z);
    const s0 = rig.project(p);
    if (lookIn) assert.ok(Math.hypot(s0.x - w / 2, s0.y - h / 2) < 1, `hand ${hi}: the place starts under the room's centre`);
    rig.goTo(shot, room, 100, 1500);
    const pts: { x: number; y: number }[] = [], looks: { x: number; y: number }[] = [];
    for (let t = 100; t <= 100 + 1500 + 32; t += 1000 / 60) { rig.update(t); pts.push(rig.project(p)); looks.push(rig.project(look3)); }
    const end = pts[pts.length - 1]!;
    let peak = 0;
    for (let i = 1; i < pts.length; i++) {
      peak = Math.max(peak, Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
      assert.ok(Math.hypot(pts[i]!.x - end.x, pts[i]!.y - end.y) <= Math.hypot(pts[i - 1]!.x - end.x, pts[i - 1]!.y - end.y) + 1e-6, `hand ${hi}: never turns back from the landing`);
    }
    assert.ok(peak <= 0.03 * w, `hand ${hi}: per-frame step ${peak.toFixed(2)} px is at most 3% of ${w}`);
    if (lookIn) {   // looking at the liver: the place does not travel at all, only the picture grows
      assert.ok(Math.hypot(end.x - s0.x, end.y - s0.y) < 1, `hand ${hi}: lands where it stood (${end.x.toFixed(1)}, ${end.y.toFixed(1)})`);
      for (let i = 0; i < pts.length * 0.4; i++) assert.ok(Math.hypot(looks[i]!.x - w / 2, looks[i]!.y - h / 2) <= 0.02 * w, `hand ${hi}: what he looks at stays within 2% of the width over the first 40%`);
    }
  });
});

test('the dive back out lands on the view he left: hand zoom, pan, and the place where it stood', () => {
  for (const hand of HANDS) {
    resetDivePlace();
    const [w, h] = SIZES.mac, { rig, room } = bodyRig(w, h, hand), { shot } = place(rig, room, w, h), p = new Vector3(...shot.target);
    const before = rig.project(p), k0 = rig.camera.zoom;
    rig.goTo(shot, room, 100, 1500);
    for (let t = 100; t <= 1700; t += 1000 / 60) rig.update(t);
    assert.equal(rig.camera.zoom, 1, 'the lobule lands on its own fit');
    rig.goTo('play', room, 3000, 1500);
    let last = Infinity;
    for (let t = 3000; t <= 4700; t += 1000 / 60) { rig.update(t); const q = rig.project(p), d = Math.hypot(q.x - before.x, q.y - before.y); assert.ok(d <= last + 1, 'the place only comes home'); last = Math.min(last, d); }
    const after = rig.project(p);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 0.5, `the place is back within half a pixel (${after.x.toFixed(2)}, ${after.y.toFixed(2)} vs ${before.x.toFixed(2)}, ${before.y.toFixed(2)})`);
    assert.ok(Math.abs(rig.camera.zoom - k0) / k0 < 0.005, 'the zoom is as he had it');
    // another body shot is not his view: a dive back to a different camera lands on that camera's fit
    rig.goTo(shot, room, 6000, 1500); for (let t = 6000; t <= 7700; t += 1000 / 60) rig.update(t);
    rig.goTo('pick', room, 9000, 1500); for (let t = 9000; t <= 10700; t += 1000 / 60) rig.update(t);
    assert.equal(rig.camera.zoom, 1, 'a different body shot lands on the fit');
  }
});

test('the place is always inside the liver, and the sinusoid follows it', () => {
  resetDivePlace();
  const far = [{ x: -9, y: 9 }, { x: 0, y: 0 }, { x: 9, y: -9 }, { x: DEFAULT_DIVE_PLACE[0], y: DEFAULT_DIVE_PLACE[1] }];
  for (const f of far) {
    const c = chooseDivePlace(f.x, f.y, box);
    assert.ok(c.x > box.minX + 0.0499 && c.x < box.maxX - 0.0499 && c.y > box.minY + 0.0499 && c.y < box.maxY - 0.0499, 'inside');
    setDivePlace(c.x, c.y);
    const w = lobuleWorld([0, 0, 0]);
    assert.ok(Math.abs(w[0] - c.x) < 1e-12 && Math.abs(w[1] - c.y) < 1e-12);
    const s = sinusoidWorld([0, 0, 0]);
    assert.ok(Math.abs(s[0] - SIN_POINT[0]) < 1e-12 && s[0] < c.x, 'the sinusoid stands toward the portal corner of the moved lobule');
  }
  resetDivePlace();
  assert.deepEqual([...LIVER_POINT], [...DEFAULT_DIVE_PLACE]);
});

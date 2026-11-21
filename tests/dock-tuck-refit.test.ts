import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { effectiveDistance } from '../src/scene/camera/room.ts';
import { lobuleShot } from '../src/scene/lobule/shots.ts';

// Mohammad 21 Nov (iPhone, Circulation slide 5): tucking the data card up left the lobule small and the whole figure blurred.
// Root cause, one: the dock's room hint only panned the camera (a room change alone keeps the zoom), so the figure never grew into the room the card left.
// Root cause, two: the dive's blur and body fade measured "the lobule's framing" in the NEW room (targetRoom) while the camera still sat at the OLD fit, so the camera
// looked like it was part way into a dive for ever. Both read the one room the distance is fitted to (rig.fitRoom).
const small = { x: 0, y: 200, w: 390, h: 300 }, big = { x: 0, y: 60, w: 390, h: 640 };
const settle = (rig: CameraRig, from: number) => { let t = from; for (; t < from + 3000; t += 16) rig.update(t); return t; };
const dist = (rig: CameraRig) => rig.camera.position.distanceTo(new Vector3(...rig.pose.shot.target));

test('a refit room change grows the lobule into the room the tucked card left, and fitRoom says which room the distance is fitted to', () => {
  const rig = new CameraRig('play', small); rig.resize(390, 844);
  rig.goTo(lobuleShot('lobule'), small, 0); const t0 = settle(rig, 0);
  const dSmall = effectiveDistance(lobuleShot('lobule'), small, 844, 390), dBig = effectiveDistance(lobuleShot('lobule'), big, 844, 390);
  assert.ok(dBig < dSmall, 'a bigger room frames the lobule closer');
  assert.deepEqual({ w: rig.fitRoom.w, h: rig.fitRoom.h }, { w: small.w, h: small.h });

  // a room change alone (a card opening, a sheet) only pans: the zoom and the fitted room stay
  rig.setRoom(big, t0); const t1 = settle(rig, t0);
  assert.equal(rig.targetRoom.h, big.h);
  assert.equal(rig.fitRoom.h, small.h, 'the fit stays');

  // the dock's hint refits: the camera eases in to the bigger room's framing, and out again when the card comes back
  rig.setRoom(small, t1, undefined, false, true); const t2 = settle(rig, t1);
  rig.setRoom(big, t2, 400, false, true);
  const mid = (rig.update(t2 + 200), dist(rig));
  const t3 = settle(rig, t2 + 200);
  assert.equal(rig.fitRoom.h, big.h);
  assert.ok(Math.abs(dist(rig) - dBig) / dBig < 0.02, `landed at the big room's framing (${dist(rig)} vs ${dBig})`);
  assert.ok(mid > dist(rig) && mid < dSmall * 1.05, 'it eased, it did not snap');
  rig.setRoom(small, t3, 400, false, true); settle(rig, t3);
  assert.ok(Math.abs(dist(rig) - dSmall) / dSmall < 0.02, 'and out again when the card returns');
});

test('the dock glide refits the camera, and the dive\'s framing distance reads the fitted room, never the room the picture is merely centred in', () => {
  assert.match(readFileSync('src/ui/deck/scene-link.ts', 'utf8'), /sceneApi\.setRoom\(h\.free, h\.ms, false, true, easeArrive\)/);
  const scene = readFileSync('src/scene/scene.ts', 'utf8');
  assert.match(scene, /lobuleRest\(\): number \{\s*const r = this\.rig\.fitRoom/);
});

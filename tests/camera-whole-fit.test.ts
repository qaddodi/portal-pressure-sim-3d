// The whole-figure Fit frames what is drawn now (Mohammad, 25 Nov, iPhone: "Zoom fit now not including part of the esophagus on top. Give it more. Also when there is ascites the bottom fit should
// move so it includes the tip of the ascites on bottom"). The esophagus is framed up to where its top fade is all but gone (placed-bounds.ts ESO_SEEN_Y), the ascites' water down to its floor and
// out to its walls (camera/whole.ts), on every screen; and when the water comes or goes under a Fit, the camera glides to the new fit, never snaps (parts/camera.ts followWhole).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { SHOTS, FOV, type Shot } from '../src/scene/camera/shots.ts';
import { effectiveDistance, type Room } from '../src/scene/camera/room.ts';
import { ESO_SEEN_Y, placedBoxOfName } from '../src/scene/anatomy/source.ts';
import { ascitesBox, wholeShot } from '../src/scene/camera/whole.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';

const TAN = Math.tan((FOV * Math.PI) / 360);
const SCREENS = [
  { name: 'iPhone Pro Max', vp: { w: 440, h: 956, safe: { top: 62, right: 0, bottom: 34, left: 0 } }, thumb: true },
  { name: 'iPhone', vp: { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, thumb: true },
  { name: 'iPhone sideways', vp: { w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } }, thumb: true },
  { name: 'iPad', vp: { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, thumb: true },
  { name: 'Mac', vp: { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, thumb: false },
] as const;
/** Where a scene point stands on the canvas with the shot fitted into the room (head-on: every whole-figure shot is square on). */
function placer(s: Shot, room: Room, vp: { w: number; h: number }) {
  const pxu = vp.h / (2 * TAN) / effectiveDistance(s, room, vp.h, vp.w);
  return { X: (x: number) => room.x + room.w / 2 + (x - s.target[0]) * pxu, Y: (y: number) => room.y + room.h / 2 - (y - s.target[1]) * pxu };
}

test('the esophagus is framed up to where its fade is all but gone, with room to spare above the plate\'s top on every screen', () => {
  const eso = placedBoxOfName('esophagus')!;
  assert.ok(ESO_SEEN_Y > eso[4] + 0.08, 'the seen top stands well above the baked box\'s top (the plate\'s, half way up the fade)');
  for (const { name, vp, thumb } of SCREENS) {
    const room = freeRoom(vp as never, layoutClass(thumb)), { Y } = placer(SHOTS.play, room, vp);
    const seen = Y(ESO_SEEN_Y) - room.y, plate = Y(eso[4]) - room.y;
    assert.ok(seen >= 0, `${name}: the esophagus' seen top is in the room (${seen.toFixed(1)} px below its top)`);
    assert.ok(plate >= 0.025 * room.h, `${name}: the esophagus' plate top stands ${plate.toFixed(1)} px below the room's top, of ${room.h.toFixed(0)} (the old Fit had it at the edge)`);
    console.log(`${name}: the esophagus' plate top ${plate.toFixed(1)} px, its seen top ${seen.toFixed(1)} px below the room's top (${room.h.toFixed(0)} high)`);
  }
});

test('with ascites the Fit reaches the water\'s floor and walls, on every screen and at every volume; with none it is the organs\' own', () => {
  assert.equal(wholeShot(0), SHOTS.play);
  assert.equal(wholeShot(120), SHOTS.play, 'under 150 mL no pool is drawn');
  const organsBottom = SHOTS.play.target[1] - SHOTS.play.half[1];
  for (const ml of [300, 1500, 4000, 8500]) {
    const b = ascitesBox(ml)!, s = wholeShot(ml);
    assert.ok(b[1] < organsBottom, `${ml} mL: the water's floor (${b[1].toFixed(3)}) lies below the organs' frame (${organsBottom.toFixed(3)}): the Fit has to move`);
    for (const { name, vp, thumb } of SCREENS) {
      const room = freeRoom(vp as never, layoutClass(thumb)), { X, Y } = placer(s, room, vp);
      const gaps = { left: X(b[0]) - room.x, right: room.x + room.w - X(b[3]), top: Y(b[4]) - room.y, bottom: room.y + room.h - Y(b[1]) };
      for (const [side, g] of Object.entries(gaps)) assert.ok(g >= -0.5, `${ml} mL ${name}: the water is cut at the ${side} (${g.toFixed(1)} px)`);
      const ob = placer(SHOTS.play, room, vp);
      assert.ok(room.y + room.h - ob.Y(b[1]) < -2, `${ml} mL ${name}: and the organs' own Fit would have cut its floor`);
    }
  }
});

test('the water comes under the Fit: the camera glides to the new fit from where it stands, one way, no snap; and back when it goes', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  type S = { resize(w: number, h: number): void; update(t: number): boolean; dispose(): void; goTo(s: unknown, r: Room, t: number, ms?: number): void; disease: object;
    rig: { isMoving: boolean; camera: { position: Vector3 }; pose: { shot: Shot } } };
  const s = new CelScene() as unknown as S;
  after(() => s.dispose());
  const vp = SCREENS[0].vp, room = freeRoom(vp as never, layoutClass(true));
  s.resize(vp.w, vp.h);
  let ml = 0, t = 0;
  Object.defineProperty(s.disease, 'fluidGoalMl', { get: () => ml });
  s.goTo('play', room, 0, 10);
  for (let i = 0; i < 40; i++) s.update((t += 16));
  for (const goal of [4000, 0]) {
    ml = goal;
    const eyes: Vector3[] = [s.rig.camera.position.clone()];
    for (let i = 0; i < 200 && (i < 3 || s.rig.isMoving); i++) { s.update((t += 16)); eyes.push(s.rig.camera.position.clone()); }
    assert.equal(s.rig.isMoving, false, 'landed');
    const end = eyes[eyes.length - 1]!, want = wholeShot(goal);
    assert.ok(eyes[0]!.distanceTo(end) > 0.05, `${goal} mL: the camera moved to the new fit`);
    assert.ok(Math.abs(s.rig.pose.shot.target[1] - want.target[1]) < 1e-6, `${goal} mL: it landed on the fit of what is drawn`);
    const steps = eyes.map((e, k) => (k ? e.distanceTo(eyes[k - 1]!) : 0)), most = Math.max(...steps);
    for (let k = 1; k < eyes.length; k++) {
      assert.ok(eyes[k]!.distanceTo(end) <= eyes[k - 1]!.distanceTo(end) * 1.002 + 1e-7, `${goal} mL: one way to the new fit (frame ${k})`);
      if (k > 1) assert.ok(steps[k]! <= 4 * steps[k - 1]! + 0.25 * most, `${goal} mL: no snap at frame ${k}`);
    }
  }
});

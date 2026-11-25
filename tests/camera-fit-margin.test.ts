// Zoom fit (Mohammad, 25 Nov: "decrease the upper and lower margin between end of figure and UI so it's more zoomed"): the whole figure stands nearer the room's edge (shots.ts WHOLE_FILL, WHOLE_MARGIN),
// on every shot that is the whole figure, and the rig keeps what a shot asks of the room solver (its `fill` and its `keep` points) when it lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { SHOTS, WHOLE_FILL, DECK_WHOLE_FILL, WHOLE_MARGIN, SHOT_MARGIN, viewReach, FOV } from '../src/scene/camera/shots.ts';
import { effectiveDistance, FILL, fullRoom } from '../src/scene/camera/room.ts';
import { camPlan } from '../src/decks/hp/cams.ts';
import { shotOfCam } from '../src/decks/ag/shots.ts';
import { boxOfNames, FIGURE_NAMES } from '../src/scene/anatomy/source.ts';

const SCREENS = [
  { name: 'iPhone upright', w: 390, h: 844, room: { w: 390, h: 546 } },
  { name: 'iPad upright', w: 820, h: 1180, room: { w: 820, h: 1000 } },
  { name: 'Mac', w: 1440, h: 900, room: { w: 1440, h: 800 } },
] as const;
const TAN = Math.tan((FOV * Math.PI) / 360);

test('every whole-figure frame carries the whole figure\'s share of the room and margin, and the figure\'s ends stand within 7 % of the room\'s height of its edge, and the same at both ends', () => {
  const plan = camPlan('fit') as { shot: typeof SHOTS.play };
  const ag = shotOfCam('fit') as { shot: typeof SHOTS.play };
  const box = boxOfNames(FIGURE_NAMES, true).box!;
  for (const [name, shot, fill] of [['play', SHOTS.play, WHOLE_FILL], ['hp fit', plan.shot, DECK_WHOLE_FILL], ['ag fit', ag.shot, DECK_WHOLE_FILL]] as const) {
    assert.equal(shot.fill, fill, `${name} fill`);
    const reach = viewReach(box, shot);
    assert.ok(shot.half[1] - reach[1] <= WHOLE_MARGIN + 1e-9, `${name}: ${(shot.half[1] - reach[1]).toFixed(3)} of margin, not more than ${WHOLE_MARGIN}`);
    for (const sc of SCREENS) {
      const d = effectiveDistance(shot, sc.room, sc.h, sc.w), pxu = sc.h / (2 * TAN) / d;
      const gap = Math.min(sc.room.h / 2 - reach[1] * pxu, sc.room.w / 2 - reach[0] * pxu);
      assert.ok(gap >= -1, `${name} ${sc.name}: the figure stays in the room (${gap.toFixed(0)} px)`);
      assert.ok(gap / sc.room.h <= 0.07, `${name} ${sc.name}: ${gap.toFixed(0)} px between the figure's end and the room's edge (${((gap / sc.room.h) * 100).toFixed(1)} % of the room)`);
    }
  }
  assert.ok(DECK_WHOLE_FILL > FILL && WHOLE_MARGIN < SHOT_MARGIN);
});

test('a part of the figure keeps the ordinary share (0.92) and margin', () => {
  assert.equal(SHOTS.free.fill, undefined);
  assert.equal(SHOTS.pick.fill, undefined);
});

test('the rig keeps a shot\'s fill and keep points when it lands (a copy that dropped them made the room solver ignore them at run time)', () => {
  const rig = new CameraRig('play');
  rig.resize(390, 844);
  const shot = { ...SHOTS.free, keep: [[-0.2, 0.3]] as const, fill: 0.97 };
  rig.goTo(shot, fullRoom(390, 640), 0);
  rig.update(0); rig.update(10);
  assert.deepEqual(rig.pose.shot.keep, shot.keep);
  assert.equal(rig.pose.shot.fill, 0.97);
});

test('free play is aimed at the figure\'s own middle: as far from the room\'s top as from its bottom (the 2D plate\'s aim stood 0.125 units too high, leaving 130 px above and 85 below on a phone)', () => {
  const box = boxOfNames(FIGURE_NAMES, true).box!, s = SHOTS.play;
  assert.ok(Math.abs((box[4] - s.target[1]) - (s.target[1] - box[1])) < 1e-9, `top ${(box[4] - s.target[1]).toFixed(3)}, bottom ${(s.target[1] - box[1]).toFixed(3)}`);
});

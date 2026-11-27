// Zoom fit (Mohammad, 25 Nov: "decrease the upper and lower margin between end of figure and UI so it's more zoomed"): the whole figure stands nearer the room's edge (shots.ts WHOLE_FILL, WHOLE_MARGIN),
// on every shot that is the whole figure, and the rig keeps what a shot asks of the room solver (its `fill` and its `keep` points) when it lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { SHOTS, WHOLE_FILL, DECK_WHOLE_FILL, WHOLE_MARGIN, SHOT_MARGIN, viewReach, FOV } from '../src/scene/camera/shots.ts';
import { effectiveDistance, FILL, fullRoom } from '../src/scene/camera/room.ts';
import { camPlan } from '../src/decks/hp/cams.ts';
import { boxOfNames, FIGURE_NAMES, VISIBLE_FIGURE_NAMES, placedBoxOfName, RECTUM_SEEN_Y } from '../src/scene/anatomy/source.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';

const SCREENS = [
  { name: 'iPhone upright', w: 390, h: 844, room: { w: 390, h: 546 } },
  { name: 'iPad upright', w: 820, h: 1180, room: { w: 820, h: 1000 } },
  { name: 'Mac', w: 1440, h: 900, room: { w: 1440, h: 800 } },
] as const;
const TAN = Math.tan((FOV * Math.PI) / 360);

test('every whole-figure frame carries the whole figure\'s share of the room and margin, and the figure\'s ends stand within 7 % of the room\'s height of its edge, and the same at both ends', () => {
  const plan = camPlan('fit') as { shot: typeof SHOTS.play };
  const box = boxOfNames(VISIBLE_FIGURE_NAMES, true).box!;
  for (const [name, shot, fill] of [['play', SHOTS.play, WHOLE_FILL], ['hp fit', plan.shot, DECK_WHOLE_FILL]] as const) {
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

test('free play on the real rooms: the organs\' silhouette stands centred up and down (gaps equal) and across (within 1 % of the room\'s width), with 3.5 % or less of the room\'s height empty at each end; measured on the organs, not the vessels', () => {
  const organs = VISIBLE_FIGURE_NAMES.map((n) => placedBoxOfName(n)!);
  const x0 = Math.min(...organs.map((b) => b[0])), x1 = Math.max(...organs.map((b) => b[3])), y0 = Math.min(...organs.map((b) => b[1])), y1 = Math.max(...organs.map((b) => b[4]));
  const screens = [
    { name: 'iPhone', vp: { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, thumb: true },
    { name: 'iPad', vp: { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, thumb: true },
    { name: 'Mac', vp: { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, thumb: false },
  ] as const;
  const s = SHOTS.play;
  for (const { name, vp, thumb } of screens) {
    const room = freeRoom(vp as never, layoutClass(thumb)), d = effectiveDistance(s, room, vp.h, vp.w), pxu = vp.h / (2 * TAN) / d;
    const X = (x: number) => room.x + room.w / 2 + (x - s.target[0]) * pxu, Y = (y: number) => room.y + room.h / 2 - (y - s.target[1]) * pxu;
    const left = X(x0) - room.x, right = room.x + room.w - X(x1), top = Y(y1) - room.y, bottom = room.y + room.h - Y(y0);
    assert.ok(Math.abs(top - bottom) < 1, `${name}: ${top.toFixed(1)} above, ${bottom.toFixed(1)} below`);
    assert.ok(Math.abs(left - right) <= room.w * 0.01, `${name}: ${left.toFixed(1)} left, ${right.toFixed(1)} right`);
    const most = 0.035;   // (WHOLE_FILL 0.96 and a margin of 0.01: shots.ts)
    assert.ok(top <= room.h * most && bottom <= room.h * most, `${name}: ${top.toFixed(1)} above, ${bottom.toFixed(1)} below, of ${room.h.toFixed(0)}`);
    console.log(`# ${name}: room ${room.w} x ${room.h.toFixed(0)}; organs: left ${left.toFixed(0)}, right ${right.toFixed(0)}, top ${top.toFixed(0)}, bottom ${bottom.toFixed(0)} px`);
  }
});

test('the colon is framed down to where its rectum is seen: RECTUM_SEEN_Y is the live tube\'s half-alpha point, and the baked box reaches further than the tube', async () => {
  const { gutTubes } = await import('../src/scene/organs/gut-tubes.ts');
  const { PLACED_ORGAN_BOX } = await import('../src/scene/anatomy/source.ts');
  const g = gutTubes().colon, pos = g.getAttribute('position'), a = g.getAttribute('esoA');
  let half = Infinity, end = Infinity;
  for (let i = 0; i < pos.count; i++) { end = Math.min(end, pos.getY(i)); if (a.getX(i) >= 0.5) half = Math.min(half, pos.getY(i)); }
  assert.ok(Math.abs(half - RECTUM_SEEN_Y) < 0.01, `the tube is half seen at ${half.toFixed(3)}, RECTUM_SEEN_Y ${RECTUM_SEEN_Y}`);
  assert.ok(PLACED_ORGAN_BOX.colon![1] < end - 0.05, 'the baked box has a cap the faded end lacks (that is why it is not what is framed)');
  assert.equal(placedBoxOfName('colon-seen')![1], RECTUM_SEEN_Y);
});

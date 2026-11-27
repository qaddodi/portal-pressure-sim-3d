// The dive from or to the body turns to the place at once and then pushes straight in (Mohammad, 27 Nov, the Sites deck, anatomy to the lobule: "zooming to the portal vein area, then going towards the lobule
// area and zooming in"). Root cause: the place's screen offset was let go on the distance's linear share (rig.ts blendDive), which a geometric zoom of a thousand times has nearly all gone by its first tenth, so the
// maths had the aim on the place at once, but the picture is the offset on screen and the place stayed at its first off-centre spot (130 px up and left on a Mac) while the liver's neighbourhood grew round it, and
// then slid to the middle at a steady pace across tissue grown a hundred times: two legs. The offset is now let go on the first AIM_SETTLE of the move (aimShare), the rest is a push into the middle of the room.
// Every screen, every body shot the decks use (the whole figure, a zoomed slide frame), in and out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig, AIM_SETTLE, aimShare } from '../src/scene/camera/rig.ts';
import { SHOTS, type Shot } from '../src/scene/camera/shots.ts';
import { lobuleShot, sinusoidShot } from '../src/scene/lobule/shots.ts';
import { sinusoidWorld } from '../src/scene/lobule/frames.ts';

const DEVICES = [
  { name: 'Mac', w: 1440, h: 900, room: { x: 420, y: 0, w: 1020, h: 900 }, portrait: false },
  { name: 'iPhone', w: 390, h: 844, room: { x: 0, y: 60, w: 390, h: 520 }, portrait: true },
  { name: 'iPad portrait', w: 768, h: 1024, room: { x: 0, y: 0, w: 768, h: 560 }, portrait: true },
  { name: 'iPad', w: 1024, h: 768, room: { x: 0, y: 0, w: 1024, h: 768 }, portrait: false },
] as const;
const MS = 1500, FRAME = 16;

/** A body shot a deck slide frames on the portal vein's area (Sites 3: the confluence and the splenic vein), seen from the whole figure's own distance. */
const PORTAL_FRAME: Shot = { ...SHOTS.play, target: [0.13, 0.125, -0.028], half: [0.706, 0.589] };

/** The place's screen offset from the room's middle, every frame of a move. */
function offsets(d: (typeof DEVICES)[number], from: Shot | 'play', to: Shot | 'play', place: Vector3): number[] {
  const rig = new CameraRig('play', d.room); rig.resize(d.w, d.h);
  rig.goTo(from, d.room, 0); rig.update(0);
  rig.goTo(to, d.room, 0, MS);
  const cx = d.room.x + d.room.w / 2, cy = d.room.y + d.room.h / 2, out: number[] = [];
  for (let t = FRAME; t <= MS + 200; t += FRAME) { rig.update(t); const s = rig.project(place); out.push(Math.hypot(s.x - cx, s.y - cy)); }
  return out;
}

test('aimShare: nothing at the body end, all of it by AIM_SETTLE, eased both ends', () => {
  assert.equal(aimShare(0), 0);
  assert.equal(aimShare(AIM_SETTLE), 1);
  assert.equal(aimShare(1), 1);
  assert.ok(aimShare(0.01) < 0.01, 'eased in');
  assert.ok(aimShare(AIM_SETTLE - 0.01) > 0.99, 'eased out');
});

for (const d of DEVICES) {
  for (const [label, from] of [['the whole figure', 'play' as const], ['a slide framed on the portal vein', PORTAL_FRAME]] as const) {
    for (const cam of ['lobule:triad', 'lobule:fit', 'lobule:sinusoid', 'lobule:central'] as const) {
      const to = lobuleShot(cam), place = new Vector3(...to.target);
      test(`${d.name}: ${label} to ${cam}: the place is on the middle of the room by the time the move is ${Math.round(AIM_SETTLE * 100 + 25)} % done, and out is the same run back`, () => {
        const inn = offsets(d, from, to, place), out = offsets(d, to, from, place);
        const first = inn[0]!, n = inn.length, settled = inn.slice(Math.floor(0.65 * (MS / FRAME)));
        assert.ok(first > 0 || out.at(-1)! >= 0);
        // (the push into the middle: from two thirds of the move the place never leaves it, a pixel at most)
        for (const [i, v] of settled.entries()) assert.ok(v < 1.5, `in, frame ${i} of the push: ${v.toFixed(1)} px off the middle`);
        // (and the settling is one way: the offset only closes, never out and back)
        for (let i = 1; i < n; i++) assert.ok(inn[i]! <= inn[i - 1]! + 0.5, `in, frame ${i}: ${inn[i - 1]!.toFixed(1)} -> ${inn[i]!.toFixed(1)}`);
        for (let i = 1; i < out.length; i++) assert.ok(out[i]! >= out[i - 1]! - 0.5, `out, frame ${i}: ${out[i - 1]!.toFixed(1)} -> ${out[i]!.toFixed(1)}`);
        // (out is in run backward: the place is on the middle for the first third, and lands where the body shot has it)
        for (const [i, v] of out.slice(0, Math.floor(0.3 * (MS / FRAME))).entries()) assert.ok(v < 1.5, `out, frame ${i} of the pull: ${v.toFixed(1)} px off the middle`);
        assert.ok(Math.abs(out.at(-1)! - first) < 2, 'out lands where in began');
      });
    }
  }
  test(`${d.name}: body to the sinusoid settles the same way`, () => {
    const sin = sinusoidShot(d.portrait, d.portrait ? d.room.w : d.room.h), place = new Vector3(...sinusoidWorld([0, 0, 0]));
    const inn = offsets(d, 'play', sin, place);
    for (const [i, v] of inn.slice(Math.floor(0.65 * (MS / FRAME))).entries()) assert.ok(v < 2, `frame ${i} of the push: ${v.toFixed(1)} px off the middle`);
  });
}

// Mohammad 23 Nov (the Budd-Chiari slide where the HVPG tries to measure): "at the tip of the catheter, again in a call-out label ... saying occluded, and then change it to say no reading. Now it says nothing."
// Root cause: the catheter's readings were drawn only for the free, wedge and result states (cath-show.ts calloutsFor), and the deck's catheter at a blocked vein stands at the ostium (advance < 1), which
// `cathere` read as "not there yet": nothing was ever asked for at its tip. Now the blocked state has one tag at the tip, words only, "Occluded" then "No reading", in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { BLOCKED_SAYS, calloutsFor } from '../src/scene/labels/cath-show.ts';

const vp = { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;

function world() {
  const room = { x: 0, y: 0, w: vp.w, h: vp.h };
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000;
  const asked: boolean[] = [];
  const d = {
    now: () => t, project: (p: Vector3, o: { x: number; y: number }) => rig.project(p, o), cameraMoving: () => false,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: () => null, level: () => 'all',
    cathere: (tip: Vector3, ahead: Vector3, blocked?: boolean) => { asked.push(!!blocked); tip.set(0.02, 0.02, 0); ahead.set(0.1, 0.12, 0); return blocked ? 1 : 0; },
  } as unknown as LabelDeps;
  const ctl = new LabelController(d); ctl.setState({ ...NO_STATE, cath: 'blocked' });
  return { ctl, asked, step: (ms: number) => { for (let i = 0; i < ms / 16; i++) { t += 16; ctl.tick(); } } };
}

test('a blocked vein stands one card at the tip', () => {
  assert.deepEqual(calloutsFor('blocked'), ['f']);
  assert.deepEqual(calloutsFor('route'), []);
});

test('the tip says "Occluded", then crosses over to "No reading" in the same card, without a pop', () => {
  const w = world();
  w.step(1500);
  assert.ok(w.asked.every(Boolean), 'the layer is told the vein is blocked');
  let p = w.ctl.cath.pills;
  assert.equal(p.length, 1, 'one card');
  assert.equal(p[0]!.id, 'f');
  assert.equal(p[0]!.reading.kicker, BLOCKED_SAYS.first);
  assert.equal(p[0]!.reading.value, ''); assert.equal(p[0]!.reading.unit, '', 'no number and no unit');
  assert.equal(p[0]!.alpha, 1);
  const { x, w: width } = p[0]!, key = p[0]!.key;
  w.step(BLOCKED_SAYS.afterMs);
  p = w.ctl.cath.pills;
  assert.equal(p.length, 1);
  assert.equal(p[0]!.reading.kicker, BLOCKED_SAYS.then);
  assert.equal(p[0]!.alpha, 1, 'it stays up while the words change (the tag itself crosses over)');
  assert.equal(p[0]!.x, x); assert.equal(p[0]!.w, width); assert.equal(p[0]!.key, key, 'same place and size: it is not a new card');
});

test('leaving the blocked state takes the words away and coming back starts at "Occluded" again', () => {
  const w = world();
  w.step(1500 + BLOCKED_SAYS.afterMs + 200);
  assert.equal(w.ctl.cath.pills[0]!.reading.kicker, BLOCKED_SAYS.then);
  w.ctl.setState({ ...NO_STATE, cath: null });
  w.step(1500);
  assert.equal(w.ctl.cath.pills.length, 0);
  w.ctl.setState({ ...NO_STATE, cath: 'blocked' });
  w.step(1500);
  assert.equal(w.ctl.cath.pills[0]!.reading.kicker, BLOCKED_SAYS.first);
});

test('"No reading" comes on a slow screen too (8 frames a second), and after a camera glide that moved the tip every frame', () => {
  // (HVPG deck review 1, 23 Nov: the capture at 20x waited "No reading" out in page time, a handful of frames. The words are counted in the label layer's page time from the first still frame, so they must
  // come however few frames the screen draws, and a tip that was gliding must not leave the layer holding for ever.)
  const w = world();
  const t0 = w.asked.length;
  for (let i = 0; i < 6; i++) w.step(16);
  const slow = (ms: number) => { for (let i = 0; i < ms / 125; i++) w.step(125); };
  slow(1000);
  assert.equal(w.ctl.cath.pills[0]!.reading.kicker, BLOCKED_SAYS.first);
  slow(BLOCKED_SAYS.afterMs + 500);
  assert.equal(w.ctl.cath.pills[0]!.reading.kicker, BLOCKED_SAYS.then);
  assert.ok(w.asked.length > t0);
});

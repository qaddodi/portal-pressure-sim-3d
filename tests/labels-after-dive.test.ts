// The labels after a dive: the sinusoid and back to Anatomy in one session brought no names back for 10+ seconds (Mac play-test, 19 Nov), though a reload did.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { SHOTS } from '../src/scene/camera/shots.ts';
import { lobuleShot, sinusoidShot } from '../src/scene/lobule/shots.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { DOT_ROOM } from '../src/scene/labels/solver.ts';

const vp = { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const room = { x: 0, y: 0, w: 1280, h: 800 };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;

function world() {
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000;
  const cards: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const deps: LabelDeps = {
    now: () => t, project: (p: Vector3, o) => rig.project(p, o), cameraMoving: () => rig.isMoving,
    free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => cards, measure, pressure: (n) => (n.length * 1.7) % 20, reading: () => null, cathere: () => 0,
  };
  const ctl = new LabelController(deps);
  ctl.setState({ ...NO_STATE, organNames: true });
  /** Runs the camera and the labels together for `ms`, as the clock does: the camera's update, then the labels' tick. */
  const run = (ms: number) => { for (let i = 0; i < ms / 16; i++) { t += 16; rig.update(t); ctl.tick(); } };
  const go = (shot: Parameters<CameraRig['goTo']>[0]) => { rig.goTo(shot, room, t, 950); };
  return { rig, ctl, run, go, cards };
}
const shown = (ctl: LabelController) => ctl.out.filter((d) => d.alpha > 0.99).length;

test('the names come back after a dive to the sinusoid and out to Anatomy', () => {
  const w = world();
  w.run(1500);
  const before = shown(w.ctl);
  assert.ok(before >= 5, `the names stand in Anatomy (${before})`);
  w.go(lobuleShot('lobule')); w.run(2500);
  w.go(sinusoidShot()); w.run(2500);
  w.go(lobuleShot('lobule')); w.run(2500);
  w.go('play'); w.run(2500);
  assert.equal(shown(w.ctl), before, 'every name is back 2.5 s after the camera lands');
});

test('no label is ever placed at a point that is not a number, whichever view the camera is in', () => {
  const w = world();
  for (const shot of ['play', lobuleShot('lobule'), sinusoidShot(), 'play'] as const) {
    w.go(shot); w.run(2500);
    for (const d of w.ctl.out) assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y), `${d.id} at ${d.x},${d.y}`);
  }
});

test('the names come back when a card that came in during the dive is still up on the way out (the same cards before and after: nothing else tells the labels to place themselves again)', () => {
  const w = world();
  w.run(1500);
  const before = shown(w.ctl);
  assert.ok(before >= 5);
  w.go(sinusoidShot()); w.cards.push({ x0: 900, y0: 80, x1: 1270, y1: 400 }); w.run(3000);   // the card opens with the sinusoid, the labels are asked to place themselves there
  w.go('play'); w.run(3000);                                                                // and it is still up when the camera is back
  assert.ok(shown(w.ctl) >= before - 1, `the names stand again (${shown(w.ctl)} of ${before})`);
});

test('the Portal vein and Lower IVC dots stand apart in free play, so the Portal vein callout stays beside its trunk on the liver side (Mac play-test, 19 Nov: it stood inside the stomach)', () => {
  const w = world();
  w.run(1500);
  const dots = w.ctl.out.filter((d) => d.dot).map((d) => ({ id: d.id, ...d.dot!, box: d }));
  const at = (id: string) => dots.find((d) => d.id === id)!;
  assert.ok(Math.hypot(at('CONF').x - at('IVCI').x, at('CONF').y - at('IVCI').y) >= DOT_ROOM - 1, 'the Portal vein and Lower IVC dots stand apart');
  const conf = dots.find((d) => d.id === 'CONF')!;
  assert.ok(conf.box.x + conf.box.w <= conf.x + 4, 'the Portal vein callout stands left of its dot, over the liver, not east of it toward the stomach');
});

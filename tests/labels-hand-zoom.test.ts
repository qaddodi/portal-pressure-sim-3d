// Mohammad, 21 Nov, iPhone (build c2ed15a3): "while pinch zooming the labels are not in place, they're stuck". ROOT CAUSE: the audit's cut rule (a dot that moves more than FOLLOW_JUMP px in one frame is a cut) could not tell a hand's
// pinch from a shot's cut: a quick pinch moves a dot 400 px from its middle by 80 px in a frame, so a pinch was a cut, and commit 9c859999 froze the names at the picture before the "cut" (controller.ts cutAnchors, ride.ts frozen) until the
// picture was still: names and dots stood at their old places while their vessels moved on. Two fixes, pinned here: a frame whose change is the hand's alone (labels/hand-watch.ts) is never a cut, and a true cut's freeze ends with
// the names' fade (hold), not when the camera comes to rest, so nothing is ever drawn away from its dot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, FOLLOW_JUMP, type LabelDeps } from '../src/scene/labels/controller.ts';
import { HandWatch, isCut } from '../src/scene/labels/hand-watch.ts';
import { FADE } from '../src/scene/labels/alpha.ts';
import { Ride } from '../src/scene/labels/ride.ts';

const vp = { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } };
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;
const shown = { presenting: true, named: new Set<string>(), shown: new Set(['RHV', 'CONF', 'SV', 'RA', 'IVCI']) };

function world(withHand = true) {
  const room = { x: 0, y: 0, w: vp.w, h: vp.h };
  const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
  let t = 1000, moving = false, dx = 0, tick = [] as { x: number; y: number }[];
  const d = {
    now: () => t, project: (p: Vector3, o: { x: number; y: number }) => { rig.project(p, o); o.x += dx; tick.push({ x: o.x, y: o.y }); return o; }, cameraMoving: () => moving,
    ...(withHand ? { hand: () => rig.handView } : {}), free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null,
    blockers: () => [], measure, pressure: () => 5, reading: () => null, cathere: () => 0, zoom: () => rig.handZoom,
  } as LabelDeps;
  const ctl = new LabelController(d); ctl.setState({ ...NO_STATE, ...shown });
  const frame = () => { t += 16; tick = []; ctl.tick(); };
  /** every label's dot is where its anchor projects to NOW: the ring is never left at a place the picture has moved from */
  const dotsOnAnchors = () => ctl.out.filter((x) => x.dot && x.alpha > 0).every((x) => tick.some((p) => Math.hypot(p.x - x.dot!.x, p.y - x.dot!.y) < 0.5));
  return { rig, ctl, frame, run: (ms: number) => { for (let i = 0; i < ms / 16; i++) frame(); }, set: (o: { moving?: boolean; dx?: number }) => { if (o.moving !== undefined) moving = o.moving; if (o.dx !== undefined) dx = o.dx; ctl.markDirty(); }, dotsOnAnchors, names: () => ctl.out.filter((x) => x.kind === 'station' && !x.ghost).map((x) => x.id) };
}

/** `hand`: the controller is given the hand's view (the app does); without it the old rule stands (every jump a cut), which is the control that shows the case breaks. */
function pinch(withHand: boolean) {
  const w = world(withHand); w.run(1500);
  const ids = w.names(); assert.ok(ids.length >= 3, `${ids.length} names stand`);
  let worstStep = 0, frozen = 0, faded = 0; void faded;
  for (let i = 1; i <= 6; i++) {
    const before = w.ctl.out.filter((x) => x.dot).map((x) => ({ id: x.id, x: x.dot!.x, y: x.dot!.y }));
    w.rig.setHand({ k: Math.pow(1.3, i), x: 0, y: 0 });   // a fast pinch out: 30 % a frame
    w.rig.update(1000 + 16 * i); w.frame();
    for (const b of before) { const n = w.ctl.out.find((x) => x.id === b.id && x.dot); if (n) worstStep = Math.max(worstStep, Math.hypot(n.dot!.x - b.x, n.dot!.y - b.y)); }
    if (!w.dotsOnAnchors()) frozen++;
  }
  return { worstStep, frozen, faded };
}

test('a quick pinch is not a cut: the names stay shown at full strength and every dot is on its anchor in every frame', () => {
  const r = pinch(true);
  assert.ok(r.worstStep > FOLLOW_JUMP, `the pinch moves a dot ${r.worstStep.toFixed(0)} px in a frame, past the cut's ${FOLLOW_JUMP}: this is the case that broke`);
  assert.equal(r.frozen, 0, 'no frame draws a dot off its anchor (frozen at the picture before the pinch)');
});

test('the control: without the hand\'s view the same pinch IS a cut (names frozen off their anchors, then faded)', () => {
  const r = pinch(false);
  assert.ok(r.frozen > 0, 'the test sees the break');
});

test('a true cut (the picture jumps and no hand moved it) fades the names out at the picture before it; the camera going on moving never leaves a name standing off its dot, and they come back riding it once it stops', () => {
  const w = world(true); w.run(1500);
  w.set({ dx: 90 }); w.frame();
  assert.ok(w.ctl.out.every((x) => x.alpha > 0), 'a cut never hides a label in one frame');
  w.set({ moving: true });
  let off = 0;
  for (let i = 0; i < 90; i++) { w.set({ dx: 90 + i }); w.frame(); if (i * 16 > FADE.settleMs + 32 && !w.dotsOnAnchors()) off++; }   // (until the fade is over the names stand where they were, tied to their fade)
  assert.equal(off, 0, 'no frame draws a visible name off its dot');
  w.set({ moving: false }); w.run(1500);
  assert.ok(w.names().length >= 3 && w.dotsOnAnchors(), 'back, on their dots');
});

test('HandWatch: a frame is the hand\'s when the hand\'s view changed and no shot moves; the first frame, a still hand and a shot\'s glide are not', () => {
  const h = new HandWatch();
  assert.equal(h.step({ k: 1, x: 0, y: 0 }, false), false, 'the first frame has nothing to compare');
  assert.equal(h.step({ k: 1, x: 0, y: 0 }, false), false, 'a still hand');
  assert.equal(h.step({ k: 1.3, x: 0, y: 0 }, false), true, 'a pinch');
  assert.equal(h.step({ k: 1.3, x: 12, y: -4 }, false), true, 'a pan');
  assert.equal(h.step({ k: 2, x: 12, y: -4 }, true), false, 'a shot glides (the hand\'s tween back to the fit): the old rule');
  assert.equal(h.step(undefined, false), false);
  assert.equal(isCut(80, FOLLOW_JUMP, false), true);
  assert.equal(isCut(80, FOLLOW_JUMP, true), false);
  assert.equal(isCut(10, FOLLOW_JUMP, false), false);
});

test('the Lobule\'s and the Circuit\'s captions (Ride) do not take a hand\'s jump for a cut either, and a true cut still hides them', () => {
  const r = new Ride(); let t = 1000, ax = 200, moving = false;
  const go = (byHand: boolean) => { t += 16; return r.step({ now: t, dt: 16, on: true, moving, byHand, a: { x: ax, y: 400 }, b: { x: ax + 100, y: 400 }, layout: () => 'a', fits: () => true }); };
  for (let i = 0; i < 80; i++) go(false);
  assert.equal(r.alpha, 1);
  moving = true;
  for (let i = 0; i < 6; i++) { ax += 90; assert.equal(go(true).alpha, 1, `pinch frame ${i}: a jump of 90 px by hand keeps the captions`); }
  ax += 90; go(false);
  for (let i = 0; i < 30; i++) go(false);
  assert.ok(r.alpha < 1, 'the same jump with no hand is a cut: the captions leave');
});

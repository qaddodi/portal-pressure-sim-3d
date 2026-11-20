import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CameraRig, blendPose } from '../src/scene/camera/rig.ts';
import { SHOTS, type Shot } from '../src/scene/camera/shots.ts';
import { fullRoom, effectiveDistance } from '../src/scene/camera/room.ts';
import { SLIDE_MAX_MS, SLIDE_MIN_MS, STEP_MAX, slideMsOf, slideSpanOf, stepOf, wholeViewOf, zoomShare } from '../src/scene/camera/slide-time.ts';
import { zoomLimits, homePan } from '../src/scene/gesture/view.ts';

// Audit 20 Nov PM, section 2: a slide's camera moves as 2D's planSlide does (800 to 1400 ms, an even log glide, a step clock capped at 50 ms), and the zoom limits are the whole figure's.

test('a slide move takes 2D\'s slideMs, clamped to 800 to 1400 ms (a third of a screen in 480 ms read as a swoop)', () => {
  assert.equal(slideMsOf(0), 480); assert.equal(slideMsOf(0.5), 480); assert.equal(slideMsOf(0.9375), 900);
  assert.ok(slideMsOf(5) > 900 && slideMsOf(5) < 1300, 'beyond the knee it slows on toward 1300 instead of stopping');
  for (const d of [0, 0.1, 0.3, 0.5, 1, 3, 20]) { const m = slideSpanOf(d); assert.ok(m >= SLIDE_MIN_MS && m <= SLIDE_MAX_MS, `${d}: ${m}`); }
  assert.equal(slideSpanOf(0), 800);
});

test('the rig\'s slide move is longer than its hand glide, and a dive keeps its own length', () => {
  const room = fullRoom(800, 600);
  const rig = new CameraRig('play', room); rig.resize(800, 600); rig.goTo('play', room, 0);
  const near: Shot = { ...SHOTS.play, target: [SHOTS.play.target[0] + 0.3, SHOTS.play.target[1], SHOTS.play.target[2]] };
  assert.ok(rig.reachMs(near) < SLIDE_MIN_MS && rig.slideMs(near) >= SLIDE_MIN_MS, `${rig.reachMs(near)} -> ${rig.slideMs(near)}`);
  const dive: Shot = { ...SHOTS.play, r: SHOTS.play.r / 200, half: [SHOTS.play.half[0] / 200, SHOTS.play.half[1] / 200] };
  assert.equal(rig.slideMs(dive), rig.reachMs(dive));
});

test('every deck slide move is asked at a slide\'s time (the view change keeps the circuit\'s own clock)', () => {
  const api = readFileSync('src/scene/api.ts', 'utf8');
  assert.match(api, /cel\.circuit\.changeMs\(\) \|\| cel\.rig\.slideMs\(shot\)/);
  assert.match(api, /showShot\(v: FigureView, shot: ShotName \| Shot, room: Room, slide = true\)/);
  assert.match(readFileSync('src/ui/deck/scene-link.ts', 'utf8'), /want === v\.shot/);
  assert.match(readFileSync('src/decks/hp/link.ts', 'utf8'), /sceneApi\.goToSlide\(v\.shot, boxes\.free\)/);
});

test('the even glide: the zoom is even on a log scale, so it neither rushes at one end nor crawls at the other', () => {
  const room = fullRoom(800, 600), h = 600;
  const a: Shot = { yaw: 0, pitch: 0, r: 1, target: [0, 0, 0], half: [4, 3] }, b: Shot = { ...a, half: [0.5, 0.375], target: [1.5, -0.7, 0] };
  const da = effectiveDistance(a, room, h), db = effectiveDistance(b, room, h);
  assert.ok(da > db * 4);
  const z = { da, db, px: h / (2 * Math.tan((14 * Math.PI) / 360)) };
  let prev = Math.log(a.half[0]);
  const steps: number[] = [];
  for (let k = 0.05; k <= 1.0001; k += 0.05) {
    const m = blendPose({ shot: a, room }, { shot: b, room }, Math.min(1, k), 0, z), l = Math.log(m.shot.half[0]);
    steps.push(prev - l); prev = l;
  }
  assert.ok(steps.every((s) => Math.abs(s - steps[0]!) < 1e-9), 'equal log steps for equal time steps');
});

test('every point of the figure travels a straight line on the screen through a zoom-and-pan move (the zoom\'s share moves the aim and the room)', () => {
  const h = 600, w = 800, px = h / (2 * Math.tan((14 * Math.PI) / 360));
  const ra = { x: 0, y: 0, w: 800, h: 600 }, rb = { x: 300, y: 40, w: 460, h: 500 };
  const a: Shot = { yaw: 0, pitch: 0, r: 0.1, target: [0, 0, 0], half: [4, 3] }, b: Shot = { yaw: 0, pitch: 0, r: 0.1, target: [2.2, -1.1, 0], half: [0.6, 0.45] };
  const da = effectiveDistance(a, ra, h, w), db = effectiveDistance(b, rb, h, w);
  const at = (k: number, p: [number, number]) => {
    const m = blendPose({ shot: a, room: ra }, { shot: b, room: rb }, k, 0, { da, db, px });
    const d = da * Math.pow(db / da, k), s = px / d, cx = m.room.x + m.room.w / 2, cy = m.room.y + m.room.h / 2;
    return [cx + (p[0] - m.shot.target[0]) * s, cy - (p[1] - m.shot.target[1]) * s] as const;
  };
  for (const p of [[0, 0], [-3, 2], [2.2, -1.1], [1, 1]] as [number, number][]) {
    const s0 = at(0, p), s1 = at(1, p), sm = at(0.37, p), q = zoomShare(da, db, 0.37);
    // the point at 0.37 of the clock is on the straight line between its start and end places, at the zoom's share of the way along it
    assert.ok(Math.hypot(sm[0] - (s0[0] + (s1[0] - s0[0]) * q), sm[1] - (s0[1] + (s1[1] - s0[1]) * q)) < 1e-6, `${p}`);
  }
});

test('zoomShare: the share of the zoom done; 0 and 1 at the ends, the clock itself with no zoom', () => {
  assert.equal(zoomShare(5, 1, 0), 0); assert.ok(Math.abs(zoomShare(5, 1, 1) - 1) < 1e-12);
  assert.ok(Math.abs(zoomShare(3, 3, 0.4) - 0.4) < 1e-12);
  assert.ok(zoomShare(5, 1, 0.5) < 0.5, 'zooming in: the even glide has done less than half of the zoom share at half the time');
});

test('the move\'s clock: a frame moves it on by what it took, never by more than 50 ms (a stalled frame pauses the move, it does not jump)', () => {
  assert.equal(STEP_MAX, 50); assert.equal(stepOf(16), 16); assert.equal(stepOf(400), 50); assert.equal(stepOf(-5), 0);
  const room = fullRoom(800, 600);
  const rig = new CameraRig('play', room); rig.resize(800, 600); rig.goTo('play', room, 0);
  rig.goTo('free', room, 1000, 1000);
  rig.update(1000);
  assert.equal(rig.update(1016), true);
  const before = rig.pose.shot.target[0];
  rig.update(6000);   // five seconds stall
  const moved = Math.abs(rig.pose.shot.target[0] - before), total = Math.abs(SHOTS.free.target[0] - SHOTS.play.target[0]);
  assert.ok(rig.isMoving, 'the move is still on after the stall');
  assert.ok(moved < total * 0.15, `the stall moved it ${(moved / total * 100).toFixed(1)}% of the way (one capped step), not to the end`);
  let t = 6000; for (let i = 0; i < 100 && rig.isMoving; i++) { t += 16; rig.update(t); }
  assert.ok(!rig.isMoving && Math.abs(rig.pose.shot.target[0] - SHOTS.free.target[0]) < 1e-9);
});

test('a time-lapse\'s push (a curve of its own) keeps the wall clock so it ends with the days', () => {
  const src = readFileSync('src/scene/camera/rig.ts', 'utf8');
  assert.match(src, /this\.step = this\.easeFn \? dt : stepOf\(dt\)/);
});

test('the whole figure seen from a close shot: its zoom is the ratio of the distances, and the limits are 2D\'s (least at the whole, most 6 x the whole)', () => {
  const room = fullRoom(800, 600);
  const whole = SHOTS.play, close = SHOTS.pick;
  const v = wholeViewOf({ ...close, r: 1, half: [0.3, 0.3] }, whole, room, 600, 800);
  assert.ok(v && v.k < 0.5, `${v?.k}`);
  assert.equal(wholeViewOf(whole, whole, room, 600, 800), null, 'the whole figure\'s own shot has no whole to return to');
  const l = zoomLimits(v, 1);
  assert.equal(l.kMin, v!.k); assert.ok(Math.abs(l.kMax - 6 * v!.k) < 1e-12);
  assert.deepEqual(zoomLimits(null, 1), { kMin: 1, kMax: 6 });
});

test('a view zoomed out below its shot rests with the whole figure centred: the pan eases from nothing at the shot\'s fit to the whole\'s pan at the whole fit', () => {
  const home = { k: 0.4, x: 100, y: -50 };
  assert.deepEqual(homePan(1, home), { x: 0, y: 0 });
  assert.deepEqual(homePan(0.4, home), { x: 100, y: -50 });
  const m = homePan(0.7, home); assert.ok(m.x > 0 && m.x < 100 && m.y < 0 && m.y > -50);
  assert.deepEqual(homePan(0.5, null), { x: 0, y: 0 });
});

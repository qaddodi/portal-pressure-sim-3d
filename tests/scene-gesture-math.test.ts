import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameQueue } from '../src/scene/gesture/frame-queue.ts';
import { FLICK, runFlick } from '../src/scene/gesture/flick.ts';
import { createWheelGlide, isPadWheel } from '../src/scene/gesture/wheel-glide.ts';
import { CAM_MS_MAX, CAM_MS_MIN, camMs, carried, easeMove, lerpView } from '../src/scene/gesture/ease.ts';
import {
  FIT_K, K_MAX, K_MIN, anchorAt, bandPan, hardPan, limitK, panFor, rectUnder, restingView, softK, unsoftPan, zoomAbout,
} from '../src/scene/gesture/view.ts';

const c = { x: 400, y: 300 };
const r0 = { x0: 100, y0: 50, x1: 700, y1: 550 };
const stage = { w: 800, h: 600 };
const screenOf = (p0: { x: number; y: number }, v: { k: number; x: number; y: number }) => ({ x: c.x + v.x + v.k * (p0.x - c.x), y: c.y + v.y + v.k * (p0.y - c.y) });

test('zoom about the pointer keeps the figure under the pointer', () => {
  const v = { k: 1.7, x: 33, y: -21 };
  const at = { x: 610, y: 140 };
  const q = anchorAt(at, v, c);                  // the figure point under the pointer, in the shot's framing
  const z = zoomAbout(v, 1.9, at, c);
  const p = screenOf(q, z);
  assert.ok(Math.abs(p.x - at.x) < 1e-9 && Math.abs(p.y - at.y) < 1e-9);
  assert.ok(Math.abs(z.k - 1.7 * 1.9) < 1e-12);
});

test('a pinch keeps the point under the fingers\' midpoint under it, as it zooms and moves', () => {
  const v0 = { k: 1.2, x: 10, y: 5 };
  const m0 = { x: 300, y: 350 };
  const anchor = anchorAt(m0, v0, c);
  for (const [k, m] of [[2.4, { x: 300, y: 350 }], [3, { x: 420, y: 280 }], [0.8, { x: 100, y: 500 }]] as const) {
    const pan = panFor(m, anchor, k, c);
    const p = screenOf(anchor, { k, x: pan.x, y: pan.y });
    assert.ok(Math.abs(p.x - m.x) < 1e-9 && Math.abs(p.y - m.y) < 1e-9, `k ${k}`);
  }
});

test('zoom limits as in the 2D app: 0.6 to 6, stretching a little past them while a pinch holds, then back', () => {
  assert.equal(K_MIN, 0.6); assert.equal(K_MAX, 6);
  assert.equal(softK(3), 3);
  assert.ok(softK(12) > K_MAX && softK(12) < 12);
  assert.ok(softK(0.2) < K_MIN && softK(0.2) > 0.2);
  assert.equal(limitK(12), K_MAX);
  assert.equal(limitK(0.1), K_MIN);
});

test('at the fit zoom the resting place is the shot\'s own framing; zoomed in, the middle of the room may not leave the figure', () => {
  assert.deepEqual({ ...hardPan({ k: 1, x: 90, y: -40 }, r0, c) }, { k: 1, x: 0, y: 0 });
  assert.ok(FIT_K > 1);
  // zoomed ×3 and panned far right: the figure's left edge would sit right of the room's middle
  const far = hardPan({ k: 3, x: 2000, y: 0 }, r0, c);
  const r = rectUnder(r0, far, c);
  assert.ok(Math.abs(r.x0 - c.x) < 1e-6, 'its edge is brought to the middle');
  // a pan that keeps the middle inside the figure is left alone
  assert.deepEqual({ ...hardPan({ k: 3, x: 100, y: 50 }, r0, c) }, { k: 3, x: 100, y: 50 });
});

test('the rubber band: no resistance inside, rising resistance past the edge, never more than 40 % of the stage', () => {
  const inside = bandPan({ k: 3, x: 100, y: 50 }, r0, c, stage, false);
  assert.ok(Math.abs(inside.x - 100) < 1e-9 && Math.abs(inside.y - 50) < 1e-9);
  const hard = hardPan({ k: 3, x: 3000, y: 0 }, r0, c);
  const banded = bandPan({ k: 3, x: 3000, y: 0 }, r0, c, stage, false);
  assert.ok(banded.x > hard.x && banded.x - hard.x <= 0.4 * stage.w + 1e-9);
  const small = bandPan({ k: 3, x: hard.x + 20, y: 0 }, r0, c, stage, false);
  assert.ok(small.x - hard.x > 15 && small.x - hard.x < 20, 'a little past the edge it is nearly free');
  // unsoft undoes soft
  const raw = { k: 3, x: hard.x + 150, y: 10 };
  const back = unsoftPan(bandPan(raw, r0, c, stage, false), r0, c, stage);
  assert.ok(Math.abs(back.x - raw.x) < 1e-6);
});

test('the spring-back puts a view inside the limits and never leaves the figure lost', () => {
  assert.deepEqual({ ...restingView({ k: 0.8, x: 40, y: 20 }, r0, c) }, { k: 0.8, x: 0, y: 0 }.k === 0.8 ? { k: 0.8, x: 0, y: 0 } : {});
  assert.equal(restingView({ k: 9, x: 0, y: 0 }, r0, c).k, K_MAX);
  assert.equal(restingView({ k: 0.3, x: 0, y: 0 }, r0, c).k, K_MIN);
  const lost = restingView({ k: 4, x: 5000, y: -5000 }, r0, c);
  const r = rectUnder(r0, lost, c);
  assert.ok(c.x >= r.x0 - 1e-6 && c.x <= r.x1 + 1e-6 && c.y >= r.y0 - 1e-6 && c.y <= r.y1 + 1e-6);
});

test('the glide takes 480 ms for a short move and at most 900 ms, on the 2D app\'s curve', () => {
  const a = { k: 1, x: 0, y: 0 };
  assert.equal(camMs(a, { k: 1.05, x: 5, y: 0 }, 800), CAM_MS_MIN);
  assert.equal(camMs(a, { k: 6, x: 900, y: 0 }, 800), CAM_MS_MAX);
  assert.equal(easeMove(0), 0); assert.equal(easeMove(1), 1); assert.equal(easeMove(0.5), 0.5);
  assert.equal(carried(0.3, 0.5, 0), 0.3);
  assert.ok(carried(0.3, 0.5, 0.4) > 0.3);
  const mid = lerpView({ k: 1, x: 0, y: 0 }, { k: 4, x: 100, y: 0 }, 0.5);
  assert.ok(Math.abs(mid.k - 2) < 1e-9, 'zoom is even in the log');
});

test('mouse notches and trackpad scrolls are told apart as the 2D app does', () => {
  assert.equal(isPadWheel({ deltaMode: 0, deltaX: 0, deltaY: 4, wheelDeltaY: -12 }), true, 'a pad reports 3× in the legacy delta');
  assert.equal(isPadWheel({ deltaMode: 0, deltaX: 0, deltaY: 100, wheelDeltaY: -120 }), false, 'a notch');
  assert.equal(isPadWheel({ deltaMode: 0, deltaX: 3, deltaY: 100, wheelDeltaY: -120 }), true, 'a sideways delta is a pad');
  assert.equal(isPadWheel({ deltaMode: 1, deltaX: 0, deltaY: 3 }), false, 'Firefox notches are in lines');
});

function clockOf() {
  let t = 0; const q = createFrameQueue(() => {});
  return { now: () => t, ask: q.ask, cancel: q.cancel, run(ms: number) { for (const end = t + ms; t < end;) { t += 16; q.run(t); } }, q };
}

test('a wheel notch glides about 100 ms and a run of notches is one continuous zoom that adds up', () => {
  const ck = clockOf();
  let total = 0, calls = 0;
  const g = createWheelGlide({ ask: ck.ask, cancel: ck.cancel, apply: (d) => { total += d; calls++; } });
  g.push(0.16, 100, 100, ck.now());
  assert.ok(g.active);
  ck.run(48);
  g.push(0.16, 100, 100, ck.now());
  ck.run(400);
  assert.ok(Math.abs(total - 0.32) < 1e-9, `total ${total}`);
  assert.ok(calls > 3, 'it moved over several frames, not in one jump');
  assert.equal(g.active, false);
  assert.equal(g.left(), 0);
});

test('a hand taking over stops the wheel glide where it is', () => {
  const ck = clockOf();
  let total = 0;
  const g = createWheelGlide({ ask: ck.ask, cancel: ck.cancel, apply: (d) => { total += d; } });
  g.push(0.3, 0, 0, ck.now());
  ck.run(32);
  g.cancel();
  const at = total;
  ck.run(200);
  assert.equal(total, at);
  assert.equal(ck.q.pending, 0);
});

test('a flick glides on, slows, stops, and calls done once; past the edge it is braked and returns', () => {
  const ck = clockOf();
  let x = 0, doneCalls = 0;
  runFlick({ x: 0, y: 0, vx: 1.2, vy: 0, hard: (px, py) => [Math.min(px, 150), py], apply: (px) => { x = px; }, done: () => { doneCalls++; }, ask: ck.ask, cancel: ck.cancel, now: ck.now });
  ck.run(4000);
  assert.equal(doneCalls, 1);
  assert.ok(Math.abs(x - 150) < 1, `came to rest at the edge: ${x}`);
  assert.equal(ck.q.pending, 0);
  assert.ok(FLICK.minSpeed === 0.25);
});

test('the frame queue asks the clock for one frame per ask, runs asks in order, and leaves a still app asking for nothing', () => {
  let frames = 0;
  const q = createFrameQueue(() => { frames++; });
  const seen: number[] = [];
  const a = q.ask(() => seen.push(1));
  q.ask(() => { seen.push(2); q.ask(() => seen.push(3)); });
  q.cancel(a);
  assert.equal(frames, 2);
  q.run(16);
  assert.deepEqual(seen, [2]);
  assert.equal(q.pending, 1, 'an ask made while a frame runs waits for the next frame');
  q.run(32);
  assert.deepEqual(seen, [2, 3]);
  assert.equal(q.pending, 0);
});

test('a view may keep its own least zoom: the sinusoid rests no further out than its fit, and a pinch past it only stretches', async () => {
  const v = await import('../src/scene/gesture/view.ts');
  assert.equal(v.limitK(0.7, 1), 1);
  assert.ok(v.softK(0.5, 1) > 0.5 && v.softK(0.5, 1) < 1);
  const r = v.restingView({ k: 0.7, x: 40, y: -20 }, { x0: 0, y0: 0, x1: 400, y1: 400 }, { x: 200, y: 200 }, 1);
  assert.deepEqual(r, { k: 1, x: 0, y: 0 });
  assert.equal(v.limitK(0.7), 0.7);
});

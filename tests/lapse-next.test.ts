// Next during a time-lapse (2D V-SLIDE-10): the first Next runs the days that are left in 600 ms, the second moves on; the counter never jumps; the camera's slow push has 2D's curve and
// is planned only where 2D plans it (lapse.cam, not a visual or catheter slide, on the anatomy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysAt, driftEase, lapseNext, setLapseSkip, skipPace, skipSpeed, SKIP_MS } from '../src/ui/deck/lapse-next.ts';
import { pushShotOf } from '../src/decks/hp/lapse-cam.ts';
import { camPlan } from '../src/decks/hp/cams.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';

test('the first Next runs the days out and the second moves on', () => {
  assert.equal(lapseNext(), false, 'no lapse: Next is the move');
  let calls = 0, fast = false;
  setLapseSkip(() => { calls++; if (fast) return false; fast = true; return true; });
  assert.equal(lapseNext(), true, 'days running: the first Next is the lapse\'s');
  assert.equal(lapseNext(), false, 'days already being run out: the next Next moves on');
  assert.equal(calls, 2);
  setLapseSkip(null);
  assert.equal(lapseNext(), false, 'a lapse that has landed or been left registers nothing');
});

test('the counter carries on from the day it was at and reaches the end in 600 ms (never a jump)', () => {
  const days = 60, t0 = 1000;
  const slow = { t0, d0: 0, rate: days / 8000, days };
  const now = t0 + 3000, d = daysAt(slow, now);
  assert.ok(Math.abs(d - 22.5) < 1e-9);
  const p = skipPace(days, d, now);
  assert.equal(daysAt(p, now), d, 'the same day at the instant of the Next');
  assert.ok(daysAt(p, now + SKIP_MS / 2) > d && daysAt(p, now + SKIP_MS / 2) < days);
  assert.equal(daysAt(p, now + SKIP_MS), days);
  assert.equal(daysAt(p, now + 5000), days, 'never past the days');
  // monotonic, so the counter and its bar never step back
  let last = -1;
  for (let t = 0; t <= SKIP_MS; t += 10) { const v = daysAt(p, now + t); assert.ok(v >= last); last = v; }
});

test('the engine clock runs the days left in 600 ms, at least one day a second (2D lapseLeft / 0.6)', () => {
  assert.equal(skipSpeed(60), 100);
  assert.ok(Math.abs(skipSpeed(7.5) - 12.5) < 1e-9);
  assert.equal(skipSpeed(0.3), 1);
  assert.equal(skipSpeed(0), 1);
});

test('the push curve is 2D\'s driftEase: even in the middle, easing at both ends, from 0 to 1', () => {
  assert.equal(driftEase(0), 0);
  assert.equal(driftEase(1), 1);
  assert.equal(driftEase(-1), 0);
  assert.equal(driftEase(2), 1);
  assert.ok(Math.abs(driftEase(0.5) - 0.5) < 1e-12);
  // the middle three fifths run at the even speed 1 / (1 - ramp)
  const v = 1 / 0.8;
  assert.ok(Math.abs((driftEase(0.6) - driftEase(0.4)) / 0.2 - v) < 1e-9);
  // slower than the even run at the ends, never going back
  let last = -1;
  for (let u = 0; u <= 1; u += 0.01) { const e = driftEase(u); assert.ok(e >= last - 1e-12); last = e; }
  assert.ok(driftEase(0.05) < 0.05 * v);
});

const slide = (o: Partial<CopiedSlide>): CopiedSlide => ({ id: 'x', days: 60, lapse: { seconds: 8, cam: 'varices' }, cam: 'fit', ...o }) as unknown as CopiedSlide;

test('a push is planned from lapse.cam as 2D does', () => {
  const s = pushShotOf(slide({}));
  assert.ok(s, 'lapse.cam names a region the slide does not already frame');
  assert.deepEqual(s, (camPlan('varices') as { shot: unknown }).shot);
  assert.equal(pushShotOf(slide({ lapse: { seconds: 8 } as never })), null, 'no lapse.cam: no push');
  assert.equal(pushShotOf(slide({ visual: 'table' })), null, 'a visual drives no camera');
  assert.equal(pushShotOf(slide({ cath: 'free' as never })), null, 'a catheter slide drives its own camera');
  assert.equal(pushShotOf(slide({ view: 'circuit' })), null, 'the circuit is always shown whole');
  assert.equal(pushShotOf(slide({ cam: 'varices' })), null, 'the same framing: nothing to push to');
  assert.equal(pushShotOf(slide({ lapse: { seconds: 8, cam: 'lobule:central' } as never })), null, 'a push is on the anatomy');
  assert.equal(pushShotOf(slide({ lapse: { seconds: 8, cam: 'nowhere' } as never })), null, 'a name neither app has is no push, never a throw');
});

test('every lapse.cam in the copied decks is a push on the anatomy', async () => {
  const decks: CopiedDeck[] = [];
  for (const id of HP_IDS) decks.push((await loadHpDeck(id)) as unknown as CopiedDeck);
  for (const id of RW_IDS) decks.push((await RW_LOADERS[id]!()) as unknown as CopiedDeck);
  for (const id of AG_IDS) decks.push((await loadAgDeck(id)) as unknown as CopiedDeck);
  let n = 0;
  for (const d of decks) for (const s of d.slides) {
    const cam = (s.lapse as { cam?: unknown } | null | undefined)?.cam;
    if (cam == null) continue;
    n++;
    assert.ok(pushShotOf(s) || s.visual || s.cath, `${d.id}/${s.id}: lapse.cam ${JSON.stringify(cam)} is a push`);
  }
  assert.ok(n >= 1, 'the varices deck has one');
});

test('the camera\'s slow push is one straight glide on 2D\'s curve for the days\' whole length, and Next brings it to rest (never a zigzag)', async () => {
  const { CameraRig } = await import('../src/scene/camera/rig.ts');
  const { boxToShot, PLATE } = await import('../src/decks/hp/cams.ts');
  const { REGIONS } = await import('../src/decks/hp/regions.copied.ts');
  const room = { x: 0, y: 0, w: 1000, h: 700 };
  const rig = new CameraRig('play', room); rig.resize(1000, 700);
  const to = boxToShot(REGIONS.varices!);
  rig.goTo(boxToShot(PLATE), room, 0); rig.update(0);
  rig.goTo(boxToShot(REGIONS.liver!), room, 0, 1000); for (let t = 16; t <= 1100; t += 16) rig.update(t);   // landed on the slide's own framing
  const T0 = 2000, MS = 8000;
  rig.goTo(to, room, T0, MS, false, driftEase);
  let lastX = rig.pose.shot.target[0], lastY = rig.pose.shot.target[1], lastH = rig.pose.shot.half[0];
  const dir = [to.target[0] - lastX, to.target[1] - lastY];
  const mid: number[] = [];
  for (let t = T0 + 16; t <= T0 + MS + 32; t += 16) {
    rig.update(t);
    const s = rig.pose.shot;
    // one direction only: never backwards along the way, never sideways off the straight line
    assert.ok((s.target[0] - lastX) * dir[0]! + (s.target[1] - lastY) * dir[1]! >= -1e-9, `forward only (t ${t})`);
    assert.ok(s.half[0] <= lastH + 1e-9, `the framing only closes (t ${t})`);
    if (t > T0 + MS * 0.25 && t < T0 + MS * 0.75) mid.push(Math.hypot(s.target[0] - lastX, s.target[1] - lastY));
    lastX = s.target[0]; lastY = s.target[1]; lastH = s.half[0];
  }
  assert.ok(Math.abs(lastX - to.target[0]) < 1e-6 && Math.abs(lastY - to.target[1]) < 1e-6, 'it ends on lapse.cam');
  const even = mid.reduce((a, b) => a + b, 0) / mid.length;
  assert.ok(mid.every((m) => Math.abs(m - even) < even * 0.02), 'the middle runs at one even speed');
});

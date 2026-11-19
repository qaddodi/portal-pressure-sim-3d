import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, PHASES, type Env } from '../src/clock/frame.ts';
import { Tweened, cubicBezier, easeArrive, easeInOutCubic } from '../src/clock/tween.ts';

// A clock on a hand-turned frame callback, so "frames drawn" can be counted exactly.
function fake() {
  let t = 1000, id = 0;
  const q = new Map<number, (t: number) => void>();
  const env: Env = { raf: (cb) => { q.set(++id, cb); return id; }, cancel: (i) => { q.delete(i); }, now: () => t };
  const tick = (ms = 16) => { t += ms; const cbs = [...q.values()]; q.clear(); cbs.forEach((cb) => cb(t)); return cbs.length; };
  return { env, tick, pending: () => q.size, at: () => t };
}

test('nothing asks, nothing is drawn', () => {
  const f = fake(); createClock(f.env);
  assert.equal(f.pending(), 0);
  assert.equal(f.tick(), 0);
});

test('invalidate draws exactly one frame, then idles', () => {
  const f = fake(), c = createClock(f.env); let n = 0;
  c.on('render', () => { n++; });
  c.invalidate('a');
  assert.equal(f.tick(), 1); assert.equal(n, 1);
  assert.equal(f.tick(), 0); assert.equal(c.awake, false);
});

test('a hold keeps frames coming until released', () => {
  const f = fake(), c = createClock(f.env); let n = 0;
  c.on('render', () => { n++; });
  const h = c.hold('camera');
  for (let i = 0; i < 5; i++) f.tick();
  assert.equal(n, 5);
  h.release();
  f.tick();            // the frame already asked for runs, and asks for none after it
  assert.equal(f.pending(), 0);
  assert.equal(c.awake, false);
});

test('phases run in the fixed order, systems by order inside a phase', () => {
  const f = fake(), c = createClock(f.env); const seen: string[] = [];
  for (const p of [...PHASES].reverse()) c.on(p, () => { seen.push(p); }, 5);
  c.on('engine', () => { seen.push('engine-first'); }, -1);
  c.invalidate('x'); f.tick();
  assert.deepEqual(seen, ['engine-first', 'engine', 'tween', 'camera', 'render', 'tags']);
});

test('an invalidate made inside a frame asks for the next one', () => {
  const f = fake(), c = createClock(f.env); let n = 0;
  c.on('render', () => { if (n++ < 2) c.invalidate('again'); });
  c.invalidate('start');
  let drawn = 0; for (let i = 0; i < 10; i++) drawn += f.tick();
  assert.equal(n, 3); assert.equal(drawn, 3);
});

test('a system that throws does not stop the frame or the others', () => {
  const f = fake(), c = createClock(f.env); let ok = false;
  const log = console.error; console.error = () => undefined;
  c.on('tween', () => { throw new Error('boom'); });
  c.on('render', () => { ok = true; });
  c.invalidate('x'); f.tick(); console.error = log;
  assert.equal(ok, true);
});

test('slow frames are listed with who asked for them', () => {
  const f = fake(), c = createClock(f.env);
  c.on('render', () => { f.env.now = () => 5000; });   // (the frame's work appears to take a long time)
  const h = c.hold('wallet-swap'); f.tick(); h.release();
  const s = c.stats();
  assert.equal(s.framesDrawn, 1);
  assert.ok(s.slow.length >= 1);
  assert.ok(s.slow[0]!.tags.includes('wallet-swap'));
});

test('a Tweened value glides, lands exactly, and lets the clock sleep', () => {
  const f = fake(), c = createClock(f.env);
  const realNow = performance.now; let now = 0; performance.now = () => now;
  try {
    const v = new Tweened(0, 'v', c); let done = false;
    v.to(10, { ms: 100, ease: (t) => t, done: () => { done = true; } });
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) { now += 16; f.env.now = () => now; f.tick(0); seen.push(v.value); }
    assert.equal(v.value, 10); assert.ok(done);
    assert.ok(seen.some((x) => x > 0 && x < 10), 'it passed through the middle');
    assert.ok(seen.every((x, i) => i === 0 || x >= seen[i - 1]!), 'monotone');
    assert.equal(v.moving, false); assert.equal(f.pending(), 0, 'the clock is asleep again');
  } finally { performance.now = realNow; }
});

test('retargeting a moving value starts from where it is', () => {
  const f = fake(), c = createClock(f.env);
  const realNow = performance.now; let now = 0; performance.now = () => now;
  try {
    const v = new Tweened(0, 'v', c);
    f.env.now = () => now;
    v.to(100, { ms: 100, ease: (t) => t });
    now += 50; f.tick(0);
    const mid = v.value; assert.ok(mid > 0 && mid < 100);
    v.to(0, { ms: 100, ease: (t) => t });
    now += 16; f.tick(0);
    assert.ok(Math.abs(v.value - mid) < 30, 'no jump');
  } finally { performance.now = realNow; }
});

test('easing curves start at 0, end at 1, and are monotone', () => {
  for (const e of [easeArrive, easeInOutCubic, cubicBezier(0.5, 0, 0.5, 1)]) {
    assert.equal(e(0), 0); assert.equal(e(1), 1);
    let prev = 0; for (let i = 1; i <= 100; i++) { const y = e(i / 100); assert.ok(y >= prev - 1e-9); prev = y; }
  }
});

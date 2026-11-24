import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, PHASES, scaledDelay, type Env } from '../src/clock/frame.ts';
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
  let now = 0; f.env.now = () => now;   // (the clock is the one reader of time: the test turns it)
  {
    const v = new Tweened(0, 'v', c); let done = false;
    v.to(10, { ms: 100, ease: (t) => t, done: () => { done = true; } });
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) { now += 16; f.tick(0); seen.push(v.value); }
    assert.equal(v.value, 10); assert.ok(done);
    assert.ok(seen.some((x) => x > 0 && x < 10), 'it passed through the middle');
    assert.ok(seen.every((x, i) => i === 0 || x >= seen[i - 1]!), 'monotone');
    assert.equal(v.moving, false); assert.equal(f.pending(), 0, 'the clock is asleep again');
  }
});

test('retargeting a moving value starts from where it is', () => {
  const f = fake(), c = createClock(f.env);
  let now = 0; f.env.now = () => now;
  {
    const v = new Tweened(0, 'v', c);
    v.to(100, { ms: 100, ease: (t) => t });
    now += 50; f.tick(0);
    const mid = v.value; assert.ok(mid > 0 && mid < 100);
    v.to(0, { ms: 100, ease: (t) => t });
    now += 16; f.tick(0);
    assert.ok(Math.abs(v.value - mid) < 30, 'no jump');
  }
});

test('easing curves start at 0, end at 1, and are monotone', () => {
  for (const e of [easeArrive, easeInOutCubic, cubicBezier(0.5, 0, 0.5, 1)]) {
    assert.equal(e(0), 0); assert.equal(e(1), 1);
    let prev = 0; for (let i = 1; i <= 100; i++) { const y = e(i / 100); assert.ok(y >= prev - 1e-9); prev = y; }
  }
});

// ── R3: one source of time ────────────────────────────────────────────────────────────────────────────────────────
// A fake Env with hand-turned timers too: time, waits and frames all move only when the test says so.
function fakeTime() {
  let t = 5000, id = 0, tid = 0;
  const q = new Map<number, (t: number) => void>();
  const waits = new Map<number, { at: number; cb: () => void }>();
  const env: Env = {
    raf: (cb) => { q.set(++id, cb); return id; }, cancel: (i) => { q.delete(i); }, now: () => t,
    timer: (cb, ms) => { const h = ++tid; waits.set(h, { at: t + ms, cb }); return h; }, untimer: (h) => { waits.delete(h as number); },
    every: (cb, ms) => { const h = ++tid; const loop = () => { waits.set(h, { at: t + ms, cb: () => { cb(); loop(); } }); }; loop(); return h; }, unevery: (h) => { waits.delete(h as number); },
  };
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      const due = [...waits.entries()].filter(([, w]) => w.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      waits.delete(due[0]); t = Math.max(t, due[1].at); due[1].cb();
    }
    t = end;
    const cbs = [...q.values()]; q.clear(); cbs.forEach((cb) => cb(t));
  };
  return { env, advance, waiting: () => waits.size };
}

test('clock.now is the env time; setScale makes it run n times faster without a jump, and back', () => {
  const f = fakeTime(), c = createClock(f.env);
  assert.equal(c.now(), 5000); assert.equal(c.scale, 1);
  f.advance(100); assert.equal(c.now(), 5100);
  c.setScale(4);
  assert.equal(c.now(), 5100);                 // (no jump when the scale is set)
  f.advance(100); assert.equal(c.now(), 5500);
  c.setScale(1);
  assert.equal(c.now(), 5500);                 // (nor when it is put back)
  f.advance(100); assert.equal(c.now(), 5600);
});

test('clock.after waits page time (1/scale of the wall time), is cancellable, counted, and holds no frames', () => {
  const f = fakeTime(), c = createClock(f.env); const fired: string[] = [];
  c.setScale(10);
  c.after(() => fired.push('a'), 950, 'a');
  const b = c.after(() => fired.push('b'), 950, 'b');
  assert.deepEqual(c.stats().timers, ['a', 'b']);
  assert.equal(c.awake, false);                // (a wait draws nothing)
  c.cancel(b); c.cancel(b); c.cancel(undefined);
  f.advance(94); assert.deepEqual(fired, []);
  f.advance(2); assert.deepEqual(fired, ['a']);   // (950 ms of page time = 95 ms of wall time at 10x)
  assert.deepEqual(c.stats().timers, []);
  assert.equal(f.waiting(), 0);
});

test('a short wait never becomes a hot loop, and zero stays zero (scaledDelay)', () => {
  assert.equal(scaledDelay(950, 10), 95); assert.equal(scaledDelay(50, 20), 16); assert.equal(scaledDelay(8, 20), 8); assert.equal(scaledDelay(0, 20), 0);
});

test('frameFor holds frames for its length in page time, then lets go and the clock sleeps with no wait left', () => {
  const f = fakeTime(), c = createClock(f.env); let n = 0;
  c.on('render', () => { n++; });
  c.frameFor('move', 200);
  for (let i = 0; i < 20; i++) f.advance(16);
  assert.ok(n >= 11 && n <= 14, `frames while held: ${n}`);
  const frames = n;
  for (let i = 0; i < 5; i++) f.advance(16);
  assert.ok(n - frames <= 1);
  assert.equal(c.awake, false); assert.equal(c.stats().timers.length, 0); assert.equal(f.waiting(), 0);
});

test('every runs in real time, not scaled, until cancelled', () => {
  const f = fakeTime(), c = createClock(f.env); let n = 0;
  c.setScale(10);
  const id = c.every(() => { n++; }, 100);
  f.advance(350); assert.equal(n, 3);
  c.cancel(id); f.advance(500); assert.equal(n, 3);
});

test('Tweened follows the clock scale: a 280 ms ease lands in 28 ms of wall time at 10x', () => {
  const f = fakeTime(), c = createClock(f.env);
  c.setScale(10);
  const t = new Tweened(0, 'x', c); t.to(1, { ms: 280 });
  f.advance(16); assert.ok(t.value > 0 && t.value < 1 && t.moving);
  f.advance(16); f.advance(16);
  assert.equal(t.value, 1); assert.equal(t.moving, false);
});

test('skip mode: a frame of a long stretch runs the motion systems in steps no longer than SKIP_CHUNK, so a dt-clamped glide finishes in one drawn frame', () => {
  const f = fake(), c = createClock(f.env); c.setScale(300); c.setSkip(true);
  let shown = 0, renders = 0;
  c.on('camera', (i) => { shown += Math.min(i.dt, 50) / 1000; });   // (a glide that takes 1 s of dt, clamped at 50 ms a step)
  c.on('render', () => { renders++; });
  c.hold('camera'); f.tick(16);   // the first frame has no dt
  f.tick(16);   // 16 ms of wall time = 4.8 s of page time
  assert.equal(renders, 2); assert.ok(shown >= 1, `the glide's second landed in one frame (${shown})`);
  const g = fake(), d = createClock(g.env); d.setScale(300); let s2 = 0;
  d.on('camera', (i) => { s2 += Math.min(i.dt, 50) / 1000; }); d.hold('camera'); g.tick(16); g.tick(16);
  assert.ok(s2 < 0.2, 'without skip the clamp eats the frame');
});

test('setDrawing(false) holds back only the gated render systems (the figure), never a chart painter\'s glide; true draws again', () => {
  const f = fake(), c = createClock(f.env); let fig = 0, painter = 0;
  c.on('render', () => { fig++; }, 0, { gated: true }); c.on('render', () => { painter++; }, 5);
  c.hold('x'); c.setDrawing(false); f.tick(); f.tick();
  assert.equal(fig, 0); assert.equal(painter, 2, 'a chart glide (chart:path, flowtime, evgraph, shift) finishes while the figure waits');
  c.setDrawing(true); f.tick(); assert.equal(fig, 1);
});

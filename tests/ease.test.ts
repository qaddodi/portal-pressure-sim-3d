import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, type Env } from '../src/clock/frame.ts';
import { Ease, fadeRate, takePops, movingEases } from '../src/clock/ease.ts';

// R7: one easing primitive. A clock on a hand-turned Env: frames and time move only when the test says so.
function fake() {
  let t = 1000, id = 0;
  const q = new Map<number, (t: number) => void>();
  const env: Env = { raf: (cb) => { q.set(++id, cb); return id; }, cancel: (i) => { q.delete(i); }, now: () => t };
  const tick = (ms = 16) => { t += ms; const cbs = [...q.values()]; q.clear(); cbs.forEach((cb) => cb(t)); };
  return { env, tick, pending: () => q.size };
}
const run = (f: ReturnType<typeof fake>, n: number, ms = 16) => { for (let i = 0; i < n; i++) f.tick(ms); };

test('a rate ease keeps the clock awake itself until it lands, then lets it sleep: no system reports it', () => {
  const f = fake(), c = createClock(f.env); const seen: number[] = [];
  const e = new Ease(0, 'occ', (v) => seen.push(v), c);
  e.to(1, fadeRate(180));
  assert.equal(e.moving, true); assert.deepEqual(c.stats().holds, ['occ']);
  run(f, 20);
  assert.equal(e.value, 1); assert.equal(e.moving, false);
  assert.ok(seen.length >= 10 && seen.every((v, i) => i === 0 || v >= seen[i - 1]!), 'monotone, in steps');
  run(f, 2); assert.equal(f.pending(), 0); assert.equal(c.awake, false); assert.deepEqual(c.stats().holds, []);
});

test('a rate ease is frame-rate independent: 180 ms end to end at 60, 30 and 10 frames a second', () => {
  for (const ms of [16, 33, 100]) {
    const f = fake(), c = createClock(f.env), e = new Ease(0, 'x', undefined, c);
    e.to(1, fadeRate(180)); let t = 0;
    while (e.moving && t < 2000) { f.tick(ms); t += ms; }
    assert.ok(t >= 180 && t <= 180 + 2 * ms, `landed after ${t} ms at ${ms} ms frames`);
  }
});

test('a rate ease never takes a stall as one leap (a step is at most 100 ms)', () => {
  const f = fake(), c = createClock(f.env), e = new Ease(0, 'x', undefined, c);
  e.to(1, { perMs: 1 / 1000 }); f.tick(16); f.tick(5000);
  assert.ok(e.value < 0.2, `value after a 5 s stall: ${e.value}`);
});

test('a timed ease follows its curve and retargets from where it stands', () => {
  const f = fake(), c = createClock(f.env), e = new Ease(0, 't', undefined, c);
  e.to(100, { ms: 100, curve: (k) => k });
  f.tick(16); f.tick(16); f.tick(16);
  const mid = e.value; assert.ok(mid > 40 && mid < 60, `mid ${mid}`);
  e.to(0, { ms: 100, curve: (k) => k });
  f.tick(16); assert.ok(Math.abs(e.value - mid) < 30, 'no jump on retarget');
  run(f, 10); assert.equal(e.value, 0); assert.equal(e.moving, false);
});

test('a follow ease approaches exponentially and lands exactly within its band', () => {
  const f = fake(), c = createClock(f.env), e = new Ease(0, 'f', undefined, c);
  e.to(1, { tauMs: 50, within: 0.002 });
  f.tick(50); assert.ok(e.value > 0.55 && e.value < 0.7, `one time constant: ${e.value}`);
  run(f, 60); assert.equal(e.value, 1); assert.equal(e.moving, false);
});

test('easing to where it is heading does nothing; snap is the only jump, and the pop detector sees it', () => {
  const f = fake(), c = createClock(f.env), e = new Ease(0, 'pop-me', undefined, c);
  e.to(1, fadeRate(180)); f.tick(16); const v = e.value;
  e.to(1, fadeRate(180)); assert.equal(e.value, v);
  takePops();                                           // (clear what the easing so far recorded)
  e.snap(1); assert.equal(e.value, 1); assert.equal(e.moving, false); assert.equal(e.target, 1);
  const pops = takePops(); assert.ok(pops.some((p) => p.tag === 'pop-me'), 'a jump of more than half the move is listed');
  e.to(0, fadeRate(180)); run(f, 20);
  assert.deepEqual(takePops().filter((p) => p.tag === 'pop-me'), [], 'a smooth ease is never listed');
});

test('movingEases lists the tags of the eases not at their goal', () => {
  const f = fake(), c = createClock(f.env), a = new Ease(0, 'a-ease', undefined, c), b = new Ease(0, 'b-ease', undefined, c);
  a.to(1, fadeRate(180));
  assert.ok(movingEases().includes('a-ease')); assert.ok(!movingEases().includes('b-ease'));
  a.dispose(); b.dispose();
});

test('at clock scale 10 a 180 ms fade is 18 ms of wall time', () => {
  const f = fake(), c = createClock(f.env), e = new Ease(0, 's', undefined, c);
  c.setScale(10); e.to(1, fadeRate(180));
  f.tick(8); assert.ok(e.value > 0 && e.value < 1); f.tick(8); f.tick(8);
  assert.equal(e.value, 1);
});

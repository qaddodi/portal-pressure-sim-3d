import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, TimerId, type Env } from '../src/clock/frame.ts';

// The laser bug (c2ed15a3): a window timer cancelled with clock.cancel stayed armed and lit the laser 500 ms after any touch. A timer is cancelled by the source that made it, and the compiler checks the
// pairing: the clock's handle (TimerId) is opaque, not a number. These lines are type-checked by `npm run typecheck` (a pairing that compiles makes the @ts-expect-error itself an error).
function fake() {
  let t = 1000, tid = 0; const waits = new Map<number, { at: number; cb: () => void }>();
  const env: Env = { raf: () => 0, cancel: () => {}, now: () => t, timer: (cb, ms) => { const h = ++tid; waits.set(h, { at: t + ms, cb }); return h; }, untimer: (h) => { waits.delete(h as number); } };
  const advance = (ms: number) => { t += ms; for (const [h, w] of [...waits]) if (w.at <= t) { waits.delete(h); w.cb(); } };
  return { env, advance, pending: () => waits.size };
}

test('a number (a window timer id) is not a clock handle, and a clock handle is not a number: the compiler refuses both pairings', () => {
  const f = fake(), c = createClock(f.env);
  const mine = c.after(() => undefined, 100);
  assert.ok(mine instanceof TimerId);
  // @ts-expect-error a window timer's id cannot be cancelled by the clock
  c.cancel(setTimeout(() => undefined, 1) as unknown as number);
  // @ts-expect-error the clock's handle cannot be given to the browser's clearTimeout
  clearTimeout(mine);
  // @ts-expect-error a bare number is not a handle either
  c.cancel(5);
  assert.equal(f.pending(), 1, 'cancelling something that is not ours left our timer armed (at runtime nothing happened; the compiler is the guard)');
  c.cancel(mine); assert.equal(f.pending(), 0);
});

test('after, afterReal and every are all cancelled by clock.cancel with the handle they returned', () => {
  const f = fake(), c = createClock(f.env); let n = 0;
  const a = c.after(() => n++, 100), b = c.afterReal(() => n++, 100);
  c.cancel(a); c.cancel(b); f.advance(500);
  assert.equal(n, 0); assert.equal(f.pending(), 0);
  const e = c.every(() => n++, 10); assert.ok(e instanceof TimerId); c.cancel(e);
  c.cancel(null); c.cancel(undefined);
});

test('afterReal is not scaled; after is', () => {
  const f = fake(), c = createClock(f.env); const fired: string[] = [];
  c.setScale(10);
  c.after(() => fired.push('page'), 1000); c.afterReal(() => fired.push('real'), 1000);
  f.advance(100); assert.deepEqual(fired, ['page']);
  f.advance(900); assert.deepEqual(fired, ['page', 'real']);
});

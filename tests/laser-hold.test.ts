// The laser's press-and-hold (iPhone, build c2ed15a3: the spotlight came on by itself). Root cause: the hold timer was a window timer cancelled with clock.cancel(), which does not know a window
// timer's id, so a tap, a scroll or a cancel left it running and it fired 500 ms later with the finger up. These drive createLaser with a fake window whose timers we advance by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLaser, HOLD_MS, HOLD_SLOP } from '../src/ui/deck/laser.ts';

function rig() {
  const L = new Map<string, ((e: any) => void)[]>();
  let t = 0, nid = 1; const timers = new Map<number, { at: number; fn: () => void }>();
  const el = () => ({ style: { setProperty() {} } as Record<string, unknown>, className: '', setAttribute() {}, append() {}, remove() {} });
  const doc = { createElement: el, body: { append() {} }, documentElement: { style: {} as Record<string, string> } } as unknown as Document;
  const win = {
    innerWidth: 390, innerHeight: 844,
    addEventListener: (n: string, f: (e: any) => void) => { (L.get(n) ?? L.set(n, []).get(n)!).push(f); },
    removeEventListener: (n: string, f: (e: any) => void) => { L.set(n, (L.get(n) ?? []).filter((g) => g !== f)); },
    setTimeout: (fn: () => void, ms: number) => { const id = nid++; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
  } as unknown as Window;
  const fire = (n: string, e: Record<string, unknown>) => { for (const f of L.get(n) ?? []) f({ cancelable: true, preventDefault() {}, stopImmediatePropagation() {}, ...e }); };
  const advance = (ms: number) => { t += ms; for (const [id, x] of [...timers]) if (x.at <= t) { timers.delete(id); x.fn(); } };
  const fig = { closest: (s: string) => (s.includes('canvas') ? {} : null) };
  const laser = createLaser({}, doc, win);
  const touch = (type: string, id = 1, x = 100, y = 200, extra: Record<string, unknown> = {}) => fire(type, { pointerType: 'touch', pointerId: id, isPrimary: id === 1, clientX: x, clientY: y, target: fig, ...extra });
  return { win, laser, touch, fire, advance, pending: () => timers.size, cursor: () => doc.documentElement.style.cursor };
}

test('a held finger on the figure turns it on after HOLD_MS, and lifting it turns it off', () => {
  const r = rig();
  r.touch('pointerdown'); r.advance(HOLD_MS - 1); assert.equal(r.laser.on, false);
  r.advance(1); assert.equal(r.laser.on, true);
  r.touch('pointerup'); assert.equal(r.laser.on, false); assert.equal(r.pending(), 0);
});

test('a tap never turns it on: the lift cancels the hold timer itself (the iPhone bug)', () => {
  const r = rig();
  r.touch('pointerdown'); r.advance(80); r.touch('pointerup');
  assert.equal(r.pending(), 0, 'no timer left running');
  r.advance(HOLD_MS * 4); assert.equal(r.laser.on, false);
});

test('a scroll or drag past the slop cancels the hold', () => {
  const r = rig();
  r.touch('pointerdown'); r.touch('pointermove', 1, 100, 200 + HOLD_SLOP + 2);
  assert.equal(r.pending(), 0); r.advance(HOLD_MS * 2); assert.equal(r.laser.on, false);
  r.touch('pointerup');
  const q = rig(); q.touch('pointerdown'); q.touch('pointermove', 1, 103, 204); assert.equal(q.pending(), 1, 'a small wobble keeps the hold'); q.advance(HOLD_MS); assert.equal(q.laser.on, true);
});

test('a cancelled touch (iOS pointercancel) cancels the hold and puts a lit laser away', () => {
  const a = rig(); a.touch('pointerdown'); a.touch('pointercancel'); assert.equal(a.pending(), 0); a.advance(HOLD_MS * 2); assert.equal(a.laser.on, false);
  const b = rig(); b.touch('pointerdown'); b.advance(HOLD_MS); assert.equal(b.laser.on, true); b.touch('pointercancel'); assert.equal(b.laser.on, false);
});

test('a lost pointerup: touchend with no finger left, touchcancel, or the next touch all put it away; the timer cannot light it for a finger that is gone', () => {
  const a = rig(); a.touch('pointerdown'); a.advance(HOLD_MS); assert.equal(a.laser.on, true);
  a.fire('touchend', { touches: [] }); assert.equal(a.laser.on, false);
  const b = rig(); b.touch('pointerdown'); b.advance(HOLD_MS); b.fire('touchcancel', { touches: [] }); assert.equal(b.laser.on, false);
  const c = rig(); c.touch('pointerdown'); c.fire('touchend', { touches: [] }); assert.equal(c.pending(), 0); c.advance(HOLD_MS * 2); assert.equal(c.laser.on, false);
  const d = rig(); d.touch('pointerdown'); d.advance(HOLD_MS); assert.equal(d.laser.on, true); d.touch('pointerdown', 1, 50, 50); assert.equal(d.laser.on, false, 'a new touch ends a hold whose lift was lost');
  const e = rig(); e.touch('pointerdown'); e.fire('touchend', { touches: [{}] }); assert.equal(e.pending(), 1, 'another finger is still down: not a lift');
});

test('a second finger (pinch or two-finger pan) cancels the hold; a press off the figure never starts one; the window losing focus puts it away', () => {
  const a = rig(); a.touch('pointerdown'); a.touch('pointerdown', 2); assert.equal(a.pending(), 0); a.advance(HOLD_MS * 2); assert.equal(a.laser.on, false);
  const b = rig(); b.touch('pointerdown', 1, 100, 200, { target: { closest: () => null } }); assert.equal(b.pending(), 0);
  const c = rig(); c.touch('pointerdown'); c.advance(HOLD_MS); assert.equal(c.laser.on, true); c.fire('blur', { target: c.win }); assert.equal(c.laser.on, false);
  const d = rig(); d.touch('pointerdown'); d.fire('blur', { target: {} }); assert.equal(d.pending(), 1, 'a button losing focus is not the window\'s blur');
});

test('dispose clears a running hold; the hold timer is a window timer set and cleared as a pair, never the page clock\'s', () => {
  const r = rig(); r.touch('pointerdown'); r.laser.dispose(); assert.equal(r.pending(), 0); assert.equal(r.cursor(), '');
  const s = readFileSync('src/ui/deck/laser.ts', 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/clock\.cancel\(/.test(s), 'clock.cancel() on a window timer id cancels nothing');
  assert.ok(/win\.setTimeout\(/.test(s) && /win\.clearTimeout\(/.test(s));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGestures, isSystemEdge, type GestureEnv, type GestureHost } from '../src/scene/gesture/controller.ts';
import { dragToOrbit } from '../src/scene/camera/rig.ts';
import { ORBIT_LIMIT } from '../src/scene/camera/shots.ts';
import { K_MAX, K_MIN, rectUnder } from '../src/scene/gesture/view.ts';
import type { View } from '../src/scene/gesture/ease.ts';

type Fn = (e: never) => void;
class Target {
  l = new Map<string, Set<Fn>>();
  addEventListener(t: string, f: Fn) { (this.l.get(t) ?? this.l.set(t, new Set()).get(t)!).add(f); }
  removeEventListener(t: string, f: Fn) { this.l.get(t)?.delete(f); }
  emit(t: string, e: object) { for (const f of [...(this.l.get(t) ?? [])]) f({ preventDefault() {}, isTrusted: true, ctrlKey: false, metaKey: false, shiftKey: false, button: 0, ...e } as never); }
  count() { let n = 0; for (const s of this.l.values()) n += s.size; return n; }
}

function rig(over: Partial<GestureHost> = {}) {
  let t = 1000, id = 0, hand: View = { k: 1, x: 0, y: 0 }, orbit = 0, picked: string | null = null;
  const asks = new Map<number, (n: number) => void>(), timers = new Map<number, { at: number; fn: () => void }>();
  const taps: [number, number][] = [];
  const log = { held: 0 };
  const env: GestureEnv = {
    now: () => t,
    ask: (cb) => { asks.set(++id, cb); return id; },
    cancel: (i) => { asks.delete(i); },
    timer: (fn, ms) => { timers.set(++id, { at: t + ms, fn }); return id; },
    clearTimer: (i) => { timers.delete(i); },
    reduceMotion: () => false,
    viewport: () => ({ w: 800, h: 600 }),
  };
  const fitRect = { x0: 100, y0: 50, x1: 700, y1: 550 };
  const host: GestureHost = {
    hand: () => hand,
    setHand: (v) => { hand = { ...v }; },
    holdHand: () => { log.held++; },
    centre: () => ({ x: 400, y: 300 }),
    fitRect: () => fitRect,
    orbit: () => orbit,
    setOrbit: (r) => { const n = Math.max(-ORBIT_LIMIT, Math.min(ORBIT_LIMIT, r)); const ch = n !== orbit; orbit = n; return ch; },
    tap: (x, y) => { taps.push([x, y]); },
    picked: () => picked,
    setPicked: (p) => { picked = p; },
    context: () => {},
    ...over,
  };
  const el = new Target(), win = new Target();
  const g = createGestures(el, host, env, win);
  const frame = (ms = 16) => { t += ms; const q = [...asks]; asks.clear(); for (const [, cb] of q) cb(t); for (const [i, x] of [...timers]) if (x.at <= t) { timers.delete(i); x.fn(); } };
  const run = (ms: number) => { for (let e = t + ms; t < e;) frame(); };
  const ptr = (type: string, pointerId: number, x: number, y: number, extra: object = {}) => { const e = { type, pointerId, pointerType: 'touch', isPrimary: pointerId === 1, clientX: x, clientY: y, ...extra }; win.emit(type, e); el.emit(type, e); };
  return { g, el, win, host, env, frame, run, ptr, taps, log, get hand() { return hand; }, get orbit() { return orbit; }, get asks() { return asks.size; }, get timers() { return timers.size; }, get picked() { return picked; }, advance: (ms: number) => { t += ms; } };
}

test('one finger turns the figure with the hand, the same rule as a mouse (dragToOrbit), inside ±25°', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 400, 300);
  r.ptr('pointermove', 1, 405, 300);       // inside the tap slop: not yet a drag
  assert.equal(r.orbit, 0);
  r.ptr('pointermove', 1, 440, 300); r.advance(16);
  r.ptr('pointermove', 1, 500, 300);
  assert.equal(r.orbit, dragToOrbit(0, 500 - 440), 'it measures from where the drag began');
  assert.ok(r.orbit !== 0);
  r.ptr('pointermove', 1, 5000, 300);
  assert.equal(Math.abs(r.orbit), ORBIT_LIMIT, 'never past the limit');
});

test('a tap on the figure picks; a drag does not', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 300, 200); r.ptr('pointerup', 1, 301, 200);
  assert.deepEqual(r.taps, [[301, 200]]);
  r.ptr('pointerdown', 1, 300, 200); r.ptr('pointermove', 1, 360, 200); r.advance(16); r.ptr('pointermove', 1, 380, 200); r.ptr('pointerup', 1, 380, 200);
  assert.equal(r.taps.length, 1);
});

test('two fingers pinch to zoom: the point between them stays between them, and the finger spread sets the zoom', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 350, 300); r.ptr('pointerdown', 2, 450, 300);
  r.ptr('pointermove', 2, 550, 300);       // spread 100 -> 200 about the new midpoint 450
  assert.ok(Math.abs(r.hand.k - 2) < 1e-9, `k ${r.hand.k}`);
  // the figure point that was under the first midpoint (400,300) is now under the new midpoint (450,300)
  const p = { x: 400 + r.hand.x + r.hand.k * (400 - 400), y: 300 + r.hand.y };
  assert.ok(Math.abs(p.x - 450) < 1e-9 && Math.abs(p.y - 300) < 1e-9);
  r.ptr('pointermove', 1, 350, 360); r.ptr('pointermove', 2, 550, 360);   // both fingers slide down: it pans too
  assert.ok(r.hand.y > 0);
  assert.equal(r.orbit, 0, 'a pinch never turns the figure');
});

test('lifting one finger after a pinch carries on as a pan, never as a tap, and is not thrown', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 350, 300); r.ptr('pointerdown', 2, 450, 300);
  r.ptr('pointermove', 2, 600, 300);
  r.ptr('pointerup', 2, 600, 300);
  const k = r.hand.k;
  r.ptr('pointermove', 1, 330, 300);
  assert.ok(Math.abs(r.hand.k - k) < 1e-12, 'zoom stays while the finger pans');
  r.ptr('pointerup', 1, 330, 300);
  assert.equal(r.taps.length, 0);
  assert.equal(r.orbit, 0);
});

test('a pinch past the limits stretches a little and springs back inside 0.6 to 6', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 390, 300); r.ptr('pointerdown', 2, 410, 300);
  r.ptr('pointermove', 2, 790, 300);       // spread ×19
  assert.ok(r.hand.k > K_MAX && r.hand.k < 19, `stretched, not free: ${r.hand.k}`);
  r.ptr('pointerup', 2, 790, 300); r.ptr('pointerup', 1, 390, 300);
  r.run(2000);
  assert.ok(Math.abs(r.hand.k - K_MAX) < 1e-6, `back at the limit: ${r.hand.k}`);
  assert.equal(r.asks + r.timers, 0, 'and then the app is still');
});

test('a pan on shift-drag moves the figure, holds it inside the rubber band, and returns to the limits after release', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 400, 300, { pointerType: 'mouse', shiftKey: true });
  r.ptr('pointermove', 1, 420, 300, { pointerType: 'mouse' }); r.advance(16);
  r.ptr('pointermove', 1, 520, 320, { pointerType: 'mouse' });
  assert.ok(r.hand.x !== 0 || r.hand.y !== 0);
  assert.equal(r.orbit, 0);
  r.advance(200);
  r.ptr('pointerup', 1, 520, 320, { pointerType: 'mouse' });
  r.run(3000);
  assert.deepEqual({ k: r.hand.k, x: Math.round(r.hand.x), y: Math.round(r.hand.y) }, { k: 1, x: 0, y: 0 }, 'at the fit there is nothing to pan to, so it returns');
  assert.equal(r.asks + r.timers, 0);
});

test('a mouse wheel zooms about the pointer, glided, and a trackpad two-finger scroll pans', () => {
  const r = rig();
  r.el.emit('wheel', { deltaMode: 0, deltaX: 0, deltaY: -100, wheelDeltaY: 120, clientX: 600, clientY: 200 });
  const k0 = r.hand.k;
  r.run(400);
  assert.ok(r.hand.k > k0, 'zoomed in, over several frames');
  const k1 = r.hand.k;
  r.run(600);
  // a pad scroll: small deltas, a sideways part
  r.advance(500);
  const before = { ...r.hand };
  r.el.emit('wheel', { deltaMode: 0, deltaX: 6, deltaY: 9, wheelDeltaY: -27, clientX: 500, clientY: 300 });
  assert.equal(r.hand.k, k1, 'a scroll never changes the zoom');
  assert.ok(r.hand.x !== before.x || r.hand.y !== before.y, 'and it moves the figure');
});

test('a trackpad pinch (ctrl + wheel) and Safari gesture events zoom about the pointer without ever zooming the page', () => {
  const r = rig();
  let prevented = 0;
  r.el.emit('wheel', { deltaMode: 0, deltaX: 0, deltaY: -20, ctrlKey: true, clientX: 300, clientY: 250, preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.ok(r.hand.k > 1);
  const k = r.hand.k;
  r.advance(600); r.run(600);
  r.el.emit('gesturestart', {}); r.el.emit('gesturechange', { scale: 1.5, clientX: 300, clientY: 250 }); r.frame(); r.frame();
  assert.ok(r.hand.k > k, 'a gesture-only pinch zooms');
  r.run(2000);
  assert.ok(r.hand.k <= K_MAX + 1e-9 && r.hand.k >= K_MIN - 1e-9);
});

test('a double click zooms in ×2 about the point and puts back what the first click picked; touch never does', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 300, 300, { pointerType: 'mouse' }); r.ptr('pointerup', 1, 300, 300, { pointerType: 'mouse' });
  r.host.setPicked('LGV');
  r.advance(100);
  r.ptr('pointerdown', 1, 302, 301, { pointerType: 'mouse' }); r.ptr('pointerup', 1, 302, 301, { pointerType: 'mouse' });
  r.run(1500);
  assert.ok(Math.abs(r.hand.k - 2) < 1e-6, `k ${r.hand.k}`);
  assert.equal(r.taps.length, 1, 'the second click is not a pick');
  const t = rig();
  t.ptr('pointerdown', 1, 300, 300); t.ptr('pointerup', 1, 300, 300); t.advance(100);
  t.ptr('pointerdown', 1, 300, 300); t.ptr('pointerup', 1, 300, 300);
  t.run(1500);
  assert.equal(t.hand.k, 1);
  assert.equal(t.taps.length, 2);
});

test('refit glides the hand home, and a button or new shot (handsOff) stops everything the hand started', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 350, 300); r.ptr('pointerdown', 2, 450, 300); r.ptr('pointermove', 2, 600, 300);
  r.ptr('pointerup', 2, 600, 300); r.ptr('pointerup', 1, 350, 300);
  r.g.handsOff();
  const at = { ...r.hand };
  r.run(2000);
  assert.deepEqual(r.hand, at, 'nothing keeps moving it after handsOff');
  r.g.refit();
  r.run(2000);
  assert.deepEqual({ ...r.hand }, { k: 1, x: 0, y: 0 });
  assert.equal(r.g.active, false);
});

test('touches that start at the screen edge belong to the system and are ignored', () => {
  const vp = { w: 800, h: 600 };
  assert.equal(isSystemEdge({ pointerType: 'touch', clientX: 400, clientY: 590 }, vp), true);
  assert.equal(isSystemEdge({ pointerType: 'touch', clientX: 5, clientY: 300 }, vp), true);
  assert.equal(isSystemEdge({ pointerType: 'mouse', clientX: 5, clientY: 300 }, vp), false);
  const r = rig();
  r.ptr('pointerdown', 1, 5, 300); r.ptr('pointermove', 1, 200, 300); r.advance(16); r.ptr('pointermove', 1, 300, 300);
  assert.equal(r.orbit, 0);
});

test('the wheel and trackpad scrolls never leave the figure lost: past the edge it rubber-bands, then rests inside', () => {
  const r = rig();
  r.el.emit('wheel', { deltaMode: 0, deltaX: 0, deltaY: -20, ctrlKey: true, clientX: 400, clientY: 300 });
  r.run(1000);
  r.el.emit('wheel', { deltaMode: 0, deltaX: -400, deltaY: 0, wheelDeltaY: 0, clientX: 400, clientY: 300 });
  r.el.emit('wheel', { deltaMode: 0, deltaX: -400, deltaY: 0, wheelDeltaY: 0, clientX: 400, clientY: 300 });
  r.run(2500);
  const rect = rectUnder({ x0: 100, y0: 50, x1: 700, y1: 550 }, r.hand, { x: 400, y: 300 });
  assert.ok(400 >= rect.x0 - 1e-6 && 400 <= rect.x1 + 1e-6);
  assert.equal(r.asks + r.timers, 0);
});

test('dispose removes every listener and every pending frame or timer', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 350, 300); r.ptr('pointerdown', 2, 450, 300); r.ptr('pointermove', 2, 700, 300);
  r.el.emit('wheel', { deltaMode: 0, deltaX: 0, deltaY: -100, wheelDeltaY: 120, clientX: 600, clientY: 200 });
  r.g.dispose();
  assert.equal(r.el.count() + r.win.count(), 0);
  assert.equal(r.asks + r.timers, 0);
});

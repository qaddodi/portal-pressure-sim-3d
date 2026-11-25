import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGestures, isSystemEdge, type GestureEnv, type GestureHost } from '../src/scene/gesture/controller.ts';
import { dragToOrbit, orbitHome } from '../src/scene/camera/rig.ts';
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

function rig(over: Partial<GestureHost> = {}, locked = false) {
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
    locked: () => locked,
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
    setPicked: (p) => { picked = p as string | null; },
    context: () => {},
    ...over,
  };
  const el = new Target(), win = new Target();
  const g = createGestures(el, host, env, win);
  const frame = (ms = 16) => { t += ms; const q = [...asks]; asks.clear(); for (const [, cb] of q) cb(t); for (const [i, x] of [...timers]) if (x.at <= t) { timers.delete(i); x.fn(); } };
  const run = (ms: number) => { for (let e = t + ms; t < e;) frame(); };
  const ptr = (type: string, pointerId: number, x: number, y: number, extra: object = {}) => { const e = { type, pointerId, pointerType: 'mouse', isPrimary: pointerId === 1, clientX: x, clientY: y, ...extra }; win.emit(type, e); el.emit(type, e); };
  return { g, el, win, host, env, frame, run, ptr, taps, log, get hand() { return hand; }, get orbit() { return orbit; }, get asks() { return asks.size; }, get timers() { return timers.size; }, get picked() { return picked; }, advance: (ms: number) => { t += ms; } };
}

test('a mouse drag turns the figure with the hand (dragToOrbit), inside ±25°', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 400, 300);
  r.ptr('pointermove', 1, 405, 300);       // inside the tap slop: not yet a drag
  assert.equal(r.orbit, 0);
  r.ptr('pointermove', 1, 440, 300); r.advance(16);
  r.ptr('pointermove', 1, 450, 300);
  assert.equal(r.orbit, dragToOrbit(0, 450 - 405), 'it measures from where the drag began');
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

test('a double click zooms in ×2 about the point and puts back what the first click picked; touch zooms the same way, never picking', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 300, 300, { pointerType: 'mouse' }); r.ptr('pointerup', 1, 300, 300, { pointerType: 'mouse' });
  r.host.setPicked('LGV');
  r.advance(100);
  r.ptr('pointerdown', 1, 302, 301, { pointerType: 'mouse' }); r.ptr('pointerup', 1, 302, 301, { pointerType: 'mouse' });
  r.run(1500);
  assert.ok(Math.abs(r.hand.k - 2) < 1e-6, `k ${r.hand.k}`);
  assert.equal(r.taps.length, 1, 'the second click is not a pick');
  const t = rig(); const T = { pointerType: 'touch' };
  t.ptr('pointerdown', 1, 300, 300, T); t.ptr('pointerup', 1, 300, 300, T); t.advance(100);
  t.ptr('pointerdown', 1, 300, 300, T); t.ptr('pointerup', 1, 300, 300, T);
  t.run(1500);
  assert.ok(Math.abs(t.hand.k - 2) < 1e-6, 'a double tap by finger zooms ×2');
  assert.equal(t.taps.length, 0, 'and picks nothing, not even the first tap');
  const u = rig(); u.ptr('pointerdown', 1, 300, 300, T); u.ptr('pointerup', 1, 300, 300, T);
  assert.equal(u.taps.length, 0, 'a lone finger tap waits out the double-tap window'); u.run(400);
  assert.deepEqual(u.taps, [[300, 300]], 'then picks');
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
  const T = { pointerType: 'touch' };
  r.ptr('pointerdown', 1, 5, 300, T); r.ptr('pointermove', 1, 200, 300, T); r.advance(16); r.ptr('pointermove', 1, 300, 300, T);
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

// ── the turn stays where the viewer leaves it; only Fit brings it home (owner, 19 Nov, after the independent review) ──────────────────
const turn = (r: ReturnType<typeof rig>) => { r.ptr('pointerdown', 1, 400, 300); r.ptr('pointermove', 1, 440, 300); r.advance(16); r.ptr('pointermove', 1, 540, 300); };

test('after a free drag the figure holds its angle for 2 s, then springs home smoothly and goes quiet (owner, 20 Nov)', () => {
  const r = rig();
  turn(r); r.advance(200);                       // held still before letting go: no momentum
  r.ptr('pointerup', 1, 540, 300);
  const turned = r.orbit;
  assert.ok(Math.abs(turned) > 0.1);
  r.run(1900);
  assert.equal(r.orbit, turned, 'held for the 2 s');
  r.run(4000);
  assert.equal(r.orbit, 0, 'home');
  assert.equal(r.asks, 0, 'and nothing asks for a frame');
  assert.equal(r.timers, 0);
});

test('a pan, a pinch or a tap on a turned figure leaves the turn alone', () => {
  const r = rig();
  turn(r); r.advance(200); r.ptr('pointerup', 1, 540, 300);
  const turned = r.orbit;
  r.ptr('pointerdown', 3, 400, 300, { shiftKey: true }); r.ptr('pointermove', 3, 460, 300, { shiftKey: true }); r.advance(16); r.ptr('pointermove', 3, 520, 300, { shiftKey: true });
  r.advance(200); r.ptr('pointerup', 3, 520, 300, { shiftKey: true });
  r.ptr('pointerdown', 4, 300, 200); r.ptr('pointerup', 4, 301, 200);
  r.run(1500);
  assert.equal(r.orbit, turned, 'each touch restarts the 2 s wait');
});

test('Fit brings the turn home: critically damped, never past the shot, and quiet once it lands', () => {
  const r = rig();
  turn(r); r.advance(200); r.ptr('pointerup', 1, 540, 300);
  const turned = r.orbit, sign = Math.sign(turned);
  r.g.refit();
  r.run(300);
  assert.ok(Math.abs(r.orbit) < Math.abs(turned) && r.orbit * sign > 0, 'on its way');
  for (let ms = 0; ms < 3000; ms += 16) { r.run(16); assert.ok(r.orbit * sign >= 0, `at ${ms} ms`); }
  assert.equal(r.orbit, 0, 'lands exactly on the shot');
  r.run(100);
  assert.equal(r.asks, 0);
  assert.equal(r.g.active, false);
});

test('touching the figure while Fit is bringing the turn home stops it where it is', () => {
  const r = rig();
  turn(r); r.advance(200); r.ptr('pointerup', 1, 540, 300);
  r.g.refit(); r.run(300);
  const mid = r.orbit;
  assert.ok(mid !== 0);
  r.ptr('pointerdown', 2, 400, 300);
  r.run(1000);
  assert.equal(r.orbit, mid);
});

test('Fit with Reduce Motion puts the turn back in one step', () => {
  const r = rig({});
  (r.env as { reduceMotion(): boolean }).reduceMotion = () => true;
  turn(r); r.advance(200); r.ptr('pointerup', 1, 540, 300);
  assert.ok(r.orbit !== 0);
  r.g.refit();
  assert.equal(r.orbit, 0);
});

test('orbitHome is a critically damped spring: x0 at the start, never past zero, under a thousandth of a radian by 1.5 s', () => {
  assert.equal(orbitHome(0.4, 0), 0.4);
  let last = 0.4;
  for (let t = 0; t <= 3000; t += 10) { const o = orbitHome(0.4, t); assert.ok(o <= last + 1e-12 && o >= 0); last = o; }
  assert.ok(orbitHome(ORBIT_LIMIT, 1500) < 1e-3);
  assert.equal(orbitHome(-0.3, 0), -0.3);
  assert.ok(orbitHome(-0.3, 400) > -0.3 && orbitHome(-0.3, 400) < 0);
});

test('turnOff (a guided step is bringing the turn home) stops the turn\'s momentum and a Fit glide, so nothing fights the camera', () => {
  const r = rig();
  r.ptr('pointerdown', 1, 400, 300); r.ptr('pointermove', 1, 440, 300); r.advance(16); r.ptr('pointermove', 1, 500, 300); r.advance(16); r.ptr('pointermove', 1, 560, 300); r.advance(8); r.ptr('pointerup', 1, 560, 300);
  r.run(32);
  const o = r.orbit;
  r.g.turnOff();
  r.run(2000);
  assert.equal(r.orbit, o, 'the thrown turn stopped where it was');
  r.g.refit(); r.run(100);
  const mid = r.orbit;
  r.g.turnOff(); r.run(2000);
  assert.equal(r.orbit, mid, 'a Fit glide stopped too');
  assert.equal(r.g.active, false);
});

test('in a talk the camera is the slide\'s: a drag, a pinch and a wheel move nothing, a tap still lands (Mohammad, 20 Nov: "why am I able to move camera in slides")', () => {
  const r = rig({}, true);
  r.ptr('pointerdown', 1, 400, 300); r.ptr('pointermove', 1, 440, 300); r.advance(16); r.ptr('pointermove', 1, 600, 320); r.ptr('pointerup', 1, 600, 320);
  assert.equal(r.orbit, 0, 'no turn');
  assert.deepEqual(r.hand, { k: 1, x: 0, y: 0 }, 'no pan');
  r.ptr('pointerdown', 1, 350, 300); r.ptr('pointerdown', 2, 450, 300); r.ptr('pointermove', 2, 600, 300); r.ptr('pointerup', 2, 600, 300); r.ptr('pointerup', 1, 350, 300);
  assert.deepEqual(r.hand, { k: 1, x: 0, y: 0 }, 'no pinch');
  r.el.emit('wheel', { deltaMode: 0, deltaX: 0, deltaY: -200, clientX: 400, clientY: 300 }); r.run(300);
  assert.deepEqual(r.hand, { k: 1, x: 0, y: 0 }, 'no wheel zoom');
  r.ptr('pointerdown', 1, 300, 200); r.ptr('pointerup', 1, 301, 200);
  assert.deepEqual(r.taps, [[301, 200]], 'a tap still lands (the sinusoid\'s explain)');
});

test('in a talk a right click or long press opens no card and a zoom key or button does not zoom the figure', () => {
  let ctx = 0;
  const r = rig({ context: () => { ctx++; } }, true);
  r.el.emit('contextmenu', { clientX: 300, clientY: 200 });
  assert.equal(ctx, 0);
  r.g.zoomStep(2); r.run(600);
  assert.equal(r.hand.k, 1);
});

test('Anatomy never rests zoomed out past its fit: the host gives kMin 1 for the body (and the sinusoid)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/scene/Stage.tsx', import.meta.url), 'utf8');
  assert.match(src, /cel\.view === 'sinusoid' \|\| cel\.view === 'lobule' \? 1 : zoomLimits\(wholeHome\(\), 1\)\.kMin/);
  assert.match(src, /home: \(\) => wholeHome\(\)/);
});

// 2D measures the zoom limits on the whole plate, not on the shot now up (audit 2.5): from a close shot the hand reaches the whole figure and no further, and never zooms 6x past the close-up
const closeShot = { k: 0.4, x: 120, y: -60 } as const;   // the hand view that frames the whole figure from a close shot: 0.4 of its zoom, panned
const lim = { kMin: () => closeShot.k, kMax: () => 6 * closeShot.k, home: () => ({ ...closeShot }) };
test('from a close shot a zoom-out step lands on the whole figure, centred, and the next one stays there (2D zoomOut: the last step out lands on the whole figure)', () => {
  const r = rig(lim);
  for (let i = 0; i < 6; i++) { r.g.zoomStep(1 / 1.4); r.run(2000); }
  assert.ok(Math.abs(r.hand.k - closeShot.k) < 1e-6, `rests at the whole figure's zoom, not past it: ${r.hand.k}`);
  assert.ok(Math.abs(r.hand.x - closeShot.x) < 1e-3 && Math.abs(r.hand.y - closeShot.y) < 1e-3, 'and centred as the whole-figure shot frames it');
});
test('from a close shot the zoom-in stops at 6 x the whole figure, not 6 x the close-up', () => {
  const r = rig(lim);
  for (let i = 0; i < 20; i++) { r.g.zoomStep(1.4); r.run(2000); }
  assert.ok(Math.abs(r.hand.k - 6 * closeShot.k) < 1e-6, `${r.hand.k}`);
});
test('a pinch out past the whole figure springs back to it (the limit is the whole figure, not the shot)', () => {
  const r = rig(lim);
  r.ptr('pointerdown', 1, 380, 300, { pointerType: 'touch' }); r.ptr('pointerdown', 2, 420, 300, { pointerType: 'touch' });
  r.ptr('pointermove', 1, 395, 300, { pointerType: 'touch' }); r.ptr('pointermove', 2, 405, 300, { pointerType: 'touch' });
  r.ptr('pointerup', 1, 395, 300, { pointerType: 'touch' }); r.ptr('pointerup', 2, 405, 300, { pointerType: 'touch' });
  r.run(3000);
  assert.ok(Math.abs(r.hand.k - closeShot.k) < 1e-3, `${r.hand.k}`);
});
test('Fit on the Circuit toggles: from the shot\'s own framing to the whole map, and back (2D stage-fit.js)', () => {
  const r = rig({ ...lim, fitToggles: () => true });
  r.g.refit(); r.run(2500);
  assert.ok(Math.abs(r.hand.k - closeShot.k) < 1e-6 && Math.abs(r.hand.x - closeShot.x) < 1e-3, `to the whole map: ${JSON.stringify(r.hand)}`);
  r.g.refit(); r.run(2500);
  assert.deepEqual({ k: r.hand.k, x: r.hand.x, y: r.hand.y }, { k: 1, x: 0, y: 0 });
  // a second press while the first is still gliding goes the other way (judged from where the glide is going)
  r.g.refit(); r.run(100); r.g.refit(); r.run(2500);
  assert.deepEqual({ k: r.hand.k, x: r.hand.x, y: r.hand.y }, { k: 1, x: 0, y: 0 });
});
test('without a whole to return to (the shot is the whole figure) the limits are the old ones: 1 to 6, and Fit goes to the shot\'s framing', () => {
  const r = rig({ kMin: () => 1, home: () => null, fitToggles: () => true });
  r.g.zoomStep(1 / 1.4); r.run(2000);
  assert.equal(r.hand.k, 1);
  r.g.refit(); r.run(2000);
  assert.deepEqual({ k: r.hand.k, x: r.hand.x, y: r.hand.y }, { k: 1, x: 0, y: 0 });
});

test('one finger pans in every view, whatever the setting; it never turns the figure', () => {
  const r = rig();
  const T = { pointerType: 'touch' };
  r.ptr('pointerdown', 1, 400, 300, T); r.ptr('pointermove', 1, 440, 300, T); r.advance(16); r.ptr('pointermove', 1, 520, 300, T);
  assert.equal(r.orbit, 0, 'a finger does not turn');
  assert.ok(r.hand.x !== 0, `it pans: ${r.hand.x}`);
});

test('a turn springs home by itself 2 s after the last finger lifts; a new touch restarts the wait', async () => {
  const src = (await import('node:fs')).readFileSync('src/scene/gesture/controller.ts', 'utf8');
  assert.match(src, /HOME_AFTER_MS = 2000/);
  assert.match(src, /if \(!pointers\.size\) homeLater\(\);/);
  assert.match(src, /const onDown = \(ev: PtrEv\) => \{\n    homeCancel\(\);/);
});

test('two fingers: sliding together tilts (no zoom), spreading zooms (no tilt); one finger pans', () => {
  let pitch = 0;
  const r = rig({ free: () => true, orbitPitch: () => pitch, setOrbitPitch: (p: number) => { const ch = p !== pitch; pitch = p; return ch; } });
  const t = { pointerType: 'touch' };
  r.ptr('pointerdown', 1, 300, 300, t); r.ptr('pointerdown', 2, 400, 300, t);
  for (let i = 1; i <= 6; i++) { r.advance(16); r.ptr('pointermove', 1, 300, 300 - i * 8, t); r.ptr('pointermove', 2, 400, 300 - i * 8, t); }
  assert.notEqual(pitch, 0, 'the slide tilted'); assert.equal(r.hand.k, 1, 'and did not zoom');
  r.ptr('pointerup', 1, 300, 252, t); r.ptr('pointerup', 2, 400, 252, t);
  const p0 = pitch;
  r.ptr('pointerdown', 3, 300, 300, t); r.ptr('pointerdown', 4, 400, 300, t);
  for (let i = 1; i <= 6; i++) { r.advance(16); r.ptr('pointermove', 3, 300 - i * 8, 300, t); r.ptr('pointermove', 4, 400 + i * 8, 300, t); }
  assert.ok(r.hand.k > 1, 'the spread zoomed'); assert.equal(pitch, p0, 'and did not tilt');
});

test('zoom presses stack: pressed again while a glide runs, the step goes on from where that glide is going (2D zooms from vtTarget)', () => {
  const r = rig();
  r.g.zoomStep(1.4); r.run(100); r.g.zoomStep(1.4); r.run(3000);
  assert.ok(Math.abs(r.hand.k - 1.4 * 1.4) < 1e-6, `${r.hand.k}`);
});

test('double tap, keep the finger down and slide: one-finger zoom about that point; down zooms in, up out, and nothing is ever picked (owner, 25 Nov)', () => {
  const r = rig(); const T = { pointerType: 'touch' };
  r.ptr('pointerdown', 1, 300, 200, T); r.ptr('pointerup', 1, 300, 200, T);
  r.advance(100);
  r.ptr('pointerdown', 1, 301, 200, T);
  r.ptr('pointermove', 1, 301, 230, T); r.ptr('pointermove', 1, 301, 300, T);
  assert.ok(r.hand.k > 1.3, `k ${r.hand.k}`);
  // the figure point under the finger stays under it
  const p = { x: 400 + r.hand.x + r.hand.k * (301 - 400), y: 300 + r.hand.y + r.hand.k * (200 - 300) };
  assert.ok(Math.abs(p.x - 301) < 1e-6 && Math.abs(p.y - 200) < 1e-6);
  const kIn = r.hand.k;
  r.ptr('pointermove', 1, 301, 150, T);
  assert.ok(r.hand.k < kIn, 'sliding up zooms out');
  assert.equal(r.orbit, 0, 'no turn, no pan');
  r.ptr('pointerup', 1, 301, 150, T);
  r.run(500); assert.equal(r.taps.length, 0, 'the first tap never picks and the zoom is not a pick');
});

test('a finger held still for ~0.4 s turns and tilts the camera when dragged; a drag without the hold still pans (owner, 25 Nov)', () => {
  let pitch = 0;
  const mk = () => rig({ free: () => true, orbitPitch: () => pitch, setOrbitPitch: (p) => { pitch = p; return true; } });
  const T = { pointerType: 'touch' };
  const a = mk();
  a.ptr('pointerdown', 1, 400, 300, T); a.run(500);
  a.ptr('pointermove', 1, 440, 330, T); a.ptr('pointermove', 1, 460, 350, T);
  assert.ok(a.orbit !== 0 && pitch !== 0, 'held then dragged: it turns and tilts');
  assert.deepEqual({ x: a.hand.x, y: a.hand.y }, { x: 0, y: 0 }, 'and does not pan');
  pitch = 0;
  const b = mk();
  b.ptr('pointerdown', 1, 400, 300, T); b.run(100);
  b.ptr('pointermove', 1, 440, 330, T); b.ptr('pointermove', 1, 460, 350, T); b.run(500);
  assert.equal(b.orbit, 0); assert.equal(pitch, 0);
  assert.ok(b.hand.x > 0 && b.hand.y > 0, 'dragged at once: it pans as before');
});

test('the hold never fires once a second finger is down or the finger lifted, and dispose clears it', () => {
  const T = { pointerType: 'touch' };
  const r = rig();
  r.ptr('pointerdown', 1, 400, 300, T); r.ptr('pointerup', 1, 400, 300, T); r.run(500);
  assert.equal(r.orbit, 0, 'lifted: nothing turned');
  r.ptr('pointerdown', 1, 350, 300, T); r.ptr('pointerdown', 2, 450, 300, T); r.run(600);
  r.ptr('pointermove', 2, 550, 300, T);
  assert.ok(r.hand.k > 1.5 && r.orbit === 0, 'two fingers still pinch');
});

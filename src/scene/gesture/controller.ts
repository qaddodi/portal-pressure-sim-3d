import { ORBIT_PER_PX, dragToOrbit, dragToPitch, orbitHome } from '../camera/rig.ts';
import { ORBIT_LIMIT } from '../camera/shots.ts';
import { CAM_MS_MAX, type View, carried, camMs, createGlideTracker, easeMove, lerpView, springSlope } from './ease.ts';
import { FLICK, runFlick } from './flick.ts';
import {
  FIT_K, IDENTITY, K_MAX, K_MIN, type Pt, type Rect, anchorAt, clamp, hardPan, limitK, panFor, restingView, sameView, softK, softPan, unsoftPan, zoomAbout,
} from './view.ts';
import { createWheelGlide, isPadWheel } from './wheel-glide.ts';

// The figure's gestures, on every device. The 2D app's pan and zoom, ported number for number (src/ui/stage-gestures.js there): zoom about the pointer,
// the soft limits and their spring-back, the rubber band past the figure, the flick, the wheel glide, the trackpad's pinch and two-finger scroll, a double click.
// What the 3D figure adds is the turn: one finger or the mouse turns it (within ±25°), and the figure follows the hand. The turn stays where the hand left it (owner, 19 Nov, after the
// independent review: a spring-back undid the angle the viewer chose); it goes home to the shot only on Fit, a second tap on the view pill or the 0 key (refit),
// and a new shot (a slide, a catheter step, another view) eases it home with the move (camera/rig.ts).
//
//   one finger / mouse drag        turn the figure (±25°, with momentum); Shift, middle button: pan
//   two fingers                    pinch to zoom and pan together: the point under the midpoint stays under it
//   one finger after a pinch       carries on as a pan (never a tap, never thrown)
//   trackpad two-finger scroll     pan        trackpad pinch (and Ctrl or ⌘ + wheel)   zoom about the pointer
//   mouse wheel                    zoom about the pointer, glided      double click   zoom in ×2 (Shift: out) about the point
//   tap                            pick a vessel, an organ or the belly's fluid
// Touches that start at the screen's edge are the system's (back swipe, home bar). Cards and the wallet are page elements above the canvas, so a gesture that
// starts on one never reaches this controller: the figure and the cards never fight over a finger.

export interface GestureEnv {
  now(): number;
  /** Runs `cb(now)` on the clock's next frame; returns an id for cancel. Everything that glides asks through this, never requestAnimationFrame. */
  ask(cb: (now: number) => void): number;
  cancel(id: number): void;
  timer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
  reduceMotion(): boolean;
  viewport(): { w: number; h: number };
  /** The camera is the slide's, not the hand's (a talk): a tap still lands, but nothing turns, pans or zooms the figure. Absent: never locked. */
  locked?(): boolean;
}

export interface GestureHost {
  hand(): Readonly<View>;
  /** Puts the hand's view on the figure (zoom k, pan x y) and asks for a frame. */
  setHand(v: View): void;
  /** The hand takes the camera: a shot's own return of the hand to the fit stops where it is. */
  holdHand(): void;
  /** The middle of the free room (canvas px). */
  centre(): Pt;
  /** The figure's rectangle on screen in the shot's own framing (hand at the fit). */
  fitRect(): Rect;
  orbit(): number;
  /** The least zoom the hand may rest at for the view now (absent: K_MIN). The sinusoid keeps its own vessel framed: never under its fit (Mohammad, 20 Nov 2026: "i shouldn't be able to zoom this much in sinusoid; spring me back"). */
  kMin?(): number;
  /** A pan let go outside the allowed area glides back to the middle of the view (the sinusoid), not just to its edge. */
  recentre?(): boolean;
  /** Returns whether the orbit changed. */
  setOrbit(rad: number): boolean;
  /** Tilt all around (Settings): whether the free turn is on, and the tilt up or down. Absent: only the ±25° turn. */
  free?(): boolean;
  orbitPitch?(): number;
  setOrbitPitch?(rad: number): boolean;
  /** A tap on the figure at canvas point (x, y); `touch` when a finger made it (a finger's reach is wider). */
  tap(x: number, y: number, touch?: boolean): void;
  /** What is selected now (a vessel or an organ: the host's own token), and a way to put it back (a double click's first click selected one). */
  picked(): unknown;
  setPicked(sel: unknown): void;
  /** Right click or long press: the same as a tap here. */
  context(x: number, y: number, touch?: boolean): void;
}

export const TAP_SLOP_TOUCH = 8, TAP_SLOP_MOUSE = 4;
export const DOUBLE_TAP_MS = 320, DOUBLE_TAP_PX = 30;
/** A touch that starts this close to the screen's edge is the system's (the 2D app's systemEdge). */
export const isSystemEdge = (e: { pointerType: string; clientX: number; clientY: number }, vp: { w: number; h: number }): boolean =>
  e.pointerType === 'touch' && (e.clientY > vp.h - 34 || e.clientX < 12 || e.clientX > vp.w - 12);

type Drag =
  | { type: 'rotate'; x: number; y: number; orbit0: number; pitch0?: number; moved: boolean; trail: number[]; touch: boolean }
  | { type: 'pan'; x: number; y: number; v0: View; moved: boolean; trail: number[]; noFling: boolean; touch: boolean }
  | { type: 'pinch'; pa: [number, number]; pb: [number, number]; d0: number; k0: number; anchor: Pt; moved: boolean; m0: Pt; tilt?: { o0: number; p0: number } }
  | { type: 'ignore' };

export interface Gestures {
  /** Whether a hand is on the figure or a gesture's momentum is running. */
  readonly active: boolean;
  /** A button took over (Fit, a zoom button, a new shot): stop what the hand started, and ignore the trackpad's momentum still arriving. */
  handsOff(): void;
  /** A guided step (a slide, a catheter step) is about to bring the turn home with the camera: stop the turn's own momentum and return so they do not fight it. */
  turnOff(): void;
  /** Glide the hand's view home to the shot's own framing. */
  refit(): void;
  /** A zoom button: zoom about the middle of the room by `factor` (the 2D app's 1.4), gliding. */
  zoomStep(factor: number): void;
  /** Glide the hand's view to `to`. */
  animateTo(to: View, ms?: number): void;
  dispose(): void;
}

export interface GestureTarget {
  addEventListener(type: string, fn: (e: never) => void, opts?: unknown): void;
  removeEventListener(type: string, fn: (e: never) => void, opts?: unknown): void;
  setPointerCapture?(id: number): void;
}

export function createGestures(el: GestureTarget, host: GestureHost, env: GestureEnv, win: GestureTarget = el): Gestures {
  const pointers = new Map<number, [number, number]>();
  let drag: Drag | null = null;
  let fit: Rect | null = null;       // the figure's rectangle, read once per gesture and held (the 2D app's panFit)
  let wheelKind: 'pad' | 'wheel' | null = null, wheelAt = -1e9, wheelMute = false, settleT = 0;
  const hand = createGlideTracker();
  let handAge = 80;
  const handSample = (age: number) => { hand.sample(host.hand(), env.now()); handAge = age; };
  let lastTap: { t: number; x: number; y: number; sel: unknown } | null = null;
  let animId = 0, cancelFlick: (() => void) | null = null, flicking = false, orbitId = 0;
  const touchesDown = new Set<number>();
  const offs: (() => void)[] = [];
  const on = (t: GestureTarget, type: string, fn: unknown, opts?: unknown) => {
    t.addEventListener(type, fn as (e: never) => void, opts);
    offs.push(() => t.removeEventListener(type, fn as (e: never) => void, opts));
  };

  const stage = () => { const v = env.viewport(); return { w: v.w, h: v.h }; };
  const fitRect = (): Rect => (fit ??= host.fitRect());
  const hardOf = (v: View, out?: View) => hardPan(v, fitRect(), host.centre(), out);
  const soft = (v: View, out?: View) => softPan(v, fitRect(), host.centre(), stage(), out);
  const unsoft = (v: View, out?: View) => unsoftPan(v, fitRect(), host.centre(), stage(), out);
  const gestureOn = () => !!drag || flicking || env.now() - wheelAt < 250;

  // ── the glide of the hand's view to a place (the spring-back, a double click, Fit): the 2D app's animateVT ────────────────────────
  function stopAnim() { if (animId) env.cancel(animId); animId = 0; }
  function animateTo(to: View, ms?: number, v0 = hand.take(env.now(), handAge)): void {
    stopAnim();
    const from = { ...host.hand() };
    if (sameView(from, to)) { host.setHand({ ...to }); return; }
    const dur = ms ?? camMs(from, to, env.viewport().w, CAM_MS_MAX);
    if (env.reduceMotion() || dur <= 0) { host.setHand({ ...to }); return; }
    const c0 = springSlope(v0, from, to, env.viewport().w, dur);
    const t0 = env.now(), cur: View = { k: 1, x: 0, y: 0 };
    const step = (now: number) => {
      animId = 0;
      const raw = clamp((now - t0) / dur, 0, 1);
      host.setHand(lerpView(from, to, carried(easeMove(raw), raw, c0), cur));
      if (raw < 1) animId = env.ask(step);
      else { host.setHand({ ...to }); fit = null; }
    };
    animId = env.ask(step);
  }
  const animZoomAt = (x: number, y: number, factor: number) => {
    const v = host.hand(), c = host.centre();
    const k = limitK(v.k * factor, kMin()), f = k / v.k;
    const to = zoomAbout(v, f, { x, y }, c);
    animateTo(k <= FIT_K ? { k, x: 0, y: 0 } : hardOf(to), undefined, null);
  };

  // ── the spring-back: back inside the limits, never lost ────────────────────────────────────────────────────────────────────────
  const kMin = () => host.kMin?.() ?? K_MIN;
  let springAsk = 0;
  const springBack = () => { springAsk ||= env.ask(springRead); };
  function springRead() {
    springAsk = 0;
    if (drag || flicking || wheelGlide.active) { if (wheelGlide.active) settleSoon(60); return; }
    const v0 = hand.take(env.now(), handAge);
    const to = restingView(host.hand(), fitRect(), host.centre(), kMin(), !!host.recentre?.());
    if (!sameView(to, host.hand())) animateTo(to, undefined, v0);
  }
  const settleSoon = (ms = 220) => { env.clearTimer(settleT); settleT = env.timer(springBack, ms); };

  // ── a flick: a pan let go at speed ───────────────────────────────────────────────────────────────────────────────────────────
  function stopFlick() { cancelFlick?.(); cancelFlick = null; flicking = false; }
  function fling(vx: number, vy: number) {
    if (env.reduceMotion() || Math.hypot(vx, vy) < FLICK.minSpeed) { springBack(); return; }
    const v = host.hand(), k = v.k, h0 = hardOf(v);
    // let go past the bounds: nothing to carry, it eases home from where it is
    if (Math.abs(v.x - h0.x) > 0.5 || Math.abs(v.y - h0.y) > 0.5) { springBack(); return; }
    flicking = true;
    cancelFlick = runFlick({
      x: v.x, y: v.y, vx, vy,
      hard: (x, y) => { const h = hardOf({ k, x, y }); return [h.x, h.y]; },
      apply: (x, y) => host.setHand({ k, x, y }),
      done: () => { flicking = false; cancelFlick = null; springBack(); },
      ask: env.ask, cancel: env.cancel, now: env.now,
    });
  }

  // ── the turn's momentum: decays like the flick, stops at the ±25° limit ─────────────────────────────────────────────────────
  function stopOrbitMomentum() { if (orbitId) env.cancel(orbitId); orbitId = 0; }
  function orbitMomentum(v: number) {   // v: rad per ms
    if (env.reduceMotion() || Math.abs(v) < 0.0004) return;
    let last = env.now();
    const step = (now: number) => {
      orbitId = 0;
      const dt = Math.min(34, now - last); last = now;
      v *= Math.pow(FLICK.decay, dt);
      const o = host.orbit() + v * dt;
      host.setOrbit(o);
      if (Math.abs(o) >= ORBIT_LIMIT) v *= Math.pow(FLICK.brake, dt / 16);
      if (Math.abs(v) > 0.00006) orbitId = env.ask(step);
    };
    orbitId = env.ask(step);
  }

  // ── the turn's return: only Fit (refit) brings a turn home, critically damped; a free drag leaves the figure at the angle the viewer chose ──
  let homeId = 0;
  function stopOrbitHome() { if (homeId) env.cancel(homeId); homeId = 0; }
  function orbitToShot() {
    stopOrbitHome();
    const o0 = host.orbit(), p0 = host.orbitPitch?.() ?? 0;
    if (o0 === 0 && p0 === 0) return;
    if (env.reduceMotion()) { host.setOrbit(0); host.setOrbitPitch?.(0); return; }
    const t0 = env.now();
    let last = o0, lastP = p0;
    const step = (now: number) => {
      homeId = 0;
      if (host.orbit() !== last || (host.orbitPitch?.() ?? 0) !== lastP) return;   // something else moved the turn (a new shot eases it home itself): not ours to carry on
      const o = orbitHome(o0, now - t0), p = orbitHome(p0, now - t0);
      if (Math.abs(o) < 1e-4 && Math.abs(p) < 1e-4) { host.setOrbit(0); host.setOrbitPitch?.(0); return; }
      host.setOrbit(o); host.setOrbitPitch?.(p); last = host.orbit(); lastP = host.orbitPitch?.() ?? 0;
      homeId = env.ask(step);
    };
    homeId = env.ask(step);
  }

  // ── wheel, trackpad ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const wheelGlide = createWheelGlide({
    ask: env.ask, cancel: env.cancel,
    apply: (d, x, y) => { zoomBy(Math.exp(d), x, y, false); handSample(300); },
  });
  function zoomBy(factor: number, x: number, y: number, stretch: boolean) {
    const v = host.hand();
    let k = v.k * factor;
    k = stretch ? softK(k, kMin()) : clamp(k, kMin(), K_MAX);
    host.setHand(zoomAbout(v, k / v.k, { x, y }, host.centre()));
  }
  const wheelPx = (ev: WheelEv, d: number) => d * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? env.viewport().h : 1);
  function handsOff() {
    if (env.now() - wheelAt < 250) wheelMute = true;
    stopFlick(); stopAnim(); stopOrbitMomentum(); wheelGlide.cancel(); env.clearTimer(settleT); fit = null;
  }
  interface WheelEv { deltaMode: number; deltaX: number; deltaY: number; wheelDeltaY?: number | null; ctrlKey: boolean; metaKey: boolean; clientX: number; clientY: number; preventDefault(): void }
  const onWheel = (ev: WheelEv) => {
    ev.preventDefault();
    if (env.locked?.()) return;
    const now = env.now();
    if (wheelMute) { if (now - wheelAt < 250) { wheelAt = now; return; } wheelMute = false; }
    host.holdHand(); stopAnim(); stopFlick(); stopOrbitMomentum();
    const dx = wheelPx(ev, ev.deltaX), dy = wheelPx(ev, ev.deltaY);
    const at = { x: ev.clientX, y: ev.clientY };
    if (ev.ctrlKey || ev.metaKey) {
      // a trackpad pinch (a wheel event with ctrlKey), or Ctrl/⌘ + wheel: zoom about the pointer, direct; the limits stretch and it springs back
      if (now - wheelAt > 250) { fit = null; wheelKind = null; hand.begin(); }
      wheelAt = now;
      zoomBy(Math.exp(-clamp(dy, -50, 50) * 0.01), at.x, at.y, true); handSample(300); settleSoon();
      return;
    }
    if (now - wheelAt > 250) { fit = null; hand.begin(); wheelKind = isPadWheel(ev) ? 'pad' : 'wheel'; }
    wheelAt = now;
    if (wheelKind === 'wheel') {
      const step = -clamp(dy, -120, 120) * 0.0015;
      if (env.reduceMotion()) zoomBy(Math.exp(step), at.x, at.y, false);
      else {
        // a notch glides about 100 ms and carries the speed of the one before; the zoom it asks for stays inside the limits counting what the glide still owes
        const k = host.hand().k, owed = wheelGlide.left(), kTo = clamp(k * Math.exp(owed + step), kMin(), K_MAX);
        wheelGlide.push(Math.log(kTo / k) - owed, at.x, at.y, now);
      }
      settleSoon();
      return;
    }
    // a trackpad's two-finger scroll pans: the figure follows the fingers, on the rubber band
    const u0 = unsoft(host.hand());
    host.setHand(soft({ k: u0.k, x: u0.x - dx, y: u0.y - dy }));
    handSample(300); settleSoon();
  };
  on(el, 'wheel', onWheel, { passive: false });

  // Safari on a Mac can report a trackpad pinch as gesture events instead of Ctrl + wheel, and an iPhone or iPad sends them alongside the touches the figure
  // already follows. The page never zooms: a pinch with no Ctrl + wheel of its own is passed on as one; while a finger is down the touches alone move the figure.
  let gScale = 1, gWheel = false;
  const onGesture = (type: string) => (e: { preventDefault(): void; scale?: number; clientX?: number; clientY?: number; target?: { dispatchEvent?(e: unknown): void; isConnected?: boolean } }) => {
    e.preventDefault();
    if (type === 'start') { gScale = 1; gWheel = false; return; }
    if (type !== 'change') return;
    const r = (e.scale ?? 1) / gScale, x = e.clientX ?? 0, y = e.clientY ?? 0;
    gScale = e.scale ?? 1;
    if (!(r > 0) || r === 1 || touchesDown.size) return;
    env.ask(() => { if (!gWheel && !touchesDown.size) onWheel({ deltaMode: 0, deltaX: 0, deltaY: -Math.log(r) / 0.01, ctrlKey: true, metaKey: false, clientX: x, clientY: y, preventDefault() {} }); });
  };
  const gs = onGesture('start'), gc = onGesture('change'), ge = onGesture('end');
  on(el, 'gesturestart', gs, { passive: false });
  on(el, 'gesturechange', gc, { passive: false });
  on(el, 'gestureend', ge, { passive: false });
  const sawCtrlWheel = (e: { isTrusted?: boolean; ctrlKey: boolean }) => { if (e.isTrusted && e.ctrlKey) gWheel = true; };
  on(el, 'wheel', sawCtrlWheel, { capture: true, passive: true });
  const touchDown = (e: { pointerType: string; pointerId: number }) => { if (e.pointerType === 'touch') touchesDown.add(e.pointerId); };
  const touchUp = (e: { pointerId: number }) => { touchesDown.delete(e.pointerId); };
  on(win, 'pointerdown', touchDown, { capture: true, passive: true });
  on(win, 'pointerup', touchUp, { capture: true, passive: true });
  on(win, 'pointercancel', touchUp, { capture: true, passive: true });

  // ── touch and mouse ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  interface PtrEv { pointerId: number; pointerType: string; isPrimary: boolean; button: number; shiftKey: boolean; clientX: number; clientY: number; preventDefault?(): void }
  const trail = (x: number, y: number): number[] => [env.now(), x, y];
  const startPan = (x: number, y: number, touch: boolean, moved = false, noFling = false): Drag => ({ type: 'pan', x, y, v0: { ...host.hand() }, moved, trail: trail(x, y), noFling, touch });
  function startPinch(): Drag {
    const [a, b] = [...pointers.values()] as [[number, number], [number, number]];
    const m = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
    // Tilt all around on a touch screen: two fingers tilt (their middle turns the figure), the spread still zooms
    const tilt = host.free?.() && host.setOrbitPitch ? { o0: host.orbit(), p0: host.orbitPitch?.() ?? 0 } : undefined;
    return { type: 'pinch', pa: a, pb: b, d0: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), k0: host.hand().k, anchor: anchorAt(m, host.hand(), host.centre()), moved: false, m0: m, tilt };
  }
  /** The one place a drag turns the figure (dragToOrbit): the one finger's or mouse's, or two fingers' middle. */
  const turnBy = (o0: number, dx: number) => host.setOrbit(dragToOrbit(o0, dx));
  const onDown = (ev: PtrEv) => {
    if (isSystemEdge(ev, env.viewport())) return;
    if (ev.isPrimary) pointers.clear();
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    fit = null;
    host.holdHand(); stopAnim(); stopFlick(); stopOrbitMomentum(); stopOrbitHome(); wheelGlide.cancel(); hand.begin(); env.clearTimer(settleT);
    (el as GestureTarget).setPointerCapture?.(ev.pointerId);
    if (env.locked?.()) { if (pointers.size < 2) drag = { type: 'rotate', x: ev.clientX, y: ev.clientY, orbit0: host.orbit(), moved: false, trail: trail(ev.clientX, ev.clientY), touch: ev.pointerType === 'touch' }; else if (drag && drag.type === 'rotate') drag.moved = true; return; }   // (a talk: the touch is a tap or nothing)
    if (pointers.size >= 2) { drag = pointers.size === 2 ? startPinch() : drag; return; }
    if (ev.button === 2) { drag = { type: 'ignore' }; return; }   // the context menu is the pick's
    const touch = ev.pointerType === 'touch';
    // a mouse turns the figure; Shift or the middle button pans (a trackpad's own two fingers pan through wheel events)
    const free = !!host.free?.();
    // A finger always pans, in every view and whatever the setting (two fingers pinch, or tilt when Tilt all around is on, see startPinch); a mouse drag turns the figure (both axes with Tilt all around)
    drag = ev.shiftKey || ev.button === 1 || touch ? startPan(ev.clientX, ev.clientY, touch) : { type: 'rotate', x: ev.clientX, y: ev.clientY, orbit0: host.orbit(), pitch0: free ? host.orbitPitch?.() ?? 0 : undefined, moved: false, trail: trail(ev.clientX, ev.clientY), touch };
  };
  const pushTrail = (tr: number[], x: number, y: number) => {
    const now = env.now();
    tr.push(now, x, y);
    while (tr.length > 6 && now - tr[0]! > 90) tr.splice(0, 3);
  };
  const onMove = (ev: PtrEv) => {
    const pt = pointers.get(ev.pointerId);
    if (!pt || !drag || drag.type === 'ignore') return;
    pt[0] = ev.clientX; pt[1] = ev.clientY;
    if (env.locked?.()) {
      // (nothing moves, but a touch that travelled is not a tap)
      if (drag.type === 'rotate' && !drag.moved && Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > (drag.touch ? TAP_SLOP_TOUCH : TAP_SLOP_MOUSE)) drag.moved = true;
      return;
    }
    if (drag.type === 'pinch') {
      if (pointers.size !== 2) return;
      const a = drag.pa, b = drag.pb;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
      if (Math.abs(d - drag.d0) > 10 || Math.hypot(m.x - drag.m0.x, m.y - drag.m0.y) > 10) drag.moved = true;
      const k = softK((drag.k0 * d) / drag.d0, kMin()), p = panFor(drag.tilt ? drag.m0 : m, drag.anchor, k, host.centre());
      if (drag.tilt) { turnBy(drag.tilt.o0, m.x - drag.m0.x); host.setOrbitPitch?.(dragToPitch(drag.tilt.p0, m.y - drag.m0.y)); }
      host.setHand({ k, x: p.x, y: p.y }); handSample(80);
      return;
    }
    const slop = drag.touch ? TAP_SLOP_TOUCH : TAP_SLOP_MOUSE;
    if (drag.type === 'rotate') {
      const dx = ev.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) + Math.abs(ev.clientY - drag.y) > slop) { drag.moved = true; drag.x = ev.clientX; drag.y = ev.clientY; }
      else if (drag.moved) { turnBy(drag.orbit0, dx); if (drag.pitch0 != null) host.setOrbitPitch?.(dragToPitch(drag.pitch0, ev.clientY - drag.y)); pushTrail(drag.trail, ev.clientX, ev.clientY); }
      return;
    }
    // pan
    if (!drag.moved && Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > slop) { drag.moved = true; drag.x = ev.clientX; drag.y = ev.clientY; drag.v0 = { ...host.hand() }; }
    if (drag.moved) {
      host.setHand(soft({ k: host.hand().k, x: drag.v0.x + (ev.clientX - drag.x), y: drag.v0.y + (ev.clientY - drag.y) }));
      handSample(80); pushTrail(drag.trail, ev.clientX, ev.clientY);
    }
  };
  const onUp = (ev: PtrEv & { type: string }) => {
    if (!pointers.delete(ev.pointerId)) return;
    const d = drag;
    if (!d) return;
    if (d.type === 'ignore') { if (!pointers.size) { drag = null; springBack(); } return; }
    if (d.type === 'pinch') {
      // one finger stays down: it carries on as a pan (never as a tap, never thrown on release)
      const rest = [...pointers.values()][0];
      drag = rest && pointers.size === 1 ? startPan(rest[0], rest[1], true, true, true) : pointers.size >= 2 ? startPinch() : null;
      if (!drag) springBack();
      return;
    }
    drag = null;
    const tr = d.trail, tb = tr.length - 3, dt = tb >= 0 ? tr[tb]! - tr[0]! : 0;
    const flickable = d.moved && !(d.type === 'pan' && d.noFling) && tb >= 6 && dt >= 30 && env.now() - tr[tb]! < 50;
    if (d.type === 'rotate') {
      if (!d.moved) { if (ev.type === 'pointerup') tap(ev); return; }
      if (flickable) orbitMomentum((-(tr[tb + 1]! - tr[1]!) / dt) * ORBIT_PER_PX);   // pixels per ms to radians per ms, the same sign as the drag
      return;
    }
    if (!d.moved) { if (ev.type === 'pointerup') tap(ev); return; }
    if (flickable) {
      const vx = (tr[tb + 1]! - tr[1]!) / dt, vy = (tr[tb + 2]! - tr[2]!) / dt, sp = Math.hypot(vx, vy), cap = Math.min(1, 2 / (sp || 1));
      fling(vx * cap, vy * cap);
    } else springBack();
  };
  function tap(ev: PtrEv) {
    const now = env.now();
    // the second click of a double click zooms (and puts back whatever the first click picked); never by touch, where the first tap picks and a second would fight it
    if (!env.locked?.() && ev.pointerType !== 'touch' && lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < DOUBLE_TAP_PX) {
      const prev = lastTap.sel;
      lastTap = null;
      host.setPicked(prev);
      animZoomAt(ev.clientX, ev.clientY, ev.shiftKey ? 1 / 2 : 2);
      return;
    }
    lastTap = { t: now, x: ev.clientX, y: ev.clientY, sel: host.picked() };
    host.tap(ev.clientX, ev.clientY, ev.pointerType === 'touch');
  }
  const onContext = (ev: PtrEv) => { ev.preventDefault?.(); if (env.locked?.()) return; host.context(ev.clientX, ev.clientY, ev.pointerType === 'touch'); };
  on(el, 'pointerdown', onDown);
  on(el, 'pointermove', onMove);
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) on(el, t, onUp);
  on(el, 'contextmenu', onContext);

  return {
    get active() { return gestureOn() || wheelGlide.active || !!animId || !!orbitId || !!homeId; },
    handsOff,
    turnOff() { stopOrbitMomentum(); stopOrbitHome(); },
    refit() { handsOff(); fit = null; animateTo({ ...IDENTITY }, undefined, null); orbitToShot(); },
    animateTo(to, ms) { handsOff(); animateTo(to, ms, null); },
    zoomStep(factor) { if (env.locked?.()) return; handsOff(); const c = host.centre(); animZoomAt(c.x, c.y, factor); },
    dispose() {
      handsOff(); stopOrbitHome();
      for (const off of offs) off();
      offs.length = 0;
    },
  };
}


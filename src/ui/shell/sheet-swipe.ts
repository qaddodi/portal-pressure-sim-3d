// A phone's bottom sheet follows a vertical drag from anywhere on it and closes past a short pull (or a quick flick) down; a short one eases back (2D util.js swipeSheet, ported line for line).
// A list scrolled away from its top scrolls back first; a sideways drag, a slider and a field keep their own gestures; taps are taps. Past its own height a pull up stretches with a quarter of the
// finger. The release rules are the cards' (ease.js SHEET_FLICK_MIN/FAR, SHEET_CLOSE_PX/SHARE), and the let-go carries the finger's own speed on (carryCurve).
// What is written while the finger moves is the panel's `translate`, one number, by the clock (menu/motion.ts follow/glide: a frame is asked for only while something moves). `onClose` runs the
// moment the let-go is a close: the sheet is already sliding out of sight (data-swiped is set, and the stylesheet gives its own entrance and exit way: chrome-3d.css), so it needs no motion of its own.
// Two inputs reach it, and whichever begins a gesture owns it until it ends: pointer events of a finger or a pen (2D's), and touch events (a device or a test tool that sends only those, and the
// page's own early claim of a pull: only a touchmove can say preventDefault before the browser takes the touch for scrolling). A mouse is never a swipe (2D): a desktop window has no sheet to pull.
// @ts-ignore plain JS copied from the 2D app
import { releaseSpeed, carryCurve, cssCurve, isFlick, D_SMALL, SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE } from '../tests/copied/ease.copied.js';
import { follow, glide, type Glide } from '../menu/motion.ts';

import { clock } from '../../clock/frame.ts';
export interface SwipeOpts {
  /** the sheet is to be closed (the let-go is a close) */
  onClose(): void;
  /** a card that is a sheet only on a phone says when it is one (read at the touch) */
  enabled?(): boolean;
  /** which CSS property carries the pull: `translate` (a sheet), or `transform` for a panel whose `translate` is its own place (a popover put by placePopover) */
  prop?: 'translate' | 'transform';
}

const MOVE = 8, STRETCH = 0.25, CLICK_SWALLOW_MS = 350, AWAY_FALLBACK_MS = 700;
/** Controls that keep their own drags: sliders, fields, editable text. */
const OWN = 'input[type="range"], textarea, [contenteditable], [role="slider"], .range-wrap';

interface Grab { via: 'pointer' | 'touch'; id: number; sc: HTMLElement | null; x: number; y: number; top: boolean; more: boolean; on: boolean; dy: number; t: number; h: number; here: number; trail: [number, number][]; m: ReturnType<typeof follow> | null }

/** The pull is written as the panel's own offset and, beside it, as `--sheet-pull`: menu-motion.css clips a pulled sheet at the dock's top edge by it, so it tucks behind the timeline bar and never shows below it. */
const write = (el: HTMLElement, prop: 'translate' | 'transform' = 'translate') => (v: number) => {
  el.style[prop] = v ? (prop === 'translate' ? `0px ${v}px` : `translateY(${v}px)`) : '';
  if (v) el.style.setProperty('--sheet-pull', `${v}px`); else el.style.removeProperty('--sheet-pull');
};

/** The nearest ancestor of `target` (up to `panel`) that scrolls vertically. */
function scroller(panel: HTMLElement, target: Element): HTMLElement | null {
  for (let n: Element | null = target; n && n !== panel.parentElement; n = n.parentElement) {
    const el = n as HTMLElement;
    if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
  }
  return null;
}

/** Whether a let-go closes the sheet: a pull down past a short way (SHEET_CLOSE_PX, or its share of the sheet's height, whichever is less) or a flick. A flick is how fast the finger was going as it
 *  lifted (`speed`, px per ms down), not only the pull's average (`avg`). */
export const closes = (dy: number, speed: number, avg: number, height: number): boolean =>
  dy > 0 && (isFlick(dy, speed, avg, SHEET_FLICK_MIN, SHEET_FLICK_FAR) || dy > Math.min(SHEET_CLOSE_PX, height * SHEET_CLOSE_SHARE));

/** Wires the pull to a sheet. Returns the remover. */
export function attachSheetSwipe(panel: HTMLElement, o: SwipeOpts): () => void {
  let s: Grab | null = null, run: Glide | null = null, off = 0, swallow = 0, away: (() => void) | null = null;

  /** The sheet went away under the finger: its offset and its swiped mark are taken off once it is shut and then open again (or, if it never shut, soon). */
  const awaitReopen = () => {
    const shut = () => panel.dataset.open === 'false' || panel.classList.contains('out') || panel.classList.contains('leaving') || panel.hasAttribute('inert');
    let seenShut = shut();
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { const now = shut(); if (now) seenShut = true; else if (seenShut) clear(); });
    const clear = () => { mo?.disconnect(); clock.cancel(tm); away = null; run?.stop(); run = null; off = 0; panel.style[o.prop ?? 'translate'] = ''; panel.style.removeProperty('--sheet-pull'); delete panel.dataset.swiped; delete panel.dataset.pulled; };
    mo?.observe(panel, { attributes: true, attributeFilter: ['data-open', 'class', 'inert'] });
    const tm = clock.after(() => { if (!shut()) clear(); }, AWAY_FALLBACK_MS);   // (a close that did not happen: the sheet comes back)
    away = clear;
  };

  const down = (via: 'pointer' | 'touch', id: number, x: number, y: number, t: Element | null) => {
    s = null;
    if (!t || (o.enabled && !o.enabled()) || t.closest(OWN)) return;
    // (where the sheet stands and how tall it is, read at the touch, never in the moves that follow)
    const sc = scroller(panel, t);
    s = { via, id, sc, x, y, top: !sc || sc.scrollTop <= 0, more: !!sc && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1, on: false, dy: 0, t: 0, h: panel.offsetHeight, here: run ? off : 0, trail: [], m: null };
  };
  /** The page must not scroll under the sheet once it follows the finger, and a pull down from the top of a list is claimed at its first move: true when the move is the sheet's to claim. */
  const claims = (x: number, y: number): boolean => {
    if (!s) return false;
    if (s.on) return true;
    const dx = x - s.x, dy = y - s.y;
    return Math.abs(dy) >= Math.abs(dx) && ((dy > 0 && s.top) || (dy < 0 && !s.more));
  };
  const move = (x: number, y: number, pointerId?: number) => {
    if (!s || (pointerId !== undefined && pointerId !== s.id)) return;
    const dx = x - s.x, dy = y - s.y;
    if (!s.on) {
      if (Math.hypot(dx, dy) < MOVE) return;
      // A pull down from the top, or a pull up with nothing more to scroll, is the sheet's; a sideways drag or a list's scroll is not.
      const mine = Math.abs(dy) > Math.abs(dx) && ((dy > 0 && s.top) || (dy < 0 && !s.more));
      if (!mine) { s = null; return; }
      // (caught while it is still easing back: the pull carries on from where the sheet is, with no jump)
      if (run) { s.here = off; run.stop(); run = null; }
      s.on = true; s.y = y - s.here; s.t = clock.now();
      panel.dataset.pulling = '1'; panel.dataset.pulled = '1';   // (the stylesheet's entrance, if it is still playing, gives way to the finger: pulled stays, so it is not played again when the finger lets go)
      s.m = follow(write(panel, o.prop), 'sheet-swipe');
      s.m.set(s.here);
      if (s.via === 'pointer') { try { panel.setPointerCapture(s.id); } catch { /* the touch is gone */ } }
    }
    const raw = y - s.y;
    s.dy = raw >= 0 ? raw : raw * STRETCH;   // (past its own height a pull up stretches with resistance, as a card does past Full)
    s.trail.push([clock.now(), y]); if (s.trail.length > 8) s.trail.shift();
    off = s.dy; s.m!.set(s.dy);
  };
  const end = () => {
    const g = s;
    s = null;
    if (!g?.on) return;
    swallow = clock.now() + CLICK_SWALLOW_MS;
    g.m?.flush(); g.m?.stop();
    const speed: number = releaseSpeed(g.trail, clock.now());   // (px per ms down, as the finger lifted: the settle starts at that speed)
    const gone = closes(g.dy, speed, g.dy / Math.max(1, clock.now() - g.t), g.h);
    const to = gone ? g.h + 8 : 0, from = g.dy, w = write(panel, o.prop);
    if (gone) { panel.dataset.swiped = '1'; awaitReopen(); }
    const curve = cssCurve(carryCurve(speed, to - from, D_SMALL) as string) as (u: number) => number;
    run = glide({ ms: D_SMALL, curve, tag: 'sheet-swipe', apply: (k) => { off = from + (to - from) * k; w(off); }, done: () => { run = null; if (!gone) { off = 0; w(0); delete panel.dataset.pulling; } } });
    if (gone) { delete panel.dataset.pulling; o.onClose(); }
  };

  // pointer events: a finger or a pen (a mouse is no swipe); a gesture the touch events began is theirs
  const onPDown = (e: PointerEvent) => { if (e.pointerType === 'mouse' || !e.isPrimary) return; down('pointer', e.pointerId, e.clientX, e.clientY, e.target as Element | null); };
  const onPMove = (e: PointerEvent) => { if (s?.via === 'pointer') move(e.clientX, e.clientY, e.pointerId); };
  const onPEnd = (e: PointerEvent) => { if (s?.via === 'pointer' && e.pointerId === s.id) end(); };
  const onLost = (e: PointerEvent) => { if (e.target === panel && s?.via === 'pointer' && e.pointerId === s.id) end(); };
  // touch events: the same gesture for a source that sends them alone, and the early claim (preventDefault) that keeps the browser from scrolling the page under a pull
  const onTStart = (e: TouchEvent) => {
    if (s || e.touches.length !== 1) return;   // (a finger's pointer events came first: that gesture is theirs, the touch events only claim it)
    const t = e.touches[0]!;
    down('touch', t.identifier, t.clientX, t.clientY, e.target as Element | null);
  };
  const onTMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!s || !t) return;
    // (a pointer sequence of the same finger is moving the sheet already: it only needs the claim)
    if (s.via === 'touch') move(t.clientX, t.clientY);
    if (e.cancelable && claims(t.clientX, t.clientY)) e.preventDefault();
  };
  const onTEnd = () => { if (s?.via === 'touch') end(); };
  // (the click a drag's release makes is not a tap: swallowed if it comes within 350 ms)
  const onClick = (e: MouseEvent) => { if (clock.now() < swallow) { swallow = 0; e.stopPropagation(); e.preventDefault(); } };

  panel.addEventListener('pointerdown', onPDown, { passive: true });
  panel.addEventListener('pointermove', onPMove);
  panel.addEventListener('pointerup', onPEnd);
  panel.addEventListener('pointercancel', onPEnd);
  panel.addEventListener('lostpointercapture', onLost);
  panel.addEventListener('touchstart', onTStart, { passive: true });
  panel.addEventListener('touchmove', onTMove, { passive: false });
  panel.addEventListener('touchend', onTEnd, { passive: true });
  panel.addEventListener('touchcancel', onTEnd, { passive: true });
  panel.addEventListener('click', onClick, true);
  return () => {
    panel.removeEventListener('pointerdown', onPDown); panel.removeEventListener('pointermove', onPMove); panel.removeEventListener('pointerup', onPEnd); panel.removeEventListener('pointercancel', onPEnd);
    panel.removeEventListener('lostpointercapture', onLost); panel.removeEventListener('touchstart', onTStart); panel.removeEventListener('touchmove', onTMove);
    panel.removeEventListener('touchend', onTEnd); panel.removeEventListener('touchcancel', onTEnd); panel.removeEventListener('click', onClick, true);
    run?.stop(); s?.m?.stop(); away?.(); panel.style[o.prop ?? 'translate'] = ''; panel.style.removeProperty('--sheet-pull'); delete panel.dataset.pulling; delete panel.dataset.swiped; delete panel.dataset.pulled;
  };
}

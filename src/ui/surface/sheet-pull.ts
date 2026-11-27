// The one pull of a panel's phone sheet (menu unification, stage 3: reports/menu-unification.md 3.2 "Sheet mode"; approved decision 4: Peek, Half and Full for every phone
// panel). Generalised from the Tests card's own (2D dock-sheet.js sheetBehaviour): a vertical drag from the head, the grab bar or anywhere in the sheet that is not a field
// moves the sheet with the finger; on release it settles at Peek, Half or Full, or closes (sheet-release.ts releaseTo: the rules every sheet over the thumb dock shares).
// Tests, Treat, History, Compare, Why, the action card and the case's stop card all wire this one; their heights come from the one stops function (sheet-stops.ts).
// While the finger moves only the sheet's `translate` is written (one number, by the clock: menu/motion.ts follow and glide); the sheet takes its new height once, on
// release, with the offset that keeps its edge where the finger left it easing back to zero (one layout at the end, never one per frame).
// A sheet pulled shut has already sunk out of sight by the time it closes, so its close plays nothing of its own: `data-swiped` is set on the box for that close (the
// stylesheets give it no transition, sheet-swipe.css), and taken off once the sheet has shut and opened again, so the next close is the usual one.
// The sheet's tail (--sheet-tail): extra sheet below its foot, so that a sheet lifted off its foot (a pull up, or a sheet that has just shrunk and eases down) never shows a
// gap under it; each sheet's stylesheet draws it (tests.css, surface/sheet.css).
// @ts-ignore plain JS copied from the 2D app
import { releaseSpeed, carryCurve, cssCurve, D_SMALL, EASE_ARRIVE } from '../tests/copied/ease.copied.js';
import { follow, glide, type Glide } from '../menu/motion.ts';
import { readStyle } from '../layout-snap.ts';
import { clock } from '../../clock/frame.ts';
import { releaseTo } from './sheet-release.ts';
import type { Detent } from './sheet-stops.ts';

export type { Detent } from './sheet-stops.ts';
export { sheetStops, stopsFor, stopVars, PEEK_H } from './sheet-stops.ts';
export { releaseTo, grabStep } from './sheet-release.ts';

export interface PullApi {
  /** the sheet is a sheet now (surface/mode.ts) and open: read at the touch */
  enabled(): boolean;
  /** read at the touch: the sheet's height now (h0), its Full and Peek (and Half, where the sheet knows it before it is laid out there), and the stop it stands at */
  heights(): { h0: number; full: number; peek: number; half?: number; at: Detent };
  /**
   * Takes the new stop in this task (the sheet is laid out once, at it). `curve` is the ease its edge settles on (the pictures in it may take it too). Returns the sheet's height
   * there when it reads it (the pull then eases the edge from where the finger left it); null when the sheet eases its own height (its box does not change); nothing to take
   * the height from heights().
   */
  setSize(to: Detent, curve: (u: number) => number): number | null | void;
  /** closes the sheet in this task (the box already carries `data-swiped`); a sheet with none is never closed by a pull, it rests at Peek */
  close?(): void;
  /** the frame tag (?perf names it) */
  tag?: string;
}

// Controls that keep their own drags: fields, sliders, an editable text.
const FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), select, textarea, [role="slider"], [contenteditable], .range-wrap, .stent-editor';
// The scrolling box under the finger, if there is one (2D dock-sheet.js scroller): a pull that starts in content scrolled away from its top scrolls it back first, it never moves the sheet.
const scroller = (t: Element, card: HTMLElement): HTMLElement | null => {
  for (let n: Element | null = t; n && n !== card; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(readStyle(n).overflowY)) return n as HTMLElement;
  }
  return null;
};
const MOVE = 6, RUBBER = 60, CLICK_SWALLOW_MS = 350, AWAY_FALLBACK_MS = 700;
const ty = (el: HTMLElement) => (v: number) => { el.style.translate = v ? `0px ${v}px` : ''; };
const TAIL = '--sheet-tail';
const tail = (el: HTMLElement, px: number) => { if (px > 0) el.style.setProperty(TAIL, `${Math.ceil(px)}px`); else el.style.removeProperty(TAIL); };

/** The sheet went away under the finger: its swiped mark comes off once it has shut and opened again (or, if it never shut, soon). */
function awaitReopen(pos: HTMLElement): void {
  const shut = () => pos.dataset.open === 'false' || pos.hasAttribute('inert') || pos.hidden;
  let seenShut = shut();
  const clear = () => { mo?.disconnect(); clock.cancel(tm); delete pos.dataset.swiped; };
  const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { const now = shut(); if (now) seenShut = true; else if (seenShut) clear(); });
  mo?.observe(pos, { attributes: true, attributeFilter: ['data-open', 'inert', 'hidden'] });
  // (a close that did not happen: the sheet comes back as it is)
  const tm = clock.after(() => { if (!shut()) clear(); }, AWAY_FALLBACK_MS);
}

/** Wires the pull to the sheet (`card`, what the finger is on) and the box that moves (`pos`, the same element for most sheets). Returns the remover. */
export function attachSheetPull(card: HTMLElement, pos: HTMLElement, api: PullApi): () => void {
  const tag = api.tag ?? 'sheet-pull';
  type H = ReturnType<PullApi['heights']>;
  type St = {
    id: number; x: number; y: number; t0: number; moved: boolean; dy: number; h: H; sc: HTMLElement | null; scTop: number;
    trail: [number, number][]; m: ReturnType<typeof follow> | null; carry: number;
  };
  let st: St | null = null, run: Glide | null = null, swallow = 0, off = 0;
  // The pull runs on pointer events (a finger, a pen, a mouse, and what a test dispatches to stand for one), as 2D's dock-sheet.js does;
  // a touch's own `touchmove` only claims the gesture from the page.
  const onDown = (e: PointerEvent) => {
    if (st || !api.enabled() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = e.target as Element | null;
    if (!t || t.closest(FIELDS)) return;
    const h = api.heights(), sc = scroller(t, card);
    const carry = run ? off : 0;
    if (run) { run.stop(); run = null; }
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: clock.now(), moved: false, dy: 0, h, sc, scTop: sc ? sc.scrollTop : 0, trail: [], m: null, carry };
  };
  // A pull down from anywhere on the sheet, its content at the top, is claimed by the touch's first move, before 6 px: iOS hands a pull on scrollable content to the page and cancels the
  // touch before then, and the sheet would never follow. Once the sheet follows the finger the page never scrolls under it. (2D dock-sheet.js touchmove.)
  const onTouchMove = (e: TouchEvent) => {
    const s = st;
    if (!s || !e.cancelable) return;
    if (s.moved) { e.preventDefault(); return; }
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (dy > 0 && dy >= Math.abs(dx) && !(s.sc && s.scTop > 0)) e.preventDefault();
  };
  // (the room the sheet may follow the finger up: to Full, from wherever it stands)
  const upRoom = (h: H) => (h.at === 'full' ? 0 : Math.max(0, h.full - h.h0));
  const onMove = (e: PointerEvent) => {
    const s = st;
    if (!s || e.pointerId !== s.id) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { end(e); return; }
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.moved) {
      if (Math.hypot(dx, dy) < MOVE) return;
      // (sideways: the swipe between the tabs)
      if (Math.abs(dx) > Math.abs(dy)) { st = null; return; }
      // (the content scrolls: scrolled away from its top, or up at Full)
      if (s.sc && (s.scTop > 0 || (dy < 0 && s.h.at === 'full'))) { st = null; return; }
      s.moved = true; s.m = follow(ty(pos), tag);
      tail(pos, upRoom(s.h) + RUBBER - Math.min(0, s.carry));
      try { card.setPointerCapture(e.pointerId); } catch { /* (a pointer that is not down: nothing to capture) */ }
    }
    s.dy = dy;
    s.trail.push([clock.now(), e.clientY]); if (s.trail.length > 8) s.trail.shift();
    // (the sheet follows the finger, up to the room Full gives and down to its own height; past either it gives a quarter)
    const room = upRoom(s.h), d = s.carry + dy, h0 = s.h.h0;
    off = d < -room ? -room + (d + room) * 0.25 : d > h0 ? h0 + (d - h0) * 0.25 : d;
    s.m!.set(off);
  };
  const end = (e?: PointerEvent) => {
    const s = st;
    if (!s || (e && e.pointerId !== s.id)) return;
    st = null;
    if (!s.moved) return;
    swallow = clock.now() + CLICK_SWALLOW_MS;
    s.m?.flush(); s.m?.stop();
    // (px per ms down, as the finger lifted)
    const speed: number = releaseSpeed(s.trail, clock.now());
    const dy = s.dy + s.carry, h = s.h, from = h.at;
    const to = releaseTo({ from, dy, speed, avg: dy / Math.max(1, clock.now() - s.t0), h0: h.h0, peek: h.peek, closable: !!api.close });
    const cur = off, w = ty(pos);
    const settle = (target: number, then: () => void) => {
      const curve = cssCurve(carryCurve(speed, target - cur, D_SMALL) as string) as (u: number) => number;
      run = glide({ ms: D_SMALL, curve, tag, apply: (k) => { off = cur + (target - cur) * k; w(off); }, done: () => { run = null; off = 0; then(); } });
    };
    // (it has sunk out of sight: it closes with nothing of its own to play, then the offset goes, so the sheet is never seen back in its place)
    if (to === 'close') { settle(h.h0 + 8, () => { pos.dataset.swiped = ''; api.close?.(); pos.style.translate = ''; tail(pos, 0); awaitReopen(pos); }); return; }
    if (to === from) { settle(0, () => { pos.style.translate = ''; tail(pos, 0); }); return; }
    // the sheet takes its new height now; its edge stays where the finger left it and eases to its place
    const known = to === 'full' ? h.full : to === 'peek' ? h.peek : h.half ?? h.h0;
    const curveOf = (dist: number) => cssCurve(carryCurve(speed, dist, D_SMALL) as string) as (u: number) => number;
    const guess = cur + (known - h.h0);
    const got = api.setSize(to, curveOf(-guess));
    // (null: the sheet eases its own height and its box stands still, so only the finger's offset eases back)
    const start = got === null ? cur : cur + ((typeof got === 'number' ? got : known) - h.h0);
    // (a sheet that shrinks lifts off its foot by -start: the tail keeps its surface down to the edge until it has eased in)
    tail(pos, -start + 1);
    const curve = curveOf(-start);
    pos.style.translate = start ? `0px ${start}px` : '';
    off = start;
    run = glide({ ms: D_SMALL, curve, tag, apply: (k) => { off = start * (1 - k); w(off); }, done: () => { run = null; off = 0; pos.style.translate = ''; tail(pos, 0); } });
  };
  // (The click a drag's release makes is not a tap: swallowed if it comes within 350 ms.)
  const onClick = (e: MouseEvent) => { if (clock.now() < swallow) { swallow = 0; e.stopPropagation(); e.preventDefault(); } };
  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
  // (Not a child's: a touch is first captured by what is under the finger (a tab, a chart), and handing the capture to the sheet at 6 px makes that one lose it, an event that bubbles up
  //  here and would end the pull at once. 2D dock-sheet.js: `e.target === el`.)
  const onLost = (e: PointerEvent) => { if (e.target === card) end(e); };
  card.addEventListener('lostpointercapture', onLost);
  card.addEventListener('touchmove', onTouchMove, { passive: false });
  card.addEventListener('click', onClick, true);
  return () => {
    card.removeEventListener('pointerdown', onDown); card.removeEventListener('pointermove', onMove);
    card.removeEventListener('pointerup', end); card.removeEventListener('pointercancel', end); card.removeEventListener('lostpointercapture', onLost);
    card.removeEventListener('touchmove', onTouchMove); card.removeEventListener('click', onClick, true);
    run?.stop(); st?.m?.stop(); pos.style.translate = ''; tail(pos, 0);
  };
}

/** The grab bar was tapped (sheet-release.ts grabStep): the sheet has taken its new height; its edge, `from` px from where it settles (the new height less the old), eases there. */
export function easeBack(pos: HTMLElement, from: number, tag = 'sheet-pull'): Glide {
  pos.style.translate = from ? `0px ${from}px` : '';
  tail(pos, -from + 1);
  const f = cssCurve(EASE_ARRIVE) as (u: number) => number, w = ty(pos);
  return glide({ ms: D_SMALL, curve: f, tag, apply: (k) => w(from * (1 - k)), done: () => { pos.style.translate = ''; tail(pos, 0); } });
}

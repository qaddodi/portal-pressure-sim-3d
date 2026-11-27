// The phone's sheet is pulled, flicked and settled (2D dock-sheet.js sheetBehaviour, the Tests card's part): a vertical drag from the head, the grab handle or anywhere in the card that is not a field
// moves the card with the finger; on release it settles at Half or Full, or closes. From Full a pull down always settles at Half (only a second pull, from Half, closes the card: past a short way or a
// quick flick; ONE pull from Half closes it, as 2D's does: owner, 20 Nov 2026, "close in one pull", replacing the stop at Peek); a pull up from Half goes to Full past 40 px or on a flick. The grab handle's tap steps
// Half, Full, Half. The same rules as every sheet over the thumb dock (ease.js SHEET_*).
// A card pulled shut has already sunk out of sight by the time it closes, so its close plays nothing of its own (2D sheet-hold: `dataset.swiped`): `data-swiped` is set on the box for that close (tests.css), or the card
// would jump back to its place at full strength and only then fade.
// While the finger moves only the card's `translate` is written (a number, by the clock); the card takes its new height once, on release, with the offset that keeps its edge where the finger left it
// easing back to zero (the 2D box is laid out once for the gesture and its content held by an offset: this lands the same picture with one layout at the end).
// @ts-ignore plain JS copied from the 2D app
import { releaseSpeed, carryCurve, cssCurve, isFlick, D_SMALL, EASE_ARRIVE, SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE } from '../copied/ease.copied.js';
import { follow, glide, type Glide } from '../../menu/motion.ts';

import { clock } from '../../../clock/frame.ts';
export interface PullApi {
  /** a phone's sheet over the thumb dock */
  enabled(): boolean;
  /** the card's height now and at its two stops, and which it stands at */
  heights(): { h0: number; half: number; full: number; peek: number; size: 0 | 1 | 2 };
  /** takes the new height in this task (the card is laid out once, at it); `curve` is the ease the card's edge settles on, which the pictures in it take too (figure-glide.ts) */
  setSize(n: 0 | 1 | 2, curve?: (u: number) => number): void;
  /** closes the card in this task (the box already carries `data-swiped`, so it plays no leave of its own) */
  close(): void;
}

// Controls that keep their own drags: fields, sliders, an editable text.
const FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), select, textarea, [role="slider"], [contenteditable], .range-wrap, .stent-editor';
// The scrolling box under the finger, if there is one (2D dock-sheet.js scroller): a pull that starts in content scrolled away from its top scrolls it back first, it never moves the card.
const scroller = (t: Element, card: HTMLElement): HTMLElement | null => {
  for (let n: Element | null = t; n && n !== card; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return n as HTMLElement;
  }
  return null;
};
const MOVE = 6, FLICK_UP = -0.5, FAR_UP = 40, STAY_FULL = 40, PEEK_UP = 24;
const ty = (el: HTMLElement) => (v: number) => { el.style.translate = v ? `0px ${v}px` : ''; };
/** The card's tail (tests.css): extra card below its foot, so that a card lifted off the screen's edge (a pull up from Half, a card that has just shrunk and eases down) never shows a gap under it. */
const TAIL = '--sheet-tail', RUBBER = 60;
const tail = (el: HTMLElement, px: number) => { if (px > 0) el.style.setProperty(TAIL, `${Math.ceil(px)}px`); else el.style.removeProperty(TAIL); };

/** Wires the pull to the card (`card`) and the box that moves (`pos`). Returns the remover. */
export function attachPull(card: HTMLElement, pos: HTMLElement, api: PullApi): () => void {
  type St = { id: number; x: number; y: number; t0: number; moved: boolean; dy: number; h0: number; half: number; full: number; peek: number; size: 0 | 1 | 2; sc: HTMLElement | null; scTop: number; trail: [number, number][]; m: ReturnType<typeof follow> | null; carry: number };
  let st: St | null = null, run: Glide | null = null, swallow = 0, off = 0;
  // The pull runs on pointer events (a finger, a pen, a mouse, and what a test dispatches to stand for one), as 2D's dock-sheet.js does; a touch's own `touchmove` only claims the gesture from the page (below).
  const onDown = (e: PointerEvent) => {
    if (st || !api.enabled() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = e.target as Element | null;
    if (!t || t.closest(FIELDS)) return;
    const h = api.heights(), sc = scroller(t, card);
    const carry = run ? off : 0;
    if (run) { run.stop(); run = null; }
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: clock.now(), moved: false, dy: 0, h0: h.h0, half: h.half, full: h.full, peek: h.peek, size: h.size, sc, scTop: sc ? sc.scrollTop : 0, trail: [], m: null, carry };
  };
  // A pull down from anywhere on the card, its content at the top, is claimed by the touch's first move, before 6 px: iOS hands a pull on scrollable content to the page and cancels the
  // touch before then, and the card would never follow. Once the card follows the finger the page never scrolls under it. (2D dock-sheet.js touchmove.)
  const onTouchMove = (e: TouchEvent) => {
    const s = st;
    if (!s || !e.cancelable) return;
    if (s.moved) { e.preventDefault(); return; }
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (dy > 0 && dy >= Math.abs(dx) && !(s.sc && s.scTop > 0)) e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    const s = st;
    if (!s || e.pointerId !== s.id) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { end(e); return; }
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.moved) {
      if (Math.hypot(dx, dy) < MOVE) return;
      if (Math.abs(dx) > Math.abs(dy)) { st = null; return; }   // (sideways: the swipe between the tabs)
      if (s.sc && (s.scTop > 0 || (dy < 0 && s.size === 1))) { st = null; return; }   // (the content scrolls: scrolled away from its top, or up at Full)
      s.moved = true; s.m = follow(ty(pos), 'tests-pull');
      tail(pos, (s.size === 0 ? s.full - s.h0 : s.size === 2 ? s.half - s.h0 : 0) + RUBBER - Math.min(0, s.carry));
      try { card.setPointerCapture(e.pointerId); } catch { /* (a pointer that is not down: nothing to capture) */ }
    }
    s.dy = dy;
    s.trail.push([clock.now(), e.clientY]); if (s.trail.length > 8) s.trail.shift();
    // (the card follows the finger, up to the room Full gives and down to its own height; past either it gives a quarter)
    const room = s.size === 0 ? s.full - s.h0 : s.size === 2 ? s.half - s.h0 : 0, d = s.carry + dy;
    off = d < -room ? -room + (d + room) * 0.25 : d > s.h0 ? s.h0 + (d - s.h0) * 0.25 : d;
    s.m!.set(off);
  };
  const end = (e?: PointerEvent) => {
    const s = st;
    if (!s || (e && e.pointerId !== s.id)) return;
    st = null;
    if (!s.moved) return;
    swallow = clock.now() + 350;
    s.m?.flush(); s.m?.stop();
    const speed: number = releaseSpeed(s.trail, clock.now());   // (px per ms down)
    const dy = s.dy + s.carry, from = s.size;
    let to: 0 | 1 | 2 | 'close' = from;
    const flick = dy > 0 && isFlick(dy, speed, dy / Math.max(1, clock.now() - s.t0), SHEET_FLICK_MIN, SHEET_FLICK_FAR);
    if (dy > 0) {
      if (from === 1) to = dy > STAY_FULL ? 0 : 1;   // (From Full a pull down settles at Half)
      else to = flick || dy > Math.min(SHEET_CLOSE_PX, s.h0 * SHEET_CLOSE_SHARE) ? 'close' : from;   // (From Half: one pull or flick closes it, 2D's rule; a short pull eases back)
    } else if (dy < 0) {
      if (from === 0) to = -dy > FAR_UP || speed < FLICK_UP ? 1 : 0;
      else if (from === 2) to = -dy > PEEK_UP || speed < FLICK_UP ? 0 : 2;   // (From Peek up to Half; a long pull goes on to Full at the next one)
    }
    const cur = off;
    const settle = (target: number, then: () => void) => {
      const curve = cssCurve(carryCurve(speed, target - cur, D_SMALL) as string) as (u: number) => number, w = ty(pos);
      run = glide({ ms: D_SMALL, curve, tag: 'tests-pull', apply: (k) => { off = cur + (target - cur) * k; w(off); }, done: () => { run = null; off = 0; then(); } });
    };
    // (it has sunk out of sight: it closes with nothing of its own to play, then the offset goes, so the card is never seen back in its place)
    if (to === 'close') { settle(s.h0 + 8, () => { pos.dataset.swiped = ''; api.close(); pos.style.translate = ''; tail(pos, 0); }); return; }
    if (to === from) { settle(0, () => { pos.style.translate = ''; tail(pos, 0); }); return; }
    // the card takes its new height now; its edge stays where the finger left it and eases to its place
    const target = to === 1 ? s.full : to === 2 ? s.peek : s.half;
    const start = cur + (target - s.h0);
    tail(pos, -start + 1);   // (a card that shrinks lifts off the foot of the screen by -start: the tail keeps its surface down to the edge until it has eased in)
    const curve = cssCurve(carryCurve(speed, -start, D_SMALL) as string) as (u: number) => number, w = ty(pos);
    api.setSize(to, curve);
    pos.style.translate = start ? `0px ${start}px` : '';
    off = start;
    run = glide({ ms: D_SMALL, curve, tag: 'tests-pull', apply: (k) => { off = start * (1 - k); w(off); }, done: () => { run = null; off = 0; pos.style.translate = ''; tail(pos, 0); } });
  };
  // (The click a drag's release makes is not a tap: swallowed if it comes within 350 ms.)
  const onClick = (e: MouseEvent) => { if (clock.now() < swallow) { swallow = 0; e.stopPropagation(); e.preventDefault(); } };
  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
  // (Not a child's: a touch is first captured by what is under the finger (a tab, a chart), and handing the capture to the card at 6 px makes that one lose it, an event that bubbles up here
  //  and would end the pull at once. 2D dock-sheet.js: `e.target === el`.)
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

/** The sheet's grab handle was tapped (Half to Full or back): the card has taken its new height; its edge, `from` px from where it settles, eases there (the same ease a pull's release takes). */
export function easeBack(pos: HTMLElement, from: number): Glide {
  pos.style.translate = from ? `0px ${from}px` : '';
  tail(pos, -from + 1);
  const f = cssCurve(EASE_ARRIVE) as (u: number) => number, w = ty(pos);
  return glide({ ms: D_SMALL, curve: f, tag: 'tests-pull', apply: (k) => w(from * (1 - k)), done: () => { pos.style.translate = ''; tail(pos, 0); } });
}

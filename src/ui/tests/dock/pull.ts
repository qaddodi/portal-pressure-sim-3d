// The phone's sheet is pulled, flicked and settled (2D dock-sheet.js sheetBehaviour, the Tests card's part): a vertical drag from the head, the grab handle or anywhere in the card that is not a field
// moves the card with the finger; on release it settles at Half or Full, or closes. From Full a pull down always settles at Half (only a second pull from Half closes the card: past a short way or a
// quick flick); a pull up from Half goes to Full past 40 px or on a flick. The grab handle's tap steps Half, Full, Half. The same rules as every sheet over the thumb dock (ease.js SHEET_*).
// While the finger moves only the card's `translate` is written (a number, by the clock); the card takes its new height once, on release, with the offset that keeps its edge where the finger left it
// easing back to zero (the 2D box is laid out once for the gesture and its content held by an offset: this lands the same picture with one layout at the end).
// @ts-ignore plain JS copied from the 2D app
import { releaseSpeed, carryCurve, cssCurve, isFlick, D_SMALL, EASE_ARRIVE, SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE } from '../copied/ease.copied.js';
import { follow, glide, type Glide } from '../../menu/motion.ts';

export interface PullApi {
  /** a phone's sheet over the thumb dock */
  enabled(): boolean;
  /** the card's height now and at its two stops, and which it stands at */
  heights(): { h0: number; half: number; full: number; size: 0 | 1 };
  /** takes the new height in this task (the card is laid out once, at it) */
  setSize(n: 0 | 1): void;
  close(): void;
}

// Controls that keep their own drags: fields, sliders, an editable text.
const FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), select, textarea, [role="slider"], [contenteditable], .range-wrap, .stent-editor';
const MOVE = 6, FLICK_UP = -0.5, FAR_UP = 40, STAY_FULL = 40;
const ty = (el: HTMLElement) => (v: number) => { el.style.translate = v ? `0px ${v}px` : ''; };

/** Wires the pull to the card (`card`) and the box that moves (`pos`). Returns the remover. */
export function attachPull(card: HTMLElement, pos: HTMLElement, api: PullApi): () => void {
  type St = { x: number; y: number; t0: number; moved: boolean; dy: number; h0: number; half: number; full: number; size: 0 | 1; trail: [number, number][]; m: ReturnType<typeof follow> | null; carry: number };
  let st: St | null = null, run: Glide | null = null, swallow = 0, off = 0;
  const onDown = (e: TouchEvent) => {
    if (st || e.touches.length !== 1 || !api.enabled()) return;
    const t = e.target as Element | null;
    if (!t || t.closest(FIELDS)) return;
    const h = api.heights();
    const carry = run ? off : 0;
    if (run) { run.stop(); run = null; }
    st = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY, t0: performance.now(), moved: false, dy: 0, h0: h.h0, half: h.half, full: h.full, size: h.size, trail: [], m: null, carry };
  };
  const onMove = (e: TouchEvent) => {
    const s = st;
    if (!s) return;
    const t = e.touches[0]!, dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.moved) {
      if (Math.hypot(dx, dy) < MOVE) return;
      if (Math.abs(dx) > Math.abs(dy)) { st = null; return; }   // (sideways: the swipe between the tabs)
      s.moved = true; s.m = follow(ty(pos), 'tests-pull');
    }
    if (e.cancelable) e.preventDefault();
    s.dy = dy;
    s.trail.push([performance.now(), t.clientY]); if (s.trail.length > 8) s.trail.shift();
    // (the card follows the finger, up to the room Full gives and down to its own height; past either it gives a quarter)
    const room = s.size === 0 ? s.full - s.h0 : 0, d = s.carry + dy;
    off = d < -room ? -room + (d + room) * 0.25 : d > s.h0 ? s.h0 + (d - s.h0) * 0.25 : d;
    s.m!.set(off);
  };
  const end = () => {
    const s = st; st = null;
    if (!s?.moved) return;
    swallow = performance.now() + 350;
    s.m?.flush(); s.m?.stop();
    const speed: number = releaseSpeed(s.trail, performance.now());   // (px per ms down)
    const dy = s.dy + s.carry, from = s.size;
    let to: 0 | 1 | 'close' = from;
    if (dy > 0) {
      if (from === 1) to = dy > STAY_FULL ? 0 : 1;
      else {
        const flick = isFlick(dy, speed, dy / Math.max(1, performance.now() - s.t0), SHEET_FLICK_MIN, SHEET_FLICK_FAR);
        to = flick || dy > Math.min(SHEET_CLOSE_PX, s.h0 * SHEET_CLOSE_SHARE) ? 'close' : 0;
      }
    } else if (dy < 0 && from === 0) to = -dy > FAR_UP || speed < FLICK_UP ? 1 : 0;
    const cur = off;
    const settle = (target: number, then: () => void) => {
      const curve = cssCurve(carryCurve(speed, target - cur, D_SMALL) as string) as (u: number) => number, w = ty(pos);
      run = glide({ ms: D_SMALL, curve, tag: 'tests-pull', apply: (k) => { off = cur + (target - cur) * k; w(off); }, done: () => { run = null; off = 0; then(); } });
    };
    if (to === 'close') { settle(s.h0 + 8, () => { api.close(); pos.style.translate = ''; }); return; }
    if (to === from) { settle(0, () => { pos.style.translate = ''; }); return; }
    // the card takes its new height now; its edge stays where the finger left it and eases to its place
    const target = to === 1 ? s.full : s.half;
    api.setSize(to);
    const start = cur + (target - s.h0);
    pos.style.translate = start ? `0px ${start}px` : '';
    off = start;
    const curve = cssCurve(carryCurve(speed, -start, D_SMALL) as string) as (u: number) => number, w = ty(pos);
    run = glide({ ms: D_SMALL, curve, tag: 'tests-pull', apply: (k) => { off = start * (1 - k); w(off); }, done: () => { run = null; off = 0; pos.style.translate = ''; } });
  };
  // (The click a drag's release makes is not a tap: swallowed if it comes within 350 ms.)
  const onClick = (e: MouseEvent) => { if (performance.now() < swallow) { swallow = 0; e.stopPropagation(); e.preventDefault(); } };
  card.addEventListener('touchstart', onDown, { passive: true });
  card.addEventListener('touchmove', onMove, { passive: false });
  card.addEventListener('touchend', end, { passive: true });
  card.addEventListener('touchcancel', end, { passive: true });
  card.addEventListener('click', onClick, true);
  return () => {
    card.removeEventListener('touchstart', onDown); card.removeEventListener('touchmove', onMove);
    card.removeEventListener('touchend', end); card.removeEventListener('touchcancel', end); card.removeEventListener('click', onClick, true);
    run?.stop(); st?.m?.stop(); pos.style.translate = '';
  };
}

/** The sheet's grab handle was tapped (Half to Full or back): the card has taken its new height; its edge, `from` px from where it settles, eases there (the same ease a pull's release takes). */
export function easeBack(pos: HTMLElement, from: number): Glide {
  pos.style.translate = from ? `0px ${from}px` : '';
  const f = cssCurve(EASE_ARRIVE) as (u: number) => number, w = ty(pos);
  return glide({ ms: D_SMALL, curve: f, tag: 'tests-pull', apply: (k) => w(from * (1 - k)), done: () => { pos.style.translate = ''; } });
}

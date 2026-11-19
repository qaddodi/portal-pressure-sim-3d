// A page pushed over a sheet's own content, moved by the finger and by the frame clock (2D page-push.js, ported line for line; the one mover of Settings' pages, History and Help): the page
// slides in from the right over what it covers, which slides back a third as far and fades; a swipe right from anywhere on the page takes it with the finger, one number (how far it stands
// from home, px) written each frame the page's glide runs and on each move of the finger, and a let-go carries the finger's speed on (a flick, or a pull past SHEET_CLOSE_PX /
// SHEET_CLOSE_SHARE of the page's width, goes back; a short pull comes home) as the sheets' own do. It moves by `transform` (never `translate`, which a sheet's own ride writes), and what it
// covers by `transform` and `opacity`; written by the clock (menu/motion.ts), never by a timer. A sideways drag only: a vertical one scrolls the page's list (touch-action: pan-y).
// @ts-ignore plain JS copied from the 2D app
import { easeArrive, carried, settleSlope, releaseSpeed, isFlick, D_SMALL, CARRY_MAX, SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE } from '../tests/copied/ease.copied.js';
import { follow, glide, type Glide } from '../menu/motion.ts';
import { reduced } from '../a11y/motion.ts';

export const PAGE_AWAY = 0.3;   // (how far, as a share of the page's width, what it covers slides back as the page comes in)

export interface Push { pop(v?: number): void; at(): number; popped(): boolean; dispose(): void }

/** The settle's length: a short way home is quicker (2D run()). */
export const settleMs = (dist: number, W: number) => Math.round(D_SMALL * (0.5 + 0.5 * Math.min(1, Math.abs(dist) / W)));

/**
 * page: the page, already in the sheet; away: what it covers (put out of reach by the caller); width: how wide the page is (read once, in the tap, by the caller).
 * onPop(): the back has begun (the caller makes what it covers interactive); onGone(): the page is home away. Returns { pop(v), at() }: pop goes back (v: the finger's speed along +x, px per ms; 0
 * for a tap), at() is how far the page stands from home (0 open .. width gone).
 */
export function pushPage(page: HTMLElement, away: HTMLElement[], width: number, { onPop, onGone }: { onPop?(): void; onGone?(): void } = {}): Push {
  const W = Math.max(1, width), still = reduced();
  let x = W, popped = false;
  let s: { id: number; x: number; y: number; on: boolean; trail: [number, number][]; t: number; dx: number } | null = null;
  let run: Glide | null = null, held: ReturnType<typeof follow> | null = null;
  const apply = (px: number) => {
    x = px;
    const open = 1 - px / W;   // 0 closed .. 1 open
    if (still) page.style.opacity = open.toFixed(3);
    else page.style.transform = `translateX(${px.toFixed(2)}px)`;
    for (const a of away) {
      if (!still) a.style.transform = `translateX(${(-PAGE_AWAY * W * open).toFixed(2)}px)`;
      a.style.opacity = (1 - open).toFixed(3);
    }
  };
  // (From where the page stands to `to`, in the frames: the curve the pages always had, opening on the finger's speed when it is let go moving.)
  function go(to: number, v: number, done?: () => void) {
    run?.stop();
    const from = x, dist = to - from, ms = settleMs(dist, W);
    const c = still ? 0 : settleSlope(v, dist, ms, CARRY_MAX);
    run = glide({ ms, curve: (u) => (c > 0 ? carried(easeArrive(u), u, c) : easeArrive(u)), tag: 'menu-page', apply: (k) => apply(from + dist * k), done });
  }
  apply(W);
  go(0, 0);
  function pop(v = 0) {
    if (popped) return;
    popped = true; s = null; held?.stop();
    onPop?.();
    go(W, v, () => {
      page.style.transform = ''; page.style.opacity = '';
      for (const a of away) { a.style.transform = ''; a.style.opacity = ''; }
      onGone?.();
    });
  }
  // (A swipe right from the page goes back, as a pushed page does on iOS: the page follows the finger from the first 8 px that are mostly sideways.)
  page.style.touchAction = 'pan-y';
  const down = (e: PointerEvent) => {
    s = null;
    if (popped || e.pointerType === 'mouse' || !e.isPrimary || (e.target as HTMLElement).closest?.('input[type="range"], textarea, [contenteditable]')) return;
    s = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, trail: [], t: 0, dx: 0 };
  };
  const move = (e: PointerEvent) => {
    if (!s || e.pointerId !== s.id || popped) return;
    if (!s.on) {
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.hypot(dx, dy) < 8) return;
      if (!(dx > 0 && dx > Math.abs(dy) * 1.2)) { s = null; return; }   // (a scroll, or a drag the other way: not this page's)
      run?.stop(); run = null;   // (caught while it is still coming in: the finger takes it from where it stands)
      s.on = true; s.x = e.clientX - x; s.t = performance.now();
      held = follow(apply, 'menu-page');
      try { page.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
    }
    const raw = e.clientX - s.x;
    s.dx = raw > 0 ? Math.min(W, raw) : 0;   // (never further open than it stands)
    s.trail.push([performance.now(), e.clientX]); if (s.trail.length > 8) s.trail.shift();
    held!.set(s.dx);
  };
  const end = (e?: PointerEvent) => {
    const s0 = s;
    if (!s0?.on || (e && e.pointerId !== s0.id)) { if (!e || !s0 || e.pointerId === s0.id) s = null; return; }
    s = null;
    held?.flush(); held?.stop(); held = null;
    const now = performance.now(), v: number = releaseSpeed(s0.trail, now);   // (px per ms to the right, as the finger lifted)
    const flick = isFlick(s0.dx, v, s0.dx / Math.max(1, now - s0.t), SHEET_FLICK_MIN, SHEET_FLICK_FAR);
    if (flick || s0.dx > Math.min(SHEET_CLOSE_PX, W * SHEET_CLOSE_SHARE)) pop(v);
    else go(0, v);   // (a short pull comes home: at the finger's speed toward home, if it was going back)
  };
  page.addEventListener('pointerdown', down, { passive: true });
  page.addEventListener('pointermove', move);
  page.addEventListener('pointerup', end);
  page.addEventListener('pointercancel', end);
  page.addEventListener('lostpointercapture', end);
  return {
    pop, at: () => x, popped: () => popped,
    // (the page left the document: nothing it started may go on writing)
    dispose() { run?.stop(); held?.stop(); page.removeEventListener('pointerdown', down); page.removeEventListener('pointermove', move); page.removeEventListener('pointerup', end); page.removeEventListener('pointercancel', end); page.removeEventListener('lostpointercapture', end); },
  };
}

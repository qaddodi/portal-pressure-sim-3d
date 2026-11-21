// A page pushed over a sheet's own content, moved by the finger and by the frame clock: 2D page-push.js (the one mover of Treat's Changes on a phone, treat-page.js), on the 3D clock.
// The page slides in from the right over what it covers, which slides back a third as far and fades; a swipe right from anywhere on the page takes it with the finger, and a let-go goes back
// on the rules every sheet shares (release.copied.ts: a flick, or a pull past SHEET_CLOSE_PX / SHEET_CLOSE_SHARE of the page's width; a short pull comes home).
// Written each frame by the clock's tween phase (transform and opacity only), and on each move of the finger. 2D carries the finger's speed on into the slide (settleSlope); here the slide is the
// card's own arrive curve over the same time.
import { clock } from '../../clock/frame.ts';
import { Tweened, easeArrive } from '../../clock/tween.ts';
import { D_SMALL, D_FLIP, reduced } from '../a11y/motion.ts';
import { releaseSpeed, isFlick, SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE } from './release.copied.ts';

/** How far, as a share of the page's width, what it covers slides back as the page comes in. */
export const PAGE_AWAY = 0.3;

/** How long a slide of `dist` px takes on a page `W` px wide (2D page-push.js run()). */
export const slideMs = (dist: number, W: number): number => Math.round(D_SMALL * (0.5 + 0.5 * Math.min(1, Math.abs(dist) / W)));

export interface Pushed { pop(v?: number): void; at(): number }
interface Swipe { id: number; x: number; y: number; on: boolean; trail: [number, number][]; t: number; dx: number }

/**
 * page: the page, already in the sheet; away: what it covers (put out of reach by the caller); width: how wide the page is (read once, in the tap, by the caller).
 * onPop(): the back has begun; onGone(): the page is home away (the caller takes it out).
 */
export function pushPage(page: HTMLElement, away: HTMLElement[], width: number, { onPop, onGone, plate = false }: { onPop?: () => void; onGone?: () => void; plate?: boolean } = {}): Pushed {
  const W = Math.max(1, width), still = reduced();
  let x = W, popped = false, s: Swipe | null = null, off: (() => void) | null = null;
  const pos = new Tweened(W, 'treat-page');
  // (A page of its own text over words that are still fading would show both: a backing, the sheet's own paper, fully opaque while the page moves and faded away once it has landed.)
  const back = plate && !still ? document.createElement('i') : null;
  if (back) { back.className = 'pp-plate'; back.setAttribute('aria-hidden', 'true'); back.style.opacity = '1'; back.style.transition = `opacity ${D_FLIP}ms`; page.prepend(back); }
  const backTo = (o: number) => { if (back) back.style.opacity = String(o); };
  const apply = (px: number) => {
    x = px;
    const open = 1 - px / W;   // 0 closed .. 1 open
    // (`translate`, not `transform`: the card's own height glide (card-glide.copied.ts) rides what is inside it by `transform`, and one property written by two movers is a fight.)
    if (still) page.style.opacity = open.toFixed(3);
    else page.style.translate = `${px.toFixed(2)}px 0`;
    for (const a of away) {
      if (!still) a.style.translate = `${(-PAGE_AWAY * W * open).toFixed(2)}px 0`;
      a.style.opacity = (1 - open).toFixed(3);
    }
  };
  const stop = () => { pos.dispose(); off?.(); off = null; };
  function run(to: number, done?: () => void) {
    stop();
    const from = x;
    pos.value = from;
    off = clock.on('tween', () => apply(pos.value), 5);
    pos.to(to, { ms: still ? D_FLIP : slideMs(to - from, W), ease: easeArrive, done: () => { apply(to); off?.(); off = null; if (to === 0) backTo(0); done?.(); } });
  }
  apply(W);
  run(0);
  function pop(_v = 0) {
    if (popped) return;
    popped = true; s = null;
    backTo(1);
    onPop?.();
    run(W, () => {
      page.style.translate = ''; page.style.opacity = '';
      for (const a of away) { a.style.translate = ''; a.style.opacity = ''; }
      onGone?.();
    });
  }
  // (A swipe right from the page goes back, as a pushed page does on iOS: the page follows the finger from the first 8 px that are mostly sideways.)
  page.style.touchAction = 'pan-y';
  page.addEventListener('pointerdown', (e) => {
    s = null;
    if (popped || e.pointerType === 'mouse' || !e.isPrimary || (e.target as Element).closest?.('input[type="range"], textarea, [contenteditable]')) return;
    s = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, trail: [], t: 0, dx: 0 };
  }, { passive: true });
  page.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id || popped) return;
    if (!s.on) {
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.hypot(dx, dy) < 8) return;
      if (!(dx > 0 && dx > Math.abs(dy) * 1.2)) { s = null; return; }   // (a scroll, or a drag the other way: not this page's)
      stop();   // (caught while it is still coming in: the finger takes it from where it stands)
      backTo(1);
      s.on = true; s.x = e.clientX - x; s.t = clock.now();
      try { page.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
    }
    const raw = e.clientX - s.x;
    s.dx = raw > 0 ? Math.min(W, raw) : 0;   // (never further open than it stands)
    s.trail.push([clock.now(), e.clientX]); if (s.trail.length > 8) s.trail.shift();
    apply(s.dx);
  });
  const end = (e?: PointerEvent) => {
    const s0 = s;
    if (!s0?.on || (e && e.pointerId !== s0.id)) { if (!e || !s0 || e.pointerId === s0.id) s = null; return; }
    s = null;
    const now = clock.now(), v = releaseSpeed(s0.trail, now);   // (px per ms to the right, as the finger lifted)
    const flick = isFlick(s0.dx, v, s0.dx / Math.max(1, now - s0.t), SHEET_FLICK_MIN, SHEET_FLICK_FAR);
    if (flick || s0.dx > Math.min(SHEET_CLOSE_PX, W * SHEET_CLOSE_SHARE)) pop(v);
    else run(0);   // (a short pull comes home)
  };
  page.addEventListener('pointerup', end); page.addEventListener('pointercancel', end); page.addEventListener('lostpointercapture', end);
  return { pop, at: () => x };
}

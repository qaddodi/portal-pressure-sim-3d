import { useEffect, useRef } from 'react';
import { dock, closedPx, settleOf, DOCK_MS, OPEN_MS } from './dock.ts';
import { reduced } from '../a11y/motion.ts';

/** When the last dock drag let go (ms): the click that follows is not a tap. */
export let lastDockEnd = -1e9;
export const justDocked = () => clock.now() - lastDockEnd < 400;

import { ownsTouch, axisStart, axisOf, axisEnd } from './swipe-own.ts';

import { clock } from '../../clock/frame.ts';
/** What a touch that starts on it stays its own: the slide surface's real controls (swipe-own.ts), and the wallet strip, which has its own vertical swipe. */
const own = (t: Element | null) => ownsTouch(t) || !!t?.closest?.('.dk-strip, [data-no-dock]');

interface Opts {
  /** a slide that is stepped through (a procedure's steps, the data card's readings): a vertical swipe moves no card, the instrument card included (Mohammad, 24 Nov) */
  locked?(): boolean;
  /** A phone on its side (docs/approved/landscape-phone.md): the two cards are one column, and the swipe slides BOTH by this many px (instead of putting the instrument away to its edge); 0 or absent: the portrait dock. */
  column?: number;
  /** both cards are up and the layout docks (a phone or an upright iPad), and no zoom or case is over them */
  enabled: boolean;
  /** the data card's settled state: docked (closed) or not */
  docked: boolean;
  /** the card has come to rest closed (true) or open (false): the store takes it */
  onSettle(closed: boolean): void;
}

const dataEls = (column = false) => {
  const pos = document.querySelector<HTMLElement>('.dk-pos[data-slot="data"]');
  const card = pos?.querySelector<HTMLElement>('.dk-card');
  const inner = card?.querySelector<HTMLElement>('.dk-in') ?? null;
  // (the column: the words card moves with it, and no card's words fade: both stay up, one of them is only partly on screen)
  const words = column ? document.querySelector<HTMLElement>('.dk-pos[data-slot="words"]') : null;
  return pos && card ? { pos, inner: column ? null : inner, also: words ? [words] : [], h: card.offsetHeight } : null;
};

/** The dock's finger (2D presenter.js dockTouch, and its far-touch: "swiping down or up anywhere on the slide should trigger as if I'm holding the handle"). A touch that turns up or down
 *  anywhere on the slide that is not a control drives the data card: up pushes it away to its handle, down brings it back, following the finger, and it goes where it was heading when let go. */
export function useDockSwipe(o: Opts) {
  const opts = useRef(o); opts.current = o;
  useEffect(() => {
    if (!o.enabled) return;
    let g: { id: number; x: number; y: number; t: number; on: boolean; lvl0: number; pts: [number, number][]; el: Element } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (!e.isPrimary) { if (g?.on) { dock.glide(dock.lvl > 0.5 ? 1 : 0, DOCK_MS, () => opts.current.onSettle(dock.lvl > 0.5), reduced()); } g = null; return; }   // (a second finger: a pinch or a tilt is the figure's, the card settles where it is)
      const t = e.target as Element | null;
      axisStart(e.pointerId);
      if (!t || own(t)) { g = null; return; }
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, on: false, lvl0: 0, pts: [[e.clientY, e.timeStamp]], el: t };
    };
    const move = (e: PointerEvent) => {
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.on) {
        if (axisOf(g.id, dx, dy) !== 'y') return;   // (not decided yet, or sideways: the slide's own swipe, useCardDrag)
        if (opts.current.locked?.()) { g = null; return; }
        const els = dataEls(!!opts.current.column);
        if (!els) { g = null; return; }
        const closed = opts.current.column ? opts.current.column : closedPx(els.h), at = dock.running ? dock.lvl : opts.current.docked ? 1 : 0;
        if ((dy < 0 && at >= 1) || (dy > 0 && at <= 0)) { g = null; return; }   // (nowhere to go that way)
        dock.begin({ pos: els.pos, inner: els.inner, also: els.also }, closed, at);
        g.on = true; g.lvl0 = at;
        try { g.el.setPointerCapture?.(e.pointerId); } catch { /* (the touch is gone) */ }
      }
      g.pts.push([e.clientY, e.timeStamp]);
      while (g.pts.length > 2 && e.timeStamp - g.pts[0]![1] > 120) g.pts.shift();
      dock.move(dy, g.lvl0);
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      const s = g; if (!s || s.id !== e.pointerId) return;
      g = null; axisEnd(s.id);
      if (!s.on) return;
      lastDockEnd = clock.now();
      const a = s.pts[0]!, b = s.pts[s.pts.length - 1]!;
      const v = b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0;
      const to = cancelled ? (dock.lvl > 0.5 ? 1 : 0) : settleOf(dock.lvl, v);
      dock.glide(to, DOCK_MS, () => opts.current.onSettle(to === 1), reduced());
    };
    const up = (e: PointerEvent) => end(e, false), cancel = (e: PointerEvent) => end(e, true);
    window.addEventListener('pointerdown', down, { capture: true, passive: true });
    window.addEventListener('pointermove', move, { capture: true, passive: true });
    window.addEventListener('pointerup', up, { capture: true, passive: true });
    const hold = (e: TouchEvent) => { if (g?.on && e.cancelable) e.preventDefault(); };   // (a swipe taken is not the page's to scroll or bounce)
    window.addEventListener('touchmove', hold, { capture: true, passive: false });
    window.addEventListener('pointercancel', cancel, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', down, { capture: true });
      window.removeEventListener('pointermove', move, { capture: true });
      window.removeEventListener('pointerup', up, { capture: true });
      window.removeEventListener('touchmove', hold, { capture: true });
      window.removeEventListener('pointercancel', cancel, { capture: true });
    };
  }, [o.enabled]);
}

/** A tap on the tucked card's edge: it comes back (2D: a tap on the handle opens the card). */
export function openDock(onSettle: (closed: boolean) => void): void {
  const els = dataEls();
  if (!els) { onSettle(false); return; }
  dock.begin({ pos: els.pos, inner: els.inner }, closedPx(els.h), 1);
  dock.glide(0, OPEN_MS, () => onSettle(false), reduced());
}

/** A phone on its side: slides the card column to `to` (1: the instrument in the middle, the words bleeding off the top; 0: the words in the middle) by `px`, as a swipe would, for a tap on the card that peeks. */
export function goColumn(to: 0 | 1, px: number, onSettle: (scrolled: boolean) => void): void {
  const els = dataEls(true);
  if (!els || !(px > 0)) { onSettle(to === 1); return; }
  dock.begin({ pos: els.pos, inner: null, also: els.also }, px, to === 1 ? 0 : 1);
  dock.glide(to, to === 1 ? DOCK_MS : OPEN_MS, () => onSettle(to === 1), reduced());
}

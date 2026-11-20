import { useEffect, useMemo, useRef } from 'react';
import type { Gesture } from '../wallet/wallet-machine.ts';
import { rail, followOf, commitOf, speedOf, PARALLAX, type Pt } from './rail.ts';
import type { Move } from '../deck/presenter-machine.ts';
import { ownsTouch, axisStart, axisOf, axisEnd } from './swipe-own.ts';

/** What the recogniser reads of a pointer event (a window's and a React card's both fit). */
interface Pe { clientX: number; clientY: number; timeStamp: number; pointerId: number; pointerType: string; target: EventTarget | null; isPrimary?: boolean }

/** When a drag last let go (ms): the tap that follows a drag's pointer-up is not a tap. */
export let lastDragEnd = -1e9;
export const justDragged = () => performance.now() - lastDragEnd < 400;

interface Opts {
  /** a finished movement that was not a drag the cards followed (a tap, a mouse swipe, a vertical swipe) */
  onEnd(g: Gesture, e: Pe, inCard: boolean): void;
  /** the talk moves (the drag was carried past its distance, or flicked) */
  onMove(m: Move): void;
  /** whether a sideways drag may move the cards now (a slide change is possible: the talk is not at an end, no zoom is up) */
  can(dx: number): boolean;
  /** whether the data card is kept by the slide this drag goes to: it does not follow the finger */
  keeps(dx: number): boolean;
  /** the width the cards' travel is scaled to */
  width: number;
  /** the card elements on screen, each with its plate, and its slot */
  cards(): { els: HTMLElement[]; data: boolean }[];
  /** the slide is up and may be swiped (a talk is playing) */
  enabled?: boolean;
}

const slot = (data: boolean) => (data ? PARALLAX.data : PARALLAX.words);

/** The finger's hold on the cards (phones and tablets: the 2D app's swipe, where the cards follow the finger and go on out from it). It is one recogniser for the whole slide: a touch that
 *  starts ANYWHERE on it (the figure, either card, the empty space between, a question that fills its card), that is not a real control's own (swipe-own.ts), and turns sideways takes every
 *  card on screen along on one soft-stopped drag (the data card a little less, so they part slightly); let go, it is judged by where the finger's speed would carry it: past 72 px of rest
 *  the talk moves and the cards go on out from where they are (their own leave, on the rail), else they ease back. A second finger (a pinch, a tilt) gives the touch up; a mouse, a tap
 *  and a vertical swipe are reported through `onEnd`, as before. */
export function useCardDrag(o: Opts) {
  const opts = useRef(o); opts.current = o;
  const st = useRef<{ x: number; y: number; t: number; id: number; touch: boolean; on: boolean; card: boolean; el: Element | null; pts: [number, number][]; cards: { els: HTMLElement[]; data: boolean }[]; f: Pt } | null>(null);
  const fns = useMemo(() => {
    const drop = (g: NonNullable<typeof st.current>) => { try { g.el?.releasePointerCapture?.(g.id); } catch { /* (no capture held) */ } };
    const down = (e: Pe) => {
      const t = e.target as Element | null, touch = e.pointerType !== 'mouse';
      if (touch ? ownsTouch(t) : t?.closest?.('button, a, input')) { st.current = null; return; }
      if (touch) axisStart(e.pointerId);
      st.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, touch, on: false, card: !!t?.closest?.('.dk-card'), el: t, pts: [[e.clientX, e.timeStamp]], cards: [], f: { x: 0, o: 1 } };
    };
    const move = (e: Pe) => {
      const g = st.current;
      if (!g || g.id !== e.pointerId || !g.touch) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.on) {
        if (axisOf(g.id, dx, dy) !== 'x' || !opts.current.can(dx)) return;
        g.on = true; { const keep = opts.current.keeps(dx); g.cards = opts.current.cards().filter((c) => !(keep && c.data)); }
        try { g.el?.setPointerCapture?.(e.pointerId); } catch { /* (the touch is gone) */ }
      }
      g.pts.push([e.clientX, e.timeStamp]);
      while (g.pts.length > 2 && e.timeStamp - g.pts[0]![1] > 120) g.pts.shift();
      followOf(dx, opts.current.width, g.f);
      for (const c of g.cards) rail.drag(c.els, g.f.x, g.f.o, slot(c.data));
    };
    const up = (e: Pe) => {
      const g = st.current; st.current = null;
      if (!g || g.id !== e.pointerId) return;
      axisEnd(g.id);
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.on) { if (!g.touch || g.card) opts.current.onEnd({ dx, dy, ms: e.timeStamp - g.t }, e, g.card); return; }
      drop(g);
      lastDragEnd = performance.now();
      g.pts.push([e.clientX, e.timeStamp]);
      const m = commitOf(dx, dy, speedOf(g.pts));
      // the cards the talk keeps (the same data card on the next slide) are not sent out: they ease back from the finger's place
      const put = g.f, cards = g.cards;
      if (m) opts.current.onMove(m);
      setTimeout(() => { for (const c of cards) if (!c.els[0]!.isConnected || c.els[0]!.closest('[data-phase="out"]') || c.els[0]!.getAttribute('data-phase') === 'out' || rail.moving(c.els)) continue; else rail.back(c.els, put.x, put.o, slot(c.data)); }, m ? 60 : 0);
    };
    const cancel = (e: Pe) => {
      const g = st.current; st.current = null;
      if (g) axisEnd(g.id);
      if (!g?.on) return;
      drop(g);
      for (const c of g.cards) rail.back(c.els, g.f.x, g.f.o, slot(c.data));
    };
    return { down, move, up, cancel };
  }, []);

  // touches: on the window, in the capture phase, so the figure's canvas, the labels and the cards all see the same finger (the figure is locked while a talk plays: Stage.tsx)
  const on = o.enabled !== false;
  useEffect(() => {
    if (!on) return;
    const touchOnly = (f: (e: Pe) => void) => (e: PointerEvent) => { if (e.pointerType !== 'mouse') f(e); };
    const down = (e: PointerEvent) => { if (e.pointerType === 'mouse') return; if (!e.isPrimary) { fns.cancel(e); return; } fns.down(e); };
    const hs: [string, (e: PointerEvent) => void][] = [['pointerdown', down], ['pointermove', touchOnly(fns.move)], ['pointerup', touchOnly(fns.up)], ['pointercancel', touchOnly(fns.cancel)]];
    for (const [n, h] of hs) window.addEventListener(n, h as EventListener, { capture: true, passive: true });
    // (a swipe the recogniser has taken is not the page's to scroll or bounce)
    const hold = (e: TouchEvent) => { if (st.current?.on && e.cancelable) e.preventDefault(); };
    window.addEventListener('touchmove', hold, { capture: true, passive: false });
    return () => { for (const [n, h] of hs) window.removeEventListener(n, h as EventListener, { capture: true }); window.removeEventListener('touchmove', hold, { capture: true }); };
  }, [on, fns]);

  // a mouse: on the cards, as before (a mouse swipe is judged at its end; it never drags the cards)
  return useMemo(() => ({
    onPointerDown: (e: Pe) => { if (e.pointerType === 'mouse') fns.down(e); },
    onPointerUp: (e: Pe) => { if (e.pointerType === 'mouse') fns.up(e); },
    onPointerCancel: (e: Pe) => { if (e.pointerType === 'mouse') fns.cancel(e); },
  }), [fns]);
}

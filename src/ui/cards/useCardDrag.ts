import { useMemo, useRef, type PointerEvent as RPE } from 'react';
import type { Gesture } from '../wallet/wallet-machine.ts';
import { rail, followOf, commitOf, speedOf, PARALLAX, type Pt } from './rail.ts';
import type { Move } from '../deck/presenter-machine.ts';

/** When a drag last let go (ms): the tap that follows a drag's pointer-up is not a tap. */
export let lastDragEnd = -1e9;
export const justDragged = () => performance.now() - lastDragEnd < 400;

interface Opts {
  /** a finished movement that was not a drag the cards followed (a tap, a mouse swipe, a vertical swipe) */
  onEnd(g: Gesture, e: RPE): void;
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
}

const slot = (data: boolean) => (data ? PARALLAX.data : PARALLAX.words);

/** The finger's hold on the cards (phones: the 2D app's swipe, where the cards follow the finger and go on out from it). A touch that turns sideways
 *  takes every card on screen along on one soft-stopped drag (the data card a little less, so they part slightly); let go, it is judged by where the
 *  finger's speed would carry it: past 72 px of rest the talk moves and the cards go on out from where they are (their own leave, on the rail), else
 *  they ease back. A press that never turns sideways, a mouse, and a vertical swipe are reported as before through `onEnd`. */
export function useCardDrag(o: Opts) {
  const opts = useRef(o); opts.current = o;
  const st = useRef<{ x: number; y: number; t: number; id: number; touch: boolean; on: boolean; pts: [number, number][]; cards: { els: HTMLElement[]; data: boolean }[]; f: Pt } | null>(null);
  return useMemo(() => {
    const drop = (g: NonNullable<typeof st.current>, e: RPE) => { try { (e.currentTarget as Element).releasePointerCapture?.(g.id); } catch { /* (no capture held) */ } };
    return {
      onPointerDown: (e: RPE) => {
        // a press on a slider, a link or the hold-to-strain button is its own; a press on any other button can still turn into a swipe (the quick check's questions are buttons that fill the card: a swipe back from the last page started on one and never began)
        if ((e.target as HTMLElement).closest?.('a, input, .pz-strain, [data-no-swipe]')) { st.current = null; return; }
        st.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, touch: e.pointerType !== 'mouse', on: false, pts: [[e.clientX, e.timeStamp]], cards: [], f: { x: 0, o: 1 } };
      },
      onPointerMove: (e: RPE) => {
        const g = st.current;
        if (!g || g.id !== e.pointerId || !g.touch) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (!g.on) {
          if (Math.abs(dx) < 8 || Math.abs(dx) < 1.5 * Math.abs(dy) || !opts.current.can(dx)) return;
          g.on = true; { const keep = opts.current.keeps(dx); g.cards = opts.current.cards().filter((c) => !(keep && c.data)); }
          try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* (the touch is gone) */ }
        }
        g.pts.push([e.clientX, e.timeStamp]);
        while (g.pts.length > 2 && e.timeStamp - g.pts[0]![1] > 120) g.pts.shift();
        followOf(dx, opts.current.width, g.f);
        for (const c of g.cards) rail.drag(c.els, g.f.x, g.f.o, slot(c.data));
      },
      onPointerUp: (e: RPE) => {
        const g = st.current; st.current = null;
        if (!g || g.id !== e.pointerId) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (!g.on) { opts.current.onEnd({ dx, dy, ms: e.timeStamp - g.t }, e); return; }
        drop(g, e);
        lastDragEnd = performance.now();
        g.pts.push([e.clientX, e.timeStamp]);
        const m = commitOf(dx, dy, speedOf(g.pts));
        // the cards the talk keeps (the same data card on the next slide) are not sent out: they ease back from the finger's place
        const put = g.f, cards = g.cards;
        if (m) opts.current.onMove(m);
        setTimeout(() => { for (const c of cards) if (!c.els[0]!.isConnected || c.els[0]!.closest('[data-phase="out"]') || c.els[0]!.getAttribute('data-phase') === 'out' || rail.moving(c.els)) continue; else rail.back(c.els, put.x, put.o, slot(c.data)); }, m ? 60 : 0);
      },
      onPointerCancel: (e: RPE) => {
        const g = st.current; st.current = null;
        if (!g?.on) return;
        drop(g, e);
        for (const c of g.cards) rail.back(c.els, g.f.x, g.f.o, slot(c.data));
      },
    };
  }, []);
}

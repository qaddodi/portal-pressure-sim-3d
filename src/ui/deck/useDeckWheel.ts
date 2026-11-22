import { useEffect, useRef } from 'react';
import { useUi } from '../ui-store.ts';
import { useShell } from '../shell/store.ts';
import { useDialogs } from './dialogs.ts';
import { ownsTouch } from '../cards/swipe-own.ts';
import { wheelFinger, wheelGesture, sidewaysGesture, type WheelG } from './wheel-swipe.ts';
import type { Move } from './presenter-machine.ts';

import { clock } from '../../clock/frame.ts';
/** A trackpad's two-finger sideways swipe goes to the next or previous slide, once a gesture (wheel-swipe.ts). A pinch (Ctrl/⌘ + wheel) is left alone (no-page-zoom.ts cancels it); a field or slider keeps its wheel. */
export function useDeckWheel(onMove: (m: Move) => void): void {
  const go = useRef(onMove);
  go.current = onMove;
  useEffect(() => {
    let g: WheelG | null = null;
    const onWheel = (e: WheelEvent) => {
      const ui = useUi.getState(), sh = useShell.getState();
      if (!ui.deck || !ui.stops.length || ui.jump || sh.dialog || sh.sheet || useDialogs.getState().dialog) return;
      if (e.ctrlKey || e.metaKey) return;
      if (ownsTouch(e.target as Element | null)) return;
      const now = e.timeStamp > 0 ? e.timeStamp : clock.now();
      const [fx, fy] = wheelFinger(e.deltaX, e.deltaY, e.deltaMode, (e as WheelEvent & { webkitDirectionInvertedFromDevice?: boolean }).webkitDirectionInvertedFromDevice, innerHeight);
      const r = wheelGesture(g, fx, fy, now);
      g = r.g;
      if (!sidewaysGesture(g, fx, fy)) return;   // up or down: the cards' own scroll
      if (e.cancelable) e.preventDefault();      // the browser's back/forward swipe and the figure's pan stay out of the talk
      e.stopPropagation();
      if (r.dir) go.current(r.dir < 0 ? 'next' : 'back');
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
  }, []);
}

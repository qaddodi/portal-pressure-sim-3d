// Runs 2D's top-bar fit (bar-fit.ts) when the bar, its pills or the window change size, and when the patient's name or the view changes (the layout then changes the pills' widths).
// Reads layout in a task of its own after the change has been laid out, never in a frame (the same rule as 2D's restTask).
import { useEffect, useRef, type DependencyList } from 'react';
import { barFit, PHONE_MQ } from './bar-fit.ts';
import { isThumb } from './thumb.ts';

import { clock, type TimerId } from '../../clock/frame.ts';
export function useBarFit(deps: DependencyList) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    let t: TimerId | null = null;
    const run = () => { t = null; barFit(bar, isThumb(), !matchMedia(PHONE_MQ).matches); };
    const soon = () => { if (!t) t = clock.after(run, 0); };
    const ro = new ResizeObserver(soon);
    ro.observe(bar);
    for (const s of ['.tb-id', '.top-right', '.sb-right']) { const e = bar.querySelector(s); if (e) ro.observe(e); }
    addEventListener('resize', soon);
    soon();
    return () => { ro.disconnect(); removeEventListener('resize', soon); clock.cancel(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref as React.RefObject<HTMLElement>;
}

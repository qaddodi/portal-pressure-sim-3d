// The size of a box, read by an observer (never in a frame): what the chart is given to lay itself out in.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { observeThenFit } from '../layout/fit-later.ts';
import { readBox } from '../layout-snap.ts';

export function useBox<T extends HTMLElement>(): { ref: RefObject<T | null>; w: number; h: number } {
  const ref = useRef<T>(null);
  const [s, setS] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const put = () => { const r = readBox(el), w = Math.round(r.width), h = Math.round(r.height); setS((o) => (o.w === w && o.h === h ? o : { w, h })); };
    put();
    if (typeof ResizeObserver !== 'function') return;
    return observeThenFit([el], put);
  }, []);
  return { ref, w: s.w, h: s.h };
}

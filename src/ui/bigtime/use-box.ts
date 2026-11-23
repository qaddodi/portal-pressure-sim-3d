// The size of a box, read by an observer (never in a frame): what the chart is given to lay itself out in. The box may come into the page after the card did (the plot is not there while there is
// nothing to draw, then the days run on and it is): the element is kept in state, so a box that appears later is measured when it does.
import { useCallback, useLayoutEffect, useState } from 'react';
import { observeThenFit } from '../layout/fit-later.ts';
import { readBox } from '../layout-snap.ts';

export function useBox<T extends HTMLElement>(): { ref: (el: T | null) => void; w: number; h: number } {
  const [el, setEl] = useState<T | null>(null);
  const [s, setS] = useState({ w: 0, h: 0 });
  const ref = useCallback((n: T | null) => setEl(n), []);
  useLayoutEffect(() => {
    if (!el) { setS((o) => (o.w === 0 && o.h === 0 ? o : { w: 0, h: 0 })); return; }
    const put = () => { const r = readBox(el), w = Math.round(r.width), h = Math.round(r.height); setS((o) => (o.w === w && o.h === h ? o : { w, h })); };
    put();
    if (typeof ResizeObserver !== 'function') return;
    return observeThenFit([el], put);
  }, [el]);
  return { ref, w: s.w, h: s.h };
}

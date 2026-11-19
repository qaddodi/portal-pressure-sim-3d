// The hand-over between the HVPG tracing and the PPG by IR's monitor (2D monitor-takeover.js createSwap): the one that leaves fades out, then the one that comes fades in, so nothing pops in or out
// (Reduce Motion keeps the fade: a cross-fade is allowed, an instant swap is not). Asked again mid-way, it finishes the fade it is in, then goes where the last ask says, so a quick run-and-stop never leaves
// both up or neither. Where nothing is on screen to fade (the pane has no box) it swaps at once. Both fades are the Web Animations API, opacity only, on the box itself: the two are children of the
// pane's view as in 2D (no wrapper of ours between the view and its .chart-box, so the 2D stylesheet's child rules reach it).
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { D_SMALL, EASE_IN, EASE_ARRIVE } from '../copied/ease.copied.js';

const FADE_OUT = [{ opacity: 1 }, { opacity: 0 }], FADE_IN = [{ opacity: 0 }, { opacity: 1 }];

/** `over` true: the monitor's (`top`) is meant to be up, false: the picture's (`base`). Each is given the ref of the element that fades (its box). */
export function HandOver({ over, base, top }: { over: boolean; base: (at: RefObject<HTMLDivElement | null>) => ReactNode; top: (at: RefObject<HTMLDivElement | null>) => ReactNode }) {
  const [on, setOn] = useState(over);
  const el = useRef<HTMLDivElement>(null), busy = useRef(false), now = useRef(over), want = useRef(over), first = useRef(true);
  want.current = over;
  useEffect(() => {
    if (busy.current || want.current === now.current) return;
    const node = el.current;
    const land = () => { busy.current = false; now.current = want.current; setOn(want.current); };
    if (!node || typeof node.animate !== 'function' || node.getBoundingClientRect().width === 0) { land(); return; }
    busy.current = true;
    const a = node.animate(FADE_OUT, { duration: D_SMALL, easing: EASE_IN, fill: 'forwards' });
    let closed = false;
    const end = () => { if (closed) return; closed = true; land(); };
    a.onfinish = end; a.oncancel = end;
  }, [over, on]);
  // the one that comes fades in where the other stood (not on the pane's first showing: the card's own entry covers that)
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const node = el.current;
    if (node && typeof node.animate === 'function') node.animate(FADE_IN, { duration: D_SMALL, easing: EASE_ARRIVE });
  }, [on]);
  // (keyed, so the one that comes is a new element: the fade-out's last frame never stays on it)
  return on ? <Fragment key="top">{top(el)}</Fragment> : <Fragment key="base">{base(el)}</Fragment>;
}

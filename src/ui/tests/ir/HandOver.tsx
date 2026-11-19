// The hand-over between the HVPG tracing and the PPG by IR's monitor (2D monitor-takeover.js createSwap): the one that leaves fades out, then the one that comes fades in, so nothing pops in or out
// (Reduce Motion keeps the fade: a cross-fade is allowed, an instant swap is not). Asked again mid-way, it finishes the fade it is in, then goes where the last ask says, so a quick run-and-stop never leaves
// both up or neither. Where nothing is on screen to fade (the pane has no box) it swaps at once. The fade-in is `.ir-fade` (ir.css); the fade-out is the Web Animations API, opacity only.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { D_SMALL, EASE_IN } from '../copied/ease.copied.js';

const FADE_OUT = [{ opacity: 1 }, { opacity: 0 }];

/** `over` true: the monitor's (`top`) is meant to be up, false: the picture's (`base`). */
export function HandOver({ over, base, top }: { over: boolean; base: ReactNode; top: ReactNode }) {
  const [on, setOn] = useState(over);
  const el = useRef<HTMLDivElement>(null), busy = useRef(false), now = useRef(over), want = useRef(over);
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
  return <div ref={el} className="ir-fade" key={on ? 'top' : 'base'}>{on ? top : base}</div>;
}

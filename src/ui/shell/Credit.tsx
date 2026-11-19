// The corner credit of the 2D page: `.stage-credit`, placed by 2D's credit.js at the figure's bottom-left corner, 12 px in; where a bar covers that corner (the thumb dock spans the width) it rides above the view pill.
// It is put once per layout change, never per frame.
// 2D's credit.js rule, copied (credit-spots.copied.js): the credit is never on or touching a bar, a card or a menu; a bottom corner rises above whatever covers it, then the
// other corners are tried, and with none free it is hidden (`covered`). The translucent bottom bar used to show the line through itself.
import { useLayoutEffect, useRef } from 'react';
import { useUi } from '../ui-store.ts';
import { useSettings } from '../../state/settings.ts';
import { CREDIT } from './words.ts';
import { M } from './metrics.ts';
import { useThumb } from './thumb.ts';
import { CORNERS, freeSpots } from './credit-spots.copied.js';

/** What the credit keeps clear of: every floating bar, card and chip on screen (the bottom dock with its view pill, the top bar's chips, the zoom pill, a card), as rectangles. */
const OBSTACLES = '.float-ui, .stage-blocker, .vdock, .zoom-pill';
function obstacles(vw: number, vh: number): { l: number; t: number; r: number; b: number }[] {
  const out: { l: number; t: number; r: number; b: number }[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(OBSTACLES)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || (r.width >= vw * 0.98 && r.height >= vh * 0.9)) continue;   // (not a layer that covers the whole screen)
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  return out;
}

export function Credit() {
  const ref = useRef<HTMLDivElement>(null);
  const vp = useUi((s) => s.vp);
  const fps = useSettings((s) => s.showFps);
  const thumb = useThumb();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    const place = () => {
      const vw = innerWidth, vh = innerHeight, h = M.creditFont * M.creditLine, w = el.offsetWidth || 220;
      // the figure is the screen inside the safe areas; the frame-rate counter stands at the bottom corner too, so the credit's bottom corner rides above it
      const rise = fps ? M.fpsInset + M.fpsFont * M.fpsLine + 4 : 0;
      const fig = { l: vp.safe.left, t: vp.safe.top, r: vw - vp.safe.right, b: vh - vp.safe.bottom - rise };
      const spots = freeSpots(fig, obstacles(vw, vh), w, h, { gap: 10, inset: M.creditInset }) as Record<string, { x: number; y: number } | null>;
      const at = CORNERS.map((c) => spots[c]).find((s) => s);
      if (at) { el.style.setProperty('--cx', `${Math.round(at.x)}px`); el.style.setProperty('--cy', `${Math.round(at.y)}px`); }
      el.classList.toggle('covered', !at);   // (no free place: hidden, as 2D's)
      el.classList.add('placed');
    };
    place();
    // the bars settle after the layout change (the dock's height, a card's transition): look again once they have, and again when one resizes
    const again = () => { clearTimeout(timer); timer = window.setTimeout(place, 260); };
    again();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(again) : null;
    for (const e of document.querySelectorAll(OBSTACLES)) ro?.observe(e);
    return () => { clearTimeout(timer); ro?.disconnect(); };
  }, [vp.w, vp.h, vp.safe.bottom, vp.safe.left, vp.safe.top, vp.safe.right, fps, thumb]);
  return <div className="stage-credit" ref={ref} aria-hidden="true">{CREDIT}</div>;
}

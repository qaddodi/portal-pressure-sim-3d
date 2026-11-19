// The corner credit of the 2D page: `.stage-credit`, placed by 2D's credit.js at the figure's bottom-left corner, 12 px in; where a bar covers that corner (the thumb dock spans the width) it rides above the view pill.
// It is put once per layout change, never per frame.
import { useLayoutEffect, useRef } from 'react';
import { useUi } from '../ui-store.ts';
import { useSettings } from '../../state/settings.ts';
import { CREDIT } from './words.ts';
import { M } from './metrics.ts';
import { useThumb } from './thumb.ts';

export function Credit() {
  const ref = useRef<HTMLDivElement>(null);
  const vp = useUi((s) => s.vp);
  const fps = useSettings((s) => s.showFps);
  const thumb = useThumb();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = M.creditFont * M.creditLine, vh = innerHeight;
    // (the frame-rate counter stands at the corner too: the credit rides above it)
    const rise = fps ? M.fpsInset + M.fpsFont * M.fpsLine + 4 - M.creditInset : 0;
    let y = vh - M.creditInset - h - Math.max(0, rise) - vp.safe.bottom;
    if (thumb) { const nb = document.getElementById('nbViews')?.getBoundingClientRect(); if (nb && nb.height) y = Math.min(y, nb.top - 10 - h); }
    el.style.setProperty('--cx', `${M.creditInset + vp.safe.left}px`);
    el.style.setProperty('--cy', `${Math.round(y)}px`);
    el.classList.add('placed');
  }, [vp.w, vp.h, vp.safe.bottom, vp.safe.left, fps, thumb]);
  return <div className="stage-credit" ref={ref} aria-hidden="true">{CREDIT}</div>;
}

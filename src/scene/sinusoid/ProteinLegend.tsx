// The sinusoid's one legend: a dot in the albumin's colour and the word "Protein". It stands in the top bar, beside the lens key (owner, 20 Nov: "move protein legend next to the lens legend"): to the left of
// the figure's pill on a laptop, and under it on a phone, where the bar has no room beside it. Every view's key is then in one place: the lens key and this one. It stands only while the sinusoid is
// the view and fades in and out with it. Its look is 2D's own .sv-legend rule (copied with the rest of 2D's CSS); where it stands is legend.css.
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '../../ui/shell/store.ts';
import { legendOn } from './legend.ts';
import './legend.css';

const FADE_MS = 240;

export function ProteinLegend() {
  const on = legendOn(useShell((s) => s.view), true);
  const [host, setHost] = useState<HTMLElement | null>(() => (typeof document === 'undefined' ? null : document.getElementById('stageTop')));
  useLayoutEffect(() => { setHost((o) => document.getElementById('stageTop') ?? o); }, []);
  const [shown, setShown] = useState(on), [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (on) { setShown(true); setLeaving(false); return; }
    if (!shown) return;
    setLeaving(true);
    const t = window.setTimeout(() => { setShown(false); setLeaving(false); }, FADE_MS + 40);
    return () => window.clearTimeout(t);
  }, [on, shown]);
  if (!host || !shown) return null;
  return createPortal(<div className={`sv-legend${leaving ? ' out' : ''}`} aria-hidden="true"><span><i className="alb" />Protein</span></div>, host);
}

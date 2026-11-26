// The sinusoid's one legend: a round swatch in the albumin's colour (the very tokens the scene's protein particles are painted from, legend.ts ALBUMIN_TOKENS) and the word "Protein". It stands in the top bar, beside the lens key (owner, 20 Nov: "move protein legend next to the lens legend"): to the left of
// the figure's pill on a laptop, and under it on a phone, where the bar has no room beside it. Every view's key is then in one place: the lens key and this one. It stands only while the sinusoid is
// the view and fades in and out with it. Its look is 2D's own .sv-legend rule (copied with the rest of 2D's CSS); where it stands is legend.css.
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '../../ui/shell/store.ts';
import { SINUSOID_KEY, legendOn } from './legend.ts';
import './legend.css';

import { clock } from '../../clock/frame.ts';
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
    const t = clock.after(() => { setShown(false); setLeaving(false); }, FADE_MS + 40);
    return () => clock.cancel(t);
  }, [on, shown]);
  if (!host || !shown) return null;
  return createPortal(
    <div className={`sv-legend${leaving ? ' out' : ''}`} aria-hidden="true">
      {SINUSOID_KEY.map((k) => (
        <span key={k.word}><i className="alb" data-shape={k.shape} style={{ '--key-fill': `var(${k.fill})`, '--key-edge': `var(${k.edge})` } as CSSProperties} />{k.word}</span>
      ))}
    </div>, host);
}

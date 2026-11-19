// The place a chart is drawn in its box. A 2D instrument draws on a <canvas> that is the child of its box (.chart-box, .hvpg-box, .fibroscan-box, .pt-box), and the 2D stylesheet gives that canvas its
// place and size (it fills the box; in the monitors' boxes it is letterboxed to their shape). The 3D charts share one GPU canvas, so the box's child here is <div class="cv">, placed by the same rules
// (copied/cv-2d.copied.css, scripts/copy-b11-panes.mjs: `canvas` rewritten to `.cv`). The chart inside takes its width from it as every chart does, and its height from `useCv`: the size the
// stylesheet gave, read by an observer (never in a frame), so a box the card sizes (a share of the card's height, a shape) is drawn at that size and nothing is laid out twice.
import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import './copied/cv-2d.copied.css';
import { cvHeight } from './cv-size.ts';

export interface CvSize { w: number; h: number }
/** The .cv's ref and its size; `fallback` is the height used before the box has one (not laid out yet, or no observer). */
export function useCv(fallback: number): { ref: RefObject<HTMLDivElement | null>; w: number; h: number; measured: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState<CvSize>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const put = (w: number, h: number) => { w = Math.round(w); h = Math.round(h); setS((o) => (o.w === w && o.h === h ? o : { w, h })); };
    const r = el.getBoundingClientRect();
    put(r.width, r.height);
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver((es) => { const c = es[es.length - 1]?.contentRect; if (c) put(c.width, c.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w: s.w, h: cvHeight(s.h, fallback), measured: s.h > 0 };
}
export function Cv({ at, children }: { at: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return <div className="cv" ref={at}>{children}</div>;
}

/** Where a pane is shown. In the Tests card ('dock') its view is 2D's `.instrument-view` inside `.dock-pane`, and the 2D stylesheet sizes every box. On a slide's card ('slide') 2D lays the same
 *  instrument as `.pz-inst` (presenter-tools.js: no head row, no switch of the dock's), sized by the slide's rules; until the slide's card carries 2D's own wrapper, a box there keeps the height it is handed. */
export const PaneHost = createContext<'dock' | 'slide'>('dock');
export function usePaneHost(): { slide: boolean; view: string; box(h: number): CSSProperties | undefined } {
  const slide = useContext(PaneHost) === 'slide';
  return { slide, view: slide ? 'pz-inst' : 'instrument-view', box: (h) => (slide ? { height: h } : undefined) };
}

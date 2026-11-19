import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEventHandler } from 'react';
import type { Rect } from '../layout/device.ts';
import type { Entry } from './stack.ts';
import { EXIT_MS } from './stack.ts';
import { useUi } from '../ui-store.ts';
import { layoutOf, radius } from '../layout/rules2d.ts';

interface Props {
  entry: Entry;
  /** Where the card goes (its height is the one measured; 0 until measured). */
  rect: Rect;
  /** Reports the natural height of the content (px, border included) whenever it changes. */
  onHeight(key: string, width: number, h: number): void;
  onGone(key: string): void;
  children: ReactNode;
  label?: string;
  pointer?: { onPointerDown: PointerEventHandler; onPointerUp: PointerEventHandler; onPointerCancel: PointerEventHandler };
  overflow?: boolean;
  /** the 2D data card's own state classes (tiles-only, col, has-tool, tool-only: presenter.js dataIn), written on the data card only */
  extra?: string;
}

/** One card: placed by transform, sized exactly to its content with a glide, invisible until its words are laid out, then it rises in. */
export function CardFrame({ entry, rect, onHeight, onGone, children, label, pointer, overflow, extra }: Props) {
  const vp = useUi((s) => s.vp);
  const r = Math.round(radius(vp.w, vp.h, layoutOf(vp.w, vp.h)));
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);          // the card has landed: from now on a move of its place glides
  const shownH = useRef<number | null>(null);        // the height the card is drawn at (for the glide)
  const out = entry.phase === 'out';
  const ready = rect.h > 0;

  // measure the words' natural height: the card is sized to it exactly
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const report = () => { const h = Math.ceil(el.getBoundingClientRect().height) + 2; onHeight(entry.key, Math.round(rect.w), h); };
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.key, Math.round(rect.w)]);

  // A change of height after landing glides, by clip-path on the card and a scaled shadow plate (compositor work, no layout per frame):
  // growing, the card is its new height at once and is revealed down to it; shrinking, it stays its old height, is clipped up to the new
  // one, and takes the new height only when the glide has finished.
  const [animH, setAnimH] = useState<number | null>(null);
  const anims = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const card = cardRef.current, plate = plateRef.current;
    if (!card || !plate || !ready) return;
    const prev = shownH.current;
    shownH.current = rect.h;
    if (prev == null || prev === rect.h || !live || out) return;
    if (typeof card.animate !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const opts: KeyframeAnimationOptions = { duration: 280, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'forwards' };
    anims.current.forEach((a) => a.cancel());
    if (rect.h > prev) {
      anims.current = [
        card.animate([{ clipPath: `inset(0 0 ${rect.h - prev}px 0 round ${r}px)` }, { clipPath: `inset(0 0 0 0 round ${r}px)` }], opts),
        plate.animate([{ transform: `scaleY(${prev / rect.h})` }, { transform: 'scaleY(1)' }], opts),
      ];
      anims.current[0].onfinish = () => anims.current.forEach((a) => a.cancel());
    } else {
      setAnimH(prev);
      const k = rect.h / prev;
      anims.current = [
        card.animate([{ clipPath: `inset(0 0 0 0 round ${r}px)` }, { clipPath: `inset(0 0 ${prev - rect.h}px 0 round ${r}px)` }], opts),
        plate.animate([{ transform: 'scaleY(1)' }, { transform: `scaleY(${k})` }], opts),
      ];
      anims.current[0].onfinish = () => setAnimH(null);
    }
  }, [rect.h, ready, live, out]);
  // the new height is in place: let go of the glide (cancelled here, after the commit, so no frame shows the full old card)
  useLayoutEffect(() => { if (animH == null && anims.current.length) { anims.current.forEach((a) => a.cancel()); anims.current = []; } }, [animH]);

  // a leaving card is removed when its exit has played (the timer is the net if the animation never reports)
  useEffect(() => {
    if (!out) return;
    const t = setTimeout(() => onGone(entry.key), EXIT_MS + 120);
    return () => clearTimeout(t);
  }, [out, entry.key, onGone]);

  const phase = out ? 'out' : ready ? 'in' : 'wait';
  // the 2D app's own classes (src/ui/css2d): the words' card is its glass `pz-shade` with `pz-text` inside; the data card is `pz-data`
  const lay = layoutOf(vp.w, vp.h), stackCls = lay === 'stack' ? ' stack' : lay === 'tab' ? ' stack tab' : '';
  const surface = entry.id === 'ladder' ? `pz-data${extra ? ` ${extra}` : ''}` : `pz-shade pz-card${stackCls}`;
  return (
    <div className="dk-pos" data-live={live && !out} style={{ width: rect.w, transform: `translate3d(${rect.x}px, ${rect.y}px, 0)` }}>
      <div ref={plateRef} className="dk-plate" data-phase={phase} style={{ height: ready ? (animH ?? rect.h) : undefined }} aria-hidden="true" />
      <div ref={cardRef} className={`dk-card ${surface}`} data-card={entry.id} data-phase={phase} data-overflow={overflow || undefined}
        role="group" aria-label={label} style={{ height: ready ? (animH ?? rect.h) : undefined }} {...pointer}
        onAnimationEnd={(e) => { if (e.target !== e.currentTarget) return; if (out) onGone(entry.key); else if (e.animationName === 'dk-in') setLive(true); }}>
        <div ref={innerRef} className={entry.id === 'ladder' ? 'dk-in' : 'dk-in pz-text'}>{children}</div>
      </div>
    </div>
  );
}

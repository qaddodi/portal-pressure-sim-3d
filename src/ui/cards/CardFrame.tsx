import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEventHandler } from 'react';
import type { Rect } from '../layout/device.ts';
import type { Entry } from './stack.ts';
import { rail, outDistance, STAGGER, PARALLAX, RAIL_MS, type Dir } from './rail.ts';
import { useUi } from '../ui-store.ts';
import { layoutOf, radius } from '../layout/rules2d.ts';
import { centredKind, centredBox, panelVisual } from '../layout/plan.ts';

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
  /** a tap on the card (2D: a case card is lifted by a tap, as by Next) */
  onTap?(): void;
  /** a visual panel's 2D visual (table, plane, walls…) */
  visual?: string;
  /** the whole group of cards on this slide is measured and its fonts are in: a card comes in only then, so the cards arrive together and at their final size */
  go?: boolean;
  /** the card is the data card (it comes in 40 ms behind the words and travels a little less far: 2D's stagger, plus a slight parallax) */
  data?: boolean;
  /** the first cards of a talk fade in where they stand; every later one slides in */
  fresh?: boolean;
}

/** One card: placed by transform, sized exactly to its content with a glide, invisible until its words are laid out, then it rises in. */
export function CardFrame({ entry, rect, onHeight, onGone, children, label, pointer, overflow, extra, onTap, visual, go = true, data = false, fresh = false }: Props) {
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
    // a centred card (2D's panel and case) keeps its padding on the card itself, so its height is its words' and that padding
    const report = () => {
      const card = cardRef.current, cs = card && centredKind(entry.id) ? getComputedStyle(card) : null;
      const pad = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 0;
      // 2D's fit (presenter-zoom.js): a panel taller than its room zooms its contents down (--pz-fit, `.pz-panel > *`) until they fit, the words never under 12 px; only past that does the card split
      if (card && cs && centredKind(entry.id) === 'panel') {
        const room = centredBox(vp, 'panel', panelVisual({ id: entry.id, visual })).maxH, size = () => el.getBoundingClientRect().height + pad + 2;
        card.style.removeProperty('--pz-fit');
        const probe = card.querySelector('.pz-line, .pz-outline li, p'), lb = probe ? parseFloat(getComputedStyle(probe).getPropertyValue('font-size')) : 0, floor = lb > 12 ? Math.ceil((12 / lb) * 1000) / 1000 : 0.5;
        let k = 1, hgt = size();
        for (let n = 0; n < 8 && hgt > room && k > floor; n++) { k = Math.max(floor, k * Math.min(0.97, (room / hgt) ** 0.9)); card.style.setProperty('--pz-fit', k.toFixed(3)); hgt = size(); }
      }
      onHeight(entry.key, Math.round(rect.w), Math.ceil(el.getBoundingClientRect().height + pad) + 2);
    };
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

  // a card comes in only when its whole group can (every card measured at its final height, the fonts in), never on its own measure:
  // once let in it stays in, whatever the group does after
  const firstFade = useRef(fresh);   // (the card's own: the cards of a talk's first slide fade in; it is read when the card comes in, not when the talk has moved on)
  const gate = useRef(false);
  if (go && ready) gate.current = true;
  const phase = out ? 'out' : ready && gate.current ? 'in' : 'wait';

  // The rail (rail.ts, 2D's card throw): in from the side the talk comes from, out the way it goes, on the one clock; no CSS animation
  const dir: Dir = useUi((s) => s.dir);
  const par = data ? PARALLAX.data : PARALLAX.words;
  const vw = vp.w, cardW = rect.w;
  useLayoutEffect(() => {
    const card = cardRef.current, plate = plateRef.current;
    if (!card || !plate) return;
    const els = [card, plate], reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (phase === 'in') rail.enter(els, { dir, delay: data ? STAGGER : 0, par, fade: firstFade.current, reduce, done: () => setLive(true) });
    else if (phase === 'out') rail.leave(els, { dir, dist: outDistance(cardW, vw), par, reduce, done: () => onGone(entry.key) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  useLayoutEffect(() => () => { const card = cardRef.current, plate = plateRef.current; if (card && plate) rail.forget([card, plate]); }, []);
  // (the net, if the clock never reports a landing)
  useEffect(() => {
    if (!out) return;
    const t = setTimeout(() => onGone(entry.key), RAIL_MS + 300);
    return () => clearTimeout(t);
  }, [out, entry.key, onGone]);
  // the 2D app's own classes (src/ui/css2d): the words' card is its glass `pz-shade` with `pz-text` inside; the data card is `pz-data`
  const lay = layoutOf(vp.w, vp.h), stackCls = lay === 'stack' ? ' stack' : lay === 'tab' ? ' stack tab' : '';
  // the outline, the quick check and a case stand alone in the middle on 2D's own surfaces (`.pz-panel`, `.pz-case.on`); every other card is glass
  const alone = centredKind(entry.id);
  const surface = alone === 'panel' ? `pz-panel${extra ? ` ${extra}` : ''}` : alone === 'case' ? 'pz-case on' : entry.id === 'ladder' ? `pz-data${extra ? ` ${extra}` : ''}` : `pz-shade pz-card${stackCls}`;
  return (
    <div className="dk-pos" data-live={live && !out} data-centred={alone || undefined} style={{ width: rect.w, transform: `translate3d(${rect.x}px, ${rect.y}px, 0)` }}>
      <div ref={plateRef} className="dk-plate" data-phase={phase} style={{ height: ready ? (animH ?? rect.h) : undefined }} aria-hidden="true" />
      <div ref={cardRef} className={`dk-card ${surface}`} data-card={entry.id} data-phase={phase} data-overflow={overflow || undefined}
        role="group" aria-label={label} onClick={onTap} data-visual={entry.id === 'title' ? 'outline' : entry.id === 'check' ? 'check' : entry.id === 'visual' ? visual || 'table' : undefined} style={{ height: ready ? (animH ?? rect.h) : undefined }} {...pointer}>
        <div ref={innerRef} className={entry.id === 'ladder' || alone ? 'dk-in' : 'dk-in pz-text'}>{children}</div>
        {/* 2D's handle in the data card's foot (a touch screen, both cards up): a push up on the card puts it away */}
        {entry.id === 'ladder' && lay !== 'wide' && lay !== 'short' && <span className="pz-grip" aria-hidden="true" />}
      </div>
    </div>
  );
}

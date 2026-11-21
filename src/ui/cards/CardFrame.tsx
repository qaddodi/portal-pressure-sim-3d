import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEventHandler, type MouseEvent } from 'react';
import type { Rect } from '../layout/device.ts';
import type { Entry } from './stack.ts';
import { reduced } from '../a11y/motion.ts';
import { ARRIVE_CSS } from '../../clock/tween.ts';
import { rail, GLIDE_MS, STAGGER, PARALLAX, RAIL_MS, IN_MS, OUT_DONE, RAIL_CSS, type Dir } from './rail.ts';
import { useUi } from '../ui-store.ts';
import { closedPx } from './dock.ts';
import { CREDIT } from '../shell/words.ts';
import { layoutOf, radius } from '../layout/rules2d.ts';
import { centredKind, centredBox, panelVisual, footRadius } from '../layout/plan.ts';
import { observeThenFit } from '../layout/fit-later.ts';

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
  onTap?(e: MouseEvent<HTMLDivElement>): void;
  /** a visual panel's 2D visual (table, plane, walls…) */
  visual?: string;
  /** the whole group of cards on this slide is measured and its fonts are in: a card comes in only then, so the cards arrive together and at their final size */
  go?: boolean;
  /** the card is the data card (it comes in 40 ms behind the words and travels a little less far: 2D's stagger, plus a slight parallax) */
  data?: boolean;
  /** the first cards of a talk fade in where they stand; every later one slides in */
  fresh?: boolean;
  /** a tap on the card's empty part zooms it to the middle (a wide screen; 2D card-zoom.js) */
  zoomable?: boolean;
  /** the words are changing while this card stays (the data card kept across a slide): it moves to its new place with the new cards, on their curve, never before and never out and back in */
  swap?: boolean;
  /** the data card is docked (2D's dock): it stays up, slid away to its handle, its words faded; a tap on its edge brings it back */
  tuck?: boolean;
  /** custom properties written on the card's box (the pair's steps: --pz-tk on the words, --pz-dk on the data card) */
  vars?: CSSProperties;
  /** a new value measures the card again at once (a step that changes no height still has to be judged afresh) */
  remeasure?: string;
}

/** 2D's markLong (presenter.js): a title that sets in more than 2.4 lines is a long one and takes the smaller step (`.pz-h.long`, --s-big), so a long title never fills the card.
 *  Judged at the full size each time (the class is taken off, measured, put back), so a resize or a new title is judged afresh. A phone's stacked card has its own small title. */
export function markLong(root: HTMLElement | null, on: boolean): void {
  const ttl = root?.querySelector<HTMLElement>('.pz-h');
  if (!ttl) return;
  ttl.classList.remove('long');
  if (!on) return;
  const lh = parseFloat(getComputedStyle(ttl).lineHeight) || ttl.offsetHeight;
  if (ttl.offsetHeight > lh * 2.4) ttl.classList.add('long');
}

/** Which edge of a card stays where it is when its height changes: the foot (a phone's words card hangs from the screen's foot), the middle (a card the plan centres), or the top (the rest). */
type Anchor = 'foot' | 'mid' | 'top';
const ORIGIN: Record<Anchor, string> = { foot: '50% 100%', mid: '50% 50%', top: '50% 0%' };

/** One card: placed by transform, sized exactly to its content with a glide, invisible until its words are laid out, then it rises in. */
export function CardFrame({ entry, rect, onHeight, onGone, children, label, pointer, overflow, extra, onTap, visual, go = true, data = false, fresh = false, zoomable = false, swap = false, tuck = false, vars, remeasure }: Props) {
  const vp = useUi((s) => s.vp);
  const r = Math.round(radius(vp.w, vp.h, layoutOf(vp.w, vp.h)));
  // the words card on an iPhone with rounded corners takes the screen's own corner (less its inset) at its bottom two corners
  const bottomR = !data && layoutOf(vp.w, vp.h) === 'stack' && !centredKind(entry.id) ? footRadius(vp) : null;
  const round = (n: number, b: number | null = bottomR) => `${n}px ${n}px ${b ?? n}px ${b ?? n}px`;
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);          // the card has landed: from now on a move of its place glides
  const shownH = useRef<number | null>(null);        // the height the card is drawn at (for the glide)
  const anims = useRef<Animation[]>([]);
  const now = useRef({ live: false, out: false, overflow: false, r: 0, rr: '', anchor: 'top' as Anchor });   // (what the measuring callback, made once, needs to know of the latest render)
  const out = entry.phase === 'out';
  const ready = rect.h > 0;
  // A phone's (and an upright tablet's) words card stands on the screen's foot: its BOTTOM edge is the fixed one (the card hangs from the foot: deck-ui.css `[data-anchor]`), and a card the plan
  // centres (the quick check, a case, a panel) keeps its MIDDLE, so a card that grows
  // rises and one that shrinks sinks, by its own height, in the same frame, with no plan to wait for. Before, the card kept its top and grew down past the foot at its old place, and the plan's
  // new place came a React round trip later: the answer stood outside the card, then the card jumped up by the growth (eyes on c70021f, 20 Nov: "overshoots and jumps 65 px").
  const lay0 = layoutOf(vp.w, vp.h);
  const anchor: Anchor = centredKind(entry.id) ? 'mid' : !data && (lay0 === 'stack' || lay0 === 'tab') ? 'foot' : 'top';
  now.current = { live, out, overflow: !!overflow, r, rr: round(r), anchor };

  // A card whose own words grow (an answer opens under its question) is that tall at once and revealed down to it by the same glide the rows under the question ease down by,
  // started in the measuring callback itself, before the frame is painted: the height the plan gives it comes a React round trip later, and until then the words stood below the
  // card's edge (Mohammad, 20 Nov: "the card is not expanding as fast as the text"). The plan's later height is the same, and finds the card already there.
  const growNow = (h: number) => {
    const card = cardRef.current, plate = plateRef.current, n = now.current, prev = shownH.current;
    if (!card || !plate || prev == null || !n.live || n.out || n.overflow || h <= prev + 1 || typeof card.animate !== 'function' || reduced()) return;
    shownH.current = h;
    card.style.height = `${h}px`; plate.style.height = `${h}px`;
    if (n.anchor === 'mid') card.style.top = `${-h / 2}px`;
    reveal(prev, h);
  };
  // the same for a card that gets shorter (an answer shuts): it is its new height at once for the words (they take their final places: the top padding stands in for the height it has lost),
  // and its frame sinks to it by the glide: clipped from the top (a card on the foot) or from the foot, its shadow plate scaled to match
  const shrinkNow = (h: number) => {
    const card = cardRef.current, n = now.current, prev = shownH.current;
    if (!card || prev == null || !n.live || n.out || n.overflow || h >= prev - 1 || typeof card.animate !== 'function' || reduced()) return;
    shownH.current = h;
    sink(prev, h);
  };
  const sink = (prev: number, next: number, opts?: KeyframeAnimationOptions) => {
    const card = cardRef.current, plate = plateRef.current;
    if (!card || !plate) return;
    const o = opts ?? { duration: GLIDE_MS, easing: ARRIVE_CSS, fill: 'forwards' }, d = prev - next, a = now.current.anchor, rr = now.current.rr, org = ORIGIN[a];
    anims.current.forEach((x) => x.cancel());
    setAnimH(prev);
    // (the words take their final places at once: the frame is still its old height, so they are moved down by what the frame's top has still to lose)
    if (a !== 'top' && innerRef.current) innerRef.current.style.transform = `translateY(${a === 'foot' ? d : d / 2}px)`;
    anims.current = [
      card.animate([{ clipPath: `inset(0 0 0 0 round ${rr})` }, { clipPath: a === 'foot' ? `inset(${d}px 0 0 0 round ${rr})` : a === 'mid' ? `inset(${d / 2}px 0 ${d / 2}px 0 round ${rr})` : `inset(0 0 ${d}px 0 round ${rr})` }], o),
      plate.animate([{ transform: 'scaleY(1)', transformOrigin: org }, { transform: `scaleY(${next / prev})`, transformOrigin: org }], o),
    ];
    anims.current[0].onfinish = () => setAnimH(null);
  };
  const reveal = (prev: number, next: number, opts?: KeyframeAnimationOptions) => {
    const card = cardRef.current, plate = plateRef.current;
    if (!card || !plate) return;
    const o = opts ?? { duration: GLIDE_MS, easing: ARRIVE_CSS, fill: 'forwards' };
    anims.current.forEach((a) => a.cancel());
    const a = now.current.anchor, rr = now.current.rr, org = ORIGIN[a], g = next - prev;
    anims.current = [
      card.animate([{ clipPath: a === 'foot' ? `inset(${g}px 0 0 0 round ${rr})` : a === 'mid' ? `inset(${g / 2}px 0 ${g / 2}px 0 round ${rr})` : `inset(0 0 ${g}px 0 round ${rr})` }, { clipPath: `inset(0 0 0 0 round ${rr})` }], o),
      plate.animate([{ transform: `scaleY(${prev / next})`, transformOrigin: org }, { transform: 'scaleY(1)', transformOrigin: org }], o),
    ];
    anims.current[0].onfinish = () => anims.current.forEach((a) => a.cancel());
  };

  // measure the words' natural height: the card is sized to it exactly
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    // a centred card (2D's panel and case) keeps its padding on the card itself, so its height is its words' and that padding
    const report = () => {
      markLong(innerRef.current, layoutOf(vp.w, vp.h) !== 'stack' && layoutOf(vp.w, vp.h) !== 'tab');
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
      const h = Math.ceil(el.getBoundingClientRect().height + pad) + 2;
      growNow(h); shrinkNow(h);
      onHeight(entry.key, Math.round(rect.w), h);
    };
    report();
    return observeThenFit([el], report);   // (the pass writes onto what it observes, its class and --pz-fit: never inside the observer's own delivery)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.key, Math.round(rect.w), remeasure]);

  // A change of height after landing glides, by clip-path on the card and a scaled shadow plate (compositor work, no layout per frame):
  // growing, the card is its new height at once and is revealed down to it; shrinking, it stays its old height, is clipped up to the new
  // one, and takes the new height only when the glide has finished.
  const [animH, setAnimH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const card = cardRef.current, plate = plateRef.current;
    if (!card || !plate || !ready) return;
    const prev = shownH.current;
    shownH.current = rect.h;
    if (out) { anims.current.forEach((a) => a.cancel()); anims.current = []; return; }   // (a card on its way out is never clipped by a height glide)
    if (prev == null || prev === rect.h || !(live || gate.current)) return;
    if (typeof card.animate !== 'function' || reduced()) return;
    const opts: KeyframeAnimationOptions = swap ? { duration: IN_MS, delay: OUT_DONE, easing: RAIL_CSS, fill: 'both' } : { duration: GLIDE_MS, easing: ARRIVE_CSS, fill: 'forwards' };
    if (rect.h > prev) {
      reveal(prev, rect.h, opts);
    } else {
      sink(prev, rect.h, opts);
    }
  }, [rect.h, ready, live, out]);
  // the new height is in place: let go of the glide (cancelled here, after the commit, so no frame shows the full old card)
  useLayoutEffect(() => { if (animH == null) { innerRef.current?.style.removeProperty('transform'); if (anims.current.length) { anims.current.forEach((a) => a.cancel()); anims.current = []; } } }, [animH]);

  // a card comes in only when its whole group can (every card measured at its final height, the fonts in), never on its own measure:
  // once let in it stays in, whatever the group does after
  const gate = useRef(false);
  if (go && ready) gate.current = true;
  now.current.live = live || gate.current;   // (a card sliding in is on screen: a change of its height glides, it never snaps)
  const phase = out ? 'out' : ready && gate.current ? 'in' : 'wait';

  // The rail (rail.ts, 2D's card throw): in from the side the talk comes from, out the way it goes, on the one clock; no CSS animation
  const dir: Dir = useUi((s) => s.dir);
  const par = data ? PARALLAX.data : PARALLAX.words;
    useLayoutEffect(() => {
    const card = cardRef.current, plate = plateRef.current;
    if (!card || !plate) return;
    const els = [card, plate], reduce = reduced();
    if (phase === 'in') rail.enter(els, { dir, delay: data ? STAGGER : 0, par, reduce, fresh, done: () => setLive(true) });
    else if (phase === 'out') rail.leave(els, { dir, par, reduce, done: () => onGone(entry.key) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  useLayoutEffect(() => () => { const card = cardRef.current, plate = plateRef.current; if (card && plate) rail.forget([card, plate]); }, []);
  // (the net, if the clock never reports a landing)
  useEffect(() => {
    if (!out) return;
    const t = setTimeout(() => onGone(entry.key), RAIL_MS + 500);
    return () => clearTimeout(t);
  }, [out, entry.key, onGone]);
  // the 2D app's own classes (src/ui/css2d): the words' card is its glass `pz-shade` with `pz-text` inside; the data card is `pz-data`
  const lay = layoutOf(vp.w, vp.h), stackCls = lay === 'stack' ? ' stack' : lay === 'tab' ? ' stack tab' : '';
  // the outline, the quick check and a case stand alone in the middle on 2D's own surfaces (`.pz-panel`, `.pz-case.on`); every other card is glass
  const alone = centredKind(entry.id);
  const surface = alone === 'panel' ? `pz-panel${extra ? ` ${extra}` : ''}` : alone === 'case' ? 'pz-case on' : entry.id === 'ladder' ? `pz-data${extra ? ` ${extra}` : ''}` : `pz-shade pz-card${stackCls}`;
  return (
    <div className="dk-pos" data-anchor={anchor !== 'top' ? anchor : undefined} data-live={live && !out} data-centred={alone || undefined} data-slot={data ? 'data' : 'words'} data-tucked={tuck || undefined} style={{ ...vars, width: rect.w, transform: `translate3d(${rect.x}px, ${anchor === 'foot' ? rect.y + rect.h : anchor === 'mid' ? rect.y + rect.h / 2 : rect.y}px, 0)`, ...(tuck ? { translate: `0 ${-closedPx(rect.h)}px` } : null), ...(swap && !reduced() ? { transition: `transform ${IN_MS}ms ${RAIL_CSS} ${OUT_DONE}ms` } : null) }}>
      <div ref={plateRef} className="dk-plate" data-phase={phase} style={{ height: ready ? (animH ?? rect.h) : undefined, ...(bottomR != null ? { borderRadius: round(r) } : null) }} aria-hidden="true" />
      <div ref={cardRef} className={`dk-card ${surface}`} data-card={entry.id} data-phase={phase} data-overflow={overflow || undefined}
        role="group" aria-label={label} onClick={onTap} data-zoomable={zoomable || undefined} data-visual={entry.id === 'title' ? 'outline' : entry.id === 'check' ? 'check' : entry.id === 'visual' ? visual || 'table' : undefined} style={{ height: ready ? (animH ?? rect.h) : undefined, ...(anchor === 'mid' && ready ? { top: -(animH ?? rect.h) / 2 } : null), ...(bottomR != null ? { borderRadius: round(r) } : null) }} {...pointer}>
        <div ref={innerRef} className={entry.id === 'ladder' || alone ? 'dk-in' : 'dk-in pz-text'} style={tuck ? { opacity: 0 } : undefined}>{children}</div>
        {/* 2D's handle in the data card's foot (a touch screen, both cards up): a push up on the card puts it away. Every data card has it (the summary table's too: it docks the same way) */}
        {/* An iPhone's credit: one line in the foot of the words card, in the same place on every slide, never over its words (2D `.pz-cred`; the foot's padding and the pill's place leave its row, plan.ts CRED_ROW) */}
        {lay === 'stack' && !data && surface.startsWith('pz-shade') && <span className="pz-cred" aria-hidden="true">{CREDIT}</span>}
        {(entry.id === 'ladder' || entry.id === 'table') && lay !== 'wide' && lay !== 'short' && <span className="pz-grip" aria-hidden="true" />}
      </div>
    </div>
  );
}

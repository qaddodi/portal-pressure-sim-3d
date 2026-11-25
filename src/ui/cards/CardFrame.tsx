import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEventHandler, type MouseEvent } from 'react';
import type { Rect } from '../layout/device.ts';
import type { Entry } from './stack.ts';
import { reduced } from '../a11y/motion.ts';
import { ARRIVE_CSS } from '../../clock/tween.ts';
import { rail, GLIDE_MS, STAGGER, PARALLAX, RAIL_MS, IN_MS, OUT_DONE, RAIL_CSS, type Dir } from './rail.ts';
import { useUi } from '../ui-store.ts';
import { closedPx } from './dock.ts';
import { CREDIT } from '../shell/words.ts';
import { layoutOf, radius, isSideways } from '../layout/rules2d.ts';
import { centredKind, centredBox, panelVisual, footRadius } from '../layout/plan.ts';
import { observeThenFit } from '../layout/fit-later.ts';
import { scaleOf } from '../charts/fit.ts';
import { heldBy, openCharts } from './card-want.ts';
import { beginSink, beginReveal, finishSink, finishReveal, settle, committed, shiftWords, type GlideHost } from './card-glide.ts';
import { boxOf, noteGrew, freezeOf, tellsLayer, BOX_START, type Frozen } from './box-lock.ts';

import { clock } from '../../clock/frame.ts';
interface Props {
  entry: Entry;
  /** Where the card goes (its height is the one measured; 0 until measured). */
  rect: Rect;
  /** Reports the natural height of the content (px, border included) whenever it changes, and `want`: that height with every picture held to its room at the height it wanted (Plan 43; = h when none is held). */
  onHeight(key: string, width: number, h: number, want?: number, open?: number): void;
  onGone(key: string): void;
  /** a kept data card's new slide needs a taller box than it landed with: the layer replaces it with a fresh card at its final size instead of growing it */
  onOutgrown?(key: string): void;
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
  /** a phone on its side: the card column is scrolled, so this card rests slid up by this many px (the same for both cards: the instrument in the middle, the words bleeding off the top) */
  lift?: number;
  /** custom properties written on the card's box (the pair's steps: --pz-tk on the words, --pz-dk on the data card) */
  vars?: CSSProperties;
  /** a new value measures the card again at once (a step that changes no height still has to be judged afresh) */
  remeasure?: string;
}

/** 2D's markLong (presenter.js): a title that sets in more than 2.4 lines is a long one and takes the smaller step (`.pz-h.long`, --s-big), so a long title never fills the card.
 *  Judged at the full size each time (the class is taken off, measured, put back), so a resize or a new title is judged afresh. A phone's stacked card has its own small title. */
/** The one card whose box grows and shuts by design: the quick check opens an answer under its question (the card glides to it; CheckCard). Its room is not reserved up front (that would make it as tall as every answer open: a decision for the owner, Plan 45 question 1). */
export const GROWS_BY_DESIGN: ReadonlySet<string> = new Set(['check']);
/** The longest a leaving card waits for the cards replacing it before it goes anyway. */
export const HOLD_OUT_MS = 700;

export function markLong(root: HTMLElement | null, on: boolean): void {
  // (every title the card holds: a compare button's other titles stand in the same cell, hidden, and must be judged the same way so the card's reserve is the tallest one's)
  root?.querySelectorAll<HTMLElement>('.pz-h').forEach((ttl) => {
    ttl.classList.remove('long');
    if (!on) return;
    const lh = parseFloat(getComputedStyle(ttl).lineHeight) || ttl.offsetHeight;
    if (ttl.offsetHeight > lh * 2.4) ttl.classList.add('long');
  });
}

/** Which edge of a card stays where it is when its height changes: the foot (a phone's words card hangs from the screen's foot), the middle (a card the plan centres), or the top (the rest). */
type Anchor = 'foot' | 'mid' | 'top';
const ORIGIN: Record<Anchor, string> = { foot: '50% 100%', mid: '50% 50%', top: '50% 0%' };

/** One card: placed by transform, sized exactly to its content with a glide, invisible until its words are laid out, then it rises in. */
export function CardFrame({ entry, rect, onHeight, onGone, onOutgrown, children, label, pointer, overflow, extra, onTap, visual, go = true, data = false, fresh = false, zoomable = false, swap = false, tuck = false, lift, vars, remeasure }: Props) {
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
  const lastStep = useRef<string | null>(null);      // the step part of the signature the card was last measured at (see stepKey)
  const box = useRef(BOX_START);                    // the card's lock (box-lock.ts): its height is decided before it shows and stands until a new key, width, step or viewport
  const now = useRef({ landed: false, live: false, out: false, overflow: false, r: 0, rr: '', anchor: 'top' as Anchor });   // (what the measuring callback, made once, needs to know of the latest render)
  const out = entry.phase === 'out';
  const ready = rect.h > 0;
  // A phone's (and an upright tablet's) words card stands on the screen's foot: its BOTTOM edge is the fixed one (the card hangs from the foot: deck-ui.css `[data-anchor]`), and a card the plan
  // centres (the quick check, a case, a panel) keeps its MIDDLE, so a card that grows
  // rises and one that shrinks sinks, by its own height, in the same frame, with no plan to wait for. Before, the card kept its top and grew down past the foot at its old place, and the plan's
  // new place came a React round trip later: the answer stood outside the card, then the card jumped up by the growth (eyes on c70021f, 20 Nov: "overshoots and jumps 65 px").
  const lay0 = layoutOf(vp.w, vp.h);
  const anchor: Anchor = centredKind(entry.id) ? 'mid' : !data && (lay0 === 'stack' || lay0 === 'tab') ? 'foot' : 'top';
  now.current = { landed: live, live, out, overflow: !!overflow, r, rr: round(r), anchor };

  // A card whose own words grow (an answer opens under its question) is that tall at once and revealed down to it by the same glide the rows under the question ease down by,
  // started in the measuring callback itself, before the frame is painted: the height the plan gives it comes a React round trip later, and until then the words stood below the
  // card's edge (Mohammad, 20 Nov: "the card is not expanding as fast as the text"). The plan's later height is the same, and finds the card already there.
  const growNow = (h: number) => {
    const card = cardRef.current, plate = plateRef.current, n = now.current, prev = shownH.current;
    if (!card || !plate || prev == null || !n.landed || n.out || n.overflow || h <= prev + 1 || typeof card.animate !== 'function' || reduced()) return;
    shownH.current = h;
    card.style.height = `${h}px`; plate.style.height = `${h}px`;
    if (n.anchor === 'mid') card.style.top = `${-h / 2}px`;
    reveal(prev, h);
  };
  // the same for a card that gets shorter (an answer shuts): it is its new height at once for the words (they take their final places: the top padding stands in for the height it has lost),
  // and its frame sinks to it by the glide: clipped from the top (a card on the foot) or from the foot, its shadow plate scaled to match
  const shrinkNow = (h: number) => {
    const card = cardRef.current, n = now.current, prev = shownH.current;
    if (!card || prev == null || !n.landed || n.out || n.overflow || h >= prev - 1 || typeof card.animate !== 'function' || reduced()) return;
    shownH.current = h;
    sink(prev, h);
  };
  // the glide's one owner (card-glide.ts): every start, cancel and finish lets go of the held height and the words' shift together, so a glide cut short can never leave either behind
  const host: GlideHost = {
    cancelAnims: () => { anims.current.forEach((x) => x.cancel()); anims.current = []; },
    setAnimH: (h) => setAnimH(h),
    shiftWords: (px) => shiftWords(innerRef.current, px),
  };
  const sink = (prev: number, next: number, opts?: KeyframeAnimationOptions) => {
    const card = cardRef.current, plate = plateRef.current;
    if (!card || !plate) return;
    const o = opts ?? { duration: GLIDE_MS, easing: ARRIVE_CSS, fill: 'forwards' }, d = prev - next, a = now.current.anchor, rr = now.current.rr, org = ORIGIN[a];
    // (the frame is still its old height, so the words are moved down by what the frame's top has still to lose: onto each child, never a transform on the inner, which would carry the name tab onto the title)
    beginSink(host, prev, next, a);
    anims.current = [
      card.animate([{ clipPath: `inset(0 0 0 0 round ${rr})` }, { clipPath: a === 'foot' ? `inset(${d}px 0 0 0 round ${rr})` : a === 'mid' ? `inset(${d / 2}px 0 ${d / 2}px 0 round ${rr})` : `inset(0 0 ${d}px 0 round ${rr})` }], o),
      plate.animate([{ transform: 'scaleY(1)', transformOrigin: org }, { transform: `scaleY(${next / prev})`, transformOrigin: org }], o),
    ];
    anims.current[0].onfinish = () => finishSink(host);
  };
  const reveal = (prev: number, next: number, opts?: KeyframeAnimationOptions) => {
    const card = cardRef.current, plate = plateRef.current;
    if (!card || !plate) return;
    const o = opts ?? { duration: GLIDE_MS, easing: ARRIVE_CSS, fill: 'forwards' };
    beginReveal(host, next);
    const a = now.current.anchor, rr = now.current.rr, org = ORIGIN[a], g = next - prev;
    anims.current = [
      card.animate([{ clipPath: a === 'foot' ? `inset(${g}px 0 0 0 round ${rr})` : a === 'mid' ? `inset(${g / 2}px 0 ${g / 2}px 0 round ${rr})` : `inset(0 0 ${g}px 0 round ${rr})` }, { clipPath: `inset(0 0 0 0 round ${rr})` }], o),
      plate.animate([{ transform: `scaleY(${prev / next})`, transformOrigin: org }, { transform: 'scaleY(1)', transformOrigin: org }], o),
    ];
    anims.current[0].onfinish = () => finishReveal(host);
  };

  // measure the words' natural height: the card is sized to it exactly
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    // a centred card (2D's panel and case) keeps its padding on the card itself, so its height is its words' and that padding
    // `full`: the fit is made from scratch (the card's first measure, a new width, a new step). A pass the observer starts after the card is let in (`live`) only measures: it never changes a class, --pz-fit
    // or a chart's box in place unless the card is really past its room (Plan 43: nothing re-spaces while a card shows or moves). A card on its way out never measures: it keeps the layout it left with.
    let sameStepPass = false;   // (set around the one measure a kept data card makes when only its slide changed)
    const report = (full = true, fresh = false) => {
      if (now.current.out) return;
      if (full) markLong(innerRef.current, layoutOf(vp.w, vp.h) !== 'stack' && layoutOf(vp.w, vp.h) !== 'tab');
      const card = cardRef.current, cs = card && centredKind(entry.id) ? getComputedStyle(card) : null;
      const pad = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 0;
      // 2D's fit (presenter-zoom.js): a panel taller than its room zooms its contents down (--pz-fit, `.pz-panel > *`) until they fit, the words never under 12 px; only past that does the card split
      if (card && cs && centredKind(entry.id) === 'panel') {
        const room = centredBox(vp, 'panel', panelVisual({ id: entry.id, visual })).maxH, size = () => el.getBoundingClientRect().height / scaleOf(el) + pad + 2 + heldBy(el);   // (+ what a picture held to its room still wants: the content zooms down until the picture has its height, never drawn past the panel, Plan 43)
        const cur = parseFloat(card.style.getPropertyValue('--pz-fit')) || 1;
        if (full) card.style.removeProperty('--pz-fit');
        const probe = card.querySelector('.pz-line, .pz-outline li, p'), lb = probe ? parseFloat(getComputedStyle(probe).getPropertyValue('font-size')) : 0, floor = lb > 12 ? Math.ceil((12 / lb) * 1000) / 1000 : 0.5;
        let k = full ? 1 : cur, hgt = size();
        for (let n = 0; n < 8 && hgt > room && k > floor; n++) { k = Math.max(floor, k * Math.min(0.97, (room / hgt) ** 0.9)); card.style.setProperty('--pz-fit', k.toFixed(3)); hgt = size(); }
      }
      const h = Math.ceil(el.getBoundingClientRect().height / scaleOf(el) + pad) + 2;   // (a card zoom is a transform: its rect is that many times the card's own height)
      // The box is decided once (box-lock.ts, Plan 45): once the card is let in, a measure the observer makes (a reading changed its width, a chart drew, a font swapped) never shrinks it or moves it;
      // a taller one still grows it by the glide (words are never clipped) and is logged for the audit. A new key, width, step or viewport (this effect's own first pass) takes the lock again.
      const out = boxOf(box.current, { t: 'measure', key: lockKey, h, fresh, shown: gate.current && !GROWS_BY_DESIGN.has(entry.id) });
      // (a kept card at the same step whose new slide needs more room than it landed with: no growth, a fresh card at its final size takes its place; the lock keeps what it landed with while this one leaves)
      // (and for a card whose content came after it was let in: a give-up let it in short, an instrument drew late. It grew past the box it locked and the box stands,
      //  so the rest would stand clipped for good; a fresh card at its final size takes its place, as for a kept card. CardLayer allows it twice a slide, then the lock stands)
      if (out.grew > 1 && onOutgrown && !now.current.out) { onOutgrown(entry.key); return; }
      box.current = out.state;
      if (out.grew) noteGrew({ card: entry.id, slide: entry.key, px: out.grew });
      if (!out.report) {
        // (a measure the lock swallowed still tells the layer the card is measured at this slide's signature, at the height it stands: the camera and the new words wait for it)
        if (tellsLayer(fresh, sameStepPass, box.current.h)) onHeight(entry.key, Math.round(rect.w), box.current.h, box.current.h + heldBy(el), openCharts(el));
        return;
      }
      growNow(h); shrinkNow(h);
      onHeight(entry.key, Math.round(rect.w), h, h + heldBy(el), openCharts(el));
    };
    // (a kept data card's slide change is a new signature but the same step: judged as an observer's measure, the lock stands)
    const sameStep = lastStep.current === stepKey && lastStep.current !== null && gate.current;
    lastStep.current = stepKey;
    sameStepPass = sameStep; report(true, !sameStep); sameStepPass = false;
    // a chart that has drawn once tells the card (card-want.ts openCharts): the card judges whether it can come in at once, not at the next resize
    const built = () => report(!now.current.live);   // (not `fresh`: a chart that draws after the card showed is a measure like any other)
    el.addEventListener('pz-chart-built', built);
    // the fonts arriving re-measure the words even when the new font leaves the height as it was (the observer is silent then, and the card would wait on a measure taken in the fallback font)
    let alive = true;
    if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(() => { if (alive) report(!now.current.live); });
    const off = observeThenFit([el], () => report(!now.current.live));
    return () => { alive = false; el.removeEventListener('pz-chart-built', built); off(); };   // (the pass writes onto what it observes, its class and --pz-fit: never inside the observer's own delivery)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.key, Math.round(rect.w), remeasure]);

  // a card comes in only when its whole group can (every card measured at its final height, the fonts in), never on its own measure:
  // once let in it stays in, whatever the group does after
  const gate = useRef(false);
  // A KEPT data card (keep.ts: the same instrument carried across slides) is not a new card when the slide changes: its signature starts with the words' key (`wordsKey|pages|…`), which changes with every slide.
  // The box is judged afresh only when a step of its own changes (page, ladder step, fit, viewport), never because the words beside it did, so it keeps the height it landed with (Mohammad, 24 Nov: cards never grow
  // as a slide lands). Before, the slide change re-measured it afresh, its room (a chart held to what the new words leave) changed its height, and the card glided to the new one.
  const stepKey = data ? (remeasure ?? '').slice((remeasure ?? '').indexOf('|') + 1) : remeasure ?? '';
  const lockKey = `${entry.key}|${Math.round(rect.w)}|${stepKey}`;
  if (go && ready && !gate.current) { gate.current = true; box.current = boxOf(box.current, { t: 'show', key: lockKey }).state; }
  now.current.live = live || gate.current;   // (a card sliding in is on screen: a change of its height glides, it never snaps)
  // THE HEIGHT IS LOCKED FROM THE FIRST FRAME THE CARD SHOWS (Mohammad, 25 Nov, third report: "teaching/instrument cards arrive in their final height, they do NOT grow ever"):
  // `hOn` is the height the card is drawn at. Once the card is let in it is the height it landed with for as long as its own step (lockKey) and the viewport stand: a plan that gives it more room later
  // (a words card that measured after it, a fit that settled) is not followed; a room that gets smaller is not either (a card never changes size once landed). A new step of its own (a page, a ladder step) or a new viewport takes the new height, and the plan is
  // given a short while to catch up with it (it lags the card's own measure by a render or two). The quick check grows by design and is exempt.
  const fz = useRef<Frozen | null>(null);
  const fkey = `${lockKey}|${vp.w}x${vp.h}|${tuck ? 'tucked' : ''}`;   // (a card the reader tucks or brings back is a change of its own, like a page: it takes the plan's height, the strip's or its own; frozen at its landing height it stayed a tall empty pane with its words hidden, Lowering pressure 11, capture af88a9c2)
  let hOn = rect.h;
  if (gate.current && ready && !out && !GROWS_BY_DESIGN.has(entry.id)) {
    fz.current = freezeOf(fz.current, fkey, rect.h, box.current.key === lockKey ? box.current.h : null);
    hOn = fz.current!.h;
  }
  // A change of height after landing glides, by clip-path on the card and a scaled shadow plate (compositor work, no layout per frame):
  // growing, the card is its new height at once and is revealed down to it; shrinking, it stays its old height, is clipped up to the new
  // one, and takes the new height only when the glide has finished.
  const [animH, setAnimH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const card = cardRef.current, plate = plateRef.current;
    if (!card || !plate || !ready) return;
    const prev = shownH.current;
    shownH.current = hOn;
    if (out) { settle(host); return; }   // (a card on its way out is never clipped by a height glide)
    // (only a card that has landed glides to a new height: one that is still arriving takes its height at once, so no arrival ever shows a card growing from below)
    if (prev == null || prev === hOn || !live) return;
    if (typeof card.animate !== 'function' || reduced()) return;
    const opts: KeyframeAnimationOptions = swap ? { duration: IN_MS, delay: OUT_DONE, easing: RAIL_CSS, fill: 'both' } : { duration: GLIDE_MS, easing: ARRIVE_CSS, fill: 'forwards' };
    if (hOn > prev) {
      reveal(prev, hOn, opts);
    } else {
      sink(prev, hOn, opts);
    }
  }, [hOn, ready, live, out]);
  // the new height is in place: let go of the glide (cancelled here, after the commit, so no frame shows the full old card)
  useLayoutEffect(() => { committed(host, animH); }, [animH]);

  const phase = out ? 'out' : ready && gate.current ? 'in' : 'wait';
  // A card that is going stays up, whole and readable, until the cards that replace it can come in (`go`: measured, fonts in), so no slide change shows an interval with nothing readable
  // (the old title gone, the case not yet there: review #14). Never for long: past HOLD_OUT_MS it goes anyway, and a card with nothing coming (the talk closing) is not held (go is not false).
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!out) { setLate(false); return; }
    if (go !== false) return;
    const t = clock.after(() => setLate(true), HOLD_OUT_MS);
    return () => clock.cancel(t);
  }, [out, go]);
  const leave = out && (go !== false || late);

  // The rail (rail.ts, 2D's card throw): in from the side the talk comes from, out the way it goes, on the one clock; no CSS animation
  const dir: Dir = useUi((s) => s.dir);
  const par = data ? PARALLAX.data : PARALLAX.words;
    useLayoutEffect(() => {
    const card = cardRef.current, plate = plateRef.current;
    if (!card || !plate) return;
    const els = [card, plate], reduce = reduced();
    if (phase === 'in') rail.enter(els, { dir, delay: data ? STAGGER : 0, par, reduce, fresh, done: () => setLive(true) });
    else if (phase === 'out' && leave) rail.leave(els, { dir, par, reduce, done: () => onGone(entry.key) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, leave]);
  useLayoutEffect(() => () => { const card = cardRef.current, plate = plateRef.current; if (card && plate) rail.forget([card, plate]); }, []);
  // (the net, if the clock never reports a landing)
  useEffect(() => {
    if (!leave) return;
    const t = clock.after(() => onGone(entry.key), RAIL_MS + 500);
    return () => clock.cancel(t);
  }, [leave, entry.key, onGone]);
  // the 2D app's own classes (src/ui/styles): the words' card is its glass `pz-shade` with `pz-text` inside; the data card is `pz-data`
  const lay = layoutOf(vp.w, vp.h), stackCls = lay === 'stack' ? ' stack' : lay === 'tab' ? ' stack tab' : '';
  // the outline, the quick check and a case stand alone in the middle on 2D's own surfaces (`.pz-panel`, `.pz-case.on`); every other card is glass
  const alone = centredKind(entry.id);
  const surface = alone === 'panel' ? `pz-panel${extra ? ` ${extra}` : ''}` : alone === 'case' ? 'pz-case on' : entry.id === 'ladder' ? `pz-data${extra ? ` ${extra}` : ''}` : `pz-shade pz-card${stackCls}`;
  return (
    <div className="dk-pos" data-anchor={anchor !== 'top' ? anchor : undefined} data-live={live && !out} data-centred={alone || undefined} data-slot={data ? 'data' : 'words'} data-tucked={tuck || undefined} style={{ ...vars, width: rect.w, transform: `translate3d(${rect.x}px, ${anchor === 'foot' ? rect.y + rect.h : anchor === 'mid' ? rect.y + rect.h / 2 : rect.y}px, 0)`, ...(tuck ? { translate: `0 ${-closedPx(rect.h)}px` } : lift ? { translate: `0 ${-lift}px` } : null), ...(swap && !reduced() ? { transition: `transform ${IN_MS}ms ${RAIL_CSS} ${OUT_DONE}ms` } : null) }}>
      <div ref={plateRef} className="dk-plate" data-phase={phase} style={{ height: ready ? (animH ?? hOn) : undefined, ...(bottomR != null ? { borderRadius: round(r) } : null) }} aria-hidden="true" />
      <div ref={cardRef} className={`dk-card ${surface}`} data-card={entry.id} data-phase={phase} data-overflow={overflow || undefined}
        role="group" aria-label={label} onClick={onTap} data-zoomable={zoomable || undefined} data-visual={entry.id === 'title' ? 'outline' : entry.id === 'check' ? 'check' : entry.id === 'visual' ? visual || 'table' : undefined} style={{ height: ready ? (animH ?? hOn) : undefined, ...(anchor === 'mid' && ready ? { top: -(animH ?? hOn) / 2 } : null), ...(bottomR != null ? { borderRadius: round(r) } : null) }} {...pointer}>
        <div ref={innerRef} className={entry.id === 'ladder' || alone ? 'dk-in' : 'dk-in pz-text'} style={tuck ? { opacity: 0 } : undefined}>{children}</div>
        {/* 2D's handle in the data card's foot (a touch screen, both cards up): a push up on the card puts it away. Every data card has it (the summary table's too: it docks the same way) */}
        {/* An iPhone's credit: one line in the foot of the words card, in the same place on every slide, never over its words (2D `.pz-cred`; the foot's padding and the pill's place leave its row, plan.ts CRED_ROW) */}
        {!data && (lay === 'stack' || lay === 'tab' ? surface.startsWith('pz-shade') : isSideways(vp.w, vp.h) && (surface.startsWith('pz-shade') || surface.startsWith('pz-panel'))) && <span className="pz-cred" aria-hidden="true">{CREDIT}</span>}
        {(entry.id === 'ladder' || entry.id === 'table') && lay !== 'wide' && lay !== 'short' && <span className="pz-grip" aria-hidden="true" />}
      </div>
    </div>
  );
}

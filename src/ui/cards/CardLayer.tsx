import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { caseOf, type Deck, type ReadingKey, type Slide } from '../../decks/schema.ts';
import { useUi, atEnd } from '../ui-store.ts';
import { finishTalk } from './finish.ts';
import { dataKeys } from './keep.ts';
import { useDockSwipe, openDock, justDocked } from './useDockSwipe.ts';
import { viewAt, lastSlideShot } from '../deck/presenter-machine.ts';
import { planLayout, widthOf, stepsFor, centredKind, centredBox, panelVisual, type CardId, type Need, type Plan } from '../layout/plan.ts';
import { isSideways, layoutOf } from '../layout/rules2d.ts';
import type { Rect } from '../layout/device.ts';
import { useStack } from './useStack.ts';
import type { Entry, Wanted } from './stack.ts';
import { CardFrame } from './CardFrame.tsx';
import { TitleCard } from './TitleCard.tsx';
import { CaseCard } from './CaseCard.tsx';
import { TeachingCard } from './TeachingCard.tsx';
import { LadderCard } from './LadderCard.tsx';
import { TilesCard, TilesHead } from './TilesCard.tsx';
import { CheckCard } from './CheckCard.tsx';
import { nameTabOf } from './NameTab.tsx';
import { TableCard } from './TableCard.tsx';
import { VisualCard } from './VisualCard.tsx';
import { ToolCard } from '../talk/ToolCard.tsx';
import { hasToolChart } from '../../decks/charts.ts';
import { Strip } from '../wallet/Strip.tsx';
import { useCardDrag, justDragged } from './useCardDrag.ts';
import { cardZoom, emptyTap } from './card-zoom.ts';
import { reduced } from '../a11y/motion.ts';
import { isSwapSwipe } from '../wallet/wallet-machine.ts';
import { swipeMove, apply, samePos, type Move } from '../deck/presenter-machine.ts';
import { gapOf } from './ladder-model.ts';
import { maxPages, clampPage } from './pages.ts';

/** True once the page's fonts are in (cards show only then). */
function useFontsReady(): boolean {
  const [ok, setOk] = useState(() => typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded');
  useEffect(() => { if (!ok) void document.fonts.ready.then(() => setOk(true)); }, [ok]);
  return ok;
}

const ZERO: Rect = { x: 0, y: 0, w: 0, h: 0 };
interface Snap { slide: Slide | null; /** the slide whose instrument the data card shows (the slide itself, or the one before it whose card stays) */ dslide: Slide | null; pages: number; at: number; trim: boolean }

/** Every card on screen: what the presenter says is up, where the planner puts it, kept through a leave and an enter. */
export function CardLayer({ deck }: { deck: Deck }) {
  const stops = useUi((s) => s.stops);
  const pos = useUi((s) => s.pos);
  const vp = useUi((s) => s.vp);
  const wallet = useUi((s) => s.wallet);
  const readings = useUi((s) => s.readings);
  const move = useUi((s) => s.move);
  const swapWallet = useUi((s) => s.swapWallet);
  const docked = useUi((s) => s.docked);
  const setDocked = useUi((s) => s.setDocked);
  const publishPlan = useUi((s) => s.publishPlan);

  // the data card at every stop (ui/cards/keep.ts): a slide with no instrument of its own keeps the one before it on screen unless a case, a lapse, a catheter or a patient change needs the screen
  const dataAt = useMemo(() => dataKeys(deck, stops), [deck, stops]);
  const here = dataAt[pos.stop] ?? null;
  const view = useMemo(() => {
    if (!stops.length) return null;
    const v = viewAt(stops, pos, lastSlideShot(stops));
    return !v.data && here && v.words === 'teach' ? { ...v, data: here.kind } : v;
  }, [stops, pos, here]);
  const carried = here && stops[here.from]?.kind === 'slide' ? (stops[here.from] as { slide: Slide }).slide : null;   // (the slide whose instrument the data card shows)
  // heights are tagged with the page they were measured on, so a card that has just been split is never judged by its whole height
  const [heights, setHeights] = useState<Record<string, { h: number; sig: string }>>({});
  const sigRef = useRef('');
  const onHeight = useCallback((key: string, w: number, h: number) => {
    const sig = sigRef.current;
    setHeights((m) => { const o = m[`${key}@${w}`]; return o && o.h === h && o.sig === sig ? m : { ...m, [`${key}@${w}`]: { h, sig } }; });
  }, []);
  const [pagesMap, setPagesMap] = useState<Record<string, number>>({});
  const page = useUi((s) => s.page);
  const setPageCount = useUi((s) => s.setPageCount);

  const wordsKey = view ? (view.slide && (view.words === 'teach' || view.words === 'case' || view.words === 'visual') ? `${view.words}:${view.slide.id}` : view.words) : '';
  const pagesKey = `${wordsKey}@${vp.w}x${vp.h}`;
  // iPhone on its side: the cards take the narrowest column that holds them, widening a step at a time (fewer lines of the same type), never a smaller type
  const sideways = isSideways(vp.w, vp.h), pair = !!view?.data;
  const [stepMap, setStepMap] = useState<Record<string, number>>({});
  const nSteps = stepsFor(vp, pair);
  // past the widest column the title takes one step down (never under 1.4× the words), then the words page: the body never shrinks
  const stepAt = sideways ? Math.min(stepMap[pagesKey] ?? 0, nSteps) : 0;
  const step = Math.min(stepAt, nSteps - 1), trim = stepAt >= nSteps;
  const alone = view && !view.data ? centredKind(view.words) : null;   // the outline, the quick check and a case stand alone in the middle at 2D's own width
  const wide = alone ? centredBox(vp, alone, panelVisual({ id: view!.words, visual: view!.slide?.visual })).w : Math.round(widthOf(vp, pair, step));
  const hit = (key: string) => heights[`${key}@${wide}`];
  const h = (key: string) => hit(key)?.h ?? 0;
  const capOf = (v: NonNullable<typeof view>) => maxPages(v.words, v.slide && v.words === 'case' ? caseOf(v.slide)?.text : v.slide?.line, v.words === 'check' ? deck.checks.length : 0);
  const pages = view ? Math.min(pagesMap[pagesKey] ?? 1, capOf(view)) : 1;
  const at = clampPage(page, pages);
  const sig = `${wordsKey}|${pages}|${at}|${stepAt}|${vp.w}x${vp.h}`;
  sigRef.current = sig;

  const dataKey = here?.key ?? 'ladder';
  const needs: Need[] = view ? [{ id: view.words, slot: 'words', visual: view.slide?.visual, h: h(wordsKey) }, ...(view.data ? [{ id: view.data, slot: 'data' as const, h: h(dataKey) }] : [])] : [];
  const plan: Plan = useMemo(() => planLayout(vp, needs, wallet.active, step, docked), [vp, wallet.active, step, docked, needs.map((n) => `${n.id}:${n.slot}:${n.h}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const wordsShown = plan.cards.find((c) => c.slot === 'words');
  // (a docked data card stays up where it was, slid away to its handle: the plan says where)
  const dataShown = plan.cards.find((c) => c.slot === 'data') ?? (plan.tucked && view?.data ? { id: view.data, slot: 'data' as const, rect: plan.tucked } : undefined);
  const wordsWanted: Wanted | null = view && wordsShown ? { key: wordsKey, id: view.words } : null;
  const dataWanted: Wanted | null = view?.data && dataShown ? { key: dataKey, id: view.data! } : null;
  const stripWanted: Wanted | null = plan.strip && !plan.docked ? { key: `strip:${plan.strip.slot}`, id: plan.strip.id } : null;
  const wordsStack = useStack(wordsWanted), dataStack = useStack(dataWanted), stripStack = useStack(stripWanted);

  // a words card taller than its room asks for one more page (only on a measurement of the page now showing); the count goes to the presenter
  const wordsHit = view ? hit(wordsKey) : undefined;
  const dataHit = view?.data ? hit(dataKey) : undefined;
  const tooTall = !!view && plan.overflow.includes(view.words) && wordsHit?.sig === sig;
  // a pair that does not fit its column at this step widens to the next step first; only past the widest does the words card split
  const tooTallPair = sideways && (tooTall || (pair && plan.overflow.includes(view?.data ?? 'ladder') && dataHit?.sig === sig));
  useLayoutEffect(() => {
    if (!view) return;
    const cap = capOf(view);
    if (tooTallPair && stepAt < nSteps) { setStepMap((m) => ({ ...m, [pagesKey]: stepAt + 1 })); return; }
    if (tooTall && pages < cap) setPagesMap((m) => ({ ...m, [pagesKey]: pages + 1 }));
  }, [tooTall, tooTallPair, stepAt, nSteps, pages, pagesKey, view, deck.checks.length]);
  useLayoutEffect(() => { setPageCount(pages); }, [pages, setPageCount, wordsKey]);

  // a leaving card stays where it was while it goes
  const last = useRef<Record<string, Rect>>({});
  const snapRef = useRef<Record<string, Snap>>({});
  if (wordsShown && wordsWanted) last.current[wordsWanted.key] = wordsShown.rect;
  if (dataShown && dataWanted) last.current[dataWanted.key] = dataShown.rect;
  if (plan.strip && stripWanted) last.current[stripWanted.key] = plan.strip.rect;

  // The cards come in together, whole: only when every card of the slide is measured on the page now showing, nothing is still to widen or split,
  // and the fonts are in (a card that came in on its own measure then grew, and the second card showed up after the first). A slow measure never
  // holds a slide back for good: past 320 ms the cards come in as they are.
  const fonts = useFontsReady();
  const growing = (tooTallPair && stepAt < nSteps) || (tooTall && pages < (view ? capOf(view) : 1));
  const measured = needs.length > 0 && needs.every((n) => (n.h > 0 && (n.slot === 'data' || hit(wordsKey)?.sig === sig)) || (plan.docked && n.slot === 'data'));
  const [late, setLate] = useState('');
  useEffect(() => { const t = setTimeout(() => setLate(pagesKey), 320); return () => clearTimeout(t); }, [pagesKey]);
  const go = fonts && !growing && (measured || late === pagesKey);
  // the first cards of a talk fade in where they stand; every later one slides in from the side the talk comes from (2D's first card has no way to come from)
  const seen = useRef(false);
  const fresh = !seen.current;
  useLayoutEffect(() => { if (wordsStack.entries.length || dataStack.entries.length) seen.current = true; });

  // 2D's card zoom (card-zoom.js): a tap on the empty part of a card on a wide screen zooms it to the middle, the other card riding along; a tap on the veil,
  // Esc, a slide change or a new size puts it back. Only a card that stands whole (nothing leaving or waiting to come in).
  const zoomsHere = plan.layout === 'wide' && !alone && !!(dataShown || wordsShown);
  const veilRef = useRef<HTMLDivElement>(null), zveilRef = useRef<HTMLDivElement>(null);
  const reduceMotion = reduced;
  const zoomTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    if (justDragged() || !zoomsHere) return;
    if (cardZoom.up) { void cardZoom.close({ reduce: reduceMotion() }); return; }
    if (cardZoom.on || !emptyTap(e.target, card)) return;
    const live = [...document.querySelectorAll<HTMLElement>('.dk-card[data-card]:not([data-phase="out"])')];
    if (live.some((c) => c.getAttribute('data-phase') === 'wait')) return;
    const els = (c: HTMLElement) => [c, ...(c.previousElementSibling?.classList.contains('dk-plate') ? [c.previousElementSibling as HTMLElement] : [])];
    cardZoom.open({
      focus: els(card), others: live.filter((c) => c !== card).map(els), reduce: reduceMotion(), veil: zveilRef.current, mark: document.body,
      area: { left: 0, top: 0, width: vp.w, height: vp.h },
    });
  };
  // a slide change, a new size or a leaving layout glides the zoom back (nothing in the app snaps: Mohammad, 20 Nov), as the slide's own cards go out and come in on the rail
  useEffect(() => { void cardZoom.close({ reduce: reduceMotion() }); }, [wordsKey, dataKey, vp.w, vp.h, zoomsHere]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cardZoom.reset(), []);

  // the cards' boxes go to the scene once per layout change, when every card up has been measured
  const settled = needs.length > 0 && needs.every((n) => n.h > 0 || (plan.docked && n.slot === 'data'));   // (a card put away is not measured: it is not up)
  useLayoutEffect(() => { if (settled) publishPlan(plan); }, [plan, settled, publishPlan]);

  // a swipe on the last slide's card ends the talk (the figure comes back); anywhere else it moves the talk
  const goTo = (m: Move) => { if (m === 'next' && atEnd(useUi.getState())) finishTalk(); else move(m); };
  // 2D's dock (ui/cards/dock.ts): on a phone or an upright iPad with both cards up, a push up anywhere on the slide slides the instrument card away to its handle, following the finger; a pull down
  // anywhere brings it back; a tap on its handle too
  const dockable = (plan.layout === 'stack' || plan.layout === 'tab') && (!plan.strip || plan.docked) && !!dataShown && !!wordsShown && !alone;
  useDockSwipe({ enabled: dockable && !cardZoom.on, docked: plan.docked, onSettle: (closed) => setDocked(closed) });
  // phones: a vertical swipe on a card swaps the wallet; anywhere: a sideways swipe on a card moves the talk
  const swipe = useCardDrag({
    onEnd: (g, e) => {
      // a vertical swipe the dock took (useDockSwipe lets go on this same pointerup) is not also the wallet's swap: once the dock has landed and the store has re-rendered (a card pushed fully away
      // lands at once), `plan.strip` is the docked card's edge, and the swipe that docked it was read a second time as "swap" and brought the card straight back
      if (justDocked()) return;
      if (plan.strip && isSwapSwipe(g)) { swapWallet(); return; }
      const m = swipeMove(g.dx, g.dy, g.ms);
      if (m) goTo(m);
    },
    onMove: goTo,
    // a drag follows only where it will do something: a slide to go to (or a page to turn), not the first slide's Back
    // the data card the next slide keeps (same key) stays put under a drag: only the cards that change follow the finger
    keeps: (dx) => { if (dx < 0 && atEnd(useUi.getState())) return false; const to = dataAt[apply(stops, pos, dx < 0 ? 'next' : 'back').stop]; return !!view?.data && !!to && to.key === dataKey; },
    // a slide change sends the cards out from where the finger let go; a page turned, or a beat of this slide, leaves them where they are (they ease back)
    leaves: (m) => {
      if (m === 'next' && atEnd(useUi.getState())) return true;
      const to = apply(stops, pos, m);
      if (samePos(to, pos)) return false;
      const v2 = viewAt(stops, to, lastSlideShot(stops));
      return (v2.slide && (v2.words === 'teach' || v2.words === 'case' || v2.words === 'visual') ? `${v2.words}:${v2.slide.id}` : v2.words) !== wordsKey;
    },
    can: (dx) => pages > 1 || (dx < 0 && atEnd(useUi.getState())) || !samePos(apply(stops, pos, dx < 0 ? 'next' : 'back'), pos),
    width: vp.w,
    cards: () => [...document.querySelectorAll<HTMLElement>('.dk-card[data-card]:not([data-phase="out"])')].map((card) => ({ els: [card, ...(card.previousElementSibling?.classList.contains('dk-plate') ? [card.previousElementSibling as HTMLElement] : [])], data: card.getAttribute('data-card') === 'ladder' || card.getAttribute('data-card') === 'table' })),
  });

  if (!view) return null;
  const read = (k: string, at?: string) => readings[at ? `${k}@${at}` : k];
  const gap = gapOf(readings);
  const stacked = layoutOf(vp.w, vp.h) === 'stack' || layoutOf(vp.w, vp.h) === 'tab';
  // each card draws what it was given when it came in, so a card that is leaving keeps its own words while it goes
  const snaps = snapRef.current;
  const now: Snap = { slide: view.slide, dslide: carried ?? view.slide, pages, at, trim };
  const content = (e: Entry) => {
    // (only the card the view is on takes the view's words: for the render before a slide change reaches the stack, the card still standing is the old slide's, and must keep its own)
    if (e.phase === 'in' && (e.key === wordsKey || e.key === dataKey)) snaps[e.key] = now;
    const sn = snaps[e.key] ?? now;
    switch (e.id) {
      case 'title': return <TitleCard deck={deck} page={sn.at} pages={sn.pages} />;
      case 'case': return sn.slide ? <CaseCard slide={sn.slide} page={sn.at} pages={sn.pages} /> : null;   // (a leaving card with no snapshot falls back to the view now, which on the title or the quick check has no slide: Back from slide 2 crashed the app)
      case 'teach': return sn.slide ? <TeachingCard slide={sn.slide} deck={deck} read={read} page={sn.at} pages={sn.pages} trim={sn.trim} /> : null;
      case 'table': return sn.dslide?.table ? <TableCard deck={deck} slide={sn.dslide} /> : sn.dslide ? <ToolCard deck={deck} slide={sn.dslide} /> : null;
      case 'ladder': return (
        <>
          {sn.dslide?.tiles || (sn.dslide && hasToolChart(sn.dslide)) ? <TilesHead deckId={deck.id} slideId={sn.dslide.id} /> : null}
          {sn.dslide && hasToolChart(sn.dslide) ? <ToolCard deck={deck} slide={sn.dslide} /> : null}
          {sn.dslide?.ladder && !sn.dslide.tool ? <LadderCard ladder={sn.dslide.ladder} readings={readings} /> : sn.dslide?.tiles ? <TilesCard deckId={deck.id} slideId={sn.dslide.id} /> : null}
        </>
      );
      case 'visual': return sn.slide ? <VisualCard deck={deck} slide={sn.slide} read={read} /> : null;
      case 'check': return <CheckCard deck={deck} page={sn.at} pages={sn.pages} />;
    }
  };
  const labelOf = (id: CardId) => ({ title: 'Talk', case: 'Case', teach: 'Slide', ladder: 'Pressures', table: 'Summary', check: 'Quick check', visual: 'Summary' })[id];
  // a data card of tiles wears the 2D card's own state classes (presenter.js dataIn): every such card is tiles-only, a floating screen's is a column under the words, an instrument's has-tool and tool-only
  const dataClass = (e: Entry) => { const sl = snaps[e.key]?.dslide; return sl?.tiles || (sl && hasToolChart(sl)) ? ['tiles-only', stacked ? '' : 'col', sl.tool ? 'has-tool tool-only' : ''].filter(Boolean).join(' ') : undefined; };
  const swapping = wordsStack.entries.some((e) => e.phase === 'out');
  const frames = (stack: ReturnType<typeof useStack>, slot: 'words' | 'data') => stack.entries.map((e) => {
    // (only the card the plan is for takes its place: for a render the card on its way out is still 'in', and it must not be given the new card's box)
    const wantedKey = slot === 'words' ? wordsWanted?.key : dataWanted?.key;
    const placed = e.phase === 'in' && e.key === wantedKey ? (slot === 'words' ? wordsShown : dataShown)?.rect : undefined;
    const rect = placed ?? last.current[e.key] ?? ZERO;
    // a card showing for the first time on a phone measures first (it is at height 0 until then)
    return (
      <CardFrame key={e.key} entry={e} rect={{ ...rect, w: rect.w || wide }} onHeight={onHeight} onGone={stack.gone} label={labelOf(e.id)}
        pointer={swipe} go={go} data={slot === 'data'} fresh={fresh} swap={slot === 'data' && swapping} tuck={slot === 'data' && plan.docked} zoomable={zoomsHere && e.phase === 'in'} onTap={slot === 'data' && plan.docked && e.phase === 'in' ? () => { if (!justDocked()) openDock(setDocked); } : e.id === 'case' && e.phase === 'in' ? () => { if (!justDragged()) move('next'); } : zoomsHere && e.phase === 'in' ? zoomTap : undefined} visual={view.slide?.visual} overflow={plan.overflow.includes(e.id) && e.phase === 'in'} extra={slot === 'data' ? dataClass(e) : [(e.id === 'check' || e.id === 'visual') && nameTabOf(deck) ? 'tabbed' : '', e.id === 'visual' && view.slide?.visual === 'ladders' ? 'fill' : ''].filter(Boolean).join(' ') || undefined}>
        {content(e)}
      </CardFrame>
    );
  });

  // 2D's veil: behind the outline and the quick check the page is washed to its own colour (92%), so the card stands on a clear field
  const veil = view.words === 'title' || view.words === 'check' || view.words === 'visual';
  return (
    <>
      {/* (2D's dip behind a case card: the figure at 22%, as this wash over it) */}
      <div className={`pz-veil${view.words === 'check' ? ' on soft' : veil ? ' on' : view.words === 'case' ? ' on dip' : ''}`} aria-hidden="true" />
      {/* 2D's zoom veil: the page dims a little and a tap on it puts the card back */}
      <div ref={zveilRef} className="pz-zveil" aria-hidden="true" onClick={() => { void cardZoom.close({ reduce: reduceMotion() }); }} />
      {frames(wordsStack, 'words')}
      {frames(dataStack, 'data')}
      {stripStack.entries.map((e) => {
        const rect = (e.phase === 'in' ? plan.strip?.rect : undefined) ?? last.current[e.key] ?? ZERO;
        const behind = plan.strip ? plan.strip.slot : e.key.endsWith('data') ? 'data' : 'words';
        return <Strip key={e.key} entry={e} rect={rect} behind={behind} hvpg={gap.value != null ? gap.hvpg : null} slideTitle={view.slide?.title ?? deck.title} dock={plan.docked} onSwap={() => (plan.docked ? setDocked(false) : swapWallet())} onGone={stripStack.gone} />;
      })}
    </>
  );
}

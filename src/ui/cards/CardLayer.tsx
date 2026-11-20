import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { caseOf, type Deck, type ReadingKey, type Slide } from '../../decks/schema.ts';
import { useUi } from '../ui-store.ts';
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
import { isSwapSwipe } from '../wallet/wallet-machine.ts';
import { swipeMove, apply, samePos } from '../deck/presenter-machine.ts';
import { gapOf } from './ladder-model.ts';
import { maxPages, clampPage } from './pages.ts';

/** True once the page's fonts are in (cards show only then). */
function useFontsReady(): boolean {
  const [ok, setOk] = useState(() => typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded');
  useEffect(() => { if (!ok) void document.fonts.ready.then(() => setOk(true)); }, [ok]);
  return ok;
}

const ZERO: Rect = { x: 0, y: 0, w: 0, h: 0 };
interface Snap { slide: Slide | null; pages: number; at: number; trim: boolean }

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

  const view = useMemo(() => (stops.length ? viewAt(stops, pos, lastSlideShot(stops)) : null), [stops, pos]);
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

  const dataKey = view?.data === 'table' && view.slide ? `table:${view.slide.id}` : view?.data === 'ladder' && view.slide && hasToolChart(view.slide) ? `tool:${view.slide.id}` : 'ladder';
  const needs: Need[] = view ? [{ id: view.words, slot: 'words', visual: view.slide?.visual, h: h(wordsKey) }, ...(view.data ? [{ id: view.data, slot: 'data' as const, h: h(dataKey) }] : [])] : [];
  const plan: Plan = useMemo(() => planLayout(vp, needs, wallet.active, step, docked), [vp, wallet.active, step, docked, needs.map((n) => `${n.id}:${n.slot}:${n.h}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const wordsShown = plan.cards.find((c) => c.slot === 'words');
  const dataShown = plan.cards.find((c) => c.slot === 'data');
  const wordsWanted: Wanted | null = view && wordsShown ? { key: wordsKey, id: view.words } : null;
  const dataWanted: Wanted | null = view?.data && dataShown ? { key: dataKey, id: view.data! } : null;
  const stripWanted: Wanted | null = plan.strip ? { key: `strip:${plan.strip.slot}`, id: plan.strip.id } : null;
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

  // the cards' boxes go to the scene once per layout change, when every card up has been measured
  const settled = needs.length > 0 && needs.every((n) => n.h > 0 || (plan.docked && n.slot === 'data'));   // (a card put away is not measured: it is not up)
  useLayoutEffect(() => { if (settled) publishPlan(plan); }, [plan, settled, publishPlan]);

  // phones: a vertical swipe on a card swaps the wallet; anywhere: a sideways swipe on a card moves the talk
  const swipe = useCardDrag({
    onEnd: (g, e) => {
      // 2D's dock: a push up on the data card puts it away to its edge (both cards up, a phone or an upright iPad); a tap or a pull down on the edge brings it back (Strip)
      if (!plan.strip && (plan.layout === 'stack' || plan.layout === 'tab') && dataShown && g.dy < 0 && isSwapSwipe(g) && (e.target as HTMLElement).closest?.('[data-card]')?.getAttribute('data-card') === dataShown.id && wordsShown) { setDocked(true); return; }
      if (plan.strip && isSwapSwipe(g)) { swapWallet(); return; }
      const m = swipeMove(g.dx, g.dy, g.ms);
      if (m) move(m);
    },
    onMove: move,
    // a drag follows only where it will do something: a slide to go to (or a page to turn), not the first slide's Back
    can: (dx) => pages > 1 || !samePos(apply(stops, pos, dx < 0 ? 'next' : 'back'), pos),
    width: vp.w,
    cards: () => [...document.querySelectorAll<HTMLElement>('.dk-card[data-card]:not([data-phase="out"])')].map((card) => ({ els: [card, ...(card.previousElementSibling?.classList.contains('dk-plate') ? [card.previousElementSibling as HTMLElement] : [])], data: card.getAttribute('data-card') === 'ladder' || card.getAttribute('data-card') === 'table' })),
  });

  if (!view) return null;
  const read = (k: string, at?: string) => readings[at ? `${k}@${at}` : k];
  const gap = gapOf(readings);
  const stacked = layoutOf(vp.w, vp.h) === 'stack' || layoutOf(vp.w, vp.h) === 'tab';
  // each card draws what it was given when it came in, so a card that is leaving keeps its own words while it goes
  const snaps = snapRef.current;
  const now: Snap = { slide: view.slide, pages, at, trim };
  const content = (e: Entry) => {
    if (e.phase === 'in') snaps[e.key] = now;
    const sn = snaps[e.key] ?? now;
    switch (e.id) {
      case 'title': return <TitleCard deck={deck} page={sn.at} pages={sn.pages} />;
      case 'case': return <CaseCard slide={sn.slide!} page={sn.at} pages={sn.pages} />;
      case 'teach': return <TeachingCard slide={sn.slide!} deck={deck} read={read} page={sn.at} pages={sn.pages} trim={sn.trim} />;
      case 'table': return sn.slide?.table ? <TableCard deck={deck} slide={sn.slide} /> : sn.slide ? <ToolCard deck={deck} slide={sn.slide} /> : null;
      case 'ladder': return (
        <>
          {sn.slide?.tiles || (sn.slide && hasToolChart(sn.slide)) ? <TilesHead deckId={deck.id} slideId={sn.slide.id} /> : null}
          {sn.slide && hasToolChart(sn.slide) ? <ToolCard deck={deck} slide={sn.slide} /> : null}
          {sn.slide?.ladder ? <LadderCard ladder={sn.slide.ladder} readings={readings} /> : sn.slide?.tiles ? <TilesCard deckId={deck.id} slideId={sn.slide.id} /> : null}
        </>
      );
      case 'visual': return sn.slide ? <VisualCard deck={deck} slide={sn.slide} read={read} /> : null;
      case 'check': return <CheckCard deck={deck} page={sn.at} pages={sn.pages} />;
    }
  };
  const labelOf = (id: CardId) => ({ title: 'Talk', case: 'Case', teach: 'Slide', ladder: 'Pressures', table: 'Summary', check: 'Quick check', visual: 'Summary' })[id];
  // a data card of tiles wears the 2D card's own state classes (presenter.js dataIn): every such card is tiles-only, a floating screen's is a column under the words, an instrument's has-tool and tool-only
  const dataClass = (e: Entry) => { const sl = snaps[e.key]?.slide; return sl?.tiles || (sl && hasToolChart(sl)) ? ['tiles-only', stacked ? '' : 'col', sl.tool ? 'has-tool tool-only' : ''].filter(Boolean).join(' ') : undefined; };
  const frames = (stack: ReturnType<typeof useStack>, slot: 'words' | 'data') => stack.entries.map((e) => {
    const placed = e.phase === 'in' ? (slot === 'words' ? wordsShown : dataShown)?.rect : undefined;
    const rect = placed ?? last.current[e.key] ?? ZERO;
    // a card showing for the first time on a phone measures first (it is at height 0 until then)
    return (
      <CardFrame key={e.key} entry={e} rect={{ ...rect, w: rect.w || wide }} onHeight={onHeight} onGone={stack.gone} label={labelOf(e.id)}
        pointer={swipe} go={go} data={slot === 'data'} fresh={fresh} onTap={e.id === 'case' && e.phase === 'in' ? () => { if (!justDragged()) move('next'); } : undefined} visual={view.slide?.visual} overflow={plan.overflow.includes(e.id) && e.phase === 'in'} extra={slot === 'data' ? dataClass(e) : (e.id === 'check' || e.id === 'visual') && nameTabOf(deck) ? 'tabbed' : undefined}>
        {content(e)}
      </CardFrame>
    );
  });

  // 2D's veil: behind the outline and the quick check the page is washed to its own colour (92%), so the card stands on a clear field
  const veil = view.words === 'title' || view.words === 'check' || view.words === 'visual';
  return (
    <>
      {/* (2D's dip behind a case card: the figure at 22%, as this wash over it) */}
      <div className={`pz-veil${veil ? ' on' : view.words === 'case' ? ' on dip' : ''}`} aria-hidden="true" />
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

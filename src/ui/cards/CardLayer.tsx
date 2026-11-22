import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { caseOf, type Deck, type ReadingKey, type Slide } from '../../decks/schema.ts';
import { useUi, atEnd } from '../ui-store.ts';
import { dock } from './dock.ts';
import { finishTalk } from './finish.ts';
import { dataKeys } from './keep.ts';
import { useDockSwipe, openDock, justDocked } from './useDockSwipe.ts';
import { viewAt, lastSlideShot } from '../deck/presenter-machine.ts';
import { DataCap } from '../talk/tool-room.ts';
import { pairSteps, stepVars, dataFitOf, type PairBase } from './pair-ladder.ts';
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
import { CardKey } from './CardKey.tsx';
import { cardKeyAt } from '../../scene/labels/deck-link.ts';
import { CheckCard } from './CheckCard.tsx';
import { nameTabOf } from './NameTab.tsx';
import { TableCard } from './TableCard.tsx';
import { VisualCard } from './VisualCard.tsx';
import { ToolCard } from '../talk/ToolCard.tsx';
import { hasToolChart } from '../../decks/charts.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { useStates, ensureStates } from '../../decks/hp/calc.ts';
import { inputsIn, GIVE_UP_MS } from './inputs-in.ts';
import { Strip } from '../wallet/Strip.tsx';
import { useCardDrag, justDragged } from './useCardDrag.ts';
import { cardZoom, emptyTap, zoomPlan } from './card-zoom.ts';
import { reduced } from '../a11y/motion.ts';
import { isSwapSwipe } from '../wallet/wallet-machine.ts';
import { useDeckWheel } from '../deck/useDeckWheel.ts';
import { swipeMove, apply, samePos, type Move } from '../deck/presenter-machine.ts';
import { gapOf } from './ladder-model.ts';
import { maxPages, clampPage } from './pages.ts';

import { clock } from '../../clock/frame.ts';
/** True once the page's fonts are in (cards show only then). */
function useFontsReady(): boolean {
  const [ok, setOk] = useState(() => typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded');
  useEffect(() => { if (!ok) void document.fonts.ready.then(() => setOk(true)); }, [ok]);
  return ok;
}

/** The card of a slot that is standing (not on its way out): the one the ladder's measures are about. */
const liveCard = (slot: string): HTMLElement | null => [...document.querySelectorAll<HTMLElement>(`.dk-pos[data-slot="${slot}"]`)].find((p) => !p.querySelector('.dk-card[data-phase="out"]')) ?? null;

const ZERO: Rect = { x: 0, y: 0, w: 0, h: 0 };
interface Snap { /** the lens whose key is the data card's first row (cardKeyAt, asked with the stop the card came from) */ dkey: string | null; slide: Slide | null; /** the slide whose instrument the data card shows (the slide itself, or the one before it whose card stays) */ dslide: Slide | null; pages: number; at: number; trim: boolean }

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
  // 2D's steps for a stacked pair too tall for the screen (pair-ladder.ts): the title, then the data card's blocks; one index per slide and size, taken before the words page
  const [ladMap, setLadMap] = useState<Record<string, number>>({});
  const [ladBase, setLadBase] = useState<Record<string, PairBase>>({});
  // the last step, when even the smallest blocks leave the data card too tall: its own fit (2D presenter-zoom.js fitEach: its zoom, --pz-fit, never under 12 px on the screen)
  const [fitMap, setFitMap] = useState<Record<string, number>>({});
  const stacked0 = layoutOf(vp.w, vp.h) === 'stack' || layoutOf(vp.w, vp.h) === 'tab';
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
  const ladOn = pair && !sideways && !stacked0 && !!view && !centredKind(view.words);
  const cands = useMemo(() => (ladBase[pagesKey] ? pairSteps(ladBase[pagesKey]) : []), [ladBase, pagesKey]);
  const lad = ladOn ? Math.min(ladMap[pagesKey] ?? 0, Math.max(0, cands.length - 1)) : 0;
  const ladVars = ladOn ? stepVars(cands[lad]) : undefined;
  const fitK = ladOn ? fitMap[pagesKey] : undefined;
  const dataVars = fitK != null && fitK < 1 ? { ...ladVars, '--pz-fit': fitK } : ladVars;
  const sig = `${wordsKey}|${pages}|${at}|${stepAt}|${vp.w}x${vp.h}|${lad}|${fitK ?? ''}`;
  sigRef.current = sig;

  const dataKey = here?.key ?? 'ladder';
  const needs: Need[] = view ? [{ id: view.words, slot: 'words', visual: view.slide?.visual, h: h(wordsKey) }, ...(view.data ? [{ id: view.data, slot: 'data' as const, h: h(dataKey) }] : [])] : [];
  const plan: Plan = useMemo(() => planLayout(vp, needs, wallet.active, step, docked), [vp, wallet.active, step, docked, needs.map((n) => `${n.id}:${n.slot}:${n.h}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // The dock glide sets off: the figure's room for where the card is going is told at once, with the glide's length, so the camera reframes with the card, not after it lands (2D presenter-zoom.js dockTo:
  // layout() then reframe(ms)). `plan` above is for the settled state only, and publishes when the card has come to rest.
  const planFor = useRef<(docked: boolean) => Plan>(() => plan);
  planFor.current = (d) => planLayout(vp, needs, wallet.active, step, d);
  useEffect(() => { dock.onGlide = (to, ms) => { const p = planFor.current(to === 1); useUi.getState().hintRoom(p.free, ms); }; return () => { dock.onGlide = null; }; }, []);

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
  // the pair is too tall for the screen as measured at this step of the ladder (both cards judged at it)
  const pairOver = ladOn && plan.overflow.length > 0 && wordsHit?.sig === sig && dataHit?.sig === sig;
  const ladBusy = pairOver && (!ladBase[pagesKey] || lad < cands.length - 1);
  const fitBusy = pairOver && !ladBusy && fitK === undefined && plan.overflow.includes(view?.data ?? 'ladder');
  const tooTall = !!view && plan.overflow.includes(view.words) && wordsHit?.sig === sig && !ladBusy && !fitBusy;
  // a pair that does not fit its column at this step widens to the next step first; only past the widest does the words card split
  const tooTallPair = sideways && (tooTall || (pair && plan.overflow.includes(view?.data ?? 'ladder') && dataHit?.sig === sig));
  useLayoutEffect(() => {
    if (!view) return;
    if (ladBusy) {
      // the first measure at the full size gives the ladder its sizes (the title's, the words', the tiles' names), read where they stand; each step after it is the next index
      if (!ladBase[pagesKey]) {
        // (from the cards now standing, never one leaving: during a slide change the old card is still first in the page, and its sizes gave a wrong floor, a title at 1.24 times its words)
        const px = (slot: string, sel: string) => { const e = liveCard(slot)?.querySelector<HTMLElement>(sel); return e ? parseFloat(getComputedStyle(e).fontSize) || 0 : 0; };
        setLadBase((m) => ({ ...m, [pagesKey]: { titlePx: px('words', '.pz-h'), bodyPx: px('words', '.pz-line, p'), labelPx: px('data', '.pz-tiles .pzt-k') } }));
      } else setLadMap((m) => ({ ...m, [pagesKey]: lad + 1 }));
      return;
    }
    if (fitBusy) {
      // the data card's zoom, from its measured height against its cap, never so far that its smallest words go under 12 px (2D: the card's floor)
      const card = liveCard('data')?.querySelector<HTMLElement>('.dk-in') ?? null;
      let minPx = Infinity;
      if (card) { const w = document.createTreeWalker(card, NodeFilter.SHOW_TEXT); let n = 0; for (let t = w.nextNode(); t && n < 400; t = w.nextNode(), n++) { if (t.textContent?.trim() && t.parentElement) minPx = Math.min(minPx, parseFloat(getComputedStyle(t.parentElement).fontSize) || Infinity); } }
      const k = dataFitOf(dataHit?.h ?? 0, plan.maxH.data, minPx);
      setFitMap((m) => ({ ...m, [pagesKey]: k }));
      return;
    }
    const cap = capOf(view);
    if (tooTallPair && stepAt < nSteps) { setStepMap((m) => ({ ...m, [pagesKey]: stepAt + 1 })); return; }
    if (tooTall && pages < cap) setPagesMap((m) => ({ ...m, [pagesKey]: pages + 1 }));
  }, [tooTall, tooTallPair, ladBusy, fitBusy, lad, cands.length, stepAt, nSteps, pages, pagesKey, view, deck.checks.length]);
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
  const growing = ladBusy || fitBusy || (tooTallPair && stepAt < nSteps) || (tooTall && pages < (view ? capOf(view) : 1));
  const measured = needs.length > 0 && needs.every((n) => (n.h > 0 && (n.slot === 'data' || hit(wordsKey)?.sig === sig)) || (plan.docked && n.slot === 'data'));
  const [late, setLate] = useState('');
  useEffect(() => { const t = clock.after(() => setLate(pagesKey), 320); return () => clock.cancel(t); }, [pagesKey]);
  // (the instrument's numbers: a card with a chart waits for its slide's step from the second engine, and asks for it again if the first run failed)
  const states = useStates((st) => st.results[deck.id]);
  const toolAt = view?.data && here?.key.startsWith('tool:') && carried && copiedOf(deck.id) ? deck.slides.findIndex((x) => x.id === carried.id) : -1;
  const numbers = inputsIn(toolAt, states);
  const [gaveUp, setGaveUp] = useState('');
  useEffect(() => {
    if (numbers) return;
    const c = copiedOf(deck.id);
    if (c) void ensureStates(c);
    const t = clock.after(() => setGaveUp(`${deck.id}:${toolAt}`), GIVE_UP_MS);
    return () => clock.cancel(t);
  }, [numbers, deck.id, toolAt]);
  const go = fonts && !growing && (numbers || gaveUp === `${deck.id}:${toolAt}`) && (measured || late === pagesKey);
  // the first cards of a talk fade in where they stand; every later one slides in from the side the talk comes from (2D's first card has no way to come from)
  const seen = useRef(false);
  const fresh = !seen.current;
  useLayoutEffect(() => { if (wordsStack.entries.length || dataStack.entries.length) seen.current = true; });

  // 2D's card zoom (card-zoom.js): a tap on the empty part of a card on a wide screen zooms it to the middle, the other card riding along; a tap on the veil,
  // Esc, a slide change or a new size puts it back. Only a card that stands whole (nothing leaving or waiting to come in).
  const zoomsHere = plan.layout === 'wide' && !alone && !!(dataShown || wordsShown);
  const veilRef = useRef<HTMLDivElement>(null), zveilRef = useRef<HTMLDivElement>(null);
  const reduceMotion = reduced;
  // the zoom of one card (the tapped card, or the one whose corner button was pressed), the other card riding with it
  const zoomOpen = (card: HTMLElement) => {
    const live = [...document.querySelectorAll<HTMLElement>('.dk-card[data-card]:not([data-phase="out"])')];
    if (live.some((c) => c.getAttribute('data-phase') === 'wait')) return;
    const els = (c: HTMLElement) => [c, ...(c.previousElementSibling?.classList.contains('dk-plate') ? [c.previousElementSibling as HTMLElement] : [])];
    cardZoom.open({
      focus: els(card), others: live.filter((c) => c !== card).map(els), reduce: reduceMotion(), veil: zveilRef.current, mark: document.body,
      area: { left: 0, top: 0, width: vp.w, height: vp.h },
    });
  };
  const zoomTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    if (justDragged() || !zoomsHere) return;
    if (cardZoom.up) { void cardZoom.close({ reduce: reduceMotion() }); return; }
    if (cardZoom.on || !emptyTap(e.target, card)) return;
    zoomOpen(card);
  };
  // 2D's corner button on an instrument's card (.pz-zbtn, presenter-start.js: `onclick: () => zoomToggle()`): the same zoom as a tap on the card's empty part, and the same way back
  const zoomButton = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();   // (the card's own tap would read it as a second one)
    if (justDragged() || !zoomsHere) return;
    if (cardZoom.up) { void cardZoom.close({ reduce: reduceMotion() }); return; }
    const card = e.currentTarget.closest<HTMLElement>('.dk-card');
    if (!cardZoom.on && card) zoomOpen(card);
  };
  // the corner button is offered where the card has room to grow (2D presenter-ladders.js `zoomOn`: wide, and `zoom.plan()` is not null), which is when it would grow by at least ZOOM_MIN
  const dataBox = dataShown?.rect;
  const zoomableData = zoomsHere && !!dataBox && !!zoomPlan({ left: dataBox.x, top: dataBox.y, width: dataBox.w, height: dataBox.h }, { left: 0, top: 0, width: vp.w, height: vp.h });
  // a slide change, a new size (the window's or a card's: the plan was made for the card's size at the tap) or a leaving layout glides the zoom back (nothing in the app snaps: Mohammad, 20 Nov), as the slide's own cards go out and come in on the rail
  useEffect(() => { void cardZoom.close({ reduce: reduceMotion() }); }, [wordsKey, dataKey, vp.w, vp.h, zoomsHere, wordsShown?.rect.h, dataShown?.rect.h]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cardZoom.reset(), []);

  // the cards' boxes go to the scene once per layout change, when every card up has been measured
  const settled = needs.length > 0 && needs.every((n) => n.h > 0 || (plan.docked && n.slot === 'data'));   // (a card put away is not measured: it is not up)
  // ...and only when they are FINAL: both cards measured at the ladder's last step, nothing still to widen, split or fit, fonts in (or the 320 ms give-up the cards use). A room published at an earlier step was
  // a different room (the data card measured whole, then stepped down or fitted): the camera fitted to it, then moved again to the final one. The stop travels with it so the camera knows whose room it is.
  const measuredNow = needs.every((n) => (plan.docked && n.slot === 'data') || hit(n.slot === 'words' ? wordsKey : dataKey)?.sig === sig);
  const final = settled && fonts && !growing && (measuredNow || late === pagesKey);
  useLayoutEffect(() => { if (final) publishPlan(plan, pos.stop); }, [plan, final, pos.stop, publishPlan]);

  // a swipe on the last slide's card ends the talk (the figure comes back); anywhere else it moves the talk
  const goTo = (m: Move) => { if (m === 'next' && atEnd(useUi.getState())) finishTalk(); else move(m); };
  // 2D's dock (ui/cards/dock.ts): on a phone or an upright iPad with both cards up, a push up anywhere on the slide slides the instrument card away to its handle, following the finger; a pull down
  // anywhere brings it back; a tap on its handle too
  const dockable = (plan.layout === 'stack' || plan.layout === 'tab') && (!plan.strip || plan.docked) && !!dataShown && !!wordsShown && !alone;
  useDockSwipe({ enabled: dockable && !cardZoom.on, docked: plan.docked, onSettle: (closed) => setDocked(closed) });
  // a Mac trackpad's two-finger sideways swipe: one slide a gesture (the glide after the fingers lift never skips another)
  useDeckWheel(goTo);
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
  const now: Snap = { dkey: cardKeyAt(stops, here?.from ?? pos.stop), slide: view.slide, dslide: carried ?? view.slide, pages, at, trim };
  const content = (e: Entry) => {
    // (only the card the view is on takes the view's words: for the render before a slide change reaches the stack, the card still standing is the old slide's, and must keep its own)
    if (e.phase === 'in' && (e.key === wordsKey || e.key === dataKey)) snaps[e.key] = now;
    const sn = snaps[e.key] ?? now;
    switch (e.id) {
      case 'title': return <TitleCard deck={deck} page={sn.at} pages={sn.pages} />;
      case 'case': return sn.slide ? <CaseCard slide={sn.slide} page={sn.at} pages={sn.pages} /> : null;   // (a leaving card with no snapshot falls back to the view now, which on the title or the quick check has no slide: Back from slide 2 crashed the app)
      case 'teach': return sn.slide ? <TeachingCard slide={sn.slide} deck={deck} read={read} fp={readings} page={sn.at} pages={sn.pages} trim={sn.trim} /> : null;
      case 'table': return sn.dslide?.table ? <TableCard deck={deck} slide={sn.dslide} /> : sn.dslide ? <ToolCard deck={deck} slide={sn.dslide} /> : null;
      case 'ladder': return (
        <>
          {sn.dslide?.tiles || (sn.dslide && hasToolChart(sn.dslide)) ? <TilesHead deckId={deck.id} slideId={sn.dslide.id} onZoom={sn.dslide.tool ? zoomButton : undefined} /> : null}
          {sn.dkey ? <CardKey lens={sn.dkey} /> : null}
          {sn.dslide && hasToolChart(sn.dslide) ? <ToolCard deck={deck} slide={sn.dslide} /> : null}
          {sn.dslide?.ladder && !sn.dslide.tool ? <LadderCard ladder={sn.dslide.ladder} readings={readings} /> : sn.dslide?.tiles ? <TilesCard deckId={deck.id} slideId={sn.dslide.id} /> : null}
        </>
      );
      case 'visual': return sn.slide ? <VisualCard deck={deck} slide={sn.slide} read={read} fp={readings} /> : null;
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
        pointer={swipe} go={go} data={slot === 'data'} vars={(slot === 'data' ? dataVars : ladVars) as never} remeasure={sig} fresh={fresh} swap={slot === 'data' && swapping} tuck={slot === 'data' && plan.docked} zoomable={zoomsHere && e.phase === 'in'} onTap={slot === 'data' && plan.docked && e.phase === 'in' ? () => { if (!justDocked()) openDock(setDocked); } : e.id === 'case' && e.phase === 'in' ? () => { if (!justDragged()) move('next'); } : zoomsHere && e.phase === 'in' ? zoomTap : undefined} visual={view.slide?.visual} overflow={plan.overflow.includes(e.id) && e.phase === 'in'} extra={slot === 'data' ? [dataClass(e), zoomableData && e.phase === 'in' ? 'pz-zoomable' : ''].filter(Boolean).join(' ') || undefined : [(e.id === 'check' || e.id === 'visual') && nameTabOf(deck) ? 'tabbed' : '', e.id === 'visual' && view.slide?.visual === 'ladders' ? 'fill' : ''].filter(Boolean).join(' ') || undefined}>
        {slot === 'data' ? <DataCap.Provider value={stacked || alone ? 0 : plan.maxH.data}>{content(e)}</DataCap.Provider>
          // (a chart in a centred panel keeps inside what the panel leaves it, as one in a data card does: only past its floor does the panel's fit zoom take over)
          : alone === 'panel' && e.id === 'visual' ? <DataCap.Provider value={plan.maxH.words}>{content(e)}</DataCap.Provider> : content(e)}
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

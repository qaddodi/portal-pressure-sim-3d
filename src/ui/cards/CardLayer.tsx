import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { caseOf, type Deck, type ReadingKey, type Slide } from '../../decks/schema.ts';
import { useUi, atEnd, type Readings } from '../ui-store.ts';
import { dock } from './dock.ts';
import { finishTalk } from './finish.ts';
import { dataKeys } from './keep.ts';
import { useDockSwipe, openDock, goColumn, justDocked } from './useDockSwipe.ts';
import { viewAt, lastSlideShot } from '../deck/presenter-machine.ts';
import { DataCap } from '../talk/tool-room.ts';
import { pairSteps, stepVars, dataFitOf, type PairBase } from './pair-ladder.ts';
import { planLayout, widthOf, centredKind, centredBox, panelVisual, type CardId, type Need, type Plan } from '../layout/plan.ts';
import { phoneView } from './phone-panel.ts';
import { layoutOf, isSideways } from '../layout/rules2d.ts';
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
import { mergeStates } from '../charts/baked/view.ts';
import { inputsIn, wordsStateIndex, GIVE_UP_MS } from './inputs-in.ts';
import { tokensOf } from '../text/tokens.ts';
import { Strip } from '../wallet/Strip.tsx';
import { lapseCanSkip } from '../deck/lapse-next.ts';
import { procCanStep } from '../deck/proc-step.ts';
import { toolCanStep } from '../talk/tool-step.ts';
import { useCardDrag, justDragged } from './useCardDrag.ts';
import { cardZoom, emptyTap, zoomPlan, zoomMargin, zoomsOn } from './card-zoom.ts';
import { fitOf } from '../charts/fit.ts';
import { reduced } from '../a11y/motion.ts';
import { isSwapSwipe } from '../wallet/wallet-machine.ts';
import { useDeckWheel } from '../deck/useDeckWheel.ts';
import { swipeMove, apply, samePos, type Move } from '../deck/presenter-machine.ts';
import { gapOf } from './ladder-model.ts';
import { maxPages, clampPage } from './pages.ts';
import { frameProps, wordsClasses, type FrameLive } from './frame-props.ts';

import { clock } from '../../clock/frame.ts';
/** Whether every font the page asked for is in right now (a measure taken before this is a measure of a fallback font's words). */
export const fontsLoaded = (): boolean => typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded';
/** True once the page's fonts are in (cards show only then). */
function useFontsReady(): boolean {
  const [ok, setOk] = useState(() => typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded');
  useEffect(() => { if (!ok) void document.fonts.ready.then(() => setOk(true)); }, [ok]);
  return ok;
}

/** The card of a slot that is standing (not on its way out): the one the ladder's measures are about. */
const liveCard = (slot: string): HTMLElement | null => [...document.querySelectorAll<HTMLElement>(`.dk-pos[data-slot="${slot}"]`)].find((p) => !p.querySelector('.dk-card[data-phase="out"]')) ?? null;

/** How long a card's measured height must stand still before the card is let in (a late row or readout shows up inside this), and the longest the cards wait for it before they come in as they are. */
export const SETTLE_MS = 120, GIVE_UP_CARDS_MS = 700;
const ZERO: Rect = { x: 0, y: 0, w: 0, h: 0 };
interface Snap { /** the lens whose key is the data card's first row (cardKeyAt, asked with the stop the card came from) */ dkey: string | null; slide: Slide | null; /** the slide whose instrument the data card shows (the slide itself, or the one before it whose card stays) */ dslide: Slide | null; pages: number; at: number; trim: boolean; /** the slide's readings as they stood while the card was the current one: a card that leaves keeps its own numbers ("13 mmHg" on Ascites 12 did not turn into the next slide's as it went) */ readings: Readings }

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
  const sidewaysNow = isSideways(vp.w, vp.h);
  const here = dataAt[pos.stop] ?? null;
  const view = useMemo(() => {
    if (!stops.length) return null;
    const v = phoneView(viewAt(stops, pos, lastSlideShot(stops)), sidewaysNow, here?.kind);
    return !v.data && here && v.words === 'teach' ? { ...v, data: here.kind } : v;
  }, [stops, pos, here, sidewaysNow]);
  const carried = here && stops[here.from]?.kind === 'slide' ? (stops[here.from] as { slide: Slide }).slide : null;   // (the slide whose instrument the data card shows)
  // heights are tagged with the page they were measured on, so a card that has just been split is never judged by its whole height
  const [heights, setHeights] = useState<Record<string, { h: number; want: number; open: number; sig: string; f: boolean; t: number }>>({});
  const sigRef = useRef('');
  const onHeight = useCallback((key: string, w: number, h: number, want = h, open = 0) => {
    const sig = sigRef.current, f = fontsLoaded();   // (a height measured while a font was still loading is not final: the card is not let in on it, 24 Nov)
    setHeights((m) => { const o = m[`${key}@${w}`]; return o && o.h === h && o.want === want && o.open === open && o.sig === sig && o.f === f ? m : { ...m, [`${key}@${w}`]: { h, want, open, sig, f, t: clock.now() } }; });
  }, []);
  const [pagesMap, setPagesMap] = useState<Record<string, number>>({});
  const page = useUi((s) => s.page);
  const setPageCount = useUi((s) => s.setPageCount);

  const wordsKey = view ? (view.slide && (view.words === 'teach' || view.words === 'case' || view.words === 'visual') ? `${view.words}:${view.slide.id}` : view.words) : '';
  const pagesKey = `${wordsKey}@${vp.w}x${vp.h}`;
  const pair = !!view?.data;
  // 2D's steps for a stacked pair too tall for the screen (pair-ladder.ts): the title, then the data card's blocks; one index per slide and size, taken before the words page
  const [ladMap, setLadMap] = useState<Record<string, number>>({});
  const [ladBase, setLadBase] = useState<Record<string, PairBase>>({});
  // the last step, when even the smallest blocks leave the data card too tall: its own fit (2D presenter-zoom.js fitEach: its zoom, --pz-fit, never under 12 px on the screen)
  const [fitMap, setFitMap] = useState<Record<string, number>>({});
  // (an iPhone on its side has one width, its side column, and the same steps a Mac pair has: the title, the data card's blocks, its fit, then the words page; the old wallet's wider columns are gone)
  const step = 0, trim = false;
  const alone = view && !view.data ? centredKind(view.words) : null;   // the outline, the quick check and a case stand alone in the middle at 2D's own width
  const wide = alone ? centredBox(vp, alone, panelVisual({ id: view!.words, visual: view!.slide?.visual })).w : Math.round(widthOf(vp, pair, step));
  const hit = (key: string) => heights[`${key}@${wide}`];
  const h = (key: string) => hit(key)?.h ?? 0;
  const capOf = (v: NonNullable<typeof view>) => maxPages(v.words, v.slide && v.words === 'case' ? caseOf(v.slide)?.text : v.slide?.line, v.words === 'check' ? deck.checks.length : 0);
  const pages = view ? Math.min(pagesMap[pagesKey] ?? 1, capOf(view)) : 1;
  const at = clampPage(page, pages);
  const ladOn = pair && !!view && !centredKind(view.words);
  const cands = useMemo(() => (ladBase[pagesKey] ? pairSteps(ladBase[pagesKey]) : []), [ladBase, pagesKey]);
  const lad = ladOn ? Math.min(ladMap[pagesKey] ?? 0, Math.max(0, cands.length - 1)) : 0;
  const ladVars = ladOn ? stepVars(cands[lad]) : undefined;
  const fitK = ladOn ? fitMap[pagesKey] : undefined;
  const dataVars = fitK != null && fitK < 1 ? { ...ladVars, '--pz-fit': fitK } : ladVars;
  // (a phone on its side, a table card past its room after every step: its rows sit closer, one last step; the type never shrinks)
  const [tightMap, setTightMap] = useState<Record<string, boolean>>({});
  const tight = !!tightMap[pagesKey];
  const sig = `${wordsKey}|${pages}|${at}|${vp.w}x${vp.h}|${lad}|${fitK ?? ''}|${tight ? 't' : ''}`;
  sigRef.current = sig;

  // A kept data card whose new slide needs a taller box than it landed with is not grown: it is replaced by a fresh card at its final size (CardFrame `onOutgrown`; Mohammad, 24 Nov: a card never visibly changes size).
  const [rekeys, setRekeys] = useState<Record<string, number>>({});
  const baseKey = here?.key ?? 'ladder';
  const dataKey = rekeys[baseKey] ? `${baseKey}~${rekeys[baseKey]}` : baseKey;
  const outgrown = useCallback((k: string) => setRekeys((m) => { const base = k.replace(/~\d+$/, ''); return { ...m, [base]: (m[base] ?? 0) + 1 }; }), []);
  const needs: Need[] = view ? [{ id: view.words, slot: 'words', visual: view.slide?.visual, h: h(wordsKey) }, ...(view.data ? [{ id: view.data, slot: 'data' as const, h: h(dataKey), want: hit(dataKey)?.want ?? 0 }] : [])] : [];
  const plan: Plan = useMemo(() => planLayout(vp, needs, wallet.active, step, docked), [vp, wallet.active, step, docked, needs.map((n) => `${n.id}:${n.slot}:${n.h}:${n.want ?? ''}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // the pair is too tall for the screen as measured at this step of the ladder (both cards judged at it): by its height, or by what its instrument WANTS when the room squeezed it (plan.short: the title steps
  // first, 2D's order, before a chart is held short)
  const pairOver = ladOn && (plan.overflow.length > 0 || plan.short) && wordsHit?.sig === sig && dataHit?.sig === sig;
  const ladBusy = pairOver && (!ladBase[pagesKey] || lad < cands.length - 1);
  const fitBusy = pairOver && !ladBusy && fitK === undefined && plan.overflow.includes(view?.data ?? 'ladder');
  const tooTall = !!view && plan.overflow.includes(view.words) && wordsHit?.sig === sig && !ladBusy && !fitBusy;
  // (a phone on its side, a table card past its room at its one width: its rows sit closer, one last step; the type never shrinks)
  const tightens = plan.sideways && tooTall && !tight && !!view && pages >= capOf(view) && view.slide?.visual === 'table';
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
    if (tooTall && pages < cap) setPagesMap((m) => ({ ...m, [pagesKey]: pages + 1 }));
    else if (tightens) setTightMap((m) => ({ ...m, [pagesKey]: true }));
  }, [tightens, tooTall, ladBusy, fitBusy, lad, cands.length, pages, pagesKey, view, deck.checks.length]);
  useLayoutEffect(() => { setPageCount(pages); }, [pages, setPageCount, wordsKey]);

  // a leaving card stays where it was while it goes
  const last = useRef<Record<string, Rect>>({});
  const snapRef = useRef<Record<string, Snap>>({});
  const frameSnap = useRef<Record<string, FrameLive>>({});   // (what each card's frame was drawn with while it was the current one: frame-props.ts)
  if (wordsShown && wordsWanted) last.current[wordsWanted.key] = wordsShown.rect;
  if (dataShown && dataWanted) last.current[dataWanted.key] = dataShown.rect;
  if (plan.strip && stripWanted) last.current[stripWanted.key] = plan.strip.rect;

  // The cards come in together, whole: only when every card of the slide is measured on the page now showing, nothing is still to widen or split,
  // and the fonts are in (a card that came in on its own measure then grew, and the second card showed up after the first). A slow measure never
  // holds a slide back for good: past GIVE_UP_CARDS_MS the cards come in as they are.
  const fonts = useFontsReady();
  const growing = ladBusy || fitBusy || (tooTall && pages < (view ? capOf(view) : 1)) || tightens;
  // (and its height has stood still for SETTLE_MS: a row or a readout that mounts in the frame after the first measure, from an effect or a second render, has come by then, so the card is let in at the height it keeps)
  const [, setTick] = useState(0);
  const settleLeft = needs.reduce((m, n) => { const e = hit(n.slot === 'words' ? wordsKey : dataKey); return e ? Math.max(m, SETTLE_MS - (clock.now() - e.t)) : m; }, 0);
  useEffect(() => { if (settleLeft <= 0) return; const t = clock.after(() => setTick((k) => k + 1), settleLeft + 1); return () => clock.cancel(t); }, [settleLeft, heights]);   // eslint-disable-line react-hooks/exhaustive-deps
  // (and every chart in a card is drawn once at its box: `open` is how many are not, so a chart never reaches its size while its card slides in; the 320 ms give-up is the net)
  const measured = needs.length > 0 && needs.every((n) => (n.h > 0 && (n.slot === 'data' || hit(wordsKey)?.sig === sig) && (hit(n.slot === 'words' ? wordsKey : dataKey)?.open ?? 0) === 0 && hit(n.slot === 'words' ? wordsKey : dataKey)?.f !== false && settleLeft <= 0) || (plan.docked && n.slot === 'data'));
  const [late, setLate] = useState('');
  useEffect(() => { const t = clock.after(() => setLate(pagesKey), GIVE_UP_CARDS_MS); return () => clock.cancel(t); }, [pagesKey]);
  // (the instrument's numbers: a card with a chart waits for its slide's step from the second engine, and asks for it again if the first run failed)
  // (the states baked at build time count as in: the cards of a slide opened first by a link or a jump no longer wait for the whole live chain to be worked out, 6 s and more on a phone: Encephalopathy 8, review bbe955e5)
  const liveStates = useStates((st) => st.results[deck.id]);
  const states = useMemo(() => mergeStates(deck.id, liveStates), [deck.id, liveStates]);
  const toolAt = view?.data && here?.key.startsWith('tool:') && carried && copiedOf(deck.id) ? deck.slides.findIndex((x) => x.id === carried.id) : -1;
  // (and the words card whose line prints the slide's own readings waits for that slide's state too: no "…" holes in the sentence, wordsStateIndex)
  const wordsAt = view?.slide && view.words === 'teach' ? wordsStateIndex(view.slide.line, deck.slides.findIndex((x) => x.id === view.slide!.id), !!copiedOf(deck.id), (t) => tokensOf(t).some((q) => q.token.kind === 'value' && !q.token.at)) : -1;
  const numbers = inputsIn(toolAt, states) && inputsIn(wordsAt, states);
  const numbersKey = `${deck.id}:${toolAt}:${wordsAt}`;
  const [gaveUp, setGaveUp] = useState('');
  useEffect(() => {
    if (numbers) return;
    const c = copiedOf(deck.id);
    if (c) void ensureStates(c);
    const t = clock.after(() => setGaveUp(numbersKey), GIVE_UP_MS);
    return () => clock.cancel(t);
  }, [numbers, deck.id, numbersKey]);
  const go = fonts && !growing && (numbers || gaveUp === numbersKey) && (measured || late === pagesKey);
  // the first cards of a talk fade in where they stand; every later one slides in from the side the talk comes from (2D's first card has no way to come from)
  const seen = useRef(false);
  const fresh = !seen.current;
  useLayoutEffect(() => { if (wordsStack.entries.length || dataStack.entries.length) seen.current = true; });

  // 2D's card zoom (card-zoom.js): a tap on the empty part of a card on a wide screen zooms it to the middle, the other card riding along; a tap on the veil,
  // Esc, a slide change or a new size puts it back. Only a card that stands whole (nothing leaving or waiting to come in).
  // (Plan 43: by device, not by screen height. 'wide' and 'short' are one card layout; the gate named 'wide' and so turned the zoom off on every iPad under 860 px tall)
  const zoomsHere = zoomsOn(plan.layout, plan.sideways) && !alone && !!(dataShown || wordsShown);
  const veilRef = useRef<HTMLDivElement>(null), zveilRef = useRef<HTMLDivElement>(null);
  const reduceMotion = reduced;
  // the room a zoomed card has: the window inside its safe areas (a notch, the home bar), the one box the tap, the corner button and the glide all measure
  const zoomArea = () => ({ left: vp.safe.left, top: vp.safe.top, width: vp.w - vp.safe.left - vp.safe.right, height: vp.h - vp.safe.top - vp.safe.bottom });
  // the zoom of one card (the tapped card, or the one whose corner button was pressed), the other card riding with it
  const zoomOpen = (card: HTMLElement) => {
    const live = [...document.querySelectorAll<HTMLElement>('.dk-card[data-card]:not([data-phase="out"])')];
    if (live.some((c) => c.getAttribute('data-phase') === 'wait')) return;
    const els = (c: HTMLElement) => [c, ...(c.previousElementSibling?.classList.contains('dk-plate') ? [c.previousElementSibling as HTMLElement] : [])];
    cardZoom.open({
      focus: els(card), others: live.filter((c) => c !== card).map(els), reduce: reduceMotion(), veil: zveilRef.current, mark: document.body,
      area: zoomArea(), layout: plan.layout,
    });
  };
  // one panel of a grid (a ladder's cell, Plan 43 part B): it grows to the middle alone, over its neighbours, which stay where they are and dim
  const zoomCell = (cell: HTMLElement, card: HTMLElement) => {
    if ([...document.querySelectorAll<HTMLElement>('.dk-card[data-card]:not([data-phase="out"])')].some((c) => c.getAttribute('data-phase') === 'wait')) return;
    cardZoom.open({ focus: [cell], others: [], area: zoomArea(), layout: plan.layout, unit: fitOf(cell), cell: { cell, card }, reduce: reduceMotion(), veil: zveilRef.current, mark: document.body });
  };
  // a tap while a zoom is up (or on its way) puts it back, wherever it lands; else on a panel of a grid it zooms that panel; else on the card's empty part it zooms the card
  const zoomTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    if (justDragged()) return;
    if (cardZoom.on) { void cardZoom.close({ reduce: reduceMotion() }); return; }
    const cell = (e.target as Element | null)?.closest?.<HTMLElement>('.pz-cell');
    if (cell && card.contains(cell) && emptyTap(e.target, cell)) { zoomCell(cell, card); return; }
    if (zoomsHere && emptyTap(e.target, card)) zoomOpen(card);
  };
  // 2D's corner button on an instrument's card (.pz-zbtn, presenter-start.js: `onclick: () => zoomToggle()`): the same zoom as a tap on the card's empty part, and the same way back
  const zoomButton = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();   // (the card's own tap would read it as a second one)
    if (justDragged() || !zoomsHere) return;
    if (cardZoom.on) { void cardZoom.close({ reduce: reduceMotion() }); return; }
    const card = e.currentTarget.closest<HTMLElement>('.dk-card');
    if (card) zoomOpen(card);
  };
  // the corner button is offered where the card has room to grow (2D presenter-ladders.js `zoomOn`: wide, and `zoom.plan()` is not null), which is when it would grow by at least ZOOM_MIN
  const dataBox = dataShown?.rect;
  const zoomableData = zoomsHere && !!dataBox && !!zoomPlan({ left: dataBox.x, top: dataBox.y, width: dataBox.w, height: dataBox.h }, zoomArea(), zoomMargin(zoomArea(), plan.layout));
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
  // (a swipe of any kind while a card is zoomed, on the card or on the dimmed page, or a trackpad's two-finger swipe, glides the zoom back and the slide stays: Plan 43. The buttons and arrow keys still change the slide)
  const goTo = (m: Move) => {
    if (cardZoom.on) { void cardZoom.close({ reduce: reduceMotion() }); return; }
    if (m === 'next' && atEnd(useUi.getState())) finishTalk(); else move(m);
  };
  // a slide whose Next is a step (a procedure, the HVPG readings): its swipes only step; no card moves, vertically either
  const steppedSlide = () => procCanStep(1) || procCanStep(-1) || toolCanStep(1) || toolCanStep(-1) || lapseCanSkip();
  // every in-slide step the presenter's move takes before it moves the talk: a lapse's days, a card page, a procedure's step, a reading
  const stepsHere = (dx: number) => { const d = dx < 0 ? 1 : -1, at = Math.min(page === 'last' ? pages - 1 : page, pages - 1); return lapseCanSkip() && d > 0 || (d > 0 ? at < pages - 1 : at > 0) || procCanStep(d) || toolCanStep(d); };
  // 2D's dock (ui/cards/dock.ts): on a phone or an upright iPad with both cards up, a push up anywhere on the slide slides the instrument card away to its handle, following the finger; a pull down
  // anywhere brings it back; a tap on its handle too
  // (a phone on its side: the two cards are one column on the left; the same swipe slides BOTH up until the instrument is in the middle, a swipe down brings the words back, and a tap on the card that peeks
  // does the same: docs/approved/landscape-phone.md. A new slide always starts on its words.)
  const dockable = ((plan.layout === 'stack' || plan.layout === 'tab') && (!plan.strip || plan.docked) || plan.sideways) && !!dataShown && !!wordsShown && !alone;
  useDockSwipe({ enabled: dockable && !cardZoom.on, locked: steppedSlide, docked: plan.docked || plan.scrolled, column: plan.sideways ? plan.scrollDy : undefined, onSettle: (closed) => setDocked(closed) });
  useEffect(() => { if (useUi.getState().docked && isSideways(vp.w, vp.h)) setDocked(false); }, [pos.stop]); // eslint-disable-line react-hooks/exhaustive-deps
  // a Mac trackpad's two-finger sideways swipe: one slide a gesture (the glide after the fingers lift never skips another)
  useDeckWheel(goTo);
  // phones: a vertical swipe on a card swaps the wallet; anywhere: a sideways swipe on a card moves the talk
  const swipe = useCardDrag({
    onEnd: (g, e) => {
      // a vertical swipe the dock took (useDockSwipe lets go on this same pointerup) is not also the wallet's swap: once the dock has landed and the store has re-rendered (a card pushed fully away
      // lands at once), `plan.strip` is the docked card's edge, and the swipe that docked it was read a second time as "swap" and brought the card straight back
      if (justDocked()) return;
      if (plan.strip && !plan.sideways && isSwapSwipe(g) && !steppedSlide()) { swapWallet(); return; }
      const m = swipeMove(g.dx, g.dy, g.ms);
      if (m) goTo(m);
    },
    onMove: goTo,
    // a drag follows only where it will do something: a slide to go to (or a page to turn), not the first slide's Back
    // the data card the next slide keeps (same key) stays put under a drag: only the cards that change follow the finger
    keeps: (dx) => { if (dx < 0 && atEnd(useUi.getState())) return false; const to = dataAt[apply(stops, pos, dx < 0 ? 'next' : 'back').stop]; return !!view?.data && !!to && to.key === baseKey; },
    // a slide whose procedure (or whose data card's readings) takes Next as a step: the swipe steps through the steps and no card follows the finger (Mohammad, 24 Nov)
    stays: stepsHere,
    // a slide change sends the cards out from where the finger let go; a page turned, or a beat of this slide, leaves them where they are (they ease back)
    leaves: (m) => {
      if (m === 'next' && atEnd(useUi.getState())) return true;
      const to = apply(stops, pos, m);
      if (samePos(to, pos)) return false;
      const v2 = phoneView(viewAt(stops, to, lastSlideShot(stops)), sidewaysNow, dataAt[to.stop]?.kind);
      return (v2.slide && (v2.words === 'teach' || v2.words === 'case' || v2.words === 'visual') ? `${v2.words}:${v2.slide.id}` : v2.words) !== wordsKey;
    },
    can: (dx) => !cardZoom.on && (pages > 1 || (dx < 0 && atEnd(useUi.getState())) || !samePos(apply(stops, pos, dx < 0 ? 'next' : 'back'), pos)),
    width: vp.w,
    cards: () => [...document.querySelectorAll<HTMLElement>('.dk-card[data-card]:not([data-phase="out"])')].map((card) => ({ els: [card, ...(card.previousElementSibling?.classList.contains('dk-plate') ? [card.previousElementSibling as HTMLElement] : [])], data: card.getAttribute('data-card') === 'ladder' || card.getAttribute('data-card') === 'table' })),
  });

  if (!view) return null;
  const gap = gapOf(readings);
  const stacked = layoutOf(vp.w, vp.h) === 'stack' || layoutOf(vp.w, vp.h) === 'tab';
  // each card draws what it was given when it came in, so a card that is leaving keeps its own words while it goes
  const snaps = snapRef.current;
  const now: Snap = { dkey: cardKeyAt(stops, here?.from ?? pos.stop), slide: view.slide, dslide: carried ?? view.slide, pages, at, trim, readings };
  const content = (e: Entry) => {
    // (only the card the view is on takes the view's words: for the render before a slide change reaches the stack, the card still standing is the old slide's, and must keep its own)
    if (e.phase === 'in' && (e.key === wordsKey || e.key === dataKey)) snaps[e.key] = now;
    const sn = snaps[e.key] ?? now;
    const own = sn.readings, readOwn = (k: string, at?: string) => own[at ? `${k}@${at}` : k];
    switch (e.id) {
      case 'title': return <TitleCard deck={deck} page={sn.at} pages={sn.pages} />;
      case 'case': return sn.slide ? <CaseCard slide={sn.slide} page={sn.at} pages={sn.pages} /> : null;   // (a leaving card with no snapshot falls back to the view now, which on the title or the quick check has no slide: Back from slide 2 crashed the app)
      case 'teach': return sn.slide ? <TeachingCard slide={sn.slide} deck={deck} read={readOwn} fp={own} page={sn.at} pages={sn.pages} trim={sn.trim} /> : null;
      case 'table': return sn.dslide?.table ? <TableCard deck={deck} slide={sn.dslide} /> : sn.dslide ? <ToolCard deck={deck} slide={sn.dslide} /> : null;
      case 'ladder': return (
        <>
          {sn.dslide?.tiles || (sn.dslide && hasToolChart(sn.dslide)) ? <TilesHead deckId={deck.id} slideId={sn.dslide.id} onZoom={sn.dslide.tool ? zoomButton : undefined} /> : null}
          {sn.dkey ? <CardKey lens={sn.dkey} /> : null}
          {sn.dslide && hasToolChart(sn.dslide) ? <ToolCard deck={deck} slide={sn.dslide} /> : null}
          {sn.dslide?.ladder && !sn.dslide.tool ? <LadderCard ladder={sn.dslide.ladder} readings={own} /> : sn.dslide?.tiles ? <TilesCard deckId={deck.id} slideId={sn.dslide.id} /> : null}
        </>
      );
      case 'visual': return sn.slide ? <VisualCard deck={deck} slide={sn.slide} read={readOwn} fp={own} /> : null;
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
    // Each card is drawn from what it was let in with (frame-props.ts): a card on its way out keeps its own step, visual and signature, never the new slide's, so it is not re-spaced or measured while it goes
    const isCurrent = e.phase === 'in' && e.key === wantedKey;
    const live: FrameLive = { vars: (slot === 'data' ? dataVars : ladVars) as CSSProperties | undefined, visual: view.slide?.visual, sig, tight };
    if (isCurrent) frameSnap.current[e.key] = live;
    const fp = frameProps(isCurrent, live, frameSnap.current[e.key]);
    // a card showing for the first time on a phone measures first (it is at height 0 until then)
    return (
      <CardFrame key={e.key} entry={e} rect={{ ...rect, w: rect.w || wide }} onHeight={onHeight} onOutgrown={slot === 'data' ? outgrown : undefined} onGone={stack.gone} label={labelOf(e.id)}
        pointer={swipe} go={go} data={slot === 'data'} vars={fp.vars as never} remeasure={fp.sig} fresh={fresh} swap={slot === 'data' && swapping} tuck={slot === 'data' && plan.docked} lift={plan.scrolled ? plan.scrollDy : undefined} zoomable={zoomsHere && e.phase === 'in'} onTap={plan.sideways && plan.scrollDy > 0 && e.phase === 'in' && (slot === 'data' ? !plan.scrolled : plan.scrolled) ? () => { if (!justDocked() && !justDragged()) goColumn(slot === 'data' ? 1 : 0, plan.scrollDy, setDocked); } : slot === 'data' && plan.docked && e.phase === 'in' ? () => { if (!justDocked()) openDock(setDocked); } : e.id === 'case' && e.phase === 'in' ? () => { if (!justDragged()) move('next'); } : zoomsOn(plan.layout, plan.sideways) && e.phase === 'in' && (zoomsHere || view.slide?.visual === 'ladders') ? zoomTap : undefined} visual={fp.visual} overflow={plan.overflow.includes(e.id) && e.phase === 'in'} extra={slot === 'data' ? [dataClass(e), zoomableData && e.phase === 'in' ? 'pz-zoomable' : ''].filter(Boolean).join(' ') || undefined : wordsClasses(e.id, fp.visual, !!nameTabOf(deck))}>
        {slot === 'data' ? <DataCap.Provider value={alone || !(wordsHit && wordsHit.h > 0) ? 0 : plan.maxH.data}>{content(e)}</DataCap.Provider>
          // (a chart in a centred panel keeps inside what the panel leaves it, as one in a data card does: only past its floor does the panel's fit zoom take over)
          : alone === 'panel' && e.id === 'visual' ? <DataCap.Provider value={plan.maxH.words}>{content(e)}</DataCap.Provider> : content(e)}
      </CardFrame>
    );
  });

  // 2D's veil: behind the outline and the quick check the page is washed to its own colour (92%), so the card stands on a clear field
  const veil = view.words === 'title' || view.words === 'check' || view.words === 'visual';
  return (
    <>
      {/* (no wash behind a case card: the figure stays whole, the card's own glass and blur set it off; owner, 24 Nov 2026) */}
      {/* (a phone on its side keeps the figure in view beside its one column: no veil) */}
      <div className={`pz-veil${plan.sideways ? '' : view.words === 'check' ? ' on soft' : veil ? ' on' : ''}`} aria-hidden="true" />
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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { caseOf, type Deck, type ReadingKey, type Slide } from '../../decks/schema.ts';
import { useUi, atEnd, type Readings } from '../ui-store.ts';
import { dock } from './dock.ts';
import { finishTalk } from './finish.ts';
import { dataKeys } from './keep.ts';
import { gatedSlide, procOver } from './proc-gate.ts';
import { useProc } from '../deck/procs-state.ts';
import { useDockSwipe, openDock, goColumn, justDocked } from './useDockSwipe.ts';
import { viewAt, lastSlideShot } from '../deck/presenter-machine.ts';
import { DataCap } from '../talk/tool-room.ts';
import { usePaneIn, paneOf } from '../talk/pane-load.ts';
import { pairSteps, stepVars, dataFitOf, type PairBase } from './pair-ladder.ts';
import { planLayout, figureAspect, widthOf, centredKind, centredBox, panelVisual, type CardId, type Need, type Plan } from '../layout/plan.ts';
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
import { cardKeyAt, copiedSlideOf } from '../../scene/labels/deck-link.ts';
import { useLabels } from '../../scene/labels/store.ts';
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
import { hvpgNotMeasurable } from '../cuts.ts';
import { maxPages, clampPage, nextToMeasure, tallestPage } from './pages.ts';
import { rekeyed } from './box-lock.ts';
import { cardKey, wordsCardKey } from './card-key.ts';
import { keptByMove } from './swipe-keeps.ts';
import { wordsFitOf } from './card-fit.ts';
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
export const MAX_REKEYS = 2, SETTLE_MS = 120, GIVE_UP_CARDS_MS = 8000, GIVE_UP_HARD_MS = 30000, PANE_GIVE_UP_MS = 25000;   // (the readiness gate decides when cards come in; the 8 s is only the crash net that keeps a failed piece from hiding the talk for good, the same one the engine's numbers have: inputs-in.ts GIVE_UP_MS)
const ZERO: Rect = { x: 0, y: 0, w: 0, h: 0 };
interface Snap { /** the deck the card was drawn for: a card that is leaving as the talk changes keeps its own deck as it keeps its own slide (the table of Next bleed 11 was asked for with Next bleed's id and the Outflow slide the card still held) */ deck: Deck; /** the lens whose key is the data card's first row (cardKeyAt, asked with the stop the card came from) */ dkey: string | null; slide: Slide | null; /** the slide whose instrument the data card shows (the slide itself, or the one before it whose card stays) */ dslide: Slide | null; pages: number; at: number; trim: boolean; /** the slide's readings as they stood while the card was the current one: a card that leaves keeps its own numbers ("13 mmHg" on Ascites 12 did not turn into the next slide's as it went) */ readings: Readings }

/** Every card on screen: what the presenter says is up, where the planner puts it, kept through a leave and an enter. */
export function CardLayer({ deck }: { deck: Deck }) {
  const stops = useUi((s) => s.stops);
  const pos = useUi((s) => s.pos);
  const vp = useUi((s) => s.vp);
  const wallet = useUi((s) => s.wallet);
  const readings = useUi((s) => s.readings);
  const pressedLens = useLabels((s) => s.pressed);   // (the lens a pressed lens button put on the figure: the data card's key row follows it, deck-link.ts keyHomes)
  const move = useUi((s) => s.move);
  const swapWallet = useUi((s) => s.swapWallet);
  const docked = useUi((s) => s.docked);
  const setDocked = useUi((s) => s.setDocked);
  const publishPlan = useUi((s) => s.publishPlan);

  // the data card at every stop (ui/cards/keep.ts): a slide with no instrument of its own keeps the one before it on screen unless a case, a lapse, a catheter or a patient change needs the screen
  const dataAt = useMemo(() => dataKeys(deck, stops), [deck, stops]);
  const sidewaysNow = isSideways(vp.w, vp.h);
  const here = dataAt[pos.stop] ?? null;
  // a procedure slide's graph card waits for its procedure (proc-gate.ts): until it is done the slide has its words card alone and the figure has the rest of the screen
  const atSlide = stops[pos.stop]?.kind === 'slide' ? (stops[pos.stop] as { slide: Slide }).slide : null;
  const gated = !!here && here.from === pos.stop && gatedSlide(atSlide, atSlide ? copiedSlideOf(deck.id, atSlide) : null);
  const procOpen = useProc((p) => !gated || (!!atSlide && procOver(p, `${deck.id}/${atSlide.id}`)));
  const view = useMemo(() => {
    if (!stops.length) return null;
    const v = phoneView(viewAt(stops, pos, lastSlideShot(stops)), sidewaysNow, here?.kind);
    const w = !v.data && here && v.words === 'teach' ? { ...v, data: here.kind } : v;
    return gated && !procOpen && w.data ? { ...w, data: null } : w;
  }, [stops, pos, here, sidewaysNow, gated, procOpen]);
  const carried = here && stops[here.from]?.kind === 'slide' ? (stops[here.from] as { slide: Slide }).slide : null;   // (the slide whose instrument the data card shows)
  // heights are tagged with the page they were measured on, so a card that has just been split is never judged by its whole height
  const [heights, setHeights] = useState<Record<string, { h: number; want: number; open: number; sig: string; f: boolean; t: number }>>({});
  const sigRef = useRef('');
  const onHeight = useCallback((key: string, w: number, h: number, want = h, open = 0) => {
    const sig = sigRef.current, f = fontsLoaded();   // (a height measured while a font was still loading is not final: the card is not let in on it, 24 Nov)
    setHeights((m) => { const o = m[`${key}@${w}`]; return o && o.h === h && o.want === want && o.open === open && o.sig === sig && o.f === f ? m : { ...m, [`${key}@${w}`]: { h, want, open, sig, f, t: clock.nowReal() } }; });
  }, []);
  const [pagesMap, setPagesMap] = useState<Record<string, number>>({});
  const page = useUi((s) => s.page);
  const setPageCount = useUi((s) => s.setPageCount);

  // (a card's key is its talk and its slide: a slide id alone is shared by several talks, card-key.ts)
  const keyOfWords = (v: NonNullable<typeof view>) => wordsCardKey(deck.id, v.words, v.slide?.id);
  // A card that grew past the box it locked is not grown: it is replaced by a fresh card at its final size (CardFrame `onOutgrown`; Mohammad, 24 Nov: a
  // card never visibly changes size), the words' card as the data card.
  const [rekeys, setRekeys] = useState<Record<string, number>>({});
  const outgrown = useCallback((k: string) => setRekeys((m) => { const n = rekeyed(m, k, MAX_REKEYS); return Object.keys(n).every((b) => n[b] === m[b]) ? m : n; }), []);
  const wordsBase = view ? keyOfWords(view) : '';
  const wordsKey = rekeys[wordsBase] ? `${wordsBase}~${rekeys[wordsBase]}` : wordsBase;
  const pagesKey = `${wordsBase}@${vp.w}x${vp.h}`;
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
  // (what a card splits into: the quick check's questions, a summary table's rows; every other card its sentences)
  const itemsOf = (v: NonNullable<typeof view>) => (v.words === 'check' ? deck.checks.length : v.words === 'visual' ? v.slide?.table?.of.length ?? 0 : 0);
  const capOf = (v: NonNullable<typeof view>) => maxPages(v.words, v.slide && v.words === 'case' ? caseOf(v.slide)?.text : v.slide?.line, itemsOf(v));
  const pages = view ? Math.min(pagesMap[pagesKey] ?? 1, capOf(view)) : 1;
  // A card that pages is one height on every page (Mohammad, 25 Nov: a card never changes size on screen; Carvedilol 10, iPhone: page 2 of 2 was a line longer than page 1 and the card grew 30 px on the turn). Before a words card lands
  // the layer walks its pages once, out of sight (the card is not let in until it is done), takes each page's measured height, and every page is then the tallest: `pageMax` is what the plan is given. The walk is by
  // the card's own measure at that page's signature, so it needs no clock; it is skipped for a card already on screen (a resize) and past the cards' give-up.
  const [surveyMap, setSurveyMap] = useState<Record<string, (number | undefined)[]>>({});
  const [surveyLate, setSurveyLate] = useState('');
  const liveWords = useRef('');   // (the words card the layer last let in: its pages are not walked again under the reader's eyes)
  const surveyKey = `${pagesKey}#${pages}`;
  const got = surveyMap[surveyKey];
  const nextPage = nextToMeasure(got, pages);
  const surveying = nextPage !== undefined && liveWords.current !== wordsBase && surveyLate !== pagesKey;
  const pageMax = tallestPage(got, pages);
  const at = surveying ? nextPage! : clampPage(page, pages);
  const ladOn = pair && !!view && !centredKind(view.words);
  const cands = useMemo(() => (ladBase[pagesKey] ? pairSteps(ladBase[pagesKey]) : []), [ladBase, pagesKey]);
  const lad = ladOn ? Math.min(ladMap[pagesKey] ?? 0, Math.max(0, cands.length - 1)) : 0;
  const ladVars = ladOn ? stepVars(cands[lad]) : undefined;
  const fitK = ladOn ? fitMap[pagesKey] : undefined;
  // A data card whose fit is spent and still stands taller than its room keeps its height and the words page instead (a path's words are held at 12 px, so zooming it
  // does not shorten it: Variceal bleed 14, stress capture c0d955e1, 360 px in 304). Sticky for the slide, so the plan does not swing between the two.
  const [holdMap, setHoldMap] = useState<Record<string, boolean>>({});
  const dataVars = fitK != null && fitK < 1 ? { ...ladVars, '--pz-fit': fitK } : ladVars;
  // (a phone on its side, a table card past its room after every step: its rows sit closer, one last step; the type never shrinks)
  const [tightMap, setTightMap] = useState<Record<string, boolean>>({});
  const tight = !!tightMap[pagesKey];
  // The words' last resort (card-fit.ts): past their last page they still stand taller than their room, so their contents zoom to it (--pz-fit, never
  // under the 12 px floor) rather than stand clipped. Before the last page they page.
  const [wfitMap, setWfitMap] = useState<Record<string, number>>({});
  const wfitK = alone ? undefined : wfitMap[pagesKey];
  const wordsVars = wfitK != null && wfitK < 1 ? { ...ladVars, '--pz-fit': wfitK } : ladVars;
  const sig = `${wordsKey}|${pages}|${at}|${vp.w}x${vp.h}|${lad}|${fitK ?? ''}|${tight ? 't' : ''}|${wfitK ?? ''}`;
  sigRef.current = sig;

  // A kept data card whose new slide needs a taller box than it landed with is replaced like the words' (above).
  const baseKey = cardKey(deck.id, here?.key ?? 'ladder');
  const dataKey = rekeys[baseKey] ? `${baseKey}~${rekeys[baseKey]}` : baseKey;
  // (a words card replaced by a fresh one at its final size stands at the height of the one it replaces until the fresh one has measured: the pair does not rearrange meanwhile)
  const wordsH = h(wordsKey) || h(wordsBase);
  const needs: Need[] = view ? [{ id: view.words, slot: 'words', visual: view.slide?.visual, h: wordsH > 0 ? Math.max(wordsH, pageMax) : 0 }, ...(view.data ? [{ id: view.data, slot: 'data' as const, h: h(dataKey), want: hit(dataKey)?.want ?? 0, hold: !!holdMap[pagesKey] }] : [])] : [];
  const aspect = figureAspect(view?.scene?.view, vp);
  const plan: Plan = useMemo(() => planLayout(vp, needs, wallet.active, step, docked, aspect), [vp, aspect, wallet.active, step, docked, needs.map((n) => `${n.id}:${n.slot}:${n.h}:${n.want ?? ''}:${n.hold ? 'h' : ''}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // The dock glide sets off: the figure's room for where the card is going is told at once, with the glide's length, so the camera reframes with the card, not after it lands (2D presenter-zoom.js dockTo:
  // layout() then reframe(ms)). `plan` above is for the settled state only, and publishes when the card has come to rest.
  const planFor = useRef<(docked: boolean) => Plan>(() => plan);
  planFor.current = (d) => planLayout(vp, needs, wallet.active, step, d, aspect);
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
  const wfitBusy = tooTall && !alone && !tightens && !!view && pages >= capOf(view) && wfitK === undefined;
  useLayoutEffect(() => {
    if (!view) return;
    // (the size of a card's lettering where it stands now: the ladder's base sizes, and the words' fit floor)
    const px = (slot: string, sel: string) => { const e = liveCard(slot)?.querySelector<HTMLElement>(sel); return e ? parseFloat(getComputedStyle(e).fontSize) || 0 : 0; };
    if (ladBusy) {
      // the first measure at the full size gives the ladder its sizes (the title's, the words', the tiles' names), read where they stand; each step after it is the next index
      if (!ladBase[pagesKey]) {
        // (from the cards now standing, never one leaving: during a slide change the old card is still first in the page, and its sizes gave a wrong floor, a title at 1.24 times its words)
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
    if (wfitBusy) {
      setWfitMap((m) => ({ ...m, [pagesKey]: wordsFitOf(wordsHit?.h ?? 0, plan.maxH.words, px('words', '.pz-line, p'), true) }));
      return;
    }
    const cap = capOf(view);
    if (tooTall && pages < cap) setPagesMap((m) => ({ ...m, [pagesKey]: pages + 1 }));
    else if (tightens) setTightMap((m) => ({ ...m, [pagesKey]: true }));
  }, [tightens, tooTall, wfitBusy, ladBusy, fitBusy, lad, cands.length, pages, pagesKey, view, deck.checks.length]);
  // (the fit has been made, the card was measured at it, and it still stands taller than its room: it cannot go smaller)
  const spent = ladOn && fitK !== undefined && !holdMap[pagesKey] && dataHit?.sig === sig && dataHit.f !== false && dataHit.open === 0 && dataHit.h > plan.maxH.data + 0.5;
  useLayoutEffect(() => { if (spent) setHoldMap((m) => ({ ...m, [pagesKey]: true })); }, [spent, pagesKey]);
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
  const growing = ladBusy || fitBusy || wfitBusy || (tooTall && pages < (view ? capOf(view) : 1)) || tightens || surveying;
  // (and its height has stood still for SETTLE_MS: a row or a readout that mounts in the frame after the first measure, from an effect or a second render, has come by then, so the card is let in at the height it keeps)
  const [, setTick] = useState(0);
  const settleLeft = needs.reduce((m, n) => { const e = hit(n.slot === 'words' ? wordsKey : dataKey); return e ? Math.max(m, SETTLE_MS - (clock.nowReal() - e.t)) : m; }, 0);
  useEffect(() => { if (settleLeft <= 0) return; const t = clock.afterReal(() => setTick((k) => k + 1), settleLeft + 1); return () => clock.cancel(t); }, [settleLeft, heights]);   // eslint-disable-line react-hooks/exhaustive-deps
  // (and every chart in a card is drawn once at its box: `open` is how many are not, so a chart never reaches its size while its card slides in; the 320 ms give-up is the net)
  const measured = needs.length > 0 && needs.every((n) => (n.h > 0 && (n.slot === 'data' || hit(wordsKey)?.sig === sig) && (hit(n.slot === 'words' ? wordsKey : dataKey)?.open ?? 0) === 0 && hit(n.slot === 'words' ? wordsKey : dataKey)?.f !== false && settleLeft <= 0) || (plan.docked && n.slot === 'data'));
  const [late, setLate] = useState('');
  // each page's height is taken from the card's own measure at that page, once it has stood still (the same readiness the card is let in on)
  useEffect(() => {
    if (!surveying || !wordsHit || wordsHit.sig !== sig || wordsHit.f === false || wordsHit.open !== 0 || settleLeft > 0 || wordsHit.h <= 0) return;
    setSurveyMap((m) => { const cur = m[surveyKey] ?? []; if (cur[nextPage!] === wordsHit.h) return m; const nx = cur.slice(); nx[nextPage!] = wordsHit.h; return { ...m, [surveyKey]: nx }; });
  }, [surveying, wordsHit, sig, settleLeft, surveyKey, nextPage]);
  // The crash net counts from the last step the negotiation made (a measure, a ladder step, the fit, a page of the walk), not from the slide's start:
  // a slow screen (a heavy figure, a phone) takes many seconds over those steps, and a net on the wall clock let the card in half-negotiated,
  // its words short of their last lines and its instrument past its room (Portal day 3, Carvedilol 5, Mac, 25 Nov).
  // A hard cap keeps a card that never stops changing from hiding the talk. Real time both (tests/card-readiness-real-time.test.ts).
  const progress = [wordsHit?.h, wordsHit?.sig, dataHit?.h, dataHit?.sig, lad, fitK, wfitK, pages, tight, got?.join(',')].join('|');
  useEffect(() => { const t = clock.afterReal(() => setSurveyLate(pagesKey), GIVE_UP_CARDS_MS); return () => clock.cancel(t); }, [pagesKey, progress]);
  useEffect(() => { const t = clock.afterReal(() => setLate(pagesKey), GIVE_UP_CARDS_MS); return () => clock.cancel(t); }, [pagesKey, progress]);
  useEffect(() => {
    const t = clock.afterReal(() => { setSurveyLate(pagesKey); setLate(pagesKey); }, GIVE_UP_HARD_MS);
    return () => clock.cancel(t);
  }, [pagesKey]);
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
    const t = clock.afterReal(() => setGaveUp(numbersKey), GIVE_UP_MS);   // (REAL time: the second engine's work is not scaled by the clock; the audit's 20x clock turned 8 s into 0.4 s and let a card in before its numbers, Ten years 13, capture f23a4c59)
    return () => clock.cancel(t);
  }, [numbers, deck.id, numbersKey]);
  // (and the Tests pane the data card's instrument is, when it is one: its code is read in before the card is measured, never after, so the card is let in at the height the pane really has: pane-load.ts)
  const paneKind = view?.data && here?.key.startsWith('tool:') && carried ? (carried.tool as { kind?: unknown } | undefined)?.kind : undefined;
  const panesIn = usePaneIn(paneKind);
  // (a pane's code is a fetch, so its wait is REAL time and longer than the cards' own: the audit's 20x clock made the 8 s a third of a second, a slow phone's first use of a pane took longer than 8 s, and in both the
  // card came in at the placeholder's height and the pane, drawn after it, stood 145 px past its foot: Stiffness 2, audit 1161e159. While the wait runs the cards' own give-up may not let the card in either: it comes
  // in when the pane is drawn in it (openCharts counts a placeholder as open), or when the pane's wait is over)
  const paneUsed = paneOf(paneKind) !== null;
  const [paneLate, setPaneLate] = useState('');
  useEffect(() => { if (!paneUsed) return; const t = clock.afterReal(() => setPaneLate(pagesKey), PANE_GIVE_UP_MS); return () => clock.cancel(t); }, [paneUsed, pagesKey]);
  const paneWaits = paneUsed && paneLate !== pagesKey;
  const go = fonts && !growing && (numbers || gaveUp === numbersKey) && (measured || (late === pagesKey && !paneWaits)) && (panesIn || paneLate === pagesKey);
  useEffect(() => { if (go && view) liveWords.current = wordsBase; });
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
    // a card the place this drag goes to shows again (the data card the next slide keeps; the words card of a beat of the same slide) stays put under the finger: only the cards that change follow it
    keeps: (dx) => { if (dx < 0 && atEnd(useUi.getState())) return { words: false, data: false }; const k = keptByMove(deck.id, stops, pos, dx < 0 ? 'next' : 'back', dataAt, wordsBase, view?.data ? baseKey : null, sidewaysNow); return k; },
    // a slide whose procedure (or whose data card's readings) takes Next as a step: the swipe steps through the steps and no card follows the finger (Mohammad, 24 Nov)
    stays: stepsHere,
    // a slide change sends the cards out from where the finger let go; a page turned, or a beat of this slide, leaves them where they are (they ease back)
    leaves: (m) => {
      if (m === 'next' && atEnd(useUi.getState())) return true;
      const to = apply(stops, pos, m);
      if (samePos(to, pos)) return false;
      const v2 = phoneView(viewAt(stops, to, lastSlideShot(stops)), sidewaysNow, dataAt[to.stop]?.kind);
      return keyOfWords(v2) !== wordsBase;
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
  const now: Snap = { deck, dkey: cardKeyAt(stops, pos.stop, pressedLens, here?.kind === 'ladder' && !gated), slide: view.slide, dslide: carried ?? view.slide, pages, at, trim, readings };
  const content = (e: Entry) => {
    // (only the card the view is on takes the view's words: for the render before a slide change reaches the stack, the card still standing is the old slide's, and must keep its own)
    if (e.phase === 'in' && (e.key === wordsKey || e.key === dataKey)) snaps[e.key] = now;
    const sn = snaps[e.key] ?? now;
    const own = sn.readings, readOwn = (k: string, at?: string) => own[at ? `${k}@${at}` : k];
    switch (e.id) {
      case 'title': return <TitleCard deck={sn.deck} page={sn.at} pages={sn.pages} />;
      case 'case': return sn.slide ? <CaseCard slide={sn.slide} deck={sn.deck} page={sn.at} pages={sn.pages} /> : null;   // (a leaving card with no snapshot falls back to the view now, which on the title or the quick check has no slide: Back from slide 2 crashed the app)
      case 'teach': return sn.slide ? <TeachingCard slide={sn.slide} deck={sn.deck} read={readOwn} fp={own} page={sn.at} pages={sn.pages} trim={sn.trim} /> : null;
      case 'table': return sn.dslide?.table ? <TableCard deck={sn.deck} slide={sn.dslide} /> : sn.dslide ? <ToolCard deck={sn.deck} slide={sn.dslide} /> : null;
      case 'ladder': return (
        <>
          {sn.dslide?.tiles || (sn.dslide && hasToolChart(sn.dslide)) ? <TilesHead deckId={sn.deck.id} slideId={sn.dslide.id} onZoom={sn.dslide.tool ? zoomButton : undefined} /> : null}
          {sn.dkey ? <CardKey lens={sn.dkey} /> : null}
          {sn.dslide && hasToolChart(sn.dslide) ? <ToolCard deck={sn.deck} slide={sn.dslide} /> : null}
          {sn.dslide?.ladder && !sn.dslide.tool ? <LadderCard ladder={sn.dslide.ladder} readings={own} /> : sn.dslide?.tiles ? <TilesCard deckId={sn.deck.id} slideId={sn.dslide.id} /> : null}
        </>
      );
      case 'visual': return sn.slide ? <VisualCard deck={sn.deck} slide={sn.slide} read={readOwn} fp={own} page={sn.at} pages={sn.pages} /> : null;
      case 'check': return <CheckCard deck={sn.deck} page={sn.at} pages={sn.pages} />;
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
    const live: FrameLive = { vars: (slot === 'data' ? dataVars : wordsVars) as CSSProperties | undefined, visual: view.slide?.visual, sig, tight };
    if (isCurrent) frameSnap.current[e.key] = live;
    const fp = frameProps(isCurrent, live, frameSnap.current[e.key]);
    // a card showing for the first time on a phone measures first (it is at height 0 until then)
    return (
      <CardFrame key={e.key} entry={e} rect={{ ...rect, w: rect.w || wide }} onHeight={onHeight} onOutgrown={alone ? undefined : outgrown} onGone={stack.gone} label={labelOf(e.id)}
        pointer={swipe} go={go} data={slot === 'data'} vars={fp.vars as never} remeasure={fp.sig} paged={pages > 1} fresh={fresh} swap={slot === 'data' && swapping} tuck={slot === 'data' && plan.docked} lift={plan.scrolled ? plan.scrollDy : undefined} zoomable={zoomsHere && e.phase === 'in'} onTap={plan.sideways && plan.scrollDy > 0 && e.phase === 'in' && (slot === 'data' ? !plan.scrolled : plan.scrolled) ? () => { if (!justDocked() && !justDragged()) goColumn(slot === 'data' ? 1 : 0, plan.scrollDy, setDocked); } : slot === 'data' && plan.docked && e.phase === 'in' ? () => { if (!justDocked()) openDock(setDocked); } : e.id === 'case' && e.phase === 'in' ? () => { if (!justDragged()) move('next'); } : zoomsOn(plan.layout, plan.sideways) && e.phase === 'in' && (zoomsHere || view.slide?.visual === 'ladders') ? zoomTap : undefined} visual={fp.visual} overflow={plan.overflow.includes(e.id) && e.phase === 'in'} extra={slot === 'data' ? [dataClass(e), zoomableData && e.phase === 'in' ? 'pz-zoomable' : ''].filter(Boolean).join(' ') || undefined : wordsClasses(e.id, fp.visual, !!nameTabOf(deck))}>
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
        return <Strip key={e.key} entry={e} rect={rect} behind={behind} hvpg={gap.value != null || hvpgNotMeasurable(readings) ? gap.hvpg : null} slideTitle={view.slide?.title ?? deck.title} dock={plan.docked} onSwap={() => (plan.docked ? setDocked(false) : swapWallet())} onGone={stripStack.gone} />;
      })}
    </>
  );
}

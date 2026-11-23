// The Tests card (2D dock.js "Instruments card"): a card on the right of a wide screen, a sheet over the foot of a phone or an upright iPad, with a row of tabs (Pressure, IR,
// Doppler, Endoscopy, Ascites, FibroScan, Readouts, Trials; Over time lives under Pressure). Always in the page and fading; the instrument on show is remembered on the device.
// The Tests button, the I key and the search commands open it through the shell's `tests` feature.
import { SheetClip } from '../shell/SheetClip.tsx';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import './tests.css';
import './trace/trace.css';
import './dock/dock-side.generated.css';
import { useUi } from '../ui-store.ts';
import { layoutOf, cardScale } from '../layout/rules2d.ts';
import { registerFeature } from '../shell/features.ts';
import { useTests } from './store.ts';
import { PaneHost } from './Cv.tsx';
import { TABS, PANE_ORDER, tabOf, shortName, tinyName, PANES, type PaneId } from './panes.ts';
import { testsPlace, sideVars, HEAD_H, PEEK_H } from './place.ts';
import { useTestsRoom } from './room.ts';
import { I } from '../shell/icons.tsx';
import { TAB_ICONS } from './copied/dock-words.copied.js';
import { CompareLine } from './CompareLine.tsx';
import { fitTabs, type TabFit } from './tab-fit.ts';
import { ReadoutsPane } from './ReadoutsPane.tsx';
import { AbdomenPane } from './abdomen/AbdomenPane.tsx';
import { PressureTab } from './trace/PressureTab.tsx';
import { startFeed } from './feed.ts';
import { notYet } from '../shell/words.ts';
import { useShell } from '../shell/store.ts';
import { probeSelected } from './from-orders.ts';
import { useThumb } from '../shell/thumb.ts';
import { need, needAll, LOADERS } from './dock/lazy.ts';
import { usePaneSwap } from './dock/swap.ts';
import { attachSwipe, swipeOn, type SwipeApi } from './dock/swipe.ts';
import { attachDivider, removeGuide } from './dock/resize.ts';
import { attachPull, easeBack } from './dock/pull.ts';
import { publishSideWidth } from './dock/app-classes.ts';
import { useTestsStatus } from './dock/status.ts';
// @ts-ignore plain JS copied from the 2D app
import { runSegGlide } from './copied/seg-glide.copied.js';
// @ts-ignore plain JS copied from the 2D app
import { handOver } from './copied/hand-over.copied.js';
import { D_FLIP, D_SMALL, EASE_IN, EASE_MOVE } from '../motion.ts';
import { reduced } from '../a11y/motion.ts';
import { M } from '../shell/metrics.ts';
import { topBarH } from '../shell/room.ts';
import { lazyRetry } from '../../boot/lazy-retry.ts';
import { LazyBoundary } from '../shell/LazyBoundary.tsx';
import { observeThenFit } from '../layout/fit-later.ts';
import { Fade } from '../fade.tsx';

// each instrument is its own file in its own folder (a thread works in one folder; the stubs say "not in the 3D app yet" until the instrument lands)
// (the loaders are dock/lazy.ts's: one import each, so a tab touched, a card opened or an idle moment asks for the code before the pane is wanted)
const IrPane = lazyRetry(() => LOADERS.hvpg().then((m) => ({ default: m.IrPane })));
const DopplerPane = lazyRetry(() => LOADERS.doppler().then((m) => ({ default: m.DopplerPane })));
const EndoPane = lazyRetry(() => LOADERS.endoscopy().then((m) => ({ default: m.EndoPane })));
const FibroPane = lazyRetry(() => LOADERS.fibroscan().then((m) => ({ default: m.FibroPane })));
const TrialsPane = lazyRetry(() => LOADERS.trials().then((m) => ({ default: m.TrialsPane })));

/** The panes built so far; a tab whose pane is not here yet says so in a line (never a dead tab). */
export interface PaneProps { narrow: boolean; /** a plot's height and a square's (dock-vars.js) */ plot: number; square: number }
const BUILT: Partial<Record<PaneId, (p: PaneProps) => ReactNode>> = {
  trials: () => <LazyBoundary><TrialsPane /></LazyBoundary>,
  readouts: (p) => <ReadoutsPane narrow={p.narrow} />,
  abdomen: (p) => <AbdomenPane square={p.square} />,
  scope: (p) => <PressureTab own="scope" {...p} />,
  profile: (p) => <PressureTab own="profile" {...p} />,
  hvpg: (p) => <LazyBoundary height={p.plot}><IrPane {...p} /></LazyBoundary>,
  doppler: (p) => <LazyBoundary height={p.plot}><DopplerPane {...p} /></LazyBoundary>,
  endoscopy: (p) => <LazyBoundary height={p.plot}><EndoPane {...p} /></LazyBoundary>,
  fibroscan: (p) => <LazyBoundary height={p.plot}><FibroPane {...p} /></LazyBoundary>,
};
export function registerPane(id: PaneId, render: (p: PaneProps) => ReactNode): void { BUILT[id] = render; }


/** One pane of the card. A pane that is going out stays where it stood (the same element, so what it holds is not built again) and fades over the new one, already drawn beneath it
 *  (2D dock.js paneOut: D_FLIP, EASE_IN, forwards), then goes. */
function Pane({ id, cls, leaver, done, children }: { id: PaneId; cls: string; leaver?: number; done(k: number): void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (leaver == null || !el) return;
    if (typeof el.animate !== 'function') { done(leaver); return; }
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { id: 'pane-out', duration: D_FLIP, easing: EASE_IN, fill: 'forwards' });
    const fin = () => done(leaver);
    a.finished.then(fin, fin);
    return () => a.cancel();
  }, [leaver, done]);
  return <section ref={ref} className={`dock-pane ${cls}`} data-pane={id} id={leaver == null ? `pane-${id}` : undefined} role={leaver == null ? 'tabpanel' : undefined} aria-label={PANES[id].name} aria-hidden={leaver == null ? undefined : true}>{children}</section>;
}

/** `away`: a talk is on. The layer stays mounted (leaving a talk used to mount this whole dock in the one commit that also unmounts the deck's UI: a 50 ms+ stall every time), but hidden, and it keeps no room. */
export function TestsLayer({ away = false }: { away?: boolean }) {
  const open = useTests((s) => s.open), pane = useTests((s) => s.pane), second = useTests((s) => s.second), picking = useTests((s) => s.picking), tstate = useTests((s) => s.state);
  const widthPx = useTests((s) => s.widthPx), heightRatio = useTests((s) => s.heightRatio), sheetSize = useTests((s) => s.sheetSize);
  const show = useTests((s) => s.show), close = useTests((s) => s.close);
  const vp = useUi((s) => s.vp), device = useUi((s) => s.device);
  const thumb = useThumb();
  const focus = tstate === 'focus';
  const place = useMemo(() => testsPlace(vp, device, { widthPx, heightRatio, sheetSize, focus }), [vp, device, widthPx, heightRatio, sheetSize, focus]);
  const narrow = place.rect.w < 470;
  const layout = layoutOf(vp.w, vp.h);
  const roles = cardScale({ vw: vp.w, vh: vp.h, layout, part: 'data' });
  const side = place.kind === 'side';

  // the body's own size, kept by an observer (the plots follow it, 2D dock.js sizeObserver; it is never read in a frame)
  const bodyRef = useRef<HTMLDivElement>(null), tabsRef = useRef<HTMLDivElement>(null), cardRef = useRef<HTMLElement>(null), posRef = useRef<HTMLDivElement>(null), dividerRef = useRef<HTMLDivElement>(null);
  const [bodyH, setBodyH] = useState<number | null>(null);
  const bodyW = useRef(0);
  const peeking = sheetSize === 2 && place.kind === 'sheet', peekRef = useRef(false);
  peekRef.current = peeking;
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    return observeThenFit([el], () => { const r = el.getBoundingClientRect(); bodyW.current = r.width; const h = Math.round(r.height); if (h && !peekRef.current) setBodyH((o) => (o === h ? o : h)); });   // (after the observer's delivery: what it sets changes the size of a box above it)
  }, []);
  const bodyNow = bodyH ?? Math.max(0, place.rect.h - HEAD_H);

  // two instruments at once where there is room for both (2D canSplit: the side card is one short height, so two never share it there; a card 1000 px wide or more, or in focus, may)
  const canSplit = focus || (side ? place.maxH >= 620 && bodyNow >= 600 : place.rect.w >= 1000);
  const split = !!second && canSplit;
  const vars = side ? sideVars(place.rect.w, bodyNow, split ? 2 : 1) : place.vars;

  // the model's samples are kept from the first frame, open or not (2D: the Over time and Doppler traces record every frame from the start)
  useEffect(() => { startFeed(); }, []);
  // every segmented control and tab row has one gliding piece (2D seg-glide.js)
  useEffect(() => runSegGlide(), []);
  // the instruments that load after the first paint come in when the card opens, and when the app is idle (2D load(), main.js lazy())
  useEffect(() => { if (open) needAll(); }, [open]);   // (when the app is idle the preload ladder reads them in, one a slot: boot/warm.ts)
  // the Tests button, the I key and the palette
  useEffect(() => registerFeature('tests', () => useTests.getState().toggle()), []);
  // the card buttons that open an instrument: Doppler, Endoscope, FibroScan (a liver or spleen card), and "Test TIPS in IR" (the stent's card)
  useEffect(() => {
    const show = (id: PaneId) => () => { useShell.getState().close(); useTests.getState().show(id); };
    const offs = [registerFeature('doppler', () => { probeSelected(); show('doppler')(); }), registerFeature('endoscopy', show('endoscopy')), registerFeature('fibroscan', show('fibroscan')), registerFeature('ir', show('hvpg'))];
    return () => offs.forEach((f) => f());
  }, []);
  // a card that was pulled shut (dock/pull.ts) closed without a leave of its own: opening again takes the mark off, so the next close is the usual one
  useEffect(() => { if (open) posRef.current?.removeAttribute('data-swiped'); }, [open]);
  // the figure keeps the room the card leaves
  useEffect(() => {
    useTestsRoom.setState({ place: open && !away ? place : null });
    return () => useTestsRoom.setState({ place: null });
  }, [open, away, place]);
  // a sideways phone's play bar ends at the card (2D putWidth: --side-ws-w on .app)
  useEffect(() => {
    const app = document.getElementById('app');
    publishSideWidth(app, open && !away && side ? place.rect.w : null);
    return () => publishSideWidth(app, null);
  }, [open, away, side, place.rect.w]);
  // a turn of the device hands the card from its side layout to its sheet or back: every scroller goes back to its top (2D hand-over.js, F35)
  const placed = useRef<{ mode?: string }>({});
  useEffect(() => {
    const body = bodyRef.current;
    handOver(placed.current, side ? 'side' : 'sheet', [body, ...(body ? Array.from(body.querySelectorAll('.dock-pane, .instrument-view')) : [])]);
  }, [side]);

  // the tab row never scrolls: a wide card shows the full names, a narrower one the short names, the tightest only the open tab's name (2D dock.js fitTabs; the width comes from the observer, never a read)
  const [fit, setFit] = useState<TabFit>({ compact: false, narrow: false, tight: false, bare: false });
  const tab = tabOf(pane);
  const wRef = useRef(0), tabRef = useRef(tab);
  tabRef.current = tab;
  const refit = (w: number) => { wRef.current = w; const f = fitTabs(w, TABS.length, shortName(tabRef.current)); setFit((o) => (o.compact === f.compact && o.narrow === f.narrow && o.tight === f.tight && o.bare === f.bare ? o : f)); };
  useLayoutEffect(() => {
    const el = tabsRef.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    return observeThenFit([el], () => { const w = el.getBoundingClientRect().width; if (w) refit(w); });   // (after the observer's delivery: what it sets changes the size of a box above it)
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (wRef.current) refit(wRef.current); }, [tab]);  // eslint-disable-line react-hooks/exhaustive-deps
  // in a tight row the open tab shows its name and the others give way at once; each slides from where it stood by translate (2D layout(): WAAPI, composite add)
  const tabX = useRef<Record<string, number> | null>(null);
  useLayoutEffect(() => {
    const row = tabsRef.current;
    if (!row) return;
    const now: Record<string, number> = {}, bs = new Map<string, HTMLElement>();
    for (const b of row.querySelectorAll<HTMLElement>('.instr-tab')) { const id = b.dataset.instrument!; bs.set(id, b); now[id] = b.offsetLeft; }
    const was = tabX.current;
    tabX.current = now;
    if (!was || !fit.tight || reduced()) return;
    for (const [id, b] of bs) { const dx = (was[id] ?? now[id]!) - now[id]!; if (Math.abs(dx) > 0.5 && typeof b.animate === 'function') b.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: D_SMALL, easing: EASE_MOVE, composite: 'add' }); }
  }, [tab, second, fit.tight, fit.bare]);

  // Tests left by the close button, Esc or the Tests button with focus inside: focus goes back to the Tests button (2D dock.js close)
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && cardRef.current?.contains(document.activeElement)) document.getElementById('tabInstruments')?.focus();
    wasOpen.current = open;
  }, [open]);

  // arrow keys, Home and End move between the tabs (2D dock.js tabs keydown); only the open tab is in the tab order (roving tabindex)
  const onTab = (id: PaneId) => { if (live.current.sheetSize === 2) onGrab(); if (useTests.getState().picking && id !== tabRef.current) useTests.getState().pickSecond(id); else show(id); };
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.indexOf((e.target as HTMLElement).closest<HTMLElement>('.instr-tab')?.dataset.instrument as PaneId);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    const id = TABS[j]!;
    tabsRef.current?.querySelector<HTMLElement>(`.instr-tab[data-instrument="${id}"]`)?.focus();
    onTab(id);
  };
  // Esc inside the card: ends a pick, takes a focused instrument back to open, else closes it (2D workspace keydown)
  const onCardKey = (e: KeyboardEvent<HTMLElement>) => { if (e.key !== 'Escape') return; useTests.getState().back(); e.stopPropagation(); };

  // ── a tab changes: the pane is built first, hidden, and swaps in while the old one fades out (dock/swap.ts); a swipe pages with the finger (dock/swipe.ts) ──
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const live = useRef({ open, picking, swiping: false, thumb, focus, second: split ? second : null, pane, side, stops: place.stops, h: place.rect.h, sheetSize, fixed: side && device !== 'phone-landscape', split, widthPx, heightRatio, w: place.rect.w, kind: place.kind });
  live.current = { ...live.current, open, picking, thumb, focus, second: split ? second : null, pane, side, stops: place.stops, h: place.rect.h, sheetSize, fixed: side && device !== 'phone-landscape', split, widthPx, heightRatio, w: place.rect.w, kind: place.kind };
  const canStage = useCallback(() => { const g = live.current; return g.open && !g.picking && !g.swiping; }, []);
  const swap = usePaneSwap(open, pane, split ? second : null, canStage);
  const swapRef = useRef(swap);
  swapRef.current = swap;
  const [peer, setPeer] = useState<PaneId | null>(null);
  useEffect(() => { if (peer && peer === swap.shown) setPeer(null); }, [peer, swap.shown]);
  useEffect(() => { if (!open) { setPeer(null); live.current.swiping = false; } }, [open]);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const api: SwipeApi = {
      enabled: () => swipeOn(live.current),
      tabs: TABS,
      index: () => TABS.indexOf(tabOf(live.current.pane)),
      ready: (id) => !need(id),
      peer: (id) => flushSync(() => setPeer(id)),
      active: () => body.querySelector<HTMLElement>('.dock-pane.active:not(.staging)'),
      paneOf: (id) => body.querySelector<HTMLElement>(`.dock-pane[data-pane="${id}"]`),
      begin: () => { live.current.swiping = true; swapRef.current.cancelStage(); },
      finish: () => { live.current.swiping = false; },
      land: (id) => flushSync(() => { swapRef.current.swipedTo(id); useTests.getState().show(id); }),
    };
    return attachSwipe(body, () => bodyW.current, api);
  }, []);
  // the sheet's pull (Half, Full, closed) and its grab handle
  useEffect(() => {
    const card = cardRef.current, pos = posRef.current;
    if (!card || !pos) return;
    return attachPull(card, pos, {
      enabled: () => { const g = live.current; return g.thumb && g.open && !g.focus && g.kind === 'sheet' && !!g.stops; },
      heights: () => { const g = live.current, st = g.stops ?? [g.h, g.h]; return { h0: g.h, half: st[0], full: st[1], peek: PEEK_H, size: g.sheetSize }; },
      setSize: (n) => flushSync(() => useTests.getState().setSheetSize(n)),
      close: () => flushSync(() => useTests.getState().close()),
    });
  }, []);
  const onGrab = () => {
    const g = live.current, pos = posRef.current;
    if (!g.thumb || !g.open || g.kind !== 'sheet' || !g.stops || !pos) return;
    const n: 0 | 1 = g.sheetSize === 1 || g.sheetSize === 2 ? 0 : 1, h0 = g.h;   // (Half to Full and back; from Peek the handle brings it up to Half)
    flushSync(() => useTests.getState().setSheetSize(n));
    if (!reduced()) easeBack(pos, g.stops[n] - h0);
  };
  // the divider: the card's width on a sideways phone, its height on a sheet that is not over the thumb dock
  useEffect(() => {
    const d = dividerRef.current;
    if (!d) return;
    const off = attachDivider(d, {
      side: () => live.current.side, fixed: () => live.current.fixed,
      card: () => { const r = cardRef.current?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: 0, h: 0 }; },
      stage: () => { const app = document.getElementById('app'), v = app ? parseFloat(getComputedStyle(app).getPropertyValue('--vdock-h')) || 0 : 0; return { W: innerWidth, H: innerHeight, sheetMax: innerHeight - (vpRef.current.safe.top + topBarH(vpRef.current, deviceRef.current)) - v - 40 }; },
      widthPx: () => live.current.widthPx, heightRatio: () => live.current.heightRatio,
      set: (o) => useTests.getState().setSize(o),
    });
    return () => { off(); removeGuide(); };
  }, []);

  // ── what is in the body: the pane on show, a second instrument, a pane being built, the swipe's neighbour, and panes fading out, each in the 2D dock's fixed order ──
  const status = useTestsStatus();
  const slots: { id: PaneId; cls: string; leaver?: number }[] = [];
  const add = (id: PaneId, cls: string, leaver?: number) => { if (!slots.some((s) => s.id === id)) slots.push({ id, cls, leaver }); };
  add(swap.shown, `active${swap.landed === swap.shown ? ' landed' : ''}`);
  if (open) {
    if (split && second) add(second, 'active');
    if (swap.staged) add(swap.staged, 'active staging');
    if (peer) add(peer, 'swipe-peer');
    for (const l of swap.leaving) add(l.id, 'pane-out', l.key);
  }
  slots.sort((a, b) => PANE_ORDER.indexOf(a.id) - PANE_ORDER.indexOf(b.id));
  const render = (id: PaneId) => {
    const body = BUILT[id];
    // (no element between the pane and its view: 2D's child rules, .dock-pane > .instrument-view, reach it; the provider says this is the dock, where the 2D stylesheet sizes every box)
    return body ? <PaneHost.Provider value="dock">{body({ narrow, plot: vars.plot, square: vars.square })}</PaneHost.Provider> : <p className="t-note t-pane">{notYet(PANES[id].name)}</p>;
  };

  const style = {
    width: place.rect.w, height: place.rect.h, transform: `translate(${Math.round(place.rect.x)}px, ${Math.round(place.rect.y)}px)`,
    ['--t-sm' as string]: `${Math.max(12, Math.round(roles.lab))}px`, ['--t-plot' as string]: `${vars.plot}px`, ['--t-square' as string]: `${vars.square}px`,
  } as CSSProperties;
  // the sizes 2D's dock hands its panes (dock.js sizeObserver: --plot-h, --square-size on the workspace)
  const card = { ['--plot-h' as string]: `${vars.plot}px`, ['--square-size' as string]: `${vars.square}px`, ['--instrument-w' as string]: `${place.rect.w}px` } as CSSProperties;
  const tabsCls = `instr-tabs ws-tabs${fit.compact ? ' compact' : ''}${fit.narrow ? ' narrow' : ''}${fit.tight ? ' tight' : ''}${fit.bare ? ' bare' : ''}`;
  const slotOf = (id: PaneId) => (split && second && tabOf(second) === id ? 2 : 1);
  const dividerNow = side ? Math.round((place.rect.w / Math.max(1, vp.w)) * 100) : Math.round(((heightRatio ?? place.rect.h / Math.max(1, vp.h))) * 100);
  return (
    <SheetClip id="tests"><div ref={posRef} className="t-pos" data-open={open} data-cold={open && swap.cold ? "true" : undefined} data-live={open} data-narrow={narrow} data-kind={place.kind} data-thumb={thumb} data-device={device} data-away={away || undefined} style={style}>
      <section ref={cardRef} className={`t-card dock instrument-workspace float-ui stage-blocker${side ? ' side' : ''}${picking ? ' picking' : ''}${place.kind === 'sheet' && sheetSize === 0 ? ' sheet-half' : ''}`} id="dock" role="dialog" aria-label="Tests" data-state={tstate} data-peek={peeking || undefined} data-safe={side ? 'right' : 'bottom'} inert={!open} style={card} onKeyDown={onCardKey}>
        <button type="button" className="sheet-grab" aria-label="Resize the Tests card" onClick={onGrab} />
        <i className="sh-grabbar" aria-hidden="true" />
        <div ref={dividerRef} className="workspace-divider" role="separator" tabIndex={0} aria-label="Instruments size" aria-orientation={side ? 'vertical' : 'horizontal'} aria-valuenow={dividerNow} hidden={tstate !== 'open' || (side && device !== 'phone-landscape')}><span /></div>
        <div className="dock-head card-head tabbed">
          <h2 className={`dock-title card-title${status.vessel ? ' dop-on' : ''}`}><span>Tests</span><span className="dt-l">{status.vessel}</span></h2>
          <span className="workspace-live" aria-live="off" data-state={status.state}>{status.text}</span>
          <div ref={tabsRef} className={tabsCls} role="tablist" aria-label="Tests" onKeyDown={onTabKey}>
            {TABS.map((id) => {
              const on = tab === id || (split && !!second && tabOf(second) === id);
              return (
                <button key={id} type="button" className="instr-tab" role="tab" data-instrument={id} data-slot={on && split && second ? String(slotOf(id)) : ''} aria-selected={on} aria-controls={`pane-${id}`} tabIndex={tab === id ? 0 : -1} title={PANES[id].name}
                  onClick={() => onTab(id)} onPointerEnter={() => { need(id); }} onPointerDown={() => { need(id); }} onFocus={() => { need(id); }}>
                  <I n={(TAB_ICONS as Record<string, string>)[id]!} />
                  <span className="it-t"><b><span className="it-full">{shortName(id)}</span><span className="it-short">{tinyName(id)}</span></b></span>
                </button>
              );
            })}
          </div>
          <button type="button" className="ib card-close workspace-close" aria-label="Close Tests" title="Close (Esc)" onClick={close}><I n="close" /></button>
        </div>
        <Fade as="div" axis="y" className="instr-hint" on={picking}>Pick a second instrument to show with <b>{PANES[pane].name}</b>.</Fade>
        <CompareLine active={open} />
        <div ref={bodyRef} className={`dock-body${split ? ' split stack' : ''}`}>
          {slots.map((s) => <Pane key={s.id} id={s.id} cls={s.cls} leaver={s.leaver} done={swap.left}>{open ? render(s.id) : null}</Pane>)}
        </div>
      </section>
    </div></SheetClip>
  );
}

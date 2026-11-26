// The UI layer above the stage. Free play: the top bar, the view pills, the play bar and the zoom group (a laptop or an iPad on its side), or the top bar, the view row,
// the play bar and the bottom bar (a phone or an upright iPad), with the 2D app's words and behaviour. A talk: its own cards, wallet and presenter pill (src/ui/DeckUi.tsx, its own chunk: ui/shell/deck-ui-load.ts).
// The sheets, the toast and the diagnostics are the same in both.
import { Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { fadeChrome } from './deck-fade.ts';
import './shell.css';
import './chrome-3d.css';
import './menu-motion.css';
import './tap-cells.css';
import { restoreFocus } from './talk-focus.ts';
import { DeckUiSlot } from './DeckUiSlot.tsx';
import { useUi } from '../ui-store.ts';
import { useShell, LENS_IDS } from './store.ts';
import { lensPickable } from '../../scene/lenses/in-view.ts';
import { TopBar } from './TopBar.tsx';
import { Dock } from './Dock.tsx';
import { Credit } from './Credit.tsx';
import { metricVars } from './metrics.ts';
import { SHEETS_OVER_PILL } from './sheets-over-pill.ts';
import { useThumb } from './thumb.ts';
import { useChromeClaims } from './chrome-claims-writer.ts';
import { ZoomGroup } from './ZoomGroup.tsx';
import { SheetsSlot } from './SheetsSlot.tsx';
import { Toast } from './Toast.tsx';
import { Diagnostics } from './Diagnostics.tsx';
import { useKeys } from '../keys/useKeys.ts';
import { syncTransport } from './transport.ts';
import { viewRoom, layoutVars, layoutClass, sheetFoot, topBarH } from './room.ts';
import { M } from './metrics.ts';
import { sceneApi } from '../../scene/api.ts';
import { applyDeepLink } from './open-link.ts';
import { showView } from './view-actions.ts';
import { useBlood } from '../../scene/blood/options.ts';
import { useLabels } from '../../scene/labels/store.ts';
import { useTestsRoom } from '../tests/room.ts';
import { useActionRoom, roomAbove } from '../action/action-room.ts';
import { panRoom, probeShift } from '../tests/place.ts';
import { useProbes } from '../../scene/devices/probes/state.ts';
import { TestsLayer } from '../tests/TestsLayer.tsx';
import { useTestsAppClasses } from '../tests/dock/app-classes.ts';
import { CompareBanner } from '../compare/CompareUi.tsx';
import { startCompare } from '../compare/bind.ts';
import { startTimeline } from '../timeline/index.ts';
import { startHistory } from '../history/bind.ts';
import { startActions } from '../action/boot.ts';
import { useTalkOn } from '../../state/deck.ts';
import { useCase } from '../case/store.ts';
import { caseBarUp, caseLift, caseRoom, useCaseRoom } from '../case/room.ts';
import { lazyRetry } from '../../boot/lazy-retry.ts';

import { clock } from '../../clock/frame.ts';
/** The screen's size and its safe areas, measured when either changes (never per frame). Free play needs it too: the talk's own UI measures only while it is mounted. */
function useViewport(probe: React.RefObject<HTMLDivElement | null>) {
  const setViewport = useUi((s) => s.setViewport);
  useLayoutEffect(() => {
    const pr = probe.current;
    if (!pr) return;
    const measure = () => {
      const cs = getComputedStyle(pr), px = (v: string) => Math.round(parseFloat(v) || 0);
      setViewport({ w: Math.round(innerWidth), h: Math.round(innerHeight), safe: { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) } });
    };
    measure();
    addEventListener('resize', measure); addEventListener('orientationchange', measure);
    return () => { removeEventListener('resize', measure); removeEventListener('orientationchange', measure); };
  }, [probe, setViewport]);
}

/** Free play frames the figure in the room the bars leave; a refit (second tap on the view, Fit, the 0 key) glides the hand's zoom and pan home. */
function useFreeCamera() {
  const mode = useTalkOn() ? 'deck' : 'free';
  const refit = useShell((s) => s.refit);
  const vp = useUi((s) => s.vp);
  const thumb = useThumb();
  const testsPlace = useTestsRoom((s) => s.place);   // (the Tests card takes room from the figure)
  const actionH = useActionRoom((s) => s.h);   // (an action card over the bottom of the figure takes its height from the room)
  // (a case's bar makes the foot taller, its stop card takes room as the Tests card does: case/room.ts)
  const caseUp = useCase((s) => caseBarUp(s.phase)), caseCut = useCaseRoom((s) => s.cut);
  const entered = useRef(false);
  // The figure pans, never zooms, under the Tests card (place.ts panRoom); `bias` is the extra shift that brings the probe now up (the Doppler's gate, the FibroScan's tip) into the free part
  const bias = useRef({ x: 0, y: 0 });
  const probe = useProbes((s) => `${s.doppler.on ? `${s.doppler.edge}|${s.doppler.seg}` : ''}/${s.fibro.on ? s.fibro.organ : ''}`);
  const roomNow = () => {
    const base = viewRoom(useShell.getState().view, vp, layoutClass(thumb)), r = roomAbove(panRoom(caseRoom(base, caseCut), testsPlace), actionH), b = bias.current;
    return { base, room: { x: r.x + b.x, y: r.y + b.y, w: r.w, h: r.h } };
  };
  const lastScreen = useRef('');
  useEffect(() => {
    if (mode !== 'free' || vp.w <= 0) { entered.current = false; return; }
    if (!testsPlace) bias.current = { x: 0, y: 0 };   // (the card is away: the figure's own room again)
    const { room } = roomNow();
    if (room.w <= 0 || room.h <= 0) return;
    // (the screen changed (size, the phone turned): the figure is fitted again; a card or a sheet alone only pans it, never zooms it out (owner, 20 Nov))
    const screen = `${vp.w}x${vp.h}:${thumb}`, refit = screen !== lastScreen.current; lastScreen.current = screen;
    if (!entered.current) { entered.current = true; showView(useShell.getState().view); } else sceneApi.setRoom(room, undefined, false, refit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, vp, thumb, testsPlace, actionH, caseUp, caseCut]);
  useEffect(() => {
    if (mode !== 'free' || vp.w <= 0 || !entered.current) return;
    // once the probe has landed (it waits for the camera and fades in), move the figure so the probe stands in the middle of what the card leaves
    const t = clock.after(() => {
      const { base } = roomNow(), f = testsPlace ? sceneApi.testFocus() : null, b = bias.current;
      const { x: nx, y: ny } = probeShift(base, testsPlace, f, b);   // (only as far as the probe needs to clear the card: place.ts probeShift)
      if (Math.abs(nx - b.x) < 24 && Math.abs(ny - b.y) < 24 && !(nx === 0 && ny === 0 && (b.x !== 0 || b.y !== 0))) return;
      bias.current = { x: nx, y: ny };
      const r = roomNow().room;
      if (r.w > 0 && r.h > 0) sceneApi.setRoom(r);
    }, 700);
    return () => clock.cancel(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, vp, testsPlace, probe]);
  const seen = useRef(refit);
  useEffect(() => { if (refit !== seen.current) { seen.current = refit; sceneApi.refit(); } }, [refit]);
}

/** What 2D's main.js publishes on .app after measuring the bars: the cards, the zoom pill and the toast read them. Set when the screen or the layout changes, never per frame. */
function usePublishedLayout(app: React.RefObject<HTMLDivElement | null>, thumb: boolean) {
  const vp = useUi((s) => s.vp);
  const cardH = useActionRoom((s) => s.h);   // (a docked action card's height above the view pill's slot, 0 with none: its own resize observer, ActionCard.tsx)
  const caseUp = useCase((s) => caseBarUp(s.phase));   // (the case bar makes the foot taller: room.ts dockHeight reads it)
  useLayoutEffect(() => {
    const el = app.current;
    if (!el || vp.w <= 0) return;
    for (const [k, v] of Object.entries(layoutVars(vp, layoutClass(thumb)))) el.style.setProperty(k, v);
    // 2D main.js publishes on the root what the menu sheets and the palette read: on the thumb dock a sheet rests one gap (M.sheetGap) above the dock's top edge (--thumb-occ, --sheet-foot-screen) and stops under the top bar (--thumb-top)
    const root = document.documentElement, d = layoutClass(thumb), px = (n: number) => `${Math.round(n)}px`;
    root.classList.toggle('thumb-ui', thumb);
    const occ = thumb ? vp.safe.bottom + sheetFoot(d) : 0;   // (from the screen's bottom, safe area included, as 2D measures it)
    root.style.setProperty('--sheet-gap', px(M.sheetGap)); root.style.setProperty('--thumb-occ', px(occ)); root.style.setProperty('--sheet-foot-screen', px(occ));
    root.style.setProperty('--thumb-top', thumb ? px(vp.safe.top + topBarH(vp, d)) : '0px');
    // the foot's height (the dock and the view pill over it) for what stands outside .app, the toast (2D: --toast-foot / --bot-occ, main.js)
    const lv = layoutVars(vp, d);
    if (lv['--bot-occ']) root.style.setProperty('--bot-occ', lv['--bot-occ']);
    // the room a docked action card takes above the dock (23 Nov, Mohammad: the note covered the card's rows): the note, the zoom pill and the figure's names stand above it (shell.css .sh-toast, css3d-over-2d.css), by a transform that glides, never by `bottom`
    root.style.setProperty('--card-occ', px(cardH));
    // the case bar's lift over the play bar's row (case/room.ts): the sums above include it; the zoom pill and the view pill ride up by it with a transform that glides (case.css)
    root.style.setProperty('--case-lift', px(caseLift(d)));
  }, [app, vp, thumb, cardH, caseUp]);
}

/** A case's bar and cards (ui/case/CaseUi.tsx) are their own chunk: a normal load never plays a case, so it neither downloads nor runs them before the first picture (tests/boot-entry.test.ts).
 *  They mount when the first case starts, every part faded in by its own `data-on` once its content is there, and stay mounted after. */
const CaseUi = lazyRetry(() => import('../case/CaseUi.tsx').then((m) => ({ default: m.CaseUi })));

/** The 2D chrome's measured numbers as `--m-*` on the shell root: the sheets' places (shell.css, history.css, why.css) read them, and without them every `calc(... var(--m-side-pad))` is invalid and the sheet falls to the corner. */
const METRICS = metricVars() as CSSProperties;

export function Shell() {
  const probe = useRef<HTMLDivElement>(null);
  const mode = useTalkOn() ? 'deck' : 'free';
  const device = useUi((s) => s.device);
  const view = useShell((s) => s.view);
  const appRef = useRef<HTMLDivElement>(null);
  useViewport(probe);
  const wasMode = useRef(mode);
  useLayoutEffect(() => { if (wasMode.current === mode) return; const away = mode === 'deck'; wasMode.current = mode; if (appRef.current) fadeChrome(appRef.current, away); if (!away) restoreFocus(appRef.current?.querySelector<HTMLElement>('.topbar button') ?? null); }, [mode]);   // (the bar and dock fade by their parts, deck-fade.ts)
  useKeys();
  useFreeCamera();
  useEffect(() => syncTransport(), []);
  useEffect(() => { const offs = [startTimeline(), startCompare(), startHistory()]; return () => offs.forEach((o) => o()); }, []);
  useEffect(() => startActions(), []);
  useEffect(() => { const f = useShell.getState().figure; sceneApi.setLobuleLayers({ lymph: f.lymph, zones: f.zones, bile: f.bile }); }, []);
  // what the Blood menu remembers goes to the scene and the labels once at boot (the menu then tells them itself)
  useEffect(() => { const b = useBlood.getState(); sceneApi.setBlood({}); useLabels.getState().set({ organNames: b.labels }); }, []);
  useEffect(() => { void applyDeepLink(location.search); }, []);
  const thumb = useThumb();
  const cardOver = useActionRoom((s) => s.over);   // (an action card is up over the dock's view pill slot: the pill fades out under it)
  // (a view with one lens to show locks its lens button: the lens table's rule, lenses/in-view.ts)
  const lensFixed = lensPickable(useShell((s) => s.view), LENS_IDS) ? '' : ' lens-fixed';
  const sheetUp = useShell((s) => thumb && !!s.sheet && SHEETS_OVER_PILL.has(s.sheet));
  const chartUp = useShell((s) => s.sheet === 'timeline');   // (the timeline chart is up: the zoom pill fades out, the chart has its own zoom)
  const testsCls = useTestsAppClasses();   // (dock-open, instrument-focus, tests-grad, dock-side: what the Tests card tells .app)
  const caseOn = useCase((s) => caseBarUp(s.phase)) && mode === 'free';   // (a case plays: its bar stands in the play bar's place, case.css)
  const [caseSeen, setCaseSeen] = useState(false);
  if (caseOn && !caseSeen) setCaseSeen(true);
  usePublishedLayout(appRef, thumb);
  useChromeClaims(thumb);
  return (
    <>
      {mode === 'deck' && <DeckUiSlot />}
      <div className="sh-root" data-device={device} data-bottom={thumb} data-mode={mode} style={METRICS}>
        <div ref={probe} aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', paddingTop: 'var(--safe-t)', paddingRight: 'var(--safe-r)', paddingBottom: 'var(--safe-b)', paddingLeft: 'var(--safe-l)' }} />
        <div className={`app${thumb ? ' thumb' : ''}${view === 'sinusoid' ? ' sin-focus' : ''}${lensFixed}${sheetUp ? ' menu-sheet-open' : ''}${cardOver ? ' ac-over-pill' : ''}${chartUp ? ' bt-up' : ''}${caseOn ? ' case-on' : ''}${testsCls}`} id="app" ref={appRef} inert={mode === 'deck'}>
          <TopBar />
          <main className={`stage-wrap${view === 'circuit' ? ' cmap' : ''}`} id="stageWrap" aria-label="Figure">
            <div className={`stage-view${view === 'lobule' || view === 'sinusoid' ? ' in-lobule' : ''}`} id="stageView"><ZoomGroup /></div>
            <Credit />
            <Dock thumb={thumb} />
            {caseSeen && <Suspense fallback={null}><CaseUi thumb={thumb} /></Suspense>}
          </main>
          {/* the Tests dock is a child of .app, as in 2D: the lifted stylesheets reach it through `.app.dock-open` (shell/InApp.tsx) */}
          <TestsLayer away={mode === 'deck'} />
        </div>
        <CompareBanner />
        <SheetsSlot />
        <Toast />
        <Diagnostics />
      </div>
    </>
  );
}

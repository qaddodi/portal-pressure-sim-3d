// The UI layer above the stage. Free play: the top bar, the view pills, the play bar and the zoom group (a laptop or an iPad on its side), or the top bar, the view row,
// the play bar and the bottom bar (a phone or an upright iPad), with the 2D app's words and behaviour. A talk: its own cards, wallet and presenter pill (src/ui/DeckUi.tsx).
// The sheets, the toast and the diagnostics are the same in both.
import { useEffect, useLayoutEffect, useRef } from 'react';
import './shell.css';
import './chrome-3d.css';
import { DeckUi } from '../DeckUi.tsx';
import { useUi } from '../ui-store.ts';
import { useShell } from './store.ts';
import { TopBar } from './TopBar.tsx';
import { Dock } from './Dock.tsx';
import { Credit } from './Credit.tsx';
import { useThumb } from './thumb.ts';
import { ZoomGroup } from './ZoomGroup.tsx';
import { Sheets } from './Sheets.tsx';
import { Toast } from './Toast.tsx';
import { startFirstHint } from './first-hint.ts';
import { Diagnostics } from './Diagnostics.tsx';
import { useKeys } from '../keys/useKeys.ts';
import { syncTransport } from './transport.ts';
import { freeRoom, layoutVars, layoutClass, dockHeight, dockInset } from './room.ts';
import { M } from './metrics.ts';
import { sceneApi } from '../../scene/api.ts';
import { applyDeepLink } from './open-link.ts';
import { showView } from './view-actions.ts';
import { useBlood } from '../../scene/blood/options.ts';
import { useLabels } from '../../scene/labels/store.ts';
import { useTestsRoom } from '../tests/room.ts';
import { roomWith } from '../tests/place.ts';
import { TestsLayer } from '../tests/TestsLayer.tsx';
import { useTestsAppClasses } from '../tests/dock/app-classes.ts';
import { CompareBanner } from '../compare/CompareUi.tsx';
import { startCompare } from '../compare/bind.ts';
import { startTimeline } from '../timeline/index.ts';
import { startHistory } from '../history/bind.ts';
import { startActions } from '../action/boot.ts';

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
  const mode = useShell((s) => s.mode);
  const refit = useShell((s) => s.refit);
  const vp = useUi((s) => s.vp);
  const thumb = useThumb();
  const testsPlace = useTestsRoom((s) => s.place);   // (the Tests card takes room from the figure)
  const entered = useRef(false);
  useEffect(() => {
    if (mode !== 'free' || vp.w <= 0) { entered.current = false; return; }
    const room = roomWith(freeRoom(vp, layoutClass(thumb)), testsPlace);
    if (room.w <= 0 || room.h <= 0) return;
    if (!entered.current) { entered.current = true; showView(useShell.getState().view); } else sceneApi.setRoom(room);
  }, [mode, vp, thumb, testsPlace]);
  const seen = useRef(refit);
  useEffect(() => { if (refit !== seen.current) { seen.current = refit; sceneApi.refit(); } }, [refit]);
}

/** What 2D's main.js publishes on .app after measuring the bars: the cards, the zoom pill and the toast read them. Set when the screen or the layout changes, never per frame. */
function usePublishedLayout(app: React.RefObject<HTMLDivElement | null>, thumb: boolean) {
  const vp = useUi((s) => s.vp);
  useLayoutEffect(() => {
    const el = app.current;
    if (!el || vp.w <= 0) return;
    for (const [k, v] of Object.entries(layoutVars(vp, layoutClass(thumb)))) el.style.setProperty(k, v);
    // 2D main.js publishes on the root what the menu sheets and the palette read: on the thumb dock a sheet rests 8 px above the dock's top edge (--thumb-occ, --sheet-foot-screen) and stops under the top bar (--thumb-top)
    const root = document.documentElement, d = layoutClass(thumb), px = (n: number) => `${Math.round(n)}px`;
    root.classList.toggle('thumb-ui', thumb);
    const occ = thumb ? dockInset(d) + dockHeight(d) + 8 : 0;
    root.style.setProperty('--thumb-occ', px(occ)); root.style.setProperty('--sheet-foot-screen', px(occ));
    root.style.setProperty('--thumb-top', thumb ? px(vp.safe.top + M.topSafe) : '0px');
    // the foot's height (the dock and the view pill over it) for what stands outside .app, the toast (2D: --toast-foot / --bot-occ, main.js)
    const lv = layoutVars(vp, d);
    if (lv['--bot-occ']) root.style.setProperty('--bot-occ', lv['--bot-occ']);
  }, [app, vp, thumb]);
}

export function Shell() {
  const probe = useRef<HTMLDivElement>(null);
  const mode = useShell((s) => s.mode);
  const device = useUi((s) => s.device);
  const view = useShell((s) => s.view);
  const appRef = useRef<HTMLDivElement>(null);
  useViewport(probe);
  useKeys();
  useFreeCamera();
  useEffect(() => syncTransport(), []);
  useEffect(() => { const offs = [startTimeline(), startCompare(), startHistory()]; return () => offs.forEach((o) => o()); }, []);
  useEffect(() => startActions(), []);
  useEffect(() => startFirstHint(), []);   // (2D's once-per-device hint: shell/first-hint.ts)
  useEffect(() => { const f = useShell.getState().figure; sceneApi.setLobuleLayers({ lymph: f.lymph, zones: f.zones, bile: f.bile }); }, []);
  // what the Blood menu remembers goes to the scene and the labels once at boot (the menu then tells them itself)
  useEffect(() => { const b = useBlood.getState(); sceneApi.setBlood({}); useLabels.getState().set({ organNames: b.labels }); }, []);
  useEffect(() => { void applyDeepLink(location.search); }, []);
  const thumb = useThumb();
  const testsCls = useTestsAppClasses();   // (dock-open, instrument-focus, tests-grad, dock-side: what the Tests card tells .app)
  usePublishedLayout(appRef, thumb);
  return (
    <>
      {mode === 'deck' && <DeckUi />}
      <div className="sh-root" data-device={device} data-bottom={thumb} data-mode={mode}>
        <div ref={probe} aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', paddingTop: 'env(safe-area-inset-top, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)' }} />
        <div className={`app${thumb ? ' thumb' : ''}${view === 'sinusoid' ? ' sin-focus' : ''}${testsCls}`} id="app" ref={appRef}>
          <TopBar />
          <main className={`stage-wrap${view === 'circuit' ? ' cmap' : ''}`} id="stageWrap" aria-label="Figure">
            <div className={`stage-view${view === 'lobule' || view === 'sinusoid' ? ' in-lobule' : ''}`} id="stageView"><ZoomGroup /></div>
            <Credit />
            <Dock thumb={thumb} />
          </main>
          {/* the Tests dock is a child of .app, as in 2D: the lifted stylesheets reach it through `.app.dock-open` (shell/InApp.tsx) */}
          {mode === 'free' && <TestsLayer />}
        </div>
        <CompareBanner />
        <Sheets />
        <Toast />
        <Diagnostics />
      </div>
    </>
  );
}

// The UI layer above the stage. Free play: the top bar, the view pills, the play bar and the zoom group (a laptop or an iPad on its side), or the top bar, the view row,
// the play bar and the bottom bar (a phone or an upright iPad), with the 2D app's words and behaviour. A talk: its own cards, wallet and presenter pill (src/ui/DeckUi.tsx).
// The sheets, the toast and the diagnostics are the same in both.
import { useEffect, useLayoutEffect, useRef } from 'react';
import './shell.css';
import './dock.css';
import { DeckUi } from '../DeckUi.tsx';
import { useUi } from '../ui-store.ts';
import { useShell } from './store.ts';
import { TopBar, ViewPills } from './TopBar.tsx';
import { PlayBar } from './PlayBar.tsx';
import { ZoomGroup } from './ZoomGroup.tsx';
import { ThumbBar } from './ThumbBar.tsx';
import { Sheets } from './Sheets.tsx';
import { Toast } from './Toast.tsx';
import { Diagnostics } from './Diagnostics.tsx';
import { useKeys } from '../keys/useKeys.ts';
import { syncTransport } from './transport.ts';
import { usesBottomBar, freeRoom } from './room.ts';
import { sceneApi } from '../../scene/api.ts';
import { applyDeepLink } from './open-link.ts';
import { showView } from './view-actions.ts';
import { useBlood } from '../../scene/blood/options.ts';
import { useLabels } from '../../scene/labels/store.ts';
import { footHeight } from './room.ts';
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
  const vp = useUi((s) => s.vp), device = useUi((s) => s.device);
  const entered = useRef(false);
  useEffect(() => {
    if (mode !== 'free' || vp.w <= 0) { entered.current = false; return; }
    const room = freeRoom(vp, device);
    if (room.w <= 0 || room.h <= 0) return;
    if (!entered.current) { entered.current = true; showView(useShell.getState().view); } else sceneApi.setRoom(room);
  }, [mode, vp, device]);
  const seen = useRef(refit);
  useEffect(() => { if (refit !== seen.current) { seen.current = refit; sceneApi.refit(); } }, [refit]);
}

export function Shell() {
  const probe = useRef<HTMLDivElement>(null);
  const mode = useShell((s) => s.mode);
  const device = useUi((s) => s.device);
  const bottom = usesBottomBar(device);
  useViewport(probe);
  useKeys();
  useFreeCamera();
  useEffect(() => syncTransport(), []);
  useEffect(() => { const offs = [startTimeline(), startCompare(), startHistory()]; return () => offs.forEach((o) => o()); }, []);
  useEffect(() => startActions(), []);
  useEffect(() => { const f = useShell.getState().figure; sceneApi.setLobuleLayers({ lymph: f.lymph, zones: f.zones }); }, []);
  // what the Blood menu remembers goes to the scene and the labels once at boot (the menu then tells them itself)
  useEffect(() => { const b = useBlood.getState(); sceneApi.setBlood({}); useLabels.getState().set({ organNames: b.labels }); }, []);
  useEffect(() => { void applyDeepLink(location.search); }, []);
  return (
    <>
      {mode === 'deck' && <DeckUi />}
      <div className="sh-root" data-device={device} data-bottom={bottom} data-mode={mode}>
        <div ref={probe} aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', paddingTop: 'env(safe-area-inset-top, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)' }} />
        <TopBar bottom={bottom} pills={!bottom || device === 'phone-landscape'} />
        {!bottom && <PlayBar phone={false} />}
        {!bottom && <ZoomGroup />}
        {bottom && (
          <div className="sh-foot" data-hidden={mode === 'deck'} style={mode === 'deck' ? { opacity: 0, pointerEvents: 'none' } : undefined}>
            {device !== 'phone-landscape' && <div className="sh-view-row"><ViewPills /></div>}
            <PlayBar phone />
            <ThumbBar />
          </div>
        )}
        <CompareBanner />
        <Sheets />
        <Toast />
        <Diagnostics />
      </div>
    </>
  );
}

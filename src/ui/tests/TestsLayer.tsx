// The Tests card (2D dock.js "Instruments card"): a card on the right of a wide screen, a sheet over the foot of a phone or an upright iPad, with a row of tabs (Pressure, IR,
// Doppler, Endoscopy, Ascites, FibroScan, Readouts, Trials; Over time lives under Pressure). Always in the page and fading; the instrument on show is remembered on the device.
// The Tests button, the I key and the search commands open it through the shell's `tests` feature.
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import './tests.css';
import './trace/trace.css';
import './abdomen/abdomen.css';
import { useUi } from '../ui-store.ts';
import { layoutOf, cardScale } from '../layout/rules2d.ts';
import { registerFeature } from '../shell/features.ts';
import { useTests } from './store.ts';
import { TABS, tabOf, shortName, tinyName, PANES, type PaneId } from './panes.ts';
import { testsPlace } from './place.ts';
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

// each instrument is its own file in its own folder (a thread works in one folder; the stubs say "not in the 3D app yet" until the instrument lands)
const ProfilePane = lazy(() => import('./profile/ProfilePane.tsx').then((m) => ({ default: m.ProfilePane })));
const IrPane = lazy(() => import('./ir/IrPane.tsx').then((m) => ({ default: m.IrPane })));
const DopplerPane = lazy(() => import('./doppler/DopplerPane.tsx').then((m) => ({ default: m.DopplerPane })));
const EndoPane = lazy(() => import('./endo/EndoPane.tsx').then((m) => ({ default: m.EndoPane })));
const FibroPane = lazy(() => import('./fibro/FibroPane.tsx').then((m) => ({ default: m.FibroPane })));
const TrialsPane = lazy(() => import('../trials/TrialsPane.tsx').then((m) => ({ default: m.TrialsPane })));

/** The panes built so far; a tab whose pane is not here yet says so in a line (never a dead tab). */
export interface PaneProps { narrow: boolean; /** a plot's height and a square's (dock-vars.js) */ plot: number; square: number; /** a card with room for two instruments at once (a side card 600 px tall or more) */ roomy: boolean }
const BUILT: Partial<Record<PaneId, (p: PaneProps) => ReactNode>> = {
  trials: () => <Suspense fallback={null}><TrialsPane /></Suspense>,
  readouts: (p) => <ReadoutsPane narrow={p.narrow} />,
  abdomen: (p) => <AbdomenPane square={p.square} />,
  scope: (p) => <PressureTab own="scope" {...p} />,
  profile: (p) => <PressureTab own="profile" {...p} />,
  hvpg: (p) => <Suspense fallback={null}><IrPane {...p} /></Suspense>,
  doppler: (p) => <Suspense fallback={null}><DopplerPane {...p} /></Suspense>,
  endoscopy: (p) => <Suspense fallback={null}><EndoPane {...p} /></Suspense>,
  fibroscan: (p) => <Suspense fallback={null}><FibroPane {...p} /></Suspense>,
};
export function registerPane(id: PaneId, render: (p: PaneProps) => ReactNode): void { BUILT[id] = render; }

export function TestsLayer() {
  const open = useTests((s) => s.open), pane = useTests((s) => s.pane), show = useTests((s) => s.show), close = useTests((s) => s.close);
  const vp = useUi((s) => s.vp), device = useUi((s) => s.device);
  const place = useMemo(() => testsPlace(vp, device), [vp, device]);
  const narrow = place.rect.w < 470;
  const layout = layoutOf(vp.w, vp.h);
  const roles = cardScale({ vw: vp.w, vh: vp.h, layout, part: 'data' });

  // the model's samples are kept from the first frame, open or not (2D: the Over time and Doppler traces record every frame from the start)
  useEffect(() => { startFeed(); }, []);
  // the Tests button, the I key and the palette
  useEffect(() => registerFeature('tests', () => useTests.getState().toggle()), []);
  // the card buttons that open an instrument: Doppler, Endoscope, FibroScan (a liver or spleen card), and "Test TIPS in IR" (the stent's card)
  useEffect(() => {
    const show = (id: PaneId) => () => { useShell.getState().close(); useTests.getState().show(id); };
    const offs = [registerFeature('doppler', () => { probeSelected(); show('doppler')(); }), registerFeature('endoscopy', show('endoscopy')), registerFeature('fibroscan', show('fibroscan')), registerFeature('ir', show('hvpg'))];
    return () => offs.forEach((f) => f());
  }, []);
  // the figure keeps the room the card leaves
  useEffect(() => {
    useTestsRoom.setState({ place: open ? place : null });
    return () => useTestsRoom.setState({ place: null });
  }, [open, place]);

  // the tab row never scrolls: a wide card shows the full names, a narrower one the short names, the tightest only the open tab's name (2D dock.js fitTabs; the width comes from the observer, never a read)
  const tabsRef = useRef<HTMLDivElement>(null), cardRef = useRef<HTMLElement>(null);
  const [fit, setFit] = useState<TabFit>({ compact: false, narrow: false, tight: false, bare: false });
  const tab = tabOf(pane);
  const wRef = useRef(0), tabRef = useRef(tab);
  tabRef.current = tab;
  const refit = (w: number) => { wRef.current = w; const f = fitTabs(w, TABS.length, shortName(tabRef.current)); setFit((o) => (o.compact === f.compact && o.narrow === f.narrow && o.tight === f.tight && o.bare === f.bare ? o : f)); };
  useLayoutEffect(() => {
    const el = tabsRef.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver((es) => { const w = es[es.length - 1]?.contentRect.width ?? 0; if (w) refit(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (wRef.current) refit(wRef.current); }, [tab]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Tests left by the close button, Esc or the Tests button with focus inside: focus goes back to the Tests button (2D dock.js close)
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && cardRef.current?.contains(document.activeElement)) document.getElementById('tabInstruments')?.focus();
    wasOpen.current = open;
  }, [open]);

  // arrow keys, Home and End move between the tabs (2D dock.js tabs keydown); only the open tab is in the tab order (roving tabindex)
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.indexOf((e.target as HTMLElement).closest<HTMLElement>('.instr-tab')?.dataset.instrument as PaneId);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    const id = TABS[j]!;
    tabsRef.current?.querySelector<HTMLElement>(`.instr-tab[data-instrument="${id}"]`)?.focus();
    show(id);
  };

  const body = BUILT[pane];
  const style = {
    width: place.rect.w, height: place.rect.h, transform: `translate(${Math.round(place.rect.x)}px, ${Math.round(place.rect.y)}px)`,
    ['--t-sm' as string]: `${Math.max(12, Math.round(roles.lab))}px`, ['--t-plot' as string]: `${place.vars.plot}px`, ['--t-square' as string]: `${place.vars.square}px`,
  } as CSSProperties;
  // the sizes 2D's dock hands its panes (dock.js sizeObserver: --plot-h, --square-size on the workspace)
  const card = { ['--plot-h' as string]: `${place.vars.plot}px`, ['--square-size' as string]: `${place.vars.square}px`, ['--instrument-w' as string]: `${place.rect.w}px` } as CSSProperties;
  const tabsCls = `instr-tabs ws-tabs${fit.compact ? ' compact' : ''}${fit.narrow ? ' narrow' : ''}${fit.tight ? ' tight' : ''}${fit.bare ? ' bare' : ''}`;
  return (
    <div className="t-pos" data-open={open} data-live={open} data-narrow={narrow} data-kind={place.kind} data-device={device} style={style}>
      <section ref={cardRef} className={`t-card dock instrument-workspace float-ui stage-blocker${place.kind === 'side' ? ' side' : ''}`} id="dock" role="dialog" aria-label="Tests" data-state="open" data-safe={place.kind === 'side' ? 'right' : 'bottom'} inert={!open} style={card}>
        <div className="dock-head card-head tabbed">
          <div ref={tabsRef} className={tabsCls} role="tablist" aria-label="Tests" onKeyDown={onTabKey}>
            {TABS.map((id) => (
              <button key={id} type="button" className="instr-tab" role="tab" data-instrument={id} aria-selected={tab === id} aria-controls={`pane-${id}`} tabIndex={tab === id ? 0 : -1} title={PANES[id].name} onClick={() => show(id)}>
                <I n={(TAB_ICONS as Record<string, string>)[id]!} />
                <span className="it-t"><b><span className="it-full">{shortName(id)}</span><span className="it-short">{tinyName(id)}</span></b></span>
              </button>
            ))}
          </div>
          <button type="button" className="ib card-close workspace-close" aria-label="Close Tests" title="Close (Esc)" onClick={close}><I n="close" /></button>
        </div>
        <CompareLine active={open} />
        <div className="dock-body">
          <div className="dock-pane active" data-pane={pane} id={`pane-${tab}`} role="tabpanel" aria-label={PANES[pane].name}>
            {open && (body ? <div key={pane} style={{ display: 'contents' }}>{body({ narrow, plot: place.vars.plot, square: place.vars.square, roomy: place.kind === 'side' && place.rect.h >= 600 })}</div> : <p key={pane} className="t-note t-pane">{notYet(PANES[pane].name)}</p>)}
          </div>
        </div>
      </section>
    </div>
  );
}

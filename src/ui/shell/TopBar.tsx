// The top bar, on the 2D app's own markup and class names (index.html #topbar): the patient pill (.tb-id), the figure's pill (.stage-bar.top > .sb-right: Layers, Blood and the colour key) and the actions pill
// (.top-right: Treat, Tests, History, Settings, Search). Its stylesheet is the 2D app's (src/ui/styles); nothing here styles it.
import { UI } from '../strings.generated.ts';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useShell, LENS_IDS } from './store.ts';
import { useLens } from '../../scene/lenses/store.ts';
import { sceneApi } from '../../scene/api.ts';
import type { LensId } from '../../scene/lenses/model.ts';
import { lensNoteIn, lensPickable, lensesFor, shownLens } from '../../scene/lenses/in-view.ts';
import { Menu, menuDomId } from '../surface/Menu.tsx';
import { I } from './icons.tsx';
import { lensSwatch } from './lens-art.ts';
import { useLook } from '../../scene/lenses/Legend.tsx';
import { VIEWS, pillViews, tapView, type ViewId } from './views.ts';
import { playFold, snapOf, stopFold, type Snap } from './pill-fold.ts';
import { runFeature, type FeatureId } from './features.ts';
import { notYet } from './words.ts';
import { goToView, refitFigure } from './view-actions.ts';
import { FigureMenu } from './FigureMenu.tsx';
import { keyLabel } from './platform.ts';
import { LensKey } from './LensKey.tsx';
import { useBarFit } from './use-bar-fit.ts';
import { COMPACT } from './scenario-names.ts';
import { pillShort } from './pill-name.ts';
import { yoursName } from '../readings/yours.ts';
import { historyName } from '../histories/meta.ts';
import { startTopbarMotion } from './topbar-motion.ts';
import { useTalkOn } from '../../state/deck.ts';
import { fadeAttrs } from '../fade.tsx';
import { isCustomCase } from '../action/case-name.ts';
import { currentParams, useParamsTick } from '../action/params.ts';

interface Tb { id: string; label: string | null; title: string | null; text: string | null }
export const tb = (id: string): Tb => UI.topbar.find((t) => t.id === id) as unknown as Tb;
const labelOf = (id: string) => tb(id).label ?? tb(id).text ?? id;

/** The view switch (Circuit, Anatomy, Lobule, Sinusoid): 2D's #viewSeg. A second tap on the active view refits it. It always shows every view (views.ts: pillViews), and the buttons ease in and out as the view changes (pill-fold.ts). */
export function ViewPills() {
  const view = useShell((s) => s.view);
  const ready = useShell((s) => s.ready);
  const seg = useRef<HTMLDivElement>(null);
  const last = useRef<{ view: ViewId; snap: Snap } | null>(null);
  // after every commit the pill's layout is kept; a change of the view plays the fold from the layout kept to the one now (nothing is drawn per frame)
  useLayoutEffect(() => {
    const el = seg.current, box = el?.parentElement;
    if (!el || !box || !box.offsetWidth) return;
    const was = last.current;
    if (was && was.view !== view && !matchMedia('(prefers-reduced-motion: reduce)').matches) playFold(el, box, was.snap, VIEWS.map((v) => v.id));
    last.current = { view, snap: snapOf(el, box) };
  }, [view]);
  useLayoutEffect(() => {
    const el = seg.current, box = el?.parentElement;
    if (!el || !box) return;
    const keep = () => { if (box.offsetWidth) last.current = { view: useShell.getState().view, snap: snapOf(el, box) }; };
    window.addEventListener('resize', keep);
    return () => { window.removeEventListener('resize', keep); stopFold(el); };
  }, []);
  return (
    <div className="seg" id="viewSeg" role="group" aria-label="View" data-view-pills ref={seg}>
      {VIEWS.map((v) => {
        const hidden = !pillViews().includes(v.id);
        return (
          <button key={v.id} type="button" data-view={v.id} aria-pressed={view === v.id} {...fadeAttrs(!hidden)} data-pending={!ready[v.id] || undefined} title={UI.views.find((x) => x.id === v.id)?.label} onClick={() => tapPill(v.id, view)}>{v.label}</button>
        );
      })}
    </div>
  );
}
function tapPill(id: ViewId, cur: ViewId) {
  const t = tapView(id, cur);
  if (t.type === 'refit') refitFigure(); else goToView(t.view);
}

/** The lens button: the colour key and a chevron (2D's #btnLayers). The lens menu (the one menu shell) opens from it; the button stays in the bar, where the 2D stylesheet addresses it. */
export function LensButton() {
  const view = useShell((s) => s.view);
  // (the name and the key are the lens the view DRAWS: lenses/in-view.ts shownLens, never one it cannot show)
  const lens = shownLens(view, useLens((s) => s.lens));
  const pickable = lensPickable(view, LENS_IDS);
  const open = useShell((s) => s.sheet === 'lens');
  const toggle = () => { if (pickable) useShell.getState().toggle('lens'); };
  return (
    <>
      <div className="lens-btn" id="btnLayers" role="button" tabIndex={0} data-opens="lens" aria-haspopup="dialog" aria-expanded={open} aria-controls={menuDomId('lens')} title={tb('btnLayers').title ?? undefined}
        onClick={toggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
        <span className="lens-name" id="colorModeLabel">{UI.lenses.find((l) => l.id === lens)?.name ?? ''}</span>
        <LensKey />
        <I n="chev-down" className="chev" />
      </div>
      <Menu id="lens" label={labelOf('btnLayers')} title={labelOf('btnLayers')} cls="layers-pop" width="m" align="end">
        <LensMenu />
      </Menu>
    </>
  );
}
/** The lens menu: the lenses the view offers (lenses/in-view.ts lensesFor, the one table), each with what it colours in this view where that differs from the menu's own words. */
function LensMenu() {
  const view = useShell((s) => s.view);
  const lens = shownLens(view, useLens((s) => s.lens));
  const look = useLook();
  return (
    <div className="lens-grid" role="radiogroup" aria-label="Color the vessels by">
      {lensesFor(view, LENS_IDS).map((id) => {
        const l = UI.lenses.find((x) => x.id === id)!;
        return (
          <button key={id} type="button" role="radio" className={`lens${lens === id ? ' on' : ''}`} aria-checked={lens === id} onClick={() => setLens(id)}>
            <span className="lens-sw" style={{ background: lensSwatch(id, look) }} /><span className="lens-t">{l.name}</span><span className="lens-d">{lensNoteIn(view, id) ?? l.note}</span>
          </button>
        );
      })}
    </div>
  );
}
export function setLens(id: LensId) { sceneApi.setLens(id); }

function Act({ id, icon, feature, extra, className = '' }: { id: string; icon: string; feature: FeatureId; extra?: React.ReactNode; className?: string }) {
  const t = tb(id);
  return (
    <button type="button" className={`${className} tb-act`.trim()} id={id} aria-label={t.label ?? undefined} title={t.title ?? undefined} aria-haspopup="dialog" onClick={() => runFeature(feature, t.label ?? id)}>
      <I n={icon} /><span>{t.text}</span>{extra}
    </button>
  );
}

/** The top bar as index.html has it. A phone or an upright iPad (the 2D "thumb" layout) keeps the patient and the colour key here, the rest in the dock's tab row. */
export function TopBar() {
  const mode = useTalkOn() ? 'deck' : 'free';
  const sheet = useShell((s) => s.sheet);
  const view = useShell((s) => s.view);
  const patientId = useShell((s) => s.patientId);
  const lobule = view === 'lobule' || view === 'sinusoid';
  useParamsTick((s) => s.tick);   // (the name follows the settings: a disease put on the case renames it)
  const patient = isCustomCase(patientId, currentParams()) ? 'Custom' : (UI.presets.find((p) => p.id === patientId)?.label ?? yoursName(patientId)) || historyName(patientId);
  const menu = tb('btnMenu');
  const barRef = useBarFit([patient, patientId, view, mode]);
  // a button that comes or goes, a longer name, a new fit step: the bar glides to it (2D topbar-motion.js)
  useEffect(() => startTopbarMotion(), []);
  const short = pillShort(patient, patientId);
  return (
    <header ref={barRef} className="topbar float-ui stage-blocker" id="topbar" data-hidden={mode === 'deck' || undefined} aria-label="Top bar">
      <div className="float-pill tb-id">
        <span className="tb-face" aria-hidden="true" />
        <button type="button" className="menu-btn" id="btnMenu" data-opens="menu" aria-haspopup="dialog" aria-expanded={sheet === 'menu'} title={menu.title ?? undefined} onClick={() => useShell.getState().toggle('menu')}>
          <i className="brand-mark" aria-hidden="true" />
          <span className="scenario-v" id="scenarioName"><span className="sn-l">{patient}</span><span className="sn-s">{short}</span><span className="sn-c">{COMPACT[short] ?? short}</span></span>
          {/* (the name is the words on the button first, then what it does: "Healthy, Menu: presentations and patients". WCAG 2.5.3: the visible words are in it, so voice control that says
              them finds it; the name follows the form shown, the other two are display: none) */}
          {menu.label && <span className="sr-only">, {menu.label}</span>}
          <I n="chev-down" className="chev" />
        </button>
      </div>
      <div className="stage-bar top" id="stageTop">
        <div className="sb-left" />
        <div className="sb-right has-face">
          <span className="tb-face" aria-hidden="true" />
          <FigureMenu kind="layers" hidden={!lobule} />
          <FigureMenu kind="blood" />
          <LensButton />
        </div>
      </div>
      <div className="top-right float-pill stage-blocker">
        <Act id="btnTreat" icon="pill" feature="treat" />
        <Act id="tabInstruments" icon="gauge" feature="tests" className="measure-launch" />
        <Act id="btnHistory" icon="clock" feature="history" extra={<b className="tb-hc" aria-hidden="true" />} />
        <span className="tb-sep" aria-hidden="true" />
        <button type="button" className="ib" id="btnSettings" data-opens="settings" aria-haspopup="dialog" aria-expanded={sheet === 'settings'} aria-label={tb('btnSettings').label ?? undefined} title={tb('btnSettings').title ?? undefined} onClick={() => useShell.getState().toggle('settings')}><I n="gear" /></button>
        <button type="button" className="pal-btn" id="btnPalette" data-opens="search" aria-expanded={sheet === 'search'} aria-label={tb('btnPalette').label ?? undefined} title={tb('btnPalette').title ?? undefined} onClick={() => useShell.getState().toggle('search')}>
          <I n="search" /><span className="pal-l">Search</span><kbd>{keyLabel('Ctrl/⌘ K')}</kbd>
        </button>
      </div>
    </header>
  );
}
export { notYet };

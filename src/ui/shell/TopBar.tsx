import { UI } from '../strings.generated.ts';
import { useUi } from '../ui-store.ts';
import { useShell, LENS_IDS } from './store.ts';
import { useLens } from '../../scene/lenses/store.ts';
import { sceneApi } from '../../scene/api.ts';
import type { LensId } from '../../scene/lenses/model.ts';
import { Anchored } from './Pop.tsx';
import { Icon } from './icons.tsx';
import { LENS_ART } from './lens-art.ts';
import { VIEWS, pillHidden, tapView, type ViewId } from './views.ts';
import { runFeature, type FeatureId } from './features.ts';
import { notYet } from './words.ts';
import { goToView, refitFigure } from './view-actions.ts';
import { FigureMenu } from './FigureMenu.tsx';
import { keyLabel } from './platform.ts';

interface Tb { id: string; label: string | null; title: string | null; text: string | null }
export const tb = (id: string): Tb => UI.topbar.find((t) => t.id === id) as unknown as Tb;
const labelOf = (id: string) => tb(id).label ?? tb(id).text ?? id;

/** The pill row of views: Circuit, Anatomy, Lobule, Sinusoid. A second tap on the active view refits it; Sinusoid folds in only while the lobule is up. */
export function ViewPills() {
  const view = useShell((s) => s.view);
  const ready = useShell((s) => s.ready);
  return (
    <div className="sh-seg" role="group" aria-label="View" data-view-pills>
      {VIEWS.map((v) => {
        const hidden = pillHidden(v.id, view);
        return (
          <button key={v.id} type="button" aria-pressed={view === v.id} data-hidden={hidden} data-pending={!ready[v.id]} tabIndex={hidden ? -1 : 0} aria-hidden={hidden || undefined}
            title={UI.views.find((x) => x.id === v.id)?.label} onClick={() => tapPill(v.id, view)}>{v.label}</button>
        );
      })}
    </div>
  );
}
function tapPill(id: ViewId, cur: ViewId) {
  const t = tapView(id, cur);
  if (t.type === 'refit') refitFigure(); else goToView(t.view);
}

/** The colour legend and lens name; the lens menu opens from it. */
export function LensButton() {
  const lens = useLens((s) => s.lens);
  const name = UI.lenses.find((l) => l.id === lens)?.name ?? '';
  return (
    <Anchored sheet="lens" label={labelOf('btnLayers')} width={440} button={({ id, open, toggle }) => (
      <button type="button" className="sh-pill sh-lens" data-opens="lens" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} title={tb('btnLayers').title ?? undefined} onClick={toggle}>
        <span className="sh-lens-name">{name}</span>
        <span className="sh-legend" role="img" aria-label={labelOf('legend')} style={{ background: LENS_ART[lens] ?? LENS_ART.pressure }} />
        <Icon n="chev-down" className="sh-chev" />
      </button>)}>
      <LensMenu />
    </Anchored>
  );
}
function LensMenu() {
  const lens = useLens((s) => s.lens);
  return (
    <div className="sh-grid" role="radiogroup" aria-label="Color the vessels by">
      {LENS_IDS.map((id) => {
        const l = UI.lenses.find((x) => x.id === id)!;
        return (
          <button key={id} type="button" role="radio" className="sh-row" aria-checked={lens === id} onClick={() => setLens(id)}>
            <span className="sh-swatch" style={{ background: LENS_ART[id] }} /><span className="sh-t">{l.name}</span><span className="sh-d">{l.note}</span>
          </button>
        );
      })}
    </div>
  );
}
export function setLens(id: LensId) { sceneApi.setLens(id); }

function Pill({ id, icon, feature, text, compact }: { id: string; icon: string; feature: FeatureId; text?: string; compact: boolean }) {
  const t = tb(id);
  return (
    <button type="button" className="sh-pill" data-icon-only={compact || undefined} aria-label={t.label ?? text} title={t.title ?? undefined} aria-haspopup="dialog" onClick={() => runFeature(feature, text ?? t.label ?? id)}>
      <Icon n={icon} />{!compact && <span>{text ?? t.text}</span>}
    </button>
  );
}

/** The top bar of a laptop or an iPad held sideways; a phone or an upright iPad keeps the menu and the lens here and the rest at the foot. */
export function TopBar({ bottom, pills = !bottom }: { bottom: boolean; pills?: boolean }) {
  const mode = useShell((s) => s.mode);
  const sheet = useShell((s) => s.sheet);
  const view = useShell((s) => s.view);
  const patientId = useShell((s) => s.patientId);
  const vw = useUi((s) => s.vp.w);
  const compact = vw < 1240;
  const patient = UI.presets.find((p) => p.id === patientId)?.label ?? '';
  const menu = tb('btnMenu');
  return (
    <header className="sh-top" data-hidden={mode === 'deck'} aria-label="Top bar">
      <button type="button" className="sh-pill sh-menu-btn" data-opens="menu" aria-haspopup="dialog" aria-expanded={sheet === 'menu'} aria-label={menu.label ?? undefined} title={menu.title ?? undefined} onClick={() => useShell.getState().toggle('menu')}>
        <Icon n="menu" /><span className="sh-name">{patient}</span>
      </button>
      {pills && <ViewPills />}
      {!bottom && <div className="sh-anchor" style={{ opacity: view === 'lobule' || view === 'sinusoid' ? 1 : 0, pointerEvents: view === 'lobule' || view === 'sinusoid' ? 'auto' : 'none', transition: 'opacity 200ms' }}><FigureMenu kind="layers" /></div>}
      {!bottom && <FigureMenu kind="blood" />}
      <LensButton />
      <span className="sh-grow" />
      {!bottom && <>
        <Pill id="btnTreat" icon="pill" feature="treat" compact={compact} />
        <Pill id="tabInstruments" icon="gauge" feature="tests" compact={compact} />
        <Pill id="btnHistory" icon="clock" feature="history" compact={compact} />
        <button type="button" className="sh-pill" data-icon-only data-opens="settings" aria-haspopup="dialog" aria-expanded={sheet === 'settings'} aria-label={tb('btnSettings').label ?? undefined} title={tb('btnSettings').title ?? undefined} onClick={() => useShell.getState().toggle('settings')}><Icon n="gear" /></button>
        <button type="button" className="sh-pill" data-icon-only={compact || undefined} data-opens="search" aria-haspopup="dialog" aria-expanded={sheet === 'search'} aria-label={tb('btnPalette').label ?? undefined} title={tb('btnPalette').title ?? undefined} onClick={() => useShell.getState().toggle('search')}>
          <Icon n="search" />{!compact && <span>Search</span>}{!compact && <kbd>{keyLabel('Ctrl/⌘ K')}</kbd>}
        </button>
      </>}
    </header>
  );
}
export { notYet };

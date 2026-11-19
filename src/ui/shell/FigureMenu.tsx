import { UI } from '../strings.generated.ts';
import { useShell, type Figure } from './store.ts';
import { Anchored } from './Pop.tsx';
import { Icon } from './icons.tsx';
import { tb } from './TopBar.tsx';
import { Frame } from './Frame.tsx';
import { refitFigure } from './view-actions.ts';
import { runFeature } from './features.ts';

const ICON: Record<string, string> = { Chevrons: 'chevrons', 'Key chevrons only': 'chevrons', 'Pressure values': 'tag', 'Potential collaterals': 'route', 'Organ names': 'liver', Zones: 'zones', Lymph: 'lymph', Bile: 'bile' };
const KEY: Record<string, keyof Figure> = { Chevrons: 'chevrons', 'Key chevrons only': 'keyChevrons', 'Pressure values': 'chips', 'Potential collaterals': 'collaterals', 'Organ names': 'labels', Zones: 'zones', Lymph: 'lymph', Bile: 'bile' };

function Switch({ label, hint }: { label: string; hint?: string }) {
  const k = KEY[label];
  const on = useShell((s) => s.figure[k] as boolean);
  return (
    <button type="button" role="switch" className="sh-row" aria-checked={on} onClick={() => useShell.getState().setFigure({ [k]: !on })}>
      <Icon n={ICON[label] ?? 'info'} /><span className="sh-t">{label}</span><span className="sh-sw" aria-hidden="true" />{hint && <span className="sh-d">{hint}</span>}
    </button>
  );
}

/** The rows of the Blood menu (moving blood, what the figure shows, how many labels) or of the lobule's Layers: the 2D app's rows with its words. */
export function FigureRows({ kind }: { kind: 'blood' | 'layers' }) {
  const level = useShell((s) => s.figure.labelLevel);
  const rows = kind === 'blood' ? UI.menus.blood : UI.menus.lobule;
  const sections = [...new Set(rows.map((r) => ('section' in r ? r.section : '')))];
  return (
    <>
      {sections.map((sec) => (
        <div key={sec}>
          <div className="sh-title">{sec}</div>
          {rows.filter((r) => ('section' in r ? r.section : '') === sec && sec !== 'Labels').map((r) => <Switch key={r.label} label={r.label} hint={'hint' in r ? r.hint : undefined} />)}
          {sec === 'Labels' && (
            <div className="sh-seg-row" role="group" aria-label="Labels on the figure">
              {rows.filter((r) => 'section' in r && r.section === 'Labels').map((r) => {
                const v = r.label.toLowerCase() as 'key' | 'all' | 'none';
                return <button key={r.label} type="button" aria-pressed={level === v} onClick={() => useShell.getState().setFigure({ labelLevel: v })}>{r.label}</button>;
              })}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/** The Blood menu and, in the lobule, the Layers menu: a popover under its button on a laptop. */
export function FigureMenu({ kind }: { kind: 'blood' | 'layers' }) {
  const blood = kind === 'blood';
  const id = blood ? 'btnBlood' : 'btnLobuleLayers';
  const t = tb(id);
  const on = useShell((s) => (blood ? s.figure.chevrons || s.figure.keyChevrons : true));
  return (
    <Anchored sheet={kind} label={t.title ?? t.label ?? id} width={320} button={({ id: pid, open, toggle }) => (
      <button type="button" className="sh-pill" data-opens={kind} data-off={!on} aria-haspopup="menu" aria-expanded={open} aria-controls={pid} title={t.title ?? undefined} onClick={toggle}>
        <Icon n={blood ? 'drop' : 'layers'} /><span>{t.label ?? t.text}</span><Icon n="chev-down" className="sh-chev" />
      </button>)}>
      <FigureRows kind={kind} />
    </Anchored>
  );
}

/** The thumb bar's Layers: a sheet from the foot with Fit to screen, Turn upright (circuit only), then the Blood rows (or the lobule's layers). 2D: openLayersMenu. */
export function LayersSheet() {
  const view = useShell((s) => s.view);
  const lobule = view === 'lobule' || view === 'sinusoid';
  const [fit, turn] = UI.menus.layersPhone;
  return (
    <Frame kind="layers" label="Layers" head={null}>
      <div className="sh-title">Layers</div>
      <button type="button" className="sh-row" onClick={() => { useShell.getState().close(); refitFigure(); }}><Icon n="fit" /><span className="sh-t">{fit.label}</span></button>
      {view === 'circuit' && <button type="button" className="sh-row" onClick={() => { useShell.getState().close(); runFeature('rotate', turn.label); }}><Icon n="rotate" /><span className="sh-t">{turn.label}</span></button>}
      <div className="sh-sep" />
      <FigureRows kind={lobule ? 'layers' : 'blood'} />
    </Frame>
  );
}

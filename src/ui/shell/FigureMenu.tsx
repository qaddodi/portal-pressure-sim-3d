import { UI } from '../strings.generated.ts';
import { useShell, type Figure } from './store.ts';
import { Anchored } from './Pop.tsx';
import { Icon } from './icons.tsx';
import { tb } from './TopBar.tsx';

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

/** The Blood menu (moving blood, what the figure shows, how many labels) and, in the lobule, the Layers menu. Both are the 2D app's rows with its words. */
export function FigureMenu({ kind }: { kind: 'blood' | 'layers' }) {
  const level = useShell((s) => s.figure.labelLevel);
  const blood = kind === 'blood';
  const id = blood ? 'btnBlood' : 'btnLobuleLayers';
  const t = tb(id);
  const rows = blood ? UI.menus.blood : UI.menus.lobule;
  const sections = [...new Set(rows.map((r) => ('section' in r ? r.section : '')))];
  const on = useShell((s) => (blood ? s.figure.chevrons || s.figure.keyChevrons : true));
  return (
    <Anchored sheet={kind} label={t.title ?? t.label ?? id} width={320} button={({ id: pid, open, toggle }) => (
      <button type="button" className="sh-pill" data-opens={kind} data-off={!on} aria-haspopup="menu" aria-expanded={open} aria-controls={pid} title={t.title ?? undefined} onClick={toggle}>
        <Icon n={blood ? 'drop' : 'layers'} /><span>{t.label ?? t.text}</span><Icon n="chev-down" className="sh-chev" />
      </button>)}>
      {sections.map((sec) => (
        <div key={sec}>
          <div className="sh-title">{sec}</div>
          {rows.filter((r) => ('section' in r ? r.section : '') === sec && !(sec === 'Labels')).map((r) => <Switch key={r.label} label={r.label} hint={'hint' in r ? r.hint : undefined} />)}
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
    </Anchored>
  );
}

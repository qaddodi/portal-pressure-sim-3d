import { UI } from '../strings.generated.ts';
import { useShell } from './store.ts';
import { useBlood } from '../../scene/blood/options.ts';
import { sceneApi } from '../../scene/api.ts';
import { Anchored } from './Pop.tsx';
import { Icon } from './icons.tsx';
import { tb } from './TopBar.tsx';
import { I } from './icons.tsx';
import { Frame } from './Frame.tsx';
import { refitFigure } from './view-actions.ts';
import { runFeature } from './features.ts';
import { figureRowsOwner } from './room.ts';
import { useUi } from '../ui-store.ts';
import { setFigureSwitch } from './figure-switch.ts';
import { useSettings } from '../../state/settings.ts';
import { STREAKS_ROW } from '../settings/depth-rows.ts';
import { talkOn } from '../../state/deck.ts';
import { FIGURE_IMAGE } from './words.ts';
import { copyFigure, saveFigure } from './figure-image-dom.ts';

const ICON: Record<string, string> = { Chevrons: 'chevrons', 'Key chevrons only': 'chevrons', 'Pressure values': 'tag', 'Potential collaterals': 'route', 'Organ names': 'liver', Zones: 'zones', Lymph: 'lymph', Bile: 'bile' };
const KEY: Record<string, string> = { Chevrons: 'chevrons', 'Key chevrons only': 'keyChevrons', 'Pressure values': 'chips', 'Potential collaterals': 'collaterals', 'Organ names': 'labels', Zones: 'zones', Lymph: 'lymph', Bile: 'bile' };

const BLOOD_KEYS = new Set(['chevrons', 'keyChevrons', 'chips', 'collaterals', 'labels']);
/** A Blood switch lives in the scene's own store (src/scene/blood); the lobule's layers live in the shell. */
function Switch({ label, hint }: { label: string; hint?: string }) {
  const k = KEY[label];
  const blood = BLOOD_KEYS.has(k);
  const on = useShell((s) => (blood ? false : (s.figure[k as 'zones'] as boolean)));
  const bloodOn = useBlood((s) => (blood ? (s[k as 'chevrons'] as boolean) : false));
  const checked = blood ? bloodOn : on;
  const flip = () => { setFigureSwitch(k, !checked); };
  return (
    <button type="button" role="switch" className="sh-row" aria-checked={checked} onClick={flip}>
      <Icon n={ICON[label] ?? 'info'} /><span className="sh-t">{label}</span><span className="sh-sw" aria-hidden="true" />{hint && <span className="sh-d">{hint}</span>}
    </button>
  );
}

/** Blood streaks (the dust): the Settings switch `particles`, shown here under the chevrons in the same row. The figure eases the particles in and out; nothing pops. */
function StreaksSwitch() {
  const on = useSettings((s) => s[STREAKS_ROW.key]);
  return (
    <button type="button" role="switch" className="sh-row" aria-checked={on} onClick={() => useSettings.getState().set(STREAKS_ROW.key, !on)}>
      <Icon n={STREAKS_ROW.icon} /><span className="sh-t">{STREAKS_ROW.label}</span><span className="sh-sw" aria-hidden="true" /><span className="sh-d">{STREAKS_ROW.hint}</span>
    </button>
  );
}

/** Key streaks only (Mohammad, 20 Nov: "add option for only key streaks to show up just like chevrons"): the streaks on the main routes only, the vessels Key chevrons only keeps; the others ease out. */
export const KEY_STREAKS_ROW = { label: 'Key streaks only', hint: 'Just the main routes, not every vessel' } as const;
function KeyStreaksSwitch() {
  const on = useBlood((s) => s.keyStreaks);
  return (
    <button type="button" role="switch" className="sh-row" aria-checked={on} onClick={() => sceneApi.setBlood({ keyStreaks: !on }, talkOn())}>
      <Icon n={STREAKS_ROW.icon} /><span className="sh-t">{KEY_STREAKS_ROW.label}</span><span className="sh-sw" aria-hidden="true" /><span className="sh-d">{KEY_STREAKS_ROW.hint}</span>
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
          {kind === 'blood' && sec === 'Moving blood' && <><StreaksSwitch /><KeyStreaksSwitch /></>}
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
      <div>
        <div className="sh-title">{FIGURE_IMAGE.section}</div>
        <button type="button" className="sh-row" onClick={() => { void copyFigure(); }}><Icon n="camera" /><span className="sh-t">{FIGURE_IMAGE.copy}</span><span className="sh-d">{FIGURE_IMAGE.copyHint}</span></button>
        <button type="button" className="sh-row" onClick={() => { void saveFigure(); }}><Icon n="download" /><span className="sh-t">{FIGURE_IMAGE.save}</span><span className="sh-d">{FIGURE_IMAGE.saveHint}</span></button>
      </div>
    </>
  );
}

/** The Blood menu and, in the lobule, the Layers menu: a popover under its button on a laptop. */
export function FigureMenu({ kind, hidden = false }: { kind: 'blood' | 'layers'; hidden?: boolean }) {
  const blood = kind === 'blood';
  const id = blood ? 'btnBlood' : 'btnLobuleLayers';
  const t = tb(id);
  const streaks = useSettings((s) => s.particles);
  const on = useBlood((s) => (blood ? s.chevrons || s.keyChevrons || streaks : true));
  // With the bottom bar (a phone, an upright iPad) the Layers tab opens the foot sheet (LayersSheet), which holds these same rows. This top-bar copy is hidden there (2D: `.app.thumb #btnBlood,
  // #btnLobuleLayers { display: none }`), and must not also open its own popover on `sheet === 'layers'`: both showed at once, two panels over each other (iPhone, 19 Nov 2026).
  const bottom = figureRowsOwner(useUi((s) => s.device)) === 'sheet';
  if (bottom) return <button type="button" className={`chip-btn${on ? '' : ' off'}`} id={id} hidden data-opens={kind} aria-haspopup="menu" aria-expanded="false" tabIndex={-1} title={t.title ?? undefined}><I n={blood ? 'drop' : 'layers'} /><span>{t.label ?? t.text}</span><I n="chev-down" className="chev" /></button>;
  return (
    <Anchored sheet={kind} label={t.title ?? t.label ?? id} width={320} button={({ id: pid, open, toggle, ref }) => (
      <button type="button" ref={ref} className={`chip-btn${on ? '' : ' off'}`} id={id} hidden={hidden || undefined} data-opens={kind} aria-haspopup="menu" aria-expanded={open} aria-controls={pid} title={t.title ?? undefined} onClick={toggle}>
        <I n={blood ? 'drop' : 'layers'} /><span>{t.label ?? t.text}</span><I n="chev-down" className="chev" />
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

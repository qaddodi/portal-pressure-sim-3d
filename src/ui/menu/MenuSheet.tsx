// The main menu: Present (the talks) and Patients, as the 2D app's menu lists them. Only the talks that play in the 3D app are listed under Present (library.ts);
// every patient is listed.
import { UI } from '../strings.generated.ts';
import { useShell, type MenuTab } from '../shell/store.ts';
import { Frame } from '../shell/Frame.tsx';
import { Icon } from '../shell/icons.tsx';
import { startTalk } from '../shell/talk.ts';
import { presentTopics, patientGroups } from './library.ts';
import { loadPatient } from './patients.ts';

const TABS = UI.menus.mainMenu.tabs as readonly { id: MenuTab; label: string }[];

export function MenuSheet() {
  const tab = useShell((s) => s.menuTab);
  const patientId = useShell((s) => s.patientId);
  return (
    <Frame kind="menu" label={UI.topbar.find((t) => t.id === 'btnMenu')!.label!} head={null}>
      <div className="sh-tabs" role="tablist" aria-label={UI.topbar.find((t) => t.id === 'btnMenu')!.title ?? undefined}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => useShell.setState({ menuTab: t.id })}><Icon n={t.id === 'present' ? 'projector' : 'scenario'} />{t.label}</button>
        ))}
      </div>
      {tab === 'present' ? (
        <div role="tabpanel">
          {presentTopics().map((t) => (
            <div key={t.topic}>
              <div className="sh-title">{t.label}</div>
              {t.decks.map((d) => (
                <button key={d.id} type="button" className="sh-row" onClick={() => startTalk(d.id)}>
                  <Icon n="projector" /><span className="sh-t">{d.title}</span><span className="sh-d">{[d.minutes ? `${d.minutes} min` : null, d.summary].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div role="tabpanel">
          {patientGroups().map((g) => (
            <div key={g.group}>
              <div className="sh-title">{g.group}</div>
              {g.patients.map((p) => (
                <button key={p.id} type="button" className="sh-row" aria-current={patientId === p.id ? 'true' : undefined} onClick={() => { void loadPatient(p.id).then((ok) => { if (ok) useShell.getState().close(); }); }}>
                  <Icon n="scenario" /><span className="sh-t">{p.label}</span>{patientId === p.id && <Icon n="check" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}

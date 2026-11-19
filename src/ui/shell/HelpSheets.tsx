// Help: the menu behind Settings › Help (and the "?" of a keyboard), and the Guide: the 2D app's single scrolling page (what it is, the keys, while presenting, reading the
// figure, thresholds and the disclaimer), from the generated 2D words. About the model, References and Privacy are in the 2D app and not yet in the 3D app.
import { useEffect, useRef } from 'react';
import { UI } from '../strings.generated.ts';
import { useShell } from './store.ts';
import { Frame } from './Frame.tsx';
import { Icon } from './icons.tsx';
import { runFeature, type FeatureId } from './features.ts';
import { keyLabel } from './platform.ts';

const HELP_ICON: Record<string, string> = { Guide: 'book', 'Keyboard shortcuts': 'grid', 'About the model': 'info', References: 'case', Privacy: 'lock' };
const HELP_FEATURE: Record<string, FeatureId> = { 'About the model': 'guide-about', References: 'guide-references', Privacy: 'guide-privacy' };

export const openGuide = (section: 'keys' | 'present' | null = null) => useShell.setState({ sheet: 'guide', helpSection: section });

export function HelpMenu() {
  return (
    <Frame kind="help" label="Help" place="top">
      {UI.helpPages.map((p) => (
        <button key={p.label} type="button" className="sh-row" onClick={() => {
          if (p.label === 'Guide') openGuide(); else if (p.label === 'Keyboard shortcuts') openGuide('keys');
          else { useShell.getState().close(); runFeature(HELP_FEATURE[p.label], p.label); }
        }}>
          <Icon n={HELP_ICON[p.label] ?? 'info'} /><span className="sh-t">{p.label}</span>{p.kb ? <kbd>{keyLabel(p.kb)}</kbd> : null}
        </button>
      ))}
    </Frame>
  );
}

const GROUPS = [...new Set(UI.shortcuts.map((s) => s.group))];
const ENTRY_NOTE = 'Keyboard';

export function Guide() {
  const open = useShell((s) => s.sheet === 'guide');
  const section = useShell((s) => s.helpSection);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !section) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-sec="${section}"]`);
    el?.scrollIntoView({ block: 'start' });
  }, [open, section]);
  const g = UI.guide;
  const keys = (group: string) => UI.shortcuts.filter((s) => s.group === group);
  return (
    <Frame kind="guide" label="Guide" place="top">
      <div className="sh-guide" ref={ref}>
        <p className="sh-lede">{g.lede}</p>
        <div className="sh-entries">{g.entries.map((e) => <div key={e.title}><b>{e.title}</b><span>{e.text}</span></div>)}</div>
        <h3 className="sh-h3" data-sec="keys">{ENTRY_NOTE}</h3>
        {GROUPS.filter((x) => x !== 'While presenting').map((group) => (
          <section key={group}>
            <h4 className="sh-keygroup">{group}</h4>
            <div className="sh-keys">{keys(group).map((s) => <div key={s.keys}><span>{s.what}</span><kbd>{keyLabel(s.keys)}</kbd></div>)}</div>
          </section>
        ))}
        <h3 className="sh-h3" data-sec="present">While presenting</h3>
        <p>{g.presentIntro}</p>
        <div className="sh-keys">{keys('While presenting').map((s) => <div key={s.keys}><span>{s.what}</span><kbd>{keyLabel(s.keys)}</kbd></div>)}</div>
        <h3 className="sh-h3">Reading the figure</h3>
        <ul>{g.reading.map((r) => <li key={r.slice(0, 24)}>{r}</li>)}</ul>
        <h3 className="sh-h3">Thresholds &amp; references</h3>
        <p>{g.thresholds}</p>
        <p className="sh-disclaimer">{g.disclaimer}</p>
      </div>
    </Frame>
  );
}

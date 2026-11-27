// Help: the menu behind Settings › Help (and the "?" of a keyboard), and the Guide: the 2D app's single scrolling page (what it is, the keys, while presenting, reading the
// figure, thresholds and the disclaimer), from the generated 2D words, in the dialog shell like About the model (owner, 27 Nov: the Guide becomes a dialog).
import { UI } from '../strings.generated.ts';
import { useShell } from './store.ts';
import { Dialog, DialogPage } from '../surface/Dialog.tsx';
import type { CancelBy } from '../surface/dialog-fit.ts';
import { I } from './icons.tsx';
import { MenuPop, MenuGroup, MenuItem } from './Menu.tsx';
import { runFeature, type FeatureId } from './features.ts';
import { keyLabel } from './platform.ts';

const AUTHOR = 'Mohammad Almeqdadi, MD', AUTHOR_URL = 'https://qaddodi.github.io/#tools';   // 2D src/version.js
const HELP_ICON: Record<string, string> = { Guide: 'book', 'Keyboard shortcuts': 'grid', 'About the model': 'info', References: 'case', Privacy: 'lock' };
const HELP_FEATURE: Record<string, FeatureId> = { 'About the model': 'guide-about', References: 'guide-references', Privacy: 'guide-privacy' };

export const openGuide = (section: 'keys' | 'present' | null = null) => useShell.setState({ sheet: 'guide', helpSection: section });

/** 2D main.js helpRows(): Guide, Keyboard shortcuts, About the model, References, Privacy, then the author's credit. The rows of the Help menu and of the Help page inside Settings. */
export function HelpRows() {
  return (
    <>
      <MenuGroup title="Help">
        {UI.helpPages.map((p) => (
          <MenuItem key={p.label} icon={HELP_ICON[p.label] ?? 'info'} label={p.label} kb={p.kb ? keyLabel(p.kb) : null} onClick={() => {
            if (p.label === 'Guide') openGuide(); else if (p.label === 'Keyboard shortcuts') openGuide('keys');
            else { useShell.getState().close(); runFeature(HELP_FEATURE[p.label], p.label); }
          }} />
        ))}
      </MenuGroup>
      <MenuGroup>
        <a className="menu-credit" href={AUTHOR_URL} target="_blank" rel="noopener" onClick={() => useShell.getState().close()}>
          <span>Created by <b>{AUTHOR}</b></span><span className="mc-link">More teaching tools <I n="chev-right" /></span>
        </a>
      </MenuGroup>
    </>
  );
}

/** The Help menu: opened from the main menu's footer. */
export function HelpMenu() {
  return (
    <MenuPop kind="help" label="Help" title="Help" from="settings" align="end">
      <HelpRows />
    </MenuPop>
  );
}

const GROUPS = [...new Set(UI.shortcuts.map((s) => s.group))];
const ENTRY_NOTE = 'Keyboard';

/** The Guide: a page dialog like About (surface/Dialog.tsx), opened at a section by `helpSection` (Keyboard shortcuts, While presenting). Its id in the shell store stays `guide`. */
export function Guide() {
  const open = useShell((s) => s.sheet === 'guide');
  const section = useShell((s) => s.helpSection);
  const g = UI.guide;
  const keys = (group: string) => UI.shortcuts.filter((s) => s.group === group);
  // (a press outside is recorded, so the tail of that press on the Guide's own opener does not open it again: store.ts closeByPress)
  const cancel = (by: CancelBy) => { if (by === 'press') useShell.getState().closeByPress(); else useShell.getState().close(); };
  return (
    <Dialog id="guide" size="l" open={open} label="Guide" onCancel={cancel} className="modal">
      <DialogPage open={open} title="Guide" section={open ? section : null} onClose={() => cancel('x')} bodyClass="sh-guide">
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
      </DialogPage>
    </Dialog>
  );
}

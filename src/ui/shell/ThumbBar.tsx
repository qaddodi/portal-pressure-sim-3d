// The thumb dock's tab row (2D main.js wireThumbBar): Treat, Tests, Search, Layers, Settings as .nb-tab buttons in nav#thumbBar. A second tap on a tab closes it. Layers is dimmed and inert outside the lobule.
import { UI } from '../strings.generated.ts';
import { useShell } from './store.ts';
import { I } from './icons.tsx';
import { runFeature, type FeatureId } from './features.ts';

const ICON: Record<string, string> = { treat: 'pill', tests: 'gauge', search: 'search', layers: 'layers', settings: 'gear' };
const FEATURE: Record<string, FeatureId> = { treat: 'treat', tests: 'tests' };

export function ThumbBar() {
  const sheet = useShell((s) => s.sheet);
  const view = useShell((s) => s.view);
  const lobule = view === 'lobule' || view === 'sinusoid';
  return (
    <nav className="thumb-bar" id="thumbBar" aria-label="Patient tools">
      {UI.menus.thumbTabs.map((t) => {
        const sheetId = t.id === 'search' ? 'search' : t.id === 'settings' ? 'settings' : t.id === 'layers' ? 'layers' : null;
        const off = t.id === 'layers' && !lobule;
        return (
          <button key={t.id} type="button" className="nb-tab" data-tab={t.id} disabled={off} data-opens={sheetId ?? undefined} aria-expanded={sheetId ? sheet === sheetId : undefined} aria-haspopup={sheetId ? 'dialog' : undefined}
            onClick={() => { if (sheetId) useShell.getState().toggle(sheetId); else runFeature(FEATURE[t.id], t.label); }}>
            <I n={ICON[t.id]} /><span className="nb-l">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

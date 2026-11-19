// The bottom bar of a phone and an upright iPad: Treat, Tests, Search, Layers, Settings (the 2D app's thumb dock). A second tap on a tab closes it. Layers shows only in
// the lobule view (it is dimmed and inert elsewhere, kept in place so the bar never changes its shape).
import { UI } from '../strings.generated.ts';
import { useShell } from './store.ts';
import { Icon } from './icons.tsx';
import { runFeature, type FeatureId } from './features.ts';

const ICON: Record<string, string> = { treat: 'pill', tests: 'gauge', search: 'search', layers: 'layers', settings: 'gear' };
const FEATURE: Record<string, FeatureId> = { treat: 'treat', tests: 'tests' };

export function ThumbBar() {
  const sheet = useShell((s) => s.sheet);
  const view = useShell((s) => s.view);
  const lobule = view === 'lobule' || view === 'sinusoid';
  return (
    <nav className="sh-thumb" aria-label="Main">
      {UI.menus.thumbTabs.map((t) => {
        const sheetId = t.id === 'search' ? 'search' : t.id === 'settings' ? 'settings' : t.id === 'layers' ? 'layers' : null;
        const off = t.id === 'layers' && !lobule;
        return (
          <button key={t.id} type="button" disabled={off} data-opens={sheetId ?? undefined} aria-expanded={sheetId ? sheet === sheetId : undefined} aria-haspopup={sheetId ? 'dialog' : undefined}
            onClick={() => { if (sheetId) useShell.getState().toggle(sheetId); else runFeature(FEATURE[t.id], t.label); }}>
            <Icon n={ICON[t.id]} /><span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

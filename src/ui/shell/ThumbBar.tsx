// The thumb dock's tab row (2D main.js wireThumbBar): Treat, Tests, Search, Layers, Settings as .nb-tab buttons in nav#thumbBar. A second tap on a tab closes it. Layers is always live: in Anatomy and Circuit it holds Fit to screen, Turn upright (Circuit) and the Blood rows, in the lobule its own layers (2D openLayersMenu; 2D dims no tab).
import { UI } from '../strings.generated.ts';
import { useShell } from './store.ts';
import { I } from './icons.tsx';
import { runFeature, type FeatureId } from './features.ts';
import { goToView } from './view-actions.ts';
import { useTests } from '../tests/store.ts';
import { useTreat } from '../treat/store.ts';

const ICON: Record<string, string> = { treat: 'pill', tests: 'gauge', search: 'search', layers: 'layers', settings: 'gear' };
const FEATURE: Record<string, FeatureId> = { treat: 'treat', tests: 'tests' };

export function ThumbBar() {
  const sheet = useShell((s) => s.sheet);
  const view = useShell((s) => s.view);
  // (2D main.js wireThumbBar's sync: Treat is pressed while its card is open and Tests while the Tests card is; the stylesheet gives a pressed tab its pill and accent. Nothing here set it, so the open tab did not show.)
  const testsOpen = useTests((s) => s.open), treatOpen = useTreat((s) => s.open);
  return (
    <nav className="thumb-bar" id="thumbBar" aria-label="Patient tools">
      {UI.menus.thumbTabs.map((t) => {
        const sheetId = t.id === 'search' ? 'search' : t.id === 'settings' ? 'settings' : t.id === 'layers' ? 'layers' : null;
        return (
          <button key={t.id} type="button" className="nb-tab" data-tab={t.id} data-opens={sheetId ?? undefined} aria-expanded={sheetId ? sheet === sheetId : undefined} aria-haspopup={sheetId ? 'dialog' : undefined} aria-pressed={t.id === 'tests' ? testsOpen : t.id === 'treat' ? treatOpen : undefined}
            onClick={() => {
              // (Treat, Tests and Layers belong to the lobule and the anatomy: from the sinusoid view they first go back out to the lobule, and open there: 2D wireThumbBar outOfSin)
              if (view === 'sinusoid' && (t.id === 'treat' || t.id === 'tests' || t.id === 'layers')) goToView('lobule');
              if (sheetId) useShell.getState().toggle(sheetId); else runFeature(FEATURE[t.id], t.label);
            }}>
            <I n={ICON[t.id]} /><span className="nb-l">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

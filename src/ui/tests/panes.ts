// The nine instruments of the Tests card, with the 2D app's names and the order of its tabs (dock-words.copied.js: dock.js SHORT, TINY, ORDER; the full names are the
// inventory's `tests.panes`). Pressure (along the circuit) and Over time share one tab with a small switch inside it; 'scope' is a pane of its own so a slide can reach it.
import { UI } from '../strings.generated.ts';
import { SHORT, TINY, ORDER } from './copied/dock-words.copied.js';

export type PaneId = 'profile' | 'scope' | 'hvpg' | 'doppler' | 'endoscopy' | 'abdomen' | 'fibroscan' | 'readouts' | 'trials';
export const PANE_ORDER = ORDER as PaneId[];
/** pane id → { id, name } (the full names: "Pressure", "Pressure over time", "IR (HVPG)"…) */
export const PANES = Object.fromEntries(UI.testsPanes.map((p) => [p.id, { id: p.id as PaneId, name: p.name as string }])) as Record<PaneId, { id: PaneId; name: string }>;
/** the tabs, left to right: every pane but Over time, which lives under Pressure */
export const TABS: PaneId[] = PANE_ORDER.filter((id) => id !== 'scope');
export const tabOf = (id: PaneId): PaneId => (id === 'scope' ? 'profile' : id);
export const shortName = (id: PaneId): string => (SHORT as Record<string, string>)[id] ?? PANES[id].name;
/** the name a narrow card uses so every tab fits without scrolling */
export const tinyName = (id: PaneId): string => (TINY as Record<string, string>)[id] ?? shortName(id);

/** The instruments that are built in the 3D app (their tab shows the pane); the others say "not in the 3D app yet". tests/b11-parity.test.ts keeps this equal to what TestsLayer renders. */
export const BUILT_PANES: readonly PaneId[] = [
  'readouts', 'scope', 'abdomen', 'trials',
  // (one line per instrument, each its own thread's: a thread adds its own)
  // profile
  // hvpg
  // doppler
  // endoscopy
  // fibroscan
];

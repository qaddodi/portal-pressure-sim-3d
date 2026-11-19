// The History control of the top bar, the play bar and Settings: open or close the panel (2D: openHistory / closeHistory; the play bar's clock opens the same one).
import { registerFeature } from '../shell/features.ts';
import { useShell } from '../shell/store.ts';
export function startHistory(): () => void { return registerFeature('history', () => useShell.getState().toggle('history')); }

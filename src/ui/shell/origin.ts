// Where a sheet was opened from, in words and in one door (store.ts goFrom / returnBack): the chart's "What happened" goes to History, History's "See as a chart" goes to the chart,
// and each one's Back returns to the other (or closes, when it was opened on its own). One rule for the chart, History (a panel beside the figure, or Settings' page) and every device.
import { useShell, type Origin, type Sheet } from './store.ts';
import { BT } from '../bigtime/words.ts';
import { HIST } from '../history/words.ts';

/** What the sheet was opened from is called: the chart "Over time", History "History"; null when it was opened on its own. */
export function originName(from: Origin | null): string | null {
  if (!from) return null;
  return from.sheet === 'timeline' ? BT.title : from.sheet === 'history' || from.page === 'history' ? HIST.title : null;
}

/** The origin of the sheet that is up now (for a sheet's Back and its label), or null when it was opened on its own. */
export function useOrigin(sheet: Exclude<Sheet, null>): Origin | null {
  return useShell((s) => (s.cameFrom && s.cameFrom.to === sheet ? s.cameFrom.from : null));
}

/** Where History is now: the panel beside the figure, or the page Settings pushed (the only two places its list is drawn). */
export function historyHere(): Origin {
  const sheet = useShell.getState().sheet;
  return sheet === 'settings' ? { sheet: 'settings', page: 'history' } : { sheet: sheet ?? 'history' };
}

/** History's "See as a chart": the chart, remembering History; when History was itself opened from the chart it simply goes back there (no second chart on top of the first). */
export function openChartFromHistory(): void {
  const { cameFrom, sheet } = useShell.getState();
  if (cameFrom && cameFrom.to === sheet && cameFrom.from.sheet === 'timeline') useShell.getState().returnBack();
  else useShell.getState().goFrom(historyHere(), 'timeline');
}

/** The chart's "What happened" on a phone: History, the page Settings pushes in from the right, remembering the chart. */
export function openHistoryFromChart(): void { useShell.getState().goFrom({ sheet: 'timeline' }, 'settings', 'history'); }

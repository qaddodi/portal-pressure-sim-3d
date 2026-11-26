// What a Look closer card opens in (types.ts LookPane): the state a stop's look names, set through each pane's own store, so the card shows what its label says: the stent's own Doppler and its
// pressures on the TIPS tab, the days of a pregnancy, the HVPG already measuring. The one place that applies it, for every course and every pane; a pane's state a look does not name is left as it is.
// The Doppler's vessel is the model's (the engine's probe message), so it is set here at once; the IR and Over time stores belong to lazy panes, so they are loaded when a look needs them.
import { setDopplerProbe } from '../tests/doppler/probe-state.ts';
import { goToView } from '../shell/view-actions.ts';
import { VIEWS, type ViewId } from '../shell/views.ts';
import { useTests } from '../tests/store.ts';
import { PANES, type PaneId } from '../tests/panes.ts';
import type { CaseLook, LookPane } from './types.ts';

/** Set the pane state a look names. Resolves once it is set (the pane need not be mounted: the stores keep it, the IR pane starts the measurement as it comes up). */
export async function applyLookPane(pane: LookPane | undefined): Promise<void> {
  if (!pane) return;
  if (pane.probe) setDopplerProbe(pane.probe);
  if (pane.range) { const { useTrace } = await import('../tests/trace/store.ts'); useTrace.getState().setRange(pane.range); }
  if (pane.stent || pane.measure) {
    const { useIr } = await import('../tests/ir/store.ts');
    if (pane.stent) useIr.getState().openStent(pane.stent);
    else useIr.getState().askMeasure();
  }
  if (pane.watch) { const { watchProcedure } = await import('./watch.ts'); watchProcedure(pane.watch); }
}

/** The Tests cards that show nothing until their measurement is run (the HVPG's tracing waits for the catheter): a look that opens one runs it,
 *  unless the look names another tab of the card (the stent's own). Decided by the card, not left to each look's data, so a look written later
 *  without `pane` cannot open an empty tracing (Mohammad, 26 Nov, capture 0bc14020 item 15). */
export const RUNS_ON_OPEN: readonly PaneId[] = ['hvpg'];
/** The cards that show their reading the moment they open (a live trace, a probe on the patient, the scope, a table), so opening them is the whole test.
 *  Every built card is in exactly one of the two lists (tests/case-look-pane.test.ts): a new instrument has to say which it is.
 *  The treatments on these cards (banding, paracentesis, the Watch row) change the patient and stay behind their own buttons. */
export const LIVE_ON_OPEN: readonly PaneId[] = ['profile', 'scope', 'doppler', 'endoscopy', 'abdomen', 'fibroscan', 'readouts', 'trials'];
/** The state a look opens its card in: what it names, and the measurement where the card needs one run. */
export const paneOf = (l: CaseLook): LookPane | undefined =>
  RUNS_ON_OPEN.includes(l.tool as PaneId) && !l.pane?.stent ? { ...l.pane, measure: true } : l.pane;

const isView = (t: string): t is ViewId => VIEWS.some((v) => v.id === t);
/** Open what a Look closer row names: a view, or a Tests card by its tool's id, in the state the look names. */
export function openLook(l: CaseLook): void {
  if (isView(l.tool)) goToView(l.tool);
  else if (l.tool in PANES) useTests.getState().show(l.tool as PaneId);
  else return;
  void applyLookPane(paneOf(l));
}

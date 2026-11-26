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
}

const isView = (t: string): t is ViewId => VIEWS.some((v) => v.id === t);
/** Open what a Look closer row names: a view, or a Tests card by its tool's id, in the state the look names. */
export function openLook(l: CaseLook): void {
  if (isView(l.tool)) { goToView(l.tool); return; }
  if (!(l.tool in PANES)) return;
  useTests.getState().show(l.tool as PaneId);
  void applyLookPane(l.pane);
}

// What an order or a card's button brings to the Tests card besides the pane it opens (2D actions.js, palette.js, main.js): a vessel card's Doppler button puts the probe on
// that vessel before the Doppler opens; the search's "Doppler of the portal vein" puts it on the portal trunk. (Ascites is opened by the selection itself: action/selection.ts.
// "Test TIPS in IR" names its stent here before the card is put away: handOverStent / takeStent.)
import { useSelection } from '../action/selection.ts';
import { normalizeSel } from '../action/cards.ts';
import { setDopplerProbe } from './doppler/probe-state.ts';
import { clock } from '../../clock/frame.ts';

/** The vessel a card's Doppler button samples: the card's own (a micro-vessel or a station stands for the structure its card is of), or null when no vessel is selected. */
export function vesselSelected(): string | null {
  const n = normalizeSel(useSelection.getState().sel);
  return n?.type === 'edge' ? n.id : null;
}
/** Put the Doppler's probe on the selected vessel (2D `CTX.probe(id)`), before the card is put away. */
export function probeSelected(probe: (id: string) => void = setDopplerProbe): void {
  const id = vesselSelected();
  if (id) probe(id);
}

/** The stent a card's "Test TIPS in IR" is for, kept from the moment of the tap until the IR pane (loaded after the first paint, so it may mount a moment later) reads it. The card closes with
 *  the tap (shell/features.ts LEAVES_CARD), so the pane cannot read the selection when it mounts: the Tests card's handler hands the stent over while the card is still selected. */
let stentFor: { id: string; at: number } | null = null;
const STENT_HAND_OVER_MS = 5000;
export function handOverStent(): void { const id = vesselSelected(); stentFor = id ? { id, at: clock.now() } : null; }
/** The handed-over stent (once), or null when none was handed over or it has gone stale. */
export function takeStent(): string | null {
  const s = stentFor;
  stentFor = null;
  return s && clock.now() - s.at < STENT_HAND_OVER_MS ? s.id : null;
}

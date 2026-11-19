// What an order or a card's button brings to the Tests card besides the pane it opens (2D actions.js, palette.js, main.js): a vessel card's Doppler button puts the probe on
// that vessel before the Doppler opens; the search's "Doppler of the portal vein" puts it on the portal trunk. (Ascites is opened by the selection itself: action/selection.ts.
// "Test TIPS in IR" is read by the IR pane from the stent's card, which stays selected.)
import { useSelection } from '../action/selection.ts';
import { normalizeSel } from '../action/cards.ts';
import { setDopplerProbe } from './doppler/probe-state.ts';

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

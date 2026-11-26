// A control in the shell whose work belongs to a later batch (Treat, Tests, History, Compare, the Circuit and lobule views…). The control is on the screen with the
// 2D app's words; this table says whether anything is behind it. A batch that builds the feature calls `registerFeature` and the control starts working; until
// then a tap says so, once, in a line (never nothing, never a dead button). The parity score counts a control as present either way and as wired only when a handler is here.
import { useShell } from './store.ts';
import { notYet } from './words.ts';
import { selectStructure } from '../action/selection.ts';

export type FeatureId =
  | 'treat' | 'tests' | 'history' | 'compare' | 'undo' | 'redo' | 'advanced' | 'feedback' | 'lens' | 'blood' | 'rotate' | 'zoom-in' | 'zoom-out'
  | 'doppler' | 'endoscopy' | 'fibroscan' | 'ir' | 'shunt' | 'view:circuit' | 'view:lobule' | 'view:sinusoid' | 'guide-about' | 'guide-references' | 'guide-privacy' | 'figure-detail';

const handlers = new Map<FeatureId, (o?: { hold?: boolean }) => void>();
/** A batch hands over the work behind a control. Returns the remover. */
export function registerFeature(id: FeatureId, run: (o?: { hold?: boolean }) => void): () => void { handlers.set(id, run); return () => { if (handlers.get(id) === run) handlers.delete(id); }; }
export const hasFeature = (id: FeatureId): boolean => handlers.has(id);

/** The features that carry a person from a vessel or organ card to an instrument in the Tests card (Doppler, Endoscope, FibroScan, IR). One rule for all of them, however they are reached
 *  (a card's button, the stent line's "Open in Tests, IR", the Details face): the card is left, so it closes (owner, 26 Nov: "when I hit IR from the TIPS card, the card should close").
 *  The shunt keeps its own rule (it puts the card away only when it finds a target) and the views drop a card their picture cannot show (selection.ts dropSelectionForView). */
export const LEAVES_CARD: ReadonlySet<FeatureId> = new Set<FeatureId>(['doppler', 'endoscopy', 'fibroscan', 'ir']);

/** Run a control's work, or say that it is not in the 3D app yet.
 *  A feature that leaves the card closes it after its handler has read what it needs from the selection (the Doppler's vessel, the IR's stent). */
export function runFeature(id: FeatureId, name: string, o?: { hold?: boolean }): boolean {
  const h = handlers.get(id);
  if (h) { h(o); if (LEAVES_CARD.has(id)) selectStructure(null); return true; }
  useShell.getState().say(notYet(name));
  return false;
}

// Starting and leaving a talk. The talk's own UI (src/ui/DeckUi.tsx) opens its deck when it mounts; leaving puts the deck store back to free play.
// A talk is a built-in deck (src/decks/registry.ts) or one of your own (a script or an imported deck kept on this device, ui/deck/script-library.ts).
import { useDeck } from '../../state/deck.ts';
import { useShell } from './store.ts';
import { useUi } from '../ui-store.ts';
import { cel } from '../../scene/api.ts';
import { deckOf } from '../deck/deck-of.ts';
import { captureSaved, restoreSaved, type Saved } from '../talk/deck-model.ts';

let saved: Saved | null = null;

/** Opens a talk at a slide (the 2D slide number minus one: 0 is the outline). Returns false, and opens nothing, when there is no such talk. */
export function startTalk(deckId: string, at = 0): boolean {
  const deck = deckOf(deckId);
  if (!deck) return false;
  if (useShell.getState().mode !== 'deck') saved = captureSaved();   // (starting another talk while one runs keeps the patient from before the first)
  cel.setView('body');
  useUi.getState().openDeck(deck, at);
  useShell.setState({ mode: 'deck', view: 'anatomic', sheet: null, dialog: null });
  return true;
}
export function leaveTalk(): void {
  useDeck.getState().close(); useUi.getState().openDeck(null); useShell.setState({ mode: 'free', sheet: null });
  const s = saved; saved = null;
  if (s) void restoreSaved(s);
}

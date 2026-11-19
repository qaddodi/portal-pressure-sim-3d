// Starting and leaving a talk. The talk's own UI (src/ui/DeckUi.tsx) opens its deck when it mounts; leaving puts the deck store back to free play.
// A talk is a built-in deck (src/decks/registry.ts) or one of your own (a script or an imported deck kept on this device, ui/deck/script-library.ts).
import { useDeck } from '../../state/deck.ts';
import { useShell } from './store.ts';
import { useUi } from '../ui-store.ts';
import { cel } from '../../scene/api.ts';
import { deckOf, isAlias, DECK_ALIAS } from '../deck/deck-of.ts';
import { isBuiltin, loadBuiltin } from '../../decks/registry.ts';
import { captureSaved, restoreSaved, type Saved } from '../talk/deck-model.ts';
import { loadToolCard, toolCardReady } from '../talk/tool-card-load.ts';

let saved: Saved | null = null;
let chartsAsked = false;

/** Opens a talk at a slide (the 2D slide number minus one: 0 is the outline). Returns false, and opens nothing, when there is no such talk. */
export function startTalk(deckId: string, at = 0): boolean {
  const deck = deckOf(deckId);
  if (!deck) {
    // a built-in talk whose data is read when it opens (its own small chunk): open it as soon as it is in
    const id = isAlias(deckId) ? DECK_ALIAS[deckId]! : deckId;
    if (!isBuiltin(id)) return false;
    void loadBuiltin(id).then((d) => { if (d) startTalk(deckId, at); });
    return true;
  }
  // a talk's charts are their own chunk (ui/talk/ToolCard.tsx): the talk opens once they are in, so no slide's card shows before its chart can draw
  // (asked once: where they cannot be fetched the talk still opens, and a card asks again when it mounts)
  if (!toolCardReady() && !chartsAsked) { chartsAsked = true; void loadToolCard().then(() => startTalk(deckId, at)); return true; }
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

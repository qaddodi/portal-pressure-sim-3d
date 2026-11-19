// Starting and leaving a talk. The talk's own UI (src/ui/DeckUi.tsx) opens its deck when it mounts; leaving puts the deck store back to free play.
// A talk is a built-in deck (src/decks/registry.ts) or one of your own (a script or an imported deck kept on this device, ui/deck/script-library.ts).
import { useDeck } from '../../state/deck.ts';
import { useShell } from './store.ts';
import { useUi } from '../ui-store.ts';
import { cel } from '../../scene/api.ts';
import { openById, cancelOpen } from '../deck/deck-of.ts';
import { W } from '../deck/words.ts';
import type { Deck } from '../../decks/schema.ts';
import { captureSaved, restoreSaved, type Saved } from '../talk/deck-model.ts';
import { loadToolCard, toolCardReady } from '../talk/tool-card-load.ts';

let saved: Saved | null = null;
let chartsAsked = false;

/** Opens a talk at a slide (the 2D slide number minus one: 0 is the outline). Returns false, and opens nothing, when there is no such talk. A built-in talk whose data is read
 *  when it opens (its own small chunk) opens as soon as it is in: `openById` is the one path, for the menu, the search, a link on a cold load and the debug page. */
export function startTalk(deckId: string, at = 0): boolean {
  return openById(deckId, at, { open: show, fail: () => useShell.getState().say(W.notFound, 'bad') });
}
function show(deck: Deck, at: number): void {
  // a talk's charts are their own chunk (ui/talk/ToolCard.tsx): the talk opens once they are in, so no slide's card shows before its chart can draw
  // (asked once: where they cannot be fetched the talk still opens, and a card asks again when it mounts)
  if (!toolCardReady() && !chartsAsked) { chartsAsked = true; void loadToolCard().then(() => show(deck, at)); return; }
  if (useShell.getState().mode !== 'deck') saved = captureSaved();   // (starting another talk while one runs keeps the patient from before the first)
  cel.setView('body');
  useUi.getState().openDeck(deck, at);
  useShell.setState({ mode: 'deck', view: 'anatomic', sheet: null, dialog: null });
}
export function leaveTalk(): void {
  cancelOpen();   // (a talk still being read does not open over what the person went to instead)
  useDeck.getState().close(); useUi.getState().openDeck(null); useShell.setState({ mode: 'free', sheet: null });
  const s = saved; saved = null;
  if (s) void restoreSaved(s);
}

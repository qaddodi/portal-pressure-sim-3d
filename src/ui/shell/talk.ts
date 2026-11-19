// Starting and leaving a talk. The talk's own UI (src/ui/DeckUi.tsx) opens its deck when it mounts; leaving puts the deck store back to free play.
import { useDeck } from '../../state/deck.ts';
import { useShell } from './store.ts';

export function startTalk(_deckId: string): void { useShell.setState({ mode: 'deck', sheet: null, dialog: null }); }
export function leaveTalk(): void { useDeck.getState().close(); useShell.setState({ mode: 'free', sheet: null }); }

// Starting and leaving a talk. The talk's own UI (src/ui/DeckUi.tsx) opens its deck when it mounts; leaving puts the deck store back to free play.
import { useDeck } from '../../state/deck.ts';
import { useShell } from './store.ts';
import { cel } from '../../scene/api.ts';

/** A talk stands on the body (its own camera shots take over); the lobule and sinusoid views are the talk's to ask for. */
export function startTalk(_deckId: string): void { cel.setView('body'); useShell.setState({ mode: 'deck', view: 'anatomic', sheet: null, dialog: null }); }
export function leaveTalk(): void { useDeck.getState().close(); useShell.setState({ mode: 'free', sheet: null }); }

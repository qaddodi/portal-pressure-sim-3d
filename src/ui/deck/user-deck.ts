// A talk of your own as a deck: a script (a patient and its settings per step) or an imported deck file (the 2D deck format), read as data and never run. It is played by the SAME path as a
// built-in deck (decks/author.ts checks it field by field, hp/deck.ts toDeck plays it), so a slide of yours can use every field a built-in slide can: its figure's camera and lens, its data card,
// its tools and procedures, its patient and its numbers. What the app cannot play comes back as `notices`, in plain words, never dropped quietly.
import type { Deck } from '../../decks/schema.ts';
import { authorDeck, safeLine } from '../../decks/author.ts';
import { toDeck } from '../../decks/hp/deck.ts';
import type { Script, ScriptStep } from './script-library.ts';

export { safeLine };

/** A script's step as the slide object the deck format writes. */
const stepSlide = (st: ScriptStep, i: number, title: string): Record<string, unknown> => ({ ...st, id: `step${i + 1}`, kicker: st.kicker || title, title: st.title || 'Step', line: st.line || '', notes: st.notes || (st as Record<string, unknown>).tell || '' });

/** The deck a script or an imported deck plays as. The id and title are the script's; its level is "yours". `notices` says what was left out and why (empty when nothing was). */
export function userDeck(s: Script): Deck & { notices: string[] } {
  const src = s.deck ?? { slides: (s.steps ?? []).map((st, i) => stepSlide(st, i, s.title)) };
  const { deck, notices } = authorDeck(s.id, s.title, src as Record<string, unknown>, s.summary ?? '');
  return { ...toDeck(deck), mine: true as const, notices };
}

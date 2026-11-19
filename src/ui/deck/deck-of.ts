// A talk by id: a built-in deck (src/decks/registry.ts; an old id the 2D app renamed opens the deck that took its slides), else one of your own.
import type { Deck } from '../../decks/schema.ts';
import { builtinDeck } from '../../decks/registry.ts';
import { readMine } from './script-library.ts';
import { userDeck } from './user-deck.ts';

/** Old links and bookmarks: a talk merged into another, or renamed, still opens by its old id, at its first slide (decks.js DECK_ALIAS). */
export const DECK_ALIAS: Readonly<Record<string, string>> = { 'where-block': 'sites', bleed: 'treatment', 'refractory-bleed': 'variceal-bleed', 'blood-volume': 'hyperdynamic', 'beta-blockers': 'treatment', 'read-doppler': 'doppler', 'pvt-cirrhosis': 'prehepatic', 'right-heart': 'outflow', 'tips-journey': 'shunts', 'first-visit': 'stiffness', 'one-year': 'ten-years', tap: 'ascites', spleen: 'stiffness', 'transplant-doppler': 'doppler' };
export const isAlias = (id: string) => Object.hasOwn(DECK_ALIAS, id);

export function deckOf(id: string): Deck | null {
  const b = builtinDeck(isAlias(id) ? DECK_ALIAS[id] : id);
  if (b) return b;
  const mine = readMine().find((x) => x.id === id);
  return mine ? userDeck(mine) : null;
}

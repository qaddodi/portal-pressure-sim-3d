// The talks the 3D app can play. A batch that ports a deck (B13) adds one `registerDeck` line below; everything that lists or opens a talk
// (the Present menu, search, deep links, the handout, the presenter's window) reads this table and nothing else.
// Your own talks (a script built in the library, an imported deck) are not here: they are kept on the device (ui/deck/script-library.ts) and found by `deckOf`.

import type { Deck } from './schema.ts';
import { HVPG_DECK } from './hvpg.ts';

const decks = new Map<string, Deck>();
export function registerDeck(d: Deck): void { decks.set(d.id, d); }

registerDeck(HVPG_DECK);

/** A built-in talk by id (an old id the 2D app renamed opens its successor: `DECK_ALIAS` in ui/menu/library.ts). */
export const builtinDeck = (id: string): Deck | null => decks.get(id) ?? null;
export const builtinDecks = (): Deck[] => [...decks.values()];
export const isBuiltin = (id: string): boolean => decks.has(id);

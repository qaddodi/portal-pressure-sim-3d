// The talks the 3D app can play. A batch that ports a deck (B13) adds one `registerDeck` line below; everything that lists or opens a talk
// (the Present menu, search, deep links, the handout, the presenter's window) reads this table and nothing else.
// Your own talks (a script built in the library, an imported deck) are not here: they are kept on the device (ui/deck/script-library.ts) and found by `deckOf`.

import type { Deck } from './schema.ts';
import { HVPG_DECK } from './hvpg.ts';
import { registerHpDecks } from './hp/register.ts';

const decks = new Map<string, Deck>();
export function registerDeck(d: Deck): void { decks.set(d.id, d); }

/** A talk whose data is loaded when it is opened (its own small chunk, so the menu never pays for decks nobody opens): the menu needs only its id and slide count. */
export interface LazyDeck { id: string; slides: number; load(): Promise<Deck> }
const lazy = new Map<string, LazyDeck>();
export function registerLazyDeck(d: LazyDeck): void { lazy.set(d.id, d); }
export const lazyDecks = (): LazyDeck[] => [...lazy.values()];
/** A built-in talk, loaded now if it is a lazy one (null for an id that is not built in). */
export async function loadBuiltin(id: string): Promise<Deck | null> {
  const have = decks.get(id);
  if (have) return have;
  const l = lazy.get(id);
  if (!l) return null;
  const d = await l.load();
  registerDeck(d);
  return d;
}

registerDeck(HVPG_DECK);
registerHpDecks(registerLazyDeck);

/** A built-in talk by id (an old id the 2D app renamed opens its successor: `DECK_ALIAS` in ui/menu/library.ts). */
export const builtinDeck = (id: string): Deck | null => decks.get(id) ?? null;
export const builtinDecks = (): Deck[] => [...decks.values()];
export const isBuiltin = (id: string): boolean => decks.has(id) || lazy.has(id);

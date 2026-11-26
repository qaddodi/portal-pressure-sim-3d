// The talks the 3D app can play. A batch that ports a deck (B13) adds one `registerDeck` line below; everything that lists or opens a talk
// (the Present menu, search, deep links, the handout, the presenter's window) reads this table and nothing else.
// Your own talks (a script built in the library, an imported deck) are not here: they are kept on the device (ui/deck/script-library.ts) and found by `deckOf`.

import type { Deck } from './schema.ts';
import { HVPG_DECK } from './hvpg.ts';
import { registerHpDecks } from './hp/register.ts';
import { registerAllDecks } from './all.ts';

const decks = new Map<string, Deck>();
/** The talks' order: the order they were REGISTERED (the table below), whatever order their data arrived in. A lazy talk joins `decks` when it finishes loading, and loads
 *  race, so a Map's own order was
 *  the order the network answered in: the same build listed Shunts before Two lesions on a Mac and after it on an iPhone (capture 2274649a, folders 35 and 36 swapped).
 *  Anything numbered by "the talk's place"
 *  (capture folders, the catalog, the audit) reads this order, so it is the same on every device and every run. */
const order: string[] = [];
const remember = (id: string): void => { if (!order.includes(id)) order.push(id); };
export function registerDeck(d: Deck): void { remember(d.id); decks.set(d.id, d); }

/** A talk whose data is loaded when it is opened (its own small chunk, so the menu never pays for decks nobody opens): the menu needs only its id and slide count. */
export interface LazyDeck { id: string; slides: number; load(): Promise<Deck> }
const lazy = new Map<string, LazyDeck>();
export function registerLazyDeck(d: LazyDeck): void { remember(d.id); lazy.set(d.id, d); }
/** Every built-in talk's id in the one registered order, loaded or not. */
export const deckOrder = (): string[] => [...order];
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
registerAllDecks(registerLazyDeck);   // (A to G and R to W: every talk of the 2D menu opens by its id)

/** A built-in talk by id (an old id the 2D app renamed opens its successor: `DECK_ALIAS` in ui/menu/library.ts). */
export const builtinDeck = (id: string): Deck | null => decks.get(id) ?? null;
/** The loaded talks, in the registered order (`deckOrder`), never the order they finished loading in. */
export const builtinDecks = (): Deck[] => order.flatMap((id) => { const d = decks.get(id); return d ? [d] : []; });
export const isBuiltin = (id: string): boolean => decks.has(id) || lazy.has(id);

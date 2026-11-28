// The talks the 3D app can play. A batch that ports a deck (B13) adds one `registerDeck` line below; everything that lists or opens a talk
// (the Present menu, search, deep links, the handout, the presenter's window) reads this table and nothing else.
// Your own talks (a script built in the library, an imported deck) are not here: they are kept on the device (ui/deck/script-library.ts) and found by `deckOf`.

import type { Deck } from './schema.ts';
import { HVPG_DECK } from './hvpg.ts';
import { prepareHvpg } from './hvpg-baked.ts';
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
/** A built-in talk that is in memory from the start still has to be made ready before it opens when it has baked chart data to lay in (`prepare`): the same step every lazy talk takes in its `load`
 *  (its file fetched and matched with its words). Without it the talk's tables and charts are worked out live after the card is measured,
 *  and a table card grew when its numbers arrived (the HVPG talk's summary, iPhone, 27 Nov). */
const prepares = new Map<string, () => Promise<void>>(), prepared = new Map<string, Promise<void>>(), preparedDone = new Set<string>();
export function registerDeck(d: Deck, prepare?: () => Promise<void>): void { remember(d.id); decks.set(d.id, d); if (prepare) prepares.set(d.id, prepare); }
/** Whether a built-in talk needs no more making ready (it has nothing to lay in, or it has been laid in). */
export const deckIsReady = (id: string): boolean => !prepares.has(id) || preparedDone.has(id);
/** Resolves when the talk is ready to open; never rejects (a file that did not come only means the live path, as for a lazy talk). */
export function deckReady(id: string): Promise<void> {
  const run = prepares.get(id);
  if (!run) return Promise.resolve();
  let p = prepared.get(id);
  if (!p) { p = run().catch(() => undefined).then(() => { preparedDone.add(id); }); prepared.set(id, p); }
  return p;
}

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

registerDeck(HVPG_DECK, prepareHvpg);
registerHpDecks(registerLazyDeck);
registerAllDecks(registerLazyDeck);   // (A to G and R to W: every talk of the 2D menu opens by its id)

/** A built-in talk by id (an old id the 2D app renamed opens its successor: `DECK_ALIAS` in ui/menu/library.ts). */
export const builtinDeck = (id: string): Deck | null => decks.get(id) ?? null;
/** The loaded talks, in the registered order (`deckOrder`), never the order they finished loading in. */
export const builtinDecks = (): Deck[] => order.flatMap((id) => { const d = decks.get(id); return d ? [d] : []; });
export const isBuiltin = (id: string): boolean => decks.has(id) || lazy.has(id);

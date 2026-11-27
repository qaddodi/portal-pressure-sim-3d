// A talk by id: a built-in deck (src/decks/registry.ts; an old id the 2D app renamed opens the deck that took its slides), else one of your own.
// Most built-in talks are read when they are opened (registry.ts `registerLazyDeck`), so there are two questions and they have different answers before a talk is first opened:
//   knownTalk(id)   is there such a talk (asked at once: a link, the menu, the search);
//   loadDeck(id)    the talk itself, read now if it has not been (asked by whatever opens, prints or lists it).
// `deckOf` answers only for a talk already read. Asking it whether a talk exists was the bug that sent a cold ?script=<id> link to "not here yet" for every talk but the first.
import type { Deck } from '../../decks/schema.ts';
import { builtinDeck, isBuiltin, loadBuiltin, deckIsReady, deckReady } from '../../decks/registry.ts';
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

/** The id a talk is kept under: an old id's successor, else itself. */
export const talkId = (id: string): string => (isAlias(id) ? DECK_ALIAS[id]! : id);
/** Whether there is a talk of this id, read or not yet: a built-in one (an old id counts) or one of your own. */
export const knownTalk = (id: string): boolean => typeof id === 'string' && !!id && (isBuiltin(talkId(id)) || readMine().some((x) => x.id === id));
/** The talk, read now if it is one that is read when opened; null when there is none. Rejects when its file could not be fetched. */
export async function loadDeck(id: string): Promise<Deck | null> {
  const have = deckOf(id);
  if (have) { await deckReady(talkId(id)); return have; }
  return isBuiltin(talkId(id)) ? ((await loadBuiltin(talkId(id))), deckOf(id)) : null;
}
/** The stop a talk of `stops` stops opens on when asked for `at` (the 2D slide number minus one; 0 is the outline): an old id opens its successor at the start (the number it was
 *  linked with means nothing there), a number past the end the last stop, anything else that is no number the start (2D presenter-start.js `want0`). */
export function landOn(id: string, at: unknown, stops: number): number {
  const n = isAlias(id) ? 0 : Math.max(0, Math.trunc(Number(at)) || 0);
  return Math.max(0, Math.min(n, stops - 1));
}

export interface OpenFx { /** show the talk at this stop */ open(d: Deck, at: number): void; /** the talk could not be read (offline, a stale page) */ fail(): void }
let asked = 0;
/** A newer open, or leaving, overtakes one still being read (2D startGen). */
export const cancelOpen = (): void => { asked++; };
/** THE way a talk is opened by id, read or not: false at once when there is no such talk; otherwise it opens now, or as soon as it is read unless something newer was asked meanwhile.
 *  `at` is passed on as asked (the talk's own stop count clamps it where it is shown: `landOn`), except for an old id, which opens at the start. */
export function openById(id: string, at: number, fx: OpenFx): boolean {
  if (!knownTalk(id)) return false;
  const mine = ++asked, want = isAlias(id) ? 0 : at;
  const have = deckOf(id);
  if (have && deckIsReady(talkId(id))) { fx.open(have, want); return true; }
  loadDeck(id).then((d) => { if (mine !== asked) return; if (d) fx.open(d, want); else fx.fail(); }, () => { if (mine === asked) fx.fail(); });
  return true;
}

// The keys of the baked chart data (Plan 33). The file is made in node at build time from the pinned engine and the decks as they are; the page uses a file only when its key is the page's own key and a deck's entry only
// when the deck's words are the ones it was made from, so a re-synced engine or an edited deck can never serve numbers worked out for another one (a miss falls through to the live sweep as before).
import pinned from '../../../engine/PINNED.json' with { type: 'json' };
import { WAVE_SECS } from '../../talk/table-wave.ts';

/** FNV-1a over a string, two lanes, as a short hex word. */
export function fnv(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0; h2 ^= h2 >>> 13; }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

/** What the numbers depend on besides the decks: the pinned engine (its commit and the hash of every file) and the format of the file. */
export const BAKE_VERSION = 3;   // (2: a summary table's Doppler traces, `waves`; 3: a summary table's own rows take the slide's `relax`)
export const engineKey = (): string => fnv(JSON.stringify([BAKE_VERSION, pinned.engine, pinned.files, WAVE_SECS]));

const sigs = new WeakMap<object, string>();
/** A deck's signature: every slide as written (the steps, the tools, the cohorts, the rows). A deck whose words changed has another one. */
export function deckSig(deck: { slides: readonly unknown[] }): string {
  let s = sigs.get(deck);
  if (!s) { s = fnv(JSON.stringify(deck.slides)); sigs.set(deck, s); }
  return s;
}

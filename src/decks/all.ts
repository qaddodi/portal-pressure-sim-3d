// Every built-in talk by id: the 14 of A to G (src/decks/ag) and the 16 of R to W (src/decks/rw) join the 12 of H to P (src/decks/hp) in one registry, played by ONE path:
// a copied 2D deck -> hp/deck.ts `toDeck` (words, the slide's camera by hp/cams.ts, its view and lens, tiles and tables, the case, the check) with its numbers from the
// second engine's 'sequence' (hp/calc.ts, streamed per slide) printed by hp/link.ts. The ag and rw folders keep their own derived tables (needs, hooks, parity rows); they no longer
// play anything of their own. The menu knows an id and a slide count; the deck's words are a chunk read when the talk opens.
import type { Deck } from './schema.ts';
import { AG_IDS, loadAgDeck, type AgId } from './ag/index.ts';
import { RW_IDS, RW_LOADERS } from './rw/copied/index.ts';
import { toDeck } from './hp/deck.ts';
import { UI } from '../ui/strings.generated.ts';

/** How many slides a talk has (the 2D menu's count, without the title and the quick check). */
const slidesOf = (id: string): number => {
  const d = UI.decks.find((x) => x.id === id);
  if (!d) throw new Error(`the 2D menu has no talk "${id}"`);
  return (d as unknown as { slides: number }).slides;
};

type Register = (d: { id: string; slides: number; load(): Promise<Deck> }) => void;

export function registerAllDecks(register: Register): void {
  for (const id of AG_IDS) register({ id, slides: slidesOf(id), load: async () => toDeck((await loadAgDeck(id as AgId)) as never) });
  for (const id of RW_IDS) register({ id, slides: slidesOf(id), load: async () => toDeck((await RW_LOADERS[id]!()) as never) });
}

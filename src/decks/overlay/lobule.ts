// Across the lobule (charts/lobule) on the slides that teach the path across it (owner approved the mock, 27 Nov: instrument-cards-27nov/lobule-strip.png). The copy stays the 2D deck character
// for character; the card is laid on when a deck loads (decks/overlay.ts withOverlay), by "deck/slide", only on a slide with no card of its own, so laying it on twice changes nothing.
//
// The strip follows the lens the figure wears, which the slide's own compare buttons set (Inside the lobule 2: Oxygen | Pressure); `view` is what it shows under any other lens.
// Dual blood supply 3 (Origin | Oxygen) keeps the oxygen view under Origin: the slide is about the two bloods meeting in zone 1, and its notes say the portal blood still brings half
// the oxygen; a pressure strip there would be a third subject on a slide with two buttons. The two "Blood crosses the lobule" slides have no buttons and show the pressure view.
import type { CopiedDeck, CopiedSlide } from '../hp/types.ts';

/** The card's tool on each slide that carries it. */
export const LOBULE_SLIDES: Readonly<Record<string, { kind: 'lobule'; title: string; view: 'oxygen' | 'pressure' }>> = {
  'lobule/lobule': { kind: 'lobule', title: 'Across the lobule', view: 'pressure' },
  'lobule/zones': { kind: 'lobule', title: 'Across the lobule', view: 'pressure' },
  'two-inflows/meet': { kind: 'lobule', title: 'Across the lobule', view: 'oxygen' },
  'circulation/lobule': { kind: 'lobule', title: 'Across the lobule', view: 'pressure' },
};

/** A slide that already has a card of its own keeps it. */
const free = (s: CopiedSlide): boolean => !s.tool && !s.visual && !s.table && !s.lapse && !s.procedure && !(Array.isArray(s.tiles) && s.tiles.length);

/** The deck with the strip on its slides (a copy; the loaded module is never changed). A slide that is not there is left alone. */
export function amendLobule(deck: CopiedDeck): CopiedDeck {
  const mine = Object.entries(LOBULE_SLIDES).filter(([k]) => k.startsWith(`${deck.id}/`));
  if (!mine.length) return deck;
  const by = new Map(mine.map(([k, t]) => [k.slice(deck.id.length + 1), t] as const));
  return { ...deck, slides: deck.slides.map((s): CopiedSlide => (by.has(s.id) && free(s) ? ({ ...s, tool: { ...by.get(s.id)! } } as CopiedSlide) : s)) };
}

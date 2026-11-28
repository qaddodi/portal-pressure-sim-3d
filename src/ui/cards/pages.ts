// A card taller than its room splits into pages (it never shrinks its text and never scrolls). The split is by whole sentences, evenly, and a
// card asks for one more page only when the page on show does not fit. Pure rules here; CardLayer measures.

// (sentences, pageSpan and pageOf live in decks/overlay.ts, where the cut of a slide into slides is made, so the boot entry gains no file for them: tests/boot-entry.test.ts)
export { sentences, pageSpan, pageOf } from '../../decks/overlay.ts';

/** The most pages a card can have: the title card two (the talk, then its objectives) and the quick check one per question, the two cards that are not a slide's words. A slide's words never page
 *  (Mohammad, 28 Nov): the line, a case and a summary table that do not fit are cut into more slides (decks/overlay.ts amendSplitPages),
 *  so a slide's card is one size from its first frame to its last. */
export function maxPages(id: string, _line: string | undefined, items = 0): number {
  if (id === 'title') return 2;
  if (id === 'check') return Math.max(1, items);   // the quick check pages by whole questions (2D HVPG has four; a phone on its side holds two)
  return 1;
}

export const clampPage = (page: number | 'last', pages: number) => (page === 'last' ? pages - 1 : Math.max(0, Math.min(pages - 1, page)));

/** The page the layer has not measured yet (0-based), or undefined when every page of a card of `pages` pages has a height: the walk that makes every page of a card the tallest one's height before the card lands
 *  (CardLayer; a card never changes size on a page turn, Carvedilol 10). `got` holds the heights measured so far, by page. */
export function nextToMeasure(got: readonly (number | undefined)[] | undefined, pages: number): number | undefined {
  if (pages <= 1) return undefined;
  for (let i = 0; i < pages; i++) if (got?.[i] === undefined) return i;
  return undefined;
}
/** The height every page of a paging card takes: the tallest measured so far (0 when none, or when the card does not page). */
export function tallestPage(got: readonly (number | undefined)[] | undefined, pages: number): number {
  if (pages <= 1 || !got) return 0;
  return Math.max(0, ...got.filter((v): v is number => v !== undefined));
}

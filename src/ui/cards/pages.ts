// A card taller than its room splits into pages (it never shrinks its text and never scrolls). The split is by whole sentences, evenly, and a
// card asks for one more page only when the page on show does not fit. Pure rules here; CardLayer measures.

/** Sentences of a line's markup: a full stop, ? or ! then a capital, a { or a [ starts the next one. */
export function sentences(line: string): string[] {
  return line.split(/(?<=[.!?])\s+(?=[A-Z{\[])/).map((s) => s.trim()).filter(Boolean);
}

/** Where page `page` (0-based) of `n` pages starts and ends in a list of `len` whole items: shared out evenly, earlier pages taking the extra one. */
export function pageSpan(len: number, n: number, page: number): { from: number; to: number } {
  const pages = Math.max(1, Math.min(n, len));
  const per = Math.floor(len / pages), extra = len % pages;
  const from = page * per + Math.min(page, extra);
  return { from, to: from + per + (page < extra ? 1 : 0) };
}

/** Page `page` (0-based) of `n` pages: the sentences (or a table's rows) shared out evenly, earlier pages taking the extra one. */
export function pageOf<T>(list: readonly T[], n: number, page: number): T[] {
  const { from, to } = pageSpan(list.length, n, page);
  return list.slice(from, to);
}

/** The most pages a card can have: a line splits per sentence, a case does not (its words ease down to fit, as in 2D), the title card in two (the talk, then its objectives),
 *  the quick check per question, a summary table (the `visual` panel, `items` = its rows) by whole rows, the rest do not split. A visual with no rows to split (a chart) has one page. */
export function maxPages(id: string, line: string | undefined, items = 0): number {
  if (id === 'title') return 2;
  if (id === 'check') return Math.max(1, items);   // the quick check pages by whole questions (2D HVPG has four; a phone on its side holds two)
  // (a summary table too tall at the 12 px floor pages by whole rows, L2, owner 27 Nov; the layer asks for one more page only while the page on show does not fit)
  if (id === 'visual') return Math.max(1, items);
  if (id === 'case') return 1;   // 2D's case card never splits: its words ease down to fit (CaseCard)
  if (id === 'teach') return line ? sentences(line).length : 1;
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

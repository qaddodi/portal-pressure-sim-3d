// A card taller than its room splits into pages (it never shrinks its text and never scrolls). The split is by whole sentences, evenly, and a
// card asks for one more page only when the page on show does not fit. Pure rules here; CardLayer measures.

/** Sentences of a line's markup: a full stop, ? or ! then a capital, a { or a [ starts the next one. */
export function sentences(line: string): string[] {
  return line.split(/(?<=[.!?])\s+(?=[A-Z{\[])/).map((s) => s.trim()).filter(Boolean);
}

/** Page `page` (0-based) of `n` pages: the sentences shared out evenly, earlier pages taking the extra one. */
export function pageOf(list: string[], n: number, page: number): string[] {
  const pages = Math.max(1, Math.min(n, list.length));
  const per = Math.floor(list.length / pages), extra = list.length % pages;
  const from = page * per + Math.min(page, extra);
  return list.slice(from, from + per + (page < extra ? 1 : 0));
}

/** The most pages a card can have: a line splits per sentence, the title card in two (the talk, then its objectives), the quick check per question, the rest do not split. */
export function maxPages(id: string, line: string | undefined, items = 0): number {
  if (id === 'title') return 2;
  if (id === 'check') return Math.max(1, items);   // the quick check pages by whole questions (2D HVPG has four; a phone on its side holds two)
  if (id === 'teach' || id === 'case') return line ? sentences(line).length : 1;
  return 1;
}

export const clampPage = (page: number | 'last', pages: number) => (page === 'last' ? pages - 1 : Math.max(0, Math.min(pages - 1, page)));

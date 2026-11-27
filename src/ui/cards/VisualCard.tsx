import type { Deck, Slide } from '../../decks/schema.ts';
import { TeachingCard } from './TeachingCard.tsx';
import { TableCard } from './TableCard.tsx';
import { ToolCard } from '../talk/ToolCard.tsx';

/** A slide whose card is a summary table or a chart, as 2D draws it: one centred panel with the slide's title and line at its head and the table or chart under them (2D's `visual` slides).
 *  A table too tall at the 12 px floor pages by whole rows (`page` of `pages`, table-paging in pages.ts): the title, the line and the legend stand on every page, the rows turn, and the card
 *  says which page it is in the name tab's band, "1 of 2", as the words card does (`.pz-pageno`). */
export function VisualCard({ deck, slide, read, fp, page = 0, pages = 1 }: { deck: Deck; slide: Slide; fp?: Readonly<Record<string, number | null | undefined>>; read: (k: string, at?: string) => number | null | undefined; page?: number; pages?: number }) {
  const paged = !!slide.table && pages > 1;
  return (
    <>
      {paged ? <><span className="pz-pageno" aria-label={`Page ${page + 1} of ${pages}`}>{page + 1} of {pages}</span><span className="dk-tabgap" aria-hidden="true" /></> : null}
      <TeachingCard panel slide={slide} deck={deck} read={read} fp={fp} page={0} pages={1} />
      {slide.table ? <TableCard deck={deck} slide={slide} page={page} pages={pages} /> : <ToolCard deck={deck} slide={slide} />}
    </>
  );
}

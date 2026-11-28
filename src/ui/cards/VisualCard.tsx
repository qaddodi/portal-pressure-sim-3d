import type { Deck, Slide } from '../../decks/schema.ts';
import { TeachingCard } from './TeachingCard.tsx';
import { TableCard } from './TableCard.tsx';
import { ToolCard } from '../talk/ToolCard.tsx';

/** A slide whose card is a summary table or a chart, as 2D draws it: one centred panel with the slide's title and line at its head and the table or chart under them (2D's `visual` slides).
 *  A table too tall for its card is shared out over slides, never paged (`table.window`, decks/overlay.ts (amendSplitPages)): the title and the line stand on every one, the rows are the slide's share. */
type Read = (k: string, at?: string) => number | null | undefined;
export function VisualCard({ deck, slide, read, fp }: { deck: Deck; slide: Slide; fp?: Readonly<Record<string, number | null | undefined>>; read: Read }) {
  return (
    <>
      <TeachingCard panel slide={slide} deck={deck} read={read} fp={fp} page={0} pages={1} />
      {slide.table ? <TableCard deck={deck} slide={slide} /> : <ToolCard deck={deck} slide={slide} />}
    </>
  );
}

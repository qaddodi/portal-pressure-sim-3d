import type { Deck, Slide } from '../../decks/schema.ts';
import { TeachingCard } from './TeachingCard.tsx';
import { TableCard } from './TableCard.tsx';
import { ToolCard } from '../talk/ToolCard.tsx';

/** A slide whose card is a summary table or a chart, as 2D draws it: one centred panel with the slide's title and line at its head and the table or chart under them (2D's `visual` slides). */
export function VisualCard({ deck, slide, read }: { deck: Deck; slide: Slide; read: (k: string, at?: string) => number | null | undefined }) {
  return (
    <>
      <TeachingCard panel slide={slide} deck={deck} read={read} page={0} pages={1} />
      {slide.table ? <TableCard deck={deck} slide={slide} /> : <ToolCard deck={deck} slide={slide} />}
    </>
  );
}

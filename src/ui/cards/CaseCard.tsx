import type { Slide } from '../../decks/schema.ts';
import { sentences, pageOf } from './pages.ts';

/** The patient the slide starts with, on a card of its own before the slide's words (the 2D deck's "Case"). */
export function CaseCard({ slide, page, pages }: { slide: Slide; page: number; pages: number }) {
  const text = pageOf(sentences(slide.vignette ?? ''), pages, page).join(' ');
  return (
    <>
      <p className="dk-kicker">Case{pages > 1 ? <span className="dk-pageno"> · {page + 1} of {pages}</span> : null}</p>
      <p className="dk-body" style={{ marginTop: 10 }}>{text}</p>
    </>
  );
}

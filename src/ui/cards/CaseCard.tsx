import { caseOf, type Slide } from '../../decks/schema.ts';
import { sentences, pageOf } from './pages.ts';

/** The patient the slide starts with, on a card of its own before the slide's words (the 2D deck's "Case"). */
export function CaseCard({ slide, page, pages }: { slide: Slide; page: number; pages: number }) {
  const c = caseOf(slide) ?? { kicker: 'Case', text: '' };
  const text = pageOf(sentences(c.text), pages, page).join(' ');
  return (
    <>
      <div className="pz-kick" data-site="none">{c.kicker}{pages > 1 ? <span className="dk-pageno"> · {page + 1} of {pages}</span> : null}</div>
      <p className="pz-line pz-case-p">{text}</p>
      {slide.caseQ && page >= pages - 1 ? <p className="pz-line pz-case-p pz-case-q">{slide.caseQ}</p> : null}
    </>
  );
}

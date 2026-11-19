import type { ReadingKey, Slide } from '../../decks/schema.ts';
import { Line } from './Line.tsx';
import { sentences, pageOf } from './pages.ts';

export function TeachingCard({ slide, read, page, pages }: { slide: Slide; read: (k: ReadingKey) => number | null | undefined; page: number; pages: number }) {
  const text = pageOf(sentences(slide.line), pages, page).join(' ');
  const eq = slide.eq && page === 0;
  return (
    <>
      <p className="dk-kicker">{slide.kicker}{pages > 1 ? <span className="dk-pageno"> · {page + 1} of {pages}</span> : null}</p>
      <h2 className="dk-title" style={{ margin: '10px 0 2px' }}>{slide.title}</h2>
      {eq && slide.eq && (
        <div className="dk-eq" role="math" aria-label={slide.eq.map((p) => p.text).join(' ')}>
          {slide.eq.map((p, i) => <span key={i} className={p.tag === 'mi' ? `dk-eq-mi${p.tone ? ` dk-eq-${p.tone}` : ''}` : 'dk-eq-mo'}>{p.text}</span>)}
        </div>
      )}
      <p className="dk-body" style={{ marginTop: eq ? 0 : 10 }}><Line text={text} read={read} terms={slide.terms} /></p>
    </>
  );
}

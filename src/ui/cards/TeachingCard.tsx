import type { CSSProperties } from 'react';
import type { ReadingKey, Slide } from '../../decks/schema.ts';
import { Line } from './Line.tsx';
import { sentences, pageOf } from './pages.ts';
import { NameTab } from './NameTab.tsx';
import type { Deck } from '../../decks/schema.ts';

export function TeachingCard({ slide, deck, read, page, pages, trim = false }: { slide: Slide; deck?: Pick<Deck, 'id' | 'title' | 'head'>; read: (k: ReadingKey) => number | null | undefined; page: number; pages: number; trim?: boolean }) {
  const text = pageOf(sentences(slide.line), pages, page).join(' ');
  const eq = slide.eq && page === 0;
  // the title's one step down when a sideways phone has no wider column left: 2D's own knob for it (--pz-tk), set from the trimmed size
  const kick: CSSProperties | undefined = trim ? { ['--pz-tk' as string]: 'var(--pz-tk-trim)' } : undefined;
  return (
    <>
      {deck && <NameTab deck={deck} />}
      <div className="pz-kick" data-site="none">{slide.kicker}{pages > 1 ? <span className="dk-pageno"> · {page + 1} of {pages}</span> : null}</div>
      <h2 className="pz-h" style={kick}>{slide.title}</h2>
      {eq && slide.eq && (
        <div className="pz-eq" role="math" aria-label={slide.eq.map((p) => p.text).join(' ')}>
          <math><mrow>{slide.eq.map((p, i) => p.tag === 'mi'
            ? <mi key={i} className={p.tone === 'wedge' ? 'eq-wedge' : p.tone === 'free' ? 'eq-hv' : undefined}>{p.text}</mi>
            : <mo key={i}>{p.text}</mo>)}</mrow></math>
        </div>
      )}
      <p className="pz-line"><Line text={text} read={read} terms={slide.terms} /></p>
    </>
  );
}

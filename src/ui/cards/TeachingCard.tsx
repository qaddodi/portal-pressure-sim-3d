import type { CSSProperties } from 'react';
import type { Slide } from '../../decks/schema.ts';
import { Line } from './Line.tsx';
import { sentences, pageOf } from './pages.ts';
import { NameTab } from './NameTab.tsx';
import { SlideControls, LapseRow } from './SlideControls.tsx';
import { ProcRow } from './ProcRow.tsx';
import type { Deck } from '../../decks/schema.ts';
import { useVariant } from '../talk/variant-words.ts';
import { cardFields } from './card-fields.ts';

export function TeachingCard({ slide, deck, read, page, pages, trim = false, panel = false }: { slide: Slide; deck?: Deck; read: (k: string, at?: string) => number | null | undefined; page: number; pages: number; trim?: boolean; /** 2D's visual panel: the head only (title, equation, line, caveat, cite) in `.pz-ph`; the table or chart follows it */ panel?: boolean }) {
  // a compare button that switches the patient brings its own words (2D variantWords); a new slide shows its own
  const variant = useVariant((v) => (deck && v.key === `${deck.id}/${slide.id}` ? v.words : null));
  const shown = variant ? { ...slide, title: variant.title, line: variant.line, kicker: variant.kicker, ...(variant.site ? { site: variant.site } : {}) } : slide;
  const text = pageOf(sentences(shown.line), pages, page).join(' ');
  const f = cardFields(deck, slide, shown, page, pages), tab = f.tab;
  const eq = slide.eq && page === 0;
  // the title's one step down when a sideways phone has no wider column left: 2D's own knob for it (--pz-tk), set from the trimmed size
  const kick: CSSProperties | undefined = trim ? { ['--pz-tk' as string]: 'var(--pz-tk-trim)' } : undefined;
  if (panel) {
    return (
      <>
        {deck && <NameTab deck={deck} air={false} />}
        <div className="pz-ph">
          <h1 className="pz-h">{shown.title}</h1>
          {eq && slide.eq && (
            <div className="pz-eq" role="math" aria-label={slide.eq.map((p) => (p.sub ? `${p.text} ${p.sub}` : p.text)).join(' ')}>
              <math><mrow>{slide.eq.map((p, i) => p.tag === 'mo' ? <mo key={i}>{p.text}</mo>
                : p.sub ? <msub key={i}><mi>{p.text}</mi><mtext>{p.sub}</mtext></msub>
                : <mi key={i} className={p.tone === 'wedge' ? 'eq-wedge' : p.tone === 'free' ? 'eq-hv' : undefined}>{p.text}</mi>)}</mrow></math>
            </div>
          )}
          {text ? <p className="pz-line"><Line text={text} read={read} terms={slide.terms} pill={f.pill} /></p> : null}
          {f.caveat ? <p className="pz-caveat">{f.caveat}</p> : null}
          {f.cite ? <p className="pz-cite">{f.cite}</p> : null}
        </div>
      </>
    );
  }
  return (
    <>
      {deck && <NameTab deck={deck} />}
      {tab ? <span className="pz-sitetab" data-site={tab.site} data-rail={tab.rail ? '' : undefined} aria-hidden="true">{tab.name}</span> : null}
      {/* 2D's words card has no kicker row: the slide's name is its title (presenter-question.js). A card that splits into pages (a phone on its side, 3D only) says which page this is. */}
      {pages > 1 ? <div className="pz-kick" data-site="none"><span className="dk-pageno">{page + 1} of {pages}</span></div> : null}
      <h2 className="pz-h" style={kick}>{shown.title}</h2>
      {eq && slide.eq && (
        <div className="pz-eq" role="math" aria-label={slide.eq.map((p) => (p.sub ? `${p.text} ${p.sub}` : p.text)).join(' ')}>
          <math><mrow>{slide.eq.map((p, i) => p.tag === 'mo' ? <mo key={i}>{p.text}</mo>
            : p.sub ? <msub key={i}><mi>{p.text}</mi><mtext>{p.sub}</mtext></msub>
            : <mi key={i} className={p.tone === 'wedge' ? 'eq-wedge' : p.tone === 'free' ? 'eq-hv' : undefined}>{p.text}</mi>)}</mrow></math>
        </div>
      )}
      {eq && slide.eqLegend && <p className="dp-eqnote">{slide.eqLegend}</p>}
      {text ? <p className="pz-line"><Line text={text} read={read} terms={slide.terms} pill={f.pill} /></p> : null}
      {f.sides.length ? (
        <div className="pz-sides" role="group" aria-label="What each guideline says">
          {f.sides.map((x) => <div key={x.who} className="pz-side"><b className="pz-side-who">{x.who.trim()}</b><p className="pz-side-p"><Line text={x.text} read={read} terms={slide.terms} /></p></div>)}
        </div>
      ) : null}
      {f.caveat ? <p className="pz-caveat">{f.caveat}</p> : null}
      {f.cite ? <p className="pz-cite">{f.cite}</p> : null}
      {deck && slide.lapse && page >= pages - 1 ? <LapseRow slide={slide} deck={deck} /> : null}
      {deck && page >= pages - 1 ? <ProcRow slide={slide} deck={deck} /> : null}
      {deck && slide.controls && page >= pages - 1 ? <SlideControls slide={slide} deck={deck} /> : null}
      {f.rail ? (
        <div className={f.rail.cls} role="img" aria-label={f.rail.label}>
          <div className="pz-rail-liver"><i /><span>Liver</span><i /></div>
          <ol>{f.rail.levels.map((l) => <li key={l.id} data-site={l.id} className={l.on ? 'on' : undefined}><i>{l.on ? <span className="pz-rail-blk" aria-hidden="true" /> : null}</i><span className="n">{l.name}</span></li>)}</ol>
        </div>
      ) : null}
      {f.causes ? <p className="pz-causes"><span className="pz-sub">{f.causes.head}</span>{f.causes.list}</p> : null}
    </>
  );
}

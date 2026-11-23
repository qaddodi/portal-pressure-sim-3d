import type { CSSProperties } from 'react';
import type { EqPart, Slide } from '../../decks/schema.ts';
import { Line } from './Line.tsx';
import { sentences, pageOf } from './pages.ts';
import { NameTab } from './NameTab.tsx';
import { SlideControls, LapseRow } from './SlideControls.tsx';
import { ProcRow } from './ProcRow.tsx';
import type { Deck } from '../../decks/schema.ts';
import { useVariant } from '../talk/variant-words.ts';
import { variantsOf, idOf } from './variants.ts';
import { cardFields } from './card-fields.ts';
import { richOf } from '../text/rich.ts';


const eqClass = (p: EqPart) => (p.tone === 'wedge' ? 'eq-wedge' : p.tone === 'free' ? 'eq-hv' : undefined);
/** A slide's equation parts as MathML (2D `.pz-eq > math`): names, numbers, signs, subscripts and fractions, in 2D's own tags. */
function EqParts({ parts }: { parts: readonly EqPart[] }) {
  return <>{parts.map((p, i) => p.tag === 'mo' ? <mo key={i}>{p.text}</mo>
    : p.tag === 'mn' ? <mn key={i}>{p.text}</mn>
    : p.tag === 'mfrac' ? <mfrac key={i} className={eqClass(p)}><mrow><EqParts parts={p.num ?? []} /></mrow><mrow><EqParts parts={p.den ?? []} /></mrow></mfrac>
    : p.sub ? <msub key={i} className={eqClass(p)}><mi>{p.text}</mi><mtext>{p.sub}</mtext></msub>
    : <mi key={i} className={eqClass(p)}>{p.text}</mi>)}</>;
}

export function TeachingCard({ slide, deck, read, fp, page, pages, trim = false, panel = false }: { slide: Slide; deck?: Deck; read: (k: string, at?: string) => number | null | undefined; /** the slide's readings (the colour of a value's pill) */ fp?: Readonly<Record<string, number | null | undefined>>; page: number; pages: number; trim?: boolean; /** 2D's visual panel: the head only (title, equation, line, caveat, cite) in `.pz-ph`; the table or chart follows it */ panel?: boolean }) {
  // a compare button that switches the patient brings its own words (2D variantWords); a new slide shows its own
  const variant = useVariant((v) => (deck && v.key === `${deck.id}/${slide.id}` ? v.words : null));
  const shown = variant ? { ...slide, title: variant.title, line: variant.line, kicker: variant.kicker, ...(variant.site ? { site: variant.site } : {}) } : slide;
  const text = pageOf(sentences(shown.line), pages, page).join(' ');
  const f = cardFields(deck, slide, shown, page, pages), tab = f.tab;
  // every set of words the compare buttons can show stands in one grid cell (the title, the line), the shown one at full opacity: the card's height is the tallest's, taken once before it shows, and a press cross-fades
  const all = variantsOf(slide, deck), here = idOf(shown);
  const list = all.some((w) => idOf(w) === here) ? all : [...all, shown];
  const many = list.length > 1;
  const titles = (Tag: 'h1' | 'h2', style?: CSSProperties) => many
    ? <div className="pz-vars">{list.map((w) => { const on = idOf(w) === here; return <Tag key={idOf(w)} className="pz-h" style={style} data-var={on ? 'on' : 'off'} {...(on ? null : { 'aria-hidden': true, inert: true })}>{w.title}</Tag>; })}</div>
    : <Tag className="pz-h" style={style}>{shown.title}</Tag>;
  const lines = () => many
    ? <div className="pz-vars">{list.map((w) => { const on = idOf(w) === here, t = on ? text : pageOf(sentences(w.line), pages, page).join(' '), g = on ? f : cardFields(deck, slide, { ...slide, ...w }, page, pages); return t ? <p key={idOf(w)} className="pz-line" data-var={on ? 'on' : 'off'} {...(on ? null : { 'aria-hidden': true, inert: true })}><Line text={t} read={read} slide={rich} fp={fp} pill={g.pill} /></p> : null; })}</div>
    : text ? <p className="pz-line"><Line text={text} read={read} slide={rich} fp={fp} pill={f.pill} /></p> : null;
  const eq = slide.eq && page === 0;
  const rich = richOf(slide);
  // the title's one step down when a sideways phone has no wider column left: 2D's own knob for it (--pz-tk), set from the trimmed size
  const kick: CSSProperties | undefined = trim ? { ['--pz-tk' as string]: 'var(--pz-tk-trim)' } : undefined;
  if (panel) {
    return (
      <>
        {deck && <NameTab deck={deck} air={false} />}
        <div className="pz-ph">
          {titles('h1')}
          {eq && slide.eq && (
            <div className="pz-eq" role="math" aria-label={slide.eq.map((p) => (p.sub ? `${p.text} ${p.sub}` : p.text)).join(' ')}>
              <math><mrow><EqParts parts={slide.eq} /></mrow></math>
            </div>
          )}
          {lines()}
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
      {titles('h2', kick)}
      {eq && slide.eq && (
        <div className="pz-eq" role="math" aria-label={slide.eq.map((p) => (p.sub ? `${p.text} ${p.sub}` : p.text)).join(' ')}>
          <math><mrow><EqParts parts={slide.eq} /></mrow></math>
        </div>
      )}
      {eq && slide.eqLegend && <p className="dp-eqnote">{slide.eqLegend}</p>}
      {lines()}
      {f.sides.length ? (
        <div className="pz-sides" role="group" aria-label="What each guideline says">
          {f.sides.map((x) => <div key={x.who} className="pz-side"><b className="pz-side-who">{x.who.trim()}</b><p className="pz-side-p"><Line text={x.text} read={read} slide={rich} fp={fp} /></p></div>)}
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

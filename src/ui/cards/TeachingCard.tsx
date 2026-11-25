import { raisesOnly, printedEnds } from './roll-reserve.ts';
import { Fragment, useMemo, type CSSProperties } from 'react';
import type { EqPart, Slide } from '../../decks/schema.ts';
import { Line } from './Line.tsx';
import { sentences, pageOf } from './pages.ts';
import { NameTab, nameTabOf } from './NameTab.tsx';
import { SlideControls, LapseRow } from './SlideControls.tsx';
import { ProcRow } from './ProcRow.tsx';
import type { Deck } from '../../decks/schema.ts';
import { useVariant } from '../talk/variant-words.ts';
import { variantsOf, idOf } from './variants.ts';
import { cardFields } from './card-fields.ts';
import { richOf } from '../text/rich.ts';
import { useStates } from '../../decks/hp/calc.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { mergeStates } from '../charts/baked/view.ts';
import { modelLines } from '../charts/flowtime/model.ts';
import { valueText, VALUE_PENDING } from '../text/tokens.ts';


/** The room each side of a sign in an equation. */
const SIGN_GAP = '0.25em';
const eqClass = (p: EqPart) => (p.tone === 'wedge' ? 'eq-wedge' : p.tone === 'free' ? 'eq-hv' : undefined);
/** A slide's equation parts as MathML (2D `.pz-eq > math`): names, numbers, signs, subscripts and fractions, in 2D's own tags. */
function EqParts({ parts }: { parts: readonly EqPart[] }) {
  // (a sign's room is two explicit spaces of one width round an operator with none of its own: the browsers' operator dictionaries and `lspace`/`rspace` differ (on iOS "WHVP − FHVP" printed tight on the left of the minus and wide on the right), a space element does not)
  return <>{parts.map((p, i) => p.tag === 'mo' ? <Fragment key={i}><mspace width={SIGN_GAP} /><mo form="infix" lspace="0" rspace="0">{p.text}</mo><mspace width={SIGN_GAP} /></Fragment>
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
  // (roll-reserve.ts `still`: nothing on the slide can bring a very different reading, so a reading keeps only its own width and no gap stands after it)
  const ctl = slide.controls, still = !slide.lapse && !ctl?.whatIf && !ctl?.strain && !ctl?.compare?.opts.some((o) => o.preset || o.slide);
  // (roll-reserve.ts: only a slider or a strain can take a reading far from where it stands, so only they hold a minus slot; a time-lapse's readings hold the width of the widest they take on its days, not a padded one)
  const live = !!(ctl?.whatIf || ctl?.strain), raises = raisesOnly(ctl);
  const liveStates = useStates((st) => (deck ? st.results[deck.id] : undefined));
  const seen = useMemo(() => {
    const idx = deck ? deck.slides.findIndex((x) => x.id === slide.id) : -1;
    if (!deck || !slide.lapse || live || ctl?.compare?.opts.some((o) => o.preset || o.slide) || idx < 0) return undefined;
    const states = mergeStates(deck.id, liveStates) as readonly ({ fp?: Record<string, number | null | undefined>; start?: { fp?: Record<string, number | null | undefined> }; trail?: unknown } | undefined)[] | undefined;
    const here = states?.[idx];
    if (!here?.fp) return undefined;
    const fps = [here.fp, idx > 0 ? states?.[idx - 1]?.fp : null, here.start?.fp].filter(Boolean) as Record<string, number | null | undefined>[];
    const tl = (copiedOf(deck.id)?.slides[idx] as { tool?: { lines?: readonly string[] } } | undefined)?.tool?.lines;
    const model = tl ? modelLines(tl) : [], rows = Array.isArray(here.trail) ? (here.trail as readonly (readonly number[])[]) : [];
    return (key: string, whole: boolean): readonly string[] | undefined => {
      if (key === 'map' || key === 'plt') return printedEnds(key, fps, whole);
      const vals = fps.map((f) => f[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const c = model.indexOf(key);
      if (c >= 0) for (const r of rows) { const v = r[1 + c]; if (typeof v === 'number' && Number.isFinite(v)) vals.push(v); }
      if (!vals.length) return undefined;
      const lo = Math.min(...vals), hi = Math.max(...vals);
      return [lo, hi].map((v) => valueText(key, { [key]: v }, whole)).filter((t) => t !== VALUE_PENDING);
    };
  }, [deck, slide, live, ctl, liveStates]);
  const titles = (Tag: 'h1' | 'h2', style?: CSSProperties) => many
    ? <div className="pz-vars">{list.map((w) => { const on = idOf(w) === here; return <Tag key={idOf(w)} className="pz-h" style={style} data-var={on ? 'on' : 'off'} {...(on ? null : { 'aria-hidden': true, inert: true })}>{w.title}</Tag>; })}</div>
    : <Tag className="pz-h" style={style}>{shown.title}</Tag>;
  const lines = () => many
    ? <div className="pz-vars">{list.map((w) => { const on = idOf(w) === here, t = on ? text : pageOf(sentences(w.line), pages, page).join(' '), g = on ? f : cardFields(deck, slide, { ...slide, ...w }, page, pages); return t ? <p key={idOf(w)} className="pz-line" data-var={on ? 'on' : 'off'} {...(on ? null : { 'aria-hidden': true, inert: true })}><Line text={t} read={read} slide={rich} fp={fp} pill={g.pill} still={still} seen={seen} minus={live} raises={raises} /></p> : null; })}</div>
    : text ? <p className="pz-line"><Line text={text} read={read} slide={rich} fp={fp} pill={f.pill} still={still} seen={seen} minus={live} raises={raises} /></p> : null;
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
      {tab ? (
        <span className="pz-sitetab" data-site={tab.site} data-rail={tab.rail ? '' : undefined} data-also={tab.also ? '' : undefined} aria-hidden="true">
          {tab.name}
          {tab.also ? <span className="pz-tabalso" data-site={tab.also.site}>{tab.also.name}</span> : null}
        </span>
      ) : null}
      {/* 2D's words card has no kicker row: the slide's name is its title (presenter-question.js). A card that splits into pages (a phone on its side, 3D only) says which page this is in the name tab's band (top left, no row of its own; owner 24 Nov, option 2). */}
      {pages > 1 ? <><span className="pz-pageno" aria-label={`Page ${page + 1} of ${pages}`}>{page + 1} of {pages}</span>{deck && nameTabOf(deck) ? null : <span className="dk-tabgap" aria-hidden="true" />}</> : null}
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
          {f.sides.map((x) => <div key={x.who} className="pz-side"><b className="pz-side-who">{x.who.trim()}</b><p className="pz-side-p"><Line text={x.text} read={read} slide={rich} fp={fp} still={still} seen={seen} minus={live} raises={raises} /></p></div>)}
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

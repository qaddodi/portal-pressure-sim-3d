import { Fragment, type ReactNode } from 'react';
import { parseLine, gluePieces } from '../text/line.ts';
import { valueText } from '../text/tokens.ts';
import { Roll } from './Roll.tsx';
import { reserveOf, altsOf } from './roll-reserve.ts';
import { nb } from '../text/glue.ts';
import { typesetter, toneVar, type Node, type RichSlide } from '../text/rich.ts';
import { pillTone, type Fp } from '../text/pill-tone.ts';
import { rateShown } from '../deck/from2d/table-marks.js';
import { TOKEN_OF_RATE } from '../../engine/hales/portal/pressure-cuts.js';

const style = (tone: string | null) => (tone ? { ['--tone' as string]: toneVar(tone) } : undefined);

/** A slide's line, typeset: live readings roll, cut-offs and bold words are bold, figure terms are tagged for the scene.
 *  `pill`: the value a line without a braced one sets in a quiet pill (card-fields.ts autoPill). */
export function Line({ text, read, slide, fp, pill, still = false, seen, minus, raises }: { text: string; read: (k: string, at?: string) => number | null | undefined; /** the slide's own terms, key and bold words (2D rich): what to set in a pill or in bold */ slide?: RichSlide; /** the slide's readings, for the colour of a value's pill */ fp?: Fp; pill?: string | null; /** no control can bring a very different reading: a reading reserves only its own width (roll-reserve.ts), so no gap stands after it */ still?: boolean; /** the texts a reading takes on this slide (a time-lapse's ends and its chart's days): its box is as wide as the widest */ seen?: (key: string, whole: boolean) => readonly string[] | undefined; /** a reading that can go below zero holds a minus slot (false unless a slider or a strain can take it there) */ minus?: boolean; /** the slide's only control is a slider that can only raise a reading (roll-reserve.ts RAISING): no minus slot */ raises?: boolean }): ReactNode {
  // (2D rich: the line is glued first, so a number keeps its unit and a name its dash on one line)
  const pieces = parseLine(nb(text));
  pill = pill ? nb(pill) : pill;
  let done = false;
  // (the spleen's word wears its status colour while it is not normal, as 2D rateTone gives it)
  const set = typesetter(slide ?? {}, () => { const r = fp ? (rateShown('spleen', fp) as string[])[0] : null; return r && r !== 'ok' ? (TOKEN_OF_RATE as Record<string, string | undefined>)[r] ?? null : null; });
  const words = (t: string, k: string): ReactNode => nodes(set.set(t), k);
  const items = gluePieces(pieces);
  // (a pill's padding is its own room: beside a stop or inside a bracket the pill gives it up, so "2.2 g/dL." and "(59.4 kPa)" read as written, not "2.2 g/dL ." and "( 59.4 kPa )")
  const stopped = (el: ReactNode, stop: string, key: number, open = false, before = ''): ReactNode => (stop || open ? <span key={key} className={`pz-nw${stop ? ' pz-stop' : ''}${open ? ' pz-open' : ''}`}>{before}{el}{stop}</span> : <Fragment key={key}>{el}</Fragment>);
  return items.map(({ p, stop, open, before }, i) => {
    switch (p.t) {
      case 'text': {
        // (the line's one pill: the first value with a unit, in the first piece of plain words that holds it)
        const at = pill && !done ? p.text.indexOf(pill) : -1;
        if (at < 0) return <Fragment key={i}>{words(p.text, 'w')}</Fragment>;
        done = true;
        const rest = p.text.slice(at + pill!.length), st = /^[,.;:]/.exec(rest)?.[0] ?? '';
        return <Fragment key={i}>{words(p.text.slice(0, at).replace(/ $/, '\u00a0'), 'a')}{stopped(<b className="pz-nw">{pill!.replace(/\s(?=mmHg|g\/dL|mL|kPa|cm\/s|mm\b|%)/, '\u00a0')}</b>, st, 0)}{words(rest.slice(st.length), 'b')}</Fragment>;
      }
      case 'step': return stopped(<span className="pz-nw"><span className="pz-step" role="img" aria-label={`Step ${p.n}`}>{p.n}</span></span>, stop, i, open, before);
      case 'bold': return <b key={i}>{p.text}</b>;
      case 'term': return <Fragment key={i}>{stop ? <span className="pz-nw pz-stop">{node(set.term(p.label, p.term), 't')}{stop}</span> : node(set.term(p.label, p.term), 't')}</Fragment>;
      case 'cutoff': return stopped(<b className="pz-nw">{p.text}</b>, stop, i, open, before);
      case 'literal': return stopped(<b className="pz-nw">{p.text}</b>, stop, i, open, before);
      case 'value': {
        // a reading as its tile prints it, with its unit (the blood pressure beside its two numbers, the platelets in thousands)
        // (a reading taken at another slide of the deck, {ppg@parallel}, is fixed text: no slider, strain or time-lapse on THIS slide moves it, so it holds only its own width. It wore the live reading's reserve, a
        //  minus slot and a padded digit, which stood as a gap after it, "17.1 mmHg      without a stent to 9.0 mmHg" on Circuit 8, audit af1c51a0)
        const stillHere = still || !!p.at;
        const v = read(p.key, p.at);
        const text = v == null ? '…' : valueText(p.key, { [p.key]: v, sbp: read('sbp', p.at), dbp: read('dbp', p.at) }, p.decimals === 0);
        const { tone, rate } = v == null ? { tone: null, rate: null } : pillTone(p.key, p.at ? { ...fp, [p.key]: fp?.[`${p.key}@${p.at}`] } : fp);
        // (its stop is set inside the reading's own box, right after the digits: the reserve is wider than a short value, and that spare width must fall after the stop, not before it)
        return stopped(<span className="pz-nw"><span className={`pz-val dk-num${tone ? ' tone' : ''}`} data-rate={rate ?? undefined} data-k={p.key} style={style(tone)}><Roll text={text} reserve={reserveOf(text, p.key, p.decimals === 0, stillHere, { seen: p.at ? undefined : seen?.(p.key, p.decimals === 0), minus, raises })} alts={altsOf(text, stillHere, { seen: p.at ? undefined : seen?.(p.key, p.decimals === 0) })} fit after={stop} /></span></span>, '', i, open, before);
      }
    }
  });
}

/** One typeset node as an element: a figure term keeps its tag for the scene (dk-term, data-term) and wears its station's colour. */
function node(n: Node, key: string): ReactNode {
  switch (n.t) {
    case 'text': return n.s;
    case 'bold': return <b key={key}>{n.s}</b>;
    case 'disease': return <span key={key} className={n.s.length <= 25 ? 'pz-dz pz-nw' : 'pz-dz'}>{n.s}</span>;
    case 'lens': return <span key={key} className="pz-term pz-lens-t" style={style(n.tone)}>{n.s}</span>;
    case 'term': {
      const el = <span className="pz-term dk-term" data-term={n.term} data-target={n.term} style={style(n.tone)}>{n.s}</span>;
      return n.stop ? <span key={key} className="pz-nw pz-stop">{el}{n.stop}</span> : <span key={key} className="contents">{el}</span>;
    }
  }
}
const nodes = (ns: Node[], key: string): ReactNode => ns.map((n, i) => node(n, `${key}${i}`));

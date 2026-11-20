import { Fragment, type ReactNode } from 'react';
import { parseLine, gluePieces } from '../text/line.ts';
import { valueText } from '../text/tokens.ts';
import { Roll } from './Roll.tsx';
import { nb } from '../text/glue.ts';
import { typesetter, toneVar, stationTone, type Node, type RichSlide } from '../text/rich.ts';
import { rateShown, tipsGoal, tileShown } from '../deck/from2d/table-marks.js';
import { TOKEN_OF_RATE } from '../../engine/hales/portal/pressure-cuts.js';

type Fp = Readonly<Record<string, number | null | undefined>>;
/** A reading's pill colour, as 2D valTone: the rating its tile gives (green, amber, red), else the station it is read at. After a TIPS the PPG is read against its 12 mmHg reference line, as its tile reads it. */
export function pillTone(k: string, fp: Fp | undefined, tips = false): { tone: string | null; rate: string | null } {
  const v = fp?.[k];
  const rate = v == null ? null : tips && k === 'ppg' ? (tipsGoal(tileShown(k, v))[0] as string) : ((rateShown(k, fp) as string[])[0] ?? null);
  const token = rate ? (TOKEN_OF_RATE as Record<string, string | undefined>)[rate] : undefined;
  return { tone: token ?? stationTone(k), rate: rate && rate !== 'none' ? rate : null };
}
const style = (tone: string | null) => (tone ? { ['--tone' as string]: toneVar(tone) } : undefined);

/** A slide's line, typeset: live readings roll, cut-offs and bold words are bold, figure terms are tagged for the scene.
 *  `pill`: the value a line without a braced one sets in a quiet pill (card-fields.ts autoPill). */
export function Line({ text, read, slide, fp, pill }: { text: string; read: (k: string, at?: string) => number | null | undefined; /** the slide's own terms, key and bold words (2D rich): what to set in a pill or in bold */ slide?: RichSlide; /** the slide's readings, for the colour of a value's pill */ fp?: Fp; pill?: string | null }): ReactNode {
  // (2D rich: the line is glued first, so a number keeps its unit and a name its dash on one line)
  const pieces = parseLine(nb(text));
  pill = pill ? nb(pill) : pill;
  let done = false;
  // (the spleen's word wears its status colour while it is not normal, as 2D rateTone gives it)
  const set = typesetter(slide ?? {}, () => { const r = fp ? (rateShown('spleen', fp) as string[])[0] : null; return r && r !== 'ok' ? (TOKEN_OF_RATE as Record<string, string | undefined>)[r] ?? null : null; });
  const words = (t: string, k: string): ReactNode => nodes(set.set(t), k);
  const items = gluePieces(pieces);
  const stopped = (el: ReactNode, stop: string, key: number): ReactNode => (stop ? <span key={key} className="pz-nw pz-stop">{el}{stop}</span> : <Fragment key={key}>{el}</Fragment>);
  return items.map(({ p, stop }, i) => {
    switch (p.t) {
      case 'text': {
        // (the line's one pill: the first value with a unit, in the first piece of plain words that holds it)
        const at = pill && !done ? p.text.indexOf(pill) : -1;
        if (at < 0) return <Fragment key={i}>{words(p.text, 'w')}</Fragment>;
        done = true;
        const rest = p.text.slice(at + pill!.length), st = /^[,.;:]/.exec(rest)?.[0] ?? '';
        return <Fragment key={i}>{words(p.text.slice(0, at).replace(/ $/, '\u00a0'), 'a')}{stopped(<b className="pz-nw">{pill!.replace(/\s(?=mmHg|g\/dL|mL|kPa|cm\/s|mm\b|%)/, '\u00a0')}</b>, st, 0)}{words(rest.slice(st.length), 'b')}</Fragment>;
      }
      case 'step': return stopped(<span className="pz-nw"><span className="pz-step" role="img" aria-label={`Step ${p.n}`}>{p.n}</span></span>, stop, i);
      case 'bold': return <b key={i}>{p.text}</b>;
      case 'term': return <Fragment key={i}>{stop ? <span className="pz-nw pz-stop">{node(set.term(p.label, p.term), 't')}{stop}</span> : node(set.term(p.label, p.term), 't')}</Fragment>;
      case 'cutoff': return stopped(<b className="pz-nw">{p.text}</b>, stop, i);
      case 'literal': return stopped(<b className="pz-nw">{p.text}</b>, stop, i);
      case 'value': {
        // a reading as its tile prints it, with its unit (the blood pressure beside its two numbers, the platelets in thousands)
        const v = read(p.key, p.at);
        const text = v == null ? '…' : valueText(p.key, { [p.key]: v, sbp: read('sbp', p.at), dbp: read('dbp', p.at) }, p.decimals === 0);
        const { tone, rate } = v == null ? { tone: null, rate: null } : pillTone(p.key, p.at ? { ...fp, [p.key]: fp?.[`${p.key}@${p.at}`] } : fp);
        return stopped(<span className="pz-nw"><span className={`pz-val dk-num${tone ? ' tone' : ''}`} data-rate={rate ?? undefined} data-k={p.key} style={style(tone)}><Roll text={text} /></span></span>, stop, i);
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

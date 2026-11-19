import type { ReactNode } from 'react';
import { parseLine } from '../text/line.ts';
import { valueText } from '../text/tokens.ts';
import { Roll } from './Roll.tsx';

/** A slide's line, typeset: live readings roll, cut-offs and bold words are bold, figure terms are tagged for the scene.
 *  `pill`: the value a line without a braced one sets in a quiet pill (card-fields.ts autoPill). */
export function Line({ text, read, terms, pill }: { text: string; read: (k: string, at?: string) => number | null | undefined; terms?: Record<string, string>; pill?: string | null }): ReactNode {
  const pieces = parseLine(text);
  let done = false;
  return pieces.map((p, i) => {
    switch (p.t) {
      case 'text': {
        // (the line's one pill: the first value with a unit, in the first piece of plain words that holds it)
        const at = pill && !done ? p.text.indexOf(pill) : -1;
        if (at < 0) return <TermText key={i} text={p.text} terms={terms} />;
        done = true;
        return <span key={i}><TermText text={p.text.slice(0, at)} terms={terms} /><b className="pz-nw">{pill!.replace(/\s(?=mmHg|g\/dL|mL|kPa|cm\/s|mm\b|%)/, '\u00a0')}</b><TermText text={p.text.slice(at + pill!.length)} terms={terms} /></span>;
      }
      case 'step': return <span key={i} className="pz-nw"><span className="pz-step" role="img" aria-label={`Step ${p.n}`}>{p.n}</span></span>;
      case 'bold': return <b key={i}>{p.text}</b>;
      case 'term': return <span key={i} className="pz-term dk-term" data-term={p.term}>{p.label}</span>;
      case 'cutoff': return <b key={i} className="pz-nw">{p.text}</b>;
      case 'literal': return <b key={i} className="pz-nw">{p.text}</b>;
      case 'value': {
        // a reading as its tile prints it, with its unit (the blood pressure beside its two numbers, the platelets in thousands)
        const v = read(p.key, p.at);
        const text = v == null ? '…' : valueText(p.key, { [p.key]: v, sbp: read('sbp', p.at), dbp: read('dbp', p.at) }, p.decimals === 0);
        return <span key={i} className="pz-val dk-num"><Roll text={text} /></span>;
      }
    }
  });
}

/** Words the slide's `terms` field names get their term tag on first mention, so the scene can light the matching part of the figure. */
function TermText({ text, terms }: { text: string; terms?: Record<string, string> }) {
  if (!terms) return <>{text}</>;
  const keys = Object.keys(terms).sort((a, b) => b.length - a.length);
  if (!keys.length) return <>{text}</>;
  const re = new RegExp(`(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return <>{text.split(re).map((part, i) => (terms[part] ? <span key={i} className="pz-term dk-term" data-term={terms[part]}>{part}</span> : part))}</>;
}

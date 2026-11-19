import type { ReactNode } from 'react';
import type { ReadingKey } from '../../decks/schema.ts';
import { parseLine, fmtPressure } from '../text/line.ts';
import { Roll } from './Roll.tsx';

/** A slide's line, typeset: live readings roll, cut-offs and bold words are bold, figure terms are tagged for the scene. */
export function Line({ text, read, terms }: { text: string; read: (k: ReadingKey) => number | null | undefined; terms?: Record<string, string> }): ReactNode {
  const pieces = parseLine(text);
  return pieces.map((p, i) => {
    switch (p.t) {
      case 'text': return <TermText key={i} text={p.text} terms={terms} />;
      case 'bold': return <b key={i}>{p.text}</b>;
      case 'term': return <span key={i} className="pz-term dk-term" data-term={p.term}>{p.label}</span>;
      case 'cutoff': return <b key={i} className="pz-nw">{p.text}</b>;
      case 'value': {
        const v = read(p.key);
        return <span key={i} className="pz-val dk-num"><Roll text={fmtPressure(v, p.decimals)} />{v == null ? '' : ' mmHg'}</span>;
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

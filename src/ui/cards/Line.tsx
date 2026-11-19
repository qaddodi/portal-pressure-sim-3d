import type { ReactNode } from 'react';
import { parseLine } from '../text/line.ts';
import { valueText } from '../text/tokens.ts';
import { Roll } from './Roll.tsx';

/** A slide's line, typeset: live readings roll, cut-offs and bold words are bold, figure terms are tagged for the scene. */
export function Line({ text, read, terms }: { text: string; read: (k: string, at?: string) => number | null | undefined; terms?: Record<string, string> }): ReactNode {
  const pieces = parseLine(text);
  return pieces.map((p, i) => {
    switch (p.t) {
      case 'text': return <TermText key={i} text={p.text} terms={terms} />;
      case 'bold': return <strong key={i}>{p.text}</strong>;
      case 'term': return <span key={i} className="dk-term" data-term={p.term}>{p.label}</span>;
      case 'cutoff': return <span key={i} className="dk-num">{p.text}</span>;
      case 'literal': return <span key={i} className="dk-num">{p.text}</span>;
      case 'value': {
        // a reading as its tile prints it, with its unit (the blood pressure beside its two numbers, the platelets in thousands)
        const v = read(p.key, p.at);
        const text = v == null ? '…' : valueText(p.key, { [p.key]: v, sbp: read('sbp', p.at), dbp: read('dbp', p.at) }, p.decimals === 0);
        return <span key={i} className="dk-num"><Roll text={text} /></span>;
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
  return <>{text.split(re).map((part, i) => (terms[part] ? <span key={i} className="dk-term" data-term={terms[part]}>{part}</span> : part))}</>;
}

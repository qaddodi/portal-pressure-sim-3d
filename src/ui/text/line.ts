// A slide's line as pieces the card can set: plain words, a live reading, a cut-off, a term that points at the figure, bold words.
// The same markup the 2D deck uses ({hvpg}, {hvpg:0}, {>=10 mmHg}, [label](term), **bold**).

import { parseToken, valueText } from './tokens.ts';

export type Piece =
  | { t: 'text'; text: string }
  /** A reading of any tile (the 2D app's), now or `at` another slide of the deck; `decimals` 0 prints it whole. */
  | { t: 'value'; key: string; decimals: number | null; at?: string }
  /** A number typed in braces (a rule from the literature, not the patient): outlined like a cut-off. */
  | { t: 'literal'; text: string }
  | { t: 'cutoff'; text: string }
  | { t: 'term'; label: string; term: string }
  | { t: 'bold'; text: string };

const RE = /\[([^\]]+)\]\(([\w:-]+)\)|\{([^}]+)\}|\*\*([^*]+)\*\*/g;
const CUT = /^(>=|<=|>|<)\s*(\d+(?:\.\d+)?)(\s+\S+)?$/;
const SYMBOL: Record<string, string> = { '>=': '≥', '<=': '≤', '>': '>', '<': '<' };

/** A cut-off as the words write it: a comparison is always a symbol (> < ≥ ≤), never "more than" ("{>=10 mmHg}" reads "≥10 mmHg"). */
export function cutoffText(body: string): string | null {
  const m = CUT.exec(body.trim());
  return m ? `${SYMBOL[m[1]]}${m[2]}${m[3] ?? ''}`.replace(/ /g, ' ') : null;
}

export function parseLine(line: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  const text = (s: string) => { if (s) out.push({ t: 'text', text: s }); };
  for (const m of line.matchAll(RE)) {
    text(line.slice(at, m.index));
    at = (m.index ?? 0) + m[0].length;
    if (m[1] !== undefined) out.push({ t: 'term', label: m[1], term: m[2] });
    else if (m[4] !== undefined) out.push({ t: 'bold', text: m[4] });
    else {
      const body = m[3].trim();
      const tk = parseToken(body);
      if (tk.kind === 'cut') out.push({ t: 'cutoff', text: tk.text });
      else if (tk.kind === 'value') out.push({ t: 'value', key: tk.key, decimals: tk.whole ? 0 : null, ...(tk.at ? { at: tk.at } : {}) });
      else if (tk.kind === 'step') out.push({ t: 'literal', text: String(tk.n) });
      // a typed number or quantity ({6 to 8 g}, {2 to 3 mg/24 h}): a rule, outlined. A bare word is a mistyped reading and stays an error.
      else if (/[\d%]/.test(tk.text)) out.push({ t: 'literal', text: tk.text });
      else throw new Error(`the line has {${body}}, which is no reading or cut-off`);
    }
  }
  text(line.slice(at));
  return out;
}

/** A pressure as the card prints it: one decimal with a true minus sign (a whole mmHg when `decimals` is 0); a reading not yet known prints
 *  as an ellipsis in running text and as one em dash in a ladder or tile (a dash between words would read as an aside). */
export function fmtPressure(v: number | null | undefined, decimals: number | null = null, inText = true): string {
  if (v == null || !Number.isFinite(v)) return inText ? '…' : '—';
  const d = decimals ?? 1;
  const f = Math.abs(v).toFixed(d);
  return (v < 0 && Number(f) !== 0 ? '−' : '') + f;
}

/** The difference of two readings as displayed (one decimal each), so a card that reads WHVP 16.4 and FHVP 4.8 reads HVPG 11.6, never 11.7. */
export function tenthGap(hi: number, lo: number, raw: number | null = null): number | null {
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return raw;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return r1(r1(hi) - r1(lo));
}

/** The text of a line with its values filled in, as plain words (for the accessible name and tests). */
export function plainLine(pieces: Piece[], read: (k: string, at?: string) => number | null | undefined): string {
  return pieces.map((p) => {
    switch (p.t) {
      case 'text': return p.text;
      case 'bold': return p.text;
      case 'term': return p.label;
      case 'cutoff': return p.text;
      case 'value': return `${fmtPressure(read(p.key), p.decimals)}${read(p.key) == null ? '' : ' mmHg'}`;
    }
  }).join('');
}

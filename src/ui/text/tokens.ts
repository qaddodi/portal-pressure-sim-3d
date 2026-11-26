// How a slide's braces print, as the 2D card prints them (callout-math.js valueText, presenter-words.js rich): one place for every deck and for the line on the card.
//   {hvpg}  a reading as its tile prints it, with its unit      {hvpg:0}  the same whole      {ppg@clot}  the reading at another slide of the deck
//   {>=10 mmHg}  a cut-off, its sign kept                         {2 to 3 mg/24 h}  a typed number (a rule, not the patient)      {#2}  a figure's step marker
import { TILE } from '../charts/tiles.generated.ts';
import { fmt, NOT_SHOWN } from '../charts/fmt.ts';
import { bedsideMean } from '../../engine/hales/portal/bedside-mean.js';
import { VALUE_PENDING } from '../../engine/hales/portal/pressure-cuts.js';

export type Fp = Readonly<Record<string, number | boolean | null | undefined | number[]>>;
export { VALUE_PENDING };

/** A reading as 2D prints it in words (callout-math.js valueText): to its tile's decimals, with its unit; a whole number when asked; "…" while unknown. */
const bp = (sbp: number, dbp: number, map: number) => {
  const r = (v: number) => String(Math.round(v));
  if (!Number.isFinite(map)) return NOT_SHOWN;
  return Number.isFinite(sbp) && Number.isFinite(dbp) ? `${r(sbp)}/${r(dbp)} (${r(bedsideMean(Math.round(sbp), Math.round(dbp)))})` : `MAP ${r(map)}`;
};
export function valueText(key: string, fp: Fp | null | undefined, whole = false): string {
  const T = TILE[key], v = fp?.[key];
  if (!T || typeof v !== 'number' || !Number.isFinite(v)) return VALUE_PENDING;
  if (key === 'plt') return `${(Math.round(v) * 1000).toLocaleString('en-US')}/µL`;
  if (key === 'map') return `${bp(fp!.sbp as number, fp!.dbp as number, v)} ${T.u}`;
  return `${fmt(v * (T.x ?? 1), whole ? 0 : T.d ?? 1)}${T.u === '%' ? '%' : T.u ? ` ${T.u}` : ''}`;
}

export type Token =
  | { kind: 'value'; key: string; whole: boolean; at: string | null }
  | { kind: 'cut'; text: string }
  | { kind: 'literal'; text: string }
  | { kind: 'step'; n: number };

/** A cut-off keeps its sign: "≥10 mmHg" (table-marks.js cutText). */
export const cutText = (c: string) => c.replace(/^>=\s*/, '≥').replace(/^<=\s*/, '≤').replace(/^([<>≥≤])\s+/, '$1');

/** What the inside of one pair of braces is, in the 2D order: a step marker, a reading, a reading whole, a reading at another slide, a cut-off, a typed number. */
export function parseToken(body: string): Token {
  let m: RegExpExecArray | null;
  if ((m = /^#(\d+)$/.exec(body))) return { kind: 'step', n: Number(m[1]) };
  if (TILE[body]) return { kind: 'value', key: body, whole: false, at: null };
  // ({key:0} asks for a whole number only where the tile prints one: a pressure is one number at one decimal on a slide, in its words as on its chart, tests/one-number.test.ts)
  if ((m = /^(\w+):0$/.exec(body)) && TILE[m[1]!]) return { kind: 'value', key: m[1]!, whole: TILE[m[1]!]!.d === 0, at: null };
  if ((m = /^(\w+)@([\w-]+)$/.exec(body)) && TILE[m[1]!]) return { kind: 'value', key: m[1]!, whole: false, at: m[2]! };
  if (/^[<>≥≤]=?/.test(body)) return { kind: 'cut', text: cutText(body) };
  return { kind: 'literal', text: body };
}

/** Every `{…}` of a text, in order. */
export function tokensOf(text: string): { raw: string; token: Token }[] {
  return [...text.matchAll(/\{([^}]+)\}/g)].map((m) => ({ raw: m[0], token: parseToken(m[1]!) }));
}

/** A text with its braces filled in as the 2D card prints them: plain text, for the accessible name, the handout and the number test. `fpAt(id)` gives another slide's fingerprint. */
export function plainText(text: string, fp: Fp | null, fpAt: (id: string) => Fp | null = () => null): string {
  return text.replace(/\{([^}]+)\}/g, (_, body: string) => {
    const t = parseToken(body);
    switch (t.kind) {
      case 'value': return valueText(t.key, t.at ? fpAt(t.at) : fp, t.whole);
      case 'cut': return t.text;
      case 'literal': return t.text;
      case 'step': return String(t.n);
    }
  });
}

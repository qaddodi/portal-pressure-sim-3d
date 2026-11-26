// The criteria card's rule list as data (ported from the 2D app's tool-criteria.js): a row as written is read into one shape, a live row is judged
// against the model's reading as its tile prints it, a cut-off and a verdict are split into the parts the card sets in different type.
import { fmt, shown, tile, NOT_SHOWN, type Fingerprint } from '../fmt.ts';

export const CRITERIA_MAX = 4;

export type Op = '>=' | '>' | '<=' | '<';

export interface Row {
  text: string;
  /** the text split at ** (odd parts are bold), or null */
  bold: string[] | null;
  note: string | null; lit: boolean; met: boolean | null; cut: string | null; and: string | null;
  key: string | null; op: Op | null; value: number | null; says: string | null;
}

const OPS: Record<Op, (a: number, b: number) => boolean> = { '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '<': (a, b) => a < b };
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A row as written, read into one shape; null when it has no words. */
export function criteriaRow(r: unknown): Row | null {
  const o: Record<string, unknown> | null = typeof r === 'string' ? { text: r } : Array.isArray(r) ? { text: r[0], key: r[1], op: r[2], value: r[3] } : r && typeof r === 'object' ? { ...(r as object) } : null;
  if (!o || typeof o.text !== 'string' || !o.text.trim()) return null;
  const live = typeof o.key === 'string' && typeof o.op === 'string' && o.op in OPS && Number.isFinite(+(o.value as number));
  const raw = o.text.trim();
  return {
    text: raw.replace(/\*\*/g, ''), bold: raw.includes('**') ? raw.split('**') : null, note: str(o.note), lit: !!o.lit,
    met: typeof o.met === 'boolean' ? o.met : null, cut: str(o.cut), and: str(o.and),
    key: live ? (o.key as string) : null, op: live ? (o.op as Op) : null, value: live ? +(o.value as number) : null, says: str(o.says),
  };
}

/** The rows a tool shows: its first four rows that have words. */
export const criteriaRows = (t: { rows?: unknown } | null | undefined): Row[] => (Array.isArray(t?.rows) ? (t!.rows as unknown[]).map(criteriaRow).filter((x): x is Row => !!x).slice(0, CRITERIA_MAX) : []);

/** Whether a live row is met by the model (null: no reading). Judged as its tile prints the reading. */
export function criteriaMet(row: Row, fp: Fingerprint | null | undefined): boolean | null {
  const v = row.key ? fp?.[row.key] : null;
  if (v == null || !Number.isFinite(v)) return null;
  return OPS[row.op!](shown(row.key!, v), row.value!);
}

/** A live row's reading as its tile prints it, with the unit. */
export function criteriaReading(row: Row, fp: Fingerprint | null | undefined): string {
  const v = row.key ? fp?.[row.key] : null;
  if (v == null || !Number.isFinite(v)) return NOT_SHOWN;
  const T = tile(row.key!);
  return `${fmt(v * (T?.x ?? 1), T?.d ?? 1)}${T?.u ? ` ${T.u}` : ''}`;
}

/** A cut-off in its parts: a comparison sign and a unit in the sans (the serif has no ≥ or ≤), the number in the serif. */
export function cutParts(c: string | null | undefined): { sign: string; num: string; unit: string } | null {
  const m = /^([≥≤<>]?)\s*(.*?)(?:\s+(mmHg|kPa|mL|L|g\/dL|mg\/dL|%|months|mo))?$/.exec(c || '');
  return m && m[2] ? { sign: m[1] || '', num: m[2], unit: m[3] || '' } : null;
}

/** The verdict's bold lead (up to and with its first colon) and the rest. */
export function verdictParts(v: unknown): { bold: string; rest: string } | null {
  const t = str(v);
  if (!t) return null;
  const i = t.indexOf(':');
  return i > 0 ? { bold: t.slice(0, i + 1), rest: t.slice(i + 1).trimStart() } : { bold: '', rest: t };
}

/** A key line as written ('**Indeterminate:** ...' or { text, swatch }), read into its words (odd parts bold) and swatch; null if it has no words. */
export function keyLine(k: unknown): { parts: string[]; swatch: 'hatch' | null; plain: string } | null {
  const o = typeof k === 'string' ? { text: k } : k && typeof k === 'object' ? (k as { text?: unknown; swatch?: unknown }) : null;
  const t = str(o?.text);
  return t ? { parts: t.split('**'), swatch: (o as { swatch?: unknown }).swatch === 'hatch' ? 'hatch' : null, plain: t.replace(/\*\*/g, '') } : null;
}

/** Whether a tool has the case column: a row with a note on the case or a live reading. */
export const criteriaHasCase = (t: { rows?: unknown } | null | undefined): boolean => criteriaRows(t).some((r) => r.note || r.key);

/** The head of the case column. When every live row reads the same measure it is named ("HVPG, this case": a bare "12.4 mmHg" never said which pressure it was, Tipping 6, capture 52ef8e63); a long or mixed
 *  set of names keeps "This case". */
export function criteriaCaseHead(rows: readonly Row[]): string {
  const keys = [...new Set(rows.filter((r) => r.key).map((r) => r.key!))];
  const T = keys.length === 1 ? tile(keys[0]!) : undefined, name = T ? (T.n ?? T.t) : '';
  return name && name.length <= 10 ? `${name}, this case` : 'This case';
}

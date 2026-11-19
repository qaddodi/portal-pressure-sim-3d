// The {brace} tokens of a 2D slide's words, and the number each one prints. The 2D line takes {pv} (a live reading in a pill), {pv:0} (whole), {co@terli} (the value
// at another slide of the deck), {6 to 8 g} (a rule typed in braces: outlined, not the patient), {>=10 mmHg} (a cut-off) and {#2} (a figure's step marker).
// The values come from the engine's fingerprint at the slide (steps.ts says which); this file only classifies a token and prints a reading as its tile does
// (callout-math.js valueText), so the cards' line component (ui/text/line.ts, B12) and the numbers test share one formatter.
import { TILE } from '../../ui/charts/tiles.generated.ts';
import { fmt } from '../../ui/charts/fmt.ts';

export type Brace =
  | { kind: 'step'; n: number }
  | { kind: 'tile'; key: string; whole: boolean; at?: string }
  | { kind: 'cutoff'; text: string }
  | { kind: 'literal'; text: string };

/** The tokens of a string, in order. */
export function braces(text: string): { raw: string; token: Brace }[] {
  return [...String(text ?? '').matchAll(/\{([^}]+)\}/g)].map((m) => ({ raw: m[1]!, token: parseBrace(m[1]!) }));
}

export function parseBrace(body: string): Brace {
  let m: RegExpExecArray | null;
  if ((m = /^#(\d+)$/.exec(body))) return { kind: 'step', n: Number(m[1]) };
  if (TILE[body]) return { kind: 'tile', key: body, whole: false };
  if ((m = /^(\w+):0$/.exec(body)) && TILE[m[1]!]) return { kind: 'tile', key: m[1]!, whole: true };
  if ((m = /^(\w+)@([\w-]+)$/.exec(body)) && TILE[m[1]!]) return { kind: 'tile', key: m[1]!, whole: false, at: m[2]! };
  if (/^[<>≥≤]=?/.test(body)) return { kind: 'cutoff', text: body };
  return { kind: 'literal', text: body };
}

/** The numbers a reading can need beyond its own key: the blood pressure is written systolic/diastolic (mean). */
export type Fp = Readonly<Record<string, number | null | undefined>>;

/** What a reading prints while it is unknown ("…", the 2D VALUE_PENDING). */
export const PENDING = '…';

/** The blood pressure as the bedside writes it: 120/80 (93); where the two are unknown, "MAP 93". The mean is worked from the two numbers as printed. */
export function bpText(sbp: number | null | undefined, dbp: number | null | undefined, map: number): string {
  if (!Number.isFinite(map)) return '—';
  const r = (v: number) => String(Math.round(v));
  if (Number.isFinite(sbp) && Number.isFinite(dbp)) { const s = Math.round(sbp!), d = Math.round(dbp!); return `${r(sbp!)}/${r(dbp!)} (${r(d + (s - d) / 3)})`; }
  return `MAP ${r(map)}`;
}

/** A reading as its tile prints it in running text: to the tile's decimals (a whole number when `whole`), with its unit; "…" while unknown. */
export function valueText(key: string, fp: Fp | null | undefined, whole = false): string {
  const T = TILE[key], v = fp?.[key];
  if (!T || v == null || !Number.isFinite(v)) return PENDING;
  if (key === 'plt') return `${(Math.round(v) * 1000).toLocaleString('en-US')}/µL`;
  if (key === 'map') return `${bpText(fp?.sbp, fp?.dbp, v)} ${T.u}`;
  return `${fmt(v * (T.x ?? 1), whole ? 0 : T.d ?? 1)}${T.u === '%' ? '%' : T.u ? ` ${T.u}` : ''}`;
}

// The pressure ladder card as numbers: one row per reading with its bar, and the subtraction under it. Pure, so a test can read it.

import type { ReadingKey } from '../../decks/schema.ts';
import { fmtPressure, tenthGap } from '../text/line.ts';
import { hvpgSev, hvpgWord, HVPG_CUTS, type Sev } from '../cuts.ts';
import type { Readings } from '../ui-store.ts';

/** The pressure axis: every bar is a share of this (mmHg), the same on every slide so a bar never rescales between slides. */
export const AXIS_MAX = 24;

export const LABEL: Record<ReadingKey, string> = { whvp: 'WHVP', fhvp: 'FHVP', hvpg: 'HVPG', ivc: 'IVC', ra: 'Right atrium', pv: 'Portal vein', ppg: 'PPG' };
export type Tone = 'wedge' | 'free' | 'portal';
const TONE: Record<ReadingKey, Tone> = { whvp: 'wedge', fhvp: 'free', ivc: 'free', ra: 'free', pv: 'portal', hvpg: 'wedge', ppg: 'portal' };

export interface Row { key: ReadingKey; label: string; text: string; value: number | null; /** 0 to 1 */ frac: number; tone: Tone }

export function ladderRows(rows: ReadingKey[], r: Readings): Row[] {
  return rows.map((key) => {
    const v = r[key] ?? null;
    const known = v != null && Number.isFinite(v);
    return { key, label: LABEL[key], text: fmtPressure(v, null, false), value: known ? v : null, frac: known ? Math.max(0, Math.min(1, v / AXIS_MAX)) : 0, tone: TONE[key] };
  });
}

export interface Gap {
  whvp: string; fhvp: string; hvpg: string; value: number | null;
  sev: Sev | null; word: string; /** the band as the pill reads it: "≥10 · CSPH", "Mild", "Normal" */ pill: string;
}

/** HVPG = WHVP − FHVP as the screen shows it: the difference of the two readings as displayed, one decimal. */
export function gapOf(r: Readings): Gap {
  const w = r.whvp, f = r.fhvp;
  const have = w != null && f != null && Number.isFinite(w) && Number.isFinite(f);
  const value = have ? tenthGap(w, f, r.hvpg ?? null) : null;
  const sev = value != null ? hvpgSev(value) : null;
  const word = value != null ? hvpgWord(value) : '';
  const pill = sev === 'danger' ? `≥${HVPG_CUTS.red} · ${word}` : word;
  return { whvp: fmtPressure(w, null, false), fhvp: fmtPressure(f, null, false), hvpg: fmtPressure(value, null, false), value, sev, word, pill };
}

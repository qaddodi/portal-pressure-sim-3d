// The words under a history's name, from the model's state today (Now, taken from the engine by the generator): "TIPS 8 mm, PPG 9.9, no carvedilol". Pure.
import type { Now, Seg } from './types.ts';

/** PPG's standing cut-offs (engine pressure-cuts: amber 6, red 12) are the row's colour: only a gradient over the red line is coloured here, as the tiles do. */
const PPG_RED = 12;
const one = (v: number): string => v.toFixed(1);
const lower = (s: string): string => s.replace(/^\S+/, (w) => (/^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w));

/** "on carvedilol, anticoagulation" for the treatments that are medicines; nothing when there are none. */
export const medsWords = (meds: readonly string[]): string => (meds.length ? `on ${meds.map(lower).join(' and ')}` : '');

/** The pieces of the second line, in the course's order; each piece is its words, and a gradient over the red line says so. */
export function stateOf(now: Now, order: readonly ('tips' | 'ppg' | 'meds' | 'ascites' | 'clot')[]): Seg[] {
  const out: Seg[] = [];
  for (const k of order) {
    if (k === 'tips') { if (now.tipsMm != null) out.push({ text: `TIPS ${now.tipsMm} mm` }); }
    else if (k === 'ppg') out.push(now.ppg >= PPG_RED ? { text: `PPG ${one(now.ppg)} · high`, tone: 'danger' } : { text: `PPG ${one(now.ppg)}` });
    else if (k === 'meds') { const w = medsWords(now.meds); if (w) out.push({ text: w }); }
    else if (k === 'ascites') out.push({ text: now.ascitesL < 0.15 ? 'no ascites' : `ascites ${one(now.ascitesL)} L` });
    else if (k === 'clot') { if (now.clot != null) out.push({ text: now.clot < 0.02 ? 'Vein open' : `Clot ${Math.round(now.clot * 100)}% left` }); }
  }
  return out;
}
/** The segments as one line ("TIPS 8 mm, PPG 9.9, on carvedilol"), for a screen reader and the search. */
export const stateLine = (s: readonly Seg[]): string => s.map((x) => x.text).join(', ');
/** "4 months in": whole months, at least one; under two months it is counted in weeks. */
export const lengthWords = (days: number): string => (days < 60 ? `${Math.max(1, Math.round(days / 7))} weeks in` : `${Math.round(days / 30.4)} months in`);

// The three figures under the Along-the-circuit chart (2D charts.js readStrip): HVPG, PPG and the portal vein, each with its word only when it is not normal.
import { hvpgSev, ppgSev, HVPG_WORDS, PPG_WORDS, NOT_SHOWN } from '../../../engine/hales/portal/pressure-cuts.js';

type M = Record<string, number | undefined>;

// the three figures under the chart: id, name, rating, the rating's words, and the readout that hides it (2D READ)
const READ = [
  { id: 'hvpg', name: 'HVPG', sev: hvpgSev as (v: number) => string, words: HVPG_WORDS as Record<string, readonly string[]>, hide: 'trueHVPG' },
  { id: 'ppg', name: 'PPG', sev: ppgSev as (v: number) => string, words: PPG_WORDS as Record<string, readonly string[]>, hide: 'pv' },
  { id: 'pv', name: 'Portal vein', sev: null, words: null, hide: 'pv' },
] as const;

/** The three readings (2D readStrip): the text, and the rating's word (none for a normal one). */
export function readings(m: M | null, hidden: ReadonlySet<string> | null): { id: string; name: string; text: string; word: string; sev: string }[] {
  return READ.map((x) => {
    const v = m?.[x.id], on = Number.isFinite(v) && !hidden?.has(x.hide);
    const rate = on && x.sev ? x.sev(v!) : '';
    return { id: x.id, name: x.name, text: on ? v!.toFixed(1) : NOT_SHOWN, word: rate && rate !== 'ok' ? x.words![rate]![0]! : '', sev: rate };
  });
}


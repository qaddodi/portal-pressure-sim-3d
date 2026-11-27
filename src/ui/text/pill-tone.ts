// A reading's colour in a slide's words (cards/Line.tsx), kept free of the page so a node test can hold it for every deck.
import { stationTone } from './rich.ts';
import { seriesToken } from './series-tone.ts';
import { rateShown, tipsGoal, tileShown } from '../deck/from2d/table-marks.js';
import { TOKEN_OF_RATE } from '../../engine/hales/portal/pressure-cuts.js';

export type Fp = Readonly<Record<string, number | null | undefined>>;
/**
 * A reading's colour in the words: its SERIES colour, the one its chart, its tile and the figure's label wear (owner, 27 Nov, L13: one colour per number; series-tone.ts).
 * Only a reading with no series colour keeps 2D's valTone: the rating its tile gives (green, amber, red), else the station it is read at.
 * After a TIPS the PPG is read against its 12 mmHg reference line, as its tile reads it.
 */
export function pillTone(k: string, fp: Fp | undefined, tips = false): { tone: string | null; rate: string | null } {
  const series = seriesToken(k);
  if (series) return { tone: series, rate: null };
  const v = fp?.[k];
  const rate = v == null ? null : tips && k === 'ppg' ? (tipsGoal(tileShown(k, v))[0] as string) : ((rateShown(k, fp) as string[])[0] ?? null);
  const token = rate ? (TOKEN_OF_RATE as Record<string, string | undefined>)[rate] : undefined;
  return { tone: token ?? stationTone(k), rate: rate && rate !== 'none' ? rate : null };
}

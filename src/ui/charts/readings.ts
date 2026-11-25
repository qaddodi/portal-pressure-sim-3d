// The ONE place a site's pressure becomes text, for every slide and every screen size (root rule, 25 Nov, capture 36b7deac: schistosomiasis read 9 on the chart and 8 on the six-case
// table, sinusoidal obstruction 12.4 and 13, three copies of the 2D profile code each printing its own way).
//
//   a station's pressure (gut, portal vein, wedge, hepatic vein, IVC, RA …)  → whole mmHg, `stationText`
//   a gradient (HVPG, PPG, EUS-PPG)                                           → one decimal, `gapText`
//
// Both read the engine's number as it stands (the fingerprint's own readings), never a number worked out again from other printed numbers: a gradient is never made by taking one
// printed reading from another, and a reading is never nudged to make such a difference close (the strip's old "closed" wedge turned 8.79 into 8). Every chart, strip, pill, plane
// readout and table cell prints through these two, and `tests/site-readings-agree.test.ts` fails if any surface prints a site differently from another.
import { fmt } from './fmt.ts';

/** A station's pressure as printed: the whole mmHg, with a true minus (U+2212) and never "−0". */
export const stationText = (v: number): string => { const r = Math.round(v); return r < 0 ? `−${-r}` : String(r); };

/** A gradient (HVPG, PPG, EUS-PPG) as printed: one decimal ("0.5", never "1"). */
export const gapText = (v: number): string => fmt(v, 1);

/** The eight stations' readings of a profile as printed, in station order. */
export const stationTexts = (p: { readonly v: readonly number[] }): string[] => p.v.map(stationText);

// The pressure cut-offs and their words, from the engine's one table (never a second copy: HVPG amber 5, red 10; PPG amber 6, red 12).
// @ts-ignore the pinned engine copy is plain JS
import * as cuts from '../engine/hales/portal/pressure-cuts.js';
// @ts-ignore the pinned engine copy is plain JS
import { VARIX_NONE_MM } from '../engine/hales/portal/metrics.js';
// @ts-ignore the pinned engine copy is plain JS
import * as lsm from '../engine/hales/portal/lsm-cuts.js';

/**
 * The word for a varix that is only the vein's own caliber (under the engine's 2.5 mm "none" cut-off): a tile, a table cell and the words print "None",
 * never the floor's 2.0 mm as a size (review 28 Nov, pattern 3). Null when the reading is a varix or is another reading.
 */
export const varixFloorWord = (key: string, v: number | null | undefined): string | null =>
  (key === 'varix' || key === 'gv') && typeof v === 'number' && Number.isFinite(v) && v < VARIX_NONE_MM ? 'None' : null;

export type Sev = 'ok' | 'caution' | 'danger';

export const HVPG_CUTS = cuts.HVPG_CUTS as { amber: number; red: number; bleed: number };
/** Which stiffness context a state reads in (vascular: a liver with no sinusoidal scar; the HVPG says CSPH only where CSPH can be said). */
export const lsmContext = lsm.lsmContext as (f: Record<string, number>) => string;
export const hvpgSev = cuts.hvpgSev as (v: number) => Sev;
/** [short, long] words of the band: Normal, Mild, CSPH. */
export const hvpgWord = cuts.hvpgWord as (v: number, long?: boolean) => string;
/** The colour token that carries a band as TEXT (a step toward the card's text colour so it clears 4.5:1). */
export const INK_OF_SEV = cuts.INK_OF_SEV as Record<Sev, string>;
export const TOKEN_OF_SEV = cuts.TOKEN_OF_SEV as Record<Sev, string>;

// "Not measurable" (the one place that decides it): src/engine/hv-flag.ts, re-exported here with the other cut-off words.
export { NOT_MEASURABLE, NOT_MEASURABLE_WHY, HV_BLOCKED_KEY, hvpgBlockedBy, hvpgNotMeasurable, readingNotMeasurable, HV_READINGS, flagFp, flagStep } from '../engine/hv-flag.ts';

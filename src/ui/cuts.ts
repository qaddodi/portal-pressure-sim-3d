// The pressure cut-offs and their words, from the engine's one table (never a second copy: HVPG amber 5, red 10; PPG amber 6, red 12).
// @ts-ignore the pinned engine copy is plain JS
import * as cuts from '../engine/hales/portal/pressure-cuts.js';

export type Sev = 'ok' | 'caution' | 'danger';

export const HVPG_CUTS = cuts.HVPG_CUTS as { amber: number; red: number; bleed: number };
export const hvpgSev = cuts.hvpgSev as (v: number) => Sev;
/** [short, long] words of the band: Normal, Mild, CSPH. */
export const hvpgWord = cuts.hvpgWord as (v: number, long?: boolean) => string;
/** The colour token that carries a band as TEXT (a step toward the card's text colour so it clears 4.5:1). */
export const INK_OF_SEV = cuts.INK_OF_SEV as Record<Sev, string>;
export const TOKEN_OF_SEV = cuts.TOKEN_OF_SEV as Record<Sev, string>;

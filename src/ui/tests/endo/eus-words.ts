// The EUS-PPG card's pure parts (2D eus-ppg.js paint): the number as printed, the technique's tooltip, the words under the readings by phase, and the panel's monitor height.
import { hvpgWord, EUS_LINE_NOTE, EUS_SITE_NOTE, NOT_SHOWN } from '../../../engine/hales/portal/pressure-cuts.js';
import { MEASURES } from '../../../scene/procedures/copied/proc-anim.js';
import { ENDO_WORDS as W } from '../copied/endo-words.copied.js';

export const EUS = MEASURES.eus as unknown as { steps: [string, string, string, string][]; T: { end: number } };
export interface Reads { pv: number; hv: number; ppg: number }
export const word = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : NOT_SHOWN);
export const TECHNIQUE = `${W.eusIdle} ${W.eusSite} ${EUS_SITE_NOTE} ${EUS_LINE_NOTE}`;
/** the panel's monitor is wide and short so the picture keeps most of its room (2D scope-card.css --ar: 2.6) */
export const EUS_AR = 2.6;
export const monitorHeight = (panelW: number): number => Math.max(96, Math.round(Math.max(0, panelW - 24) / EUS_AR));

/** The words under the readings: the step's, the result's, else the technique's one line (2D eus-ppg.js paint). */
export function captionOf(phase: 'idle' | 'run' | 'hold', step: number, rd: Reads): string {
  return phase === 'run' && step >= 0 ? EUS.steps[step]![2]
    : phase === 'hold' && Number.isFinite(rd.ppg) ? `${hvpgWord(rd.ppg, true)}${W.eusDone[0]}${word(rd.pv)}${W.eusDone[1]}${word(rd.hv)}${W.eusDone[2]}${word(rd.ppg)}${W.eusDone[3]}` : W.eusIdle;
}

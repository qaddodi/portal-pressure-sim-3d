// The pure parts of the HVPG tracing card (2D tool-hvpg.js): the readings' order and times, the step a catheter slide stands at, the levels a settled state gives. No React, so node can hold them to the decks.
import { T } from '../tests/copied/hvpg-clock.copied.js';
import { tenthGap } from '../../engine/hales/core/gap.js';

type Rec = Record<string, unknown>;
export type HvpgStep = 'free' | 'wedge' | 'result';
export const HVPG_STEPS: readonly HvpgStep[] = ['free', 'wedge', 'result'];
/** The script time each reading is taken at (the free sweep ends as the balloon goes up; the wedge once the plateau has held; the HVPG when the sum is shown). */
export const STEP_T: Record<HvpgStep, number> = { free: T.inflate - 60, wedge: T.result, result: T.back };

/** The step of the slide's catheter this card follows (2D `configure`: only with `catheter: true` and a catheter on the figure), else null (the card plays on its own). */
export const stepsOf = (tool: Rec, cath: unknown): HvpgStep | null => (tool.catheter && HVPG_STEPS.includes(cath as HvpgStep) ? (cath as HvpgStep) : null);

/** The levels a card shows from a settled state: the two pressures, and the HVPG as the difference of them as printed (2D levelsOf). */
export function levelsOf(m: Rec | null | undefined): { fhvp: number; whvp: number; hvpg: number } | null {
  const f = m?.fhvp, w = m?.whvp;
  return typeof f === 'number' && typeof w === 'number' && Number.isFinite(f) && Number.isFinite(w) ? { fhvp: f, whvp: w, hvpg: (tenthGap as (a: number, b: number, c: unknown) => number)(w, f, m?.hvpg) } : null;
}


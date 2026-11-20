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


/** Where on the HVPG script a card that has just come up starts its tracing, so it reads as it is taken:
 *  - a card that came within a moment of another slide's (the next slide of the same measurement) carries on from where that one stopped;
 *  - a card that follows the catheter reads the figure's own script time (`figure`, while the deck holds the catheter), so the free pressure scrolls in as the catheter parks and the balloon's rise is
 *    the figure's balloon: never a finished picture of a reading that is still being taken. A figure already at or past the reading's time (a jump) shows the finished tracing;
 *  - a card that steps on its own, stepped onto going forward, starts at the free sweep and waits; otherwise (a jump, or back) it shows the finished tracing at once. */
export function startAt(o: { to: number; carry: number | null; follow: boolean; figure: number | null; forward: boolean }): number {
  if (o.carry != null) return o.carry;
  if (o.follow) return o.figure != null ? Math.min(o.to, Math.max(0, o.figure)) : o.to;
  return o.forward ? T.free - 300 : o.to;
}

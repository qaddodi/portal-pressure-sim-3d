// The words of a slide that plays a procedure, by step (capture 3531bdfa, review ids B-D8 and D-D7; owner, 27 Nov 2026: "print each step's readings, future tense until the last step").
//
// The wrong source: a slide that plays a procedure lands on the state BEFORE it (hp/link.ts, 2D `pre`), but its line printed the readings of the state AFTER it, so at "Needle in" the words said the
// ascites was drained to 0.7 L while the gauge still read 5.8 L, and at "Catheter in" the PPG had already "fallen to 9.3". The line has two sets of words now: `lineAhead`, in the future tense,
// which prints no reading the procedure changes, for every step before the figure shows the result; and `line`, the result, from the step on which the figure shows it. Both stand in one cell
// of the card (variants.ts), so the card never changes size and the change of words is the card's own cross-fade.
import { procPlanOf, specFor } from './procs-plan.ts';

/** The step on which the figure shows a procedure's result: the first step whose stop lies after the moment the model takes the change (`T.apply`), else the last step.
 *  null for a procedure that changes nothing (a reading's catheter or needle): its words never wait for a result. */
export function resultStepOf(kind: string): number | null {
  const sp = specFor(kind) as { T: { apply?: number }; stops: number[] } | null;
  if (!sp || typeof sp.T.apply !== 'number' || !sp.stops.length) return null;
  const k = sp.stops.findIndex((t) => t > sp.T.apply!);
  return k < 0 ? sp.stops.length - 1 : k;
}

/** The step a slide's `lineAhead` gives way at (its procedure's result step), for deck.ts to put on the slide; null when the slide has no such words. */
export function aheadUntil(s: { procedure?: unknown; lineAhead?: string }): number | null {
  const plan = s.lineAhead ? procPlanOf(s) : null;
  return plan ? resultStepOf(plan.kind) : null;
}

/** Whether the slide's words are the ones for before the result: it has a `lineAhead`, and the figure is on a step before the result's (`at`: the step the figure is on, -1 before the first Next). */
export function wordsAhead(slide: { lineAhead?: string; aheadUntil?: number }, at: number): boolean {
  return !!slide.lineAhead && typeof slide.aheadUntil === 'number' && at < slide.aheadUntil;
}

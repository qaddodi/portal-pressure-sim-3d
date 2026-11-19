// The all-patients chart's numbers from the engine (2D: visual-allpatients.js seriesWork). Each patient is the deck's own slides run again from a fresh model with a
// reading on every day of every time-lapse; the 2D app asks its presenter's worker (ctx.run(steps, null)), this one asks the same worker message, 'sequence',
// through whatever `run` is given (EngineClient.sequence). Pure but for that call, so a test hands it a fake.
import { cohortOf, cohortSteps, seriesOf, type DeckLike, type Series, type Step } from './model.ts';

/** What the worker's 'sequence' hands back for each step (src/engine/client.ts SeqStep): the fingerprint and, for a step with a trail, a reading on each day. */
export type RunOut = { fp?: Record<string, number | null>; trail?: number[][] | null; [k: string]: unknown };
export type Run = (steps: Step[]) => Promise<RunOut[]>;

/** The slide's cohort steps (a fresh model for each patient), or null while a slide the cohort names is not in the deck. */
export const stepsOf = (slide: unknown, deck: DeckLike | null | undefined) => cohortSteps(slide, deck);
export const hasCohort = (slide: unknown) => cohortOf(slide).length > 0;

const kept = new WeakMap<object, Map<string, Promise<Series | null>>>();
const keyOf = (slide: { id?: unknown; cohort?: unknown }) => JSON.stringify([slide.id, slide.cohort]);

/** The four patients' series for a slide, worked out once per deck (a promise of the series), or null when the deck's states are not all there. */
export function cohortSeries(slide: { id: string; cohort?: unknown }, deck: DeckLike, run: Run): Promise<Series | null> | null {
  const made = cohortSteps(slide, deck);
  if (!made) return null;
  let store = kept.get(deck);
  if (!store) kept.set(deck, (store = new Map()));
  const key = keyOf(slide);
  let p = store.get(key);
  if (p) return p;
  p = run(made.steps).then((outs) => seriesOf(slide, deck, outs));
  store.set(key, p);
  p.then((ser) => { if (!ser) store!.delete(key); }, () => store!.delete(key));
  return p;
}

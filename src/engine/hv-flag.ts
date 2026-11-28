// The one place that decides "this patient's HVPG is not measurable" (owner ruling, 27 Nov 2026, review 3531bdfa W1). Next to the engine client because the page takes its states from the
// engine here: the deck's sequence (decks/hp/numbers.ts), the client's `sequence`, the live fingerprint and the bake (charts/baked/make.ts) each pass a step through `flagStep`.
// @ts-ignore the pinned engine copy is plain JS
import * as cuts from './hales/portal/pressure-cuts.js';
// @ts-ignore the pinned engine copy is plain JS
import { PRESETS, defaultParams } from './hales/portal/scenario.js';

// The HVPG is taken with a catheter wedged in the right hepatic vein. When that vein is blocked (Budd-Chiari: thrombosed outflow, the engine's `hvBlocked(params)`), no catheter
// reaches the sinusoid and the model's own HVPG (0.3 mmHg: both pressures read upstream of the clot) is a number nobody can measure, so every surface that prints or draws it says
// "Not measurable" instead. The fact is the PATIENT's (their params), never a slide's authored flag (a slide's `cath: 'blocked'` and a table row's `blank` say how the catheter is drawn, and
// cannot know a patient a control, a preset or a treatment made). The fingerprint carries it as `hvBlocked: 1`, put there where the page takes a state from the engine (`flagStep`: the deck's sequence, the
// engine client, the live fingerprint, the bake); a surface asks `hvpgNotMeasurable(fp)`. Absent for a patient whose vein is open, so nothing else changes.
export const NOT_MEASURABLE = cuts.NOT_MEASURABLE as string;
/** The word with its reason, for a card with room for it (a table's screen-reader text, a tile's sub-line). */
export const NOT_MEASURABLE_WHY = cuts.NOT_MEASURABLE_WHY as string;
/** The fingerprint's key for it. */
export const HV_BLOCKED_KEY = 'hvBlocked';
/** Whether a patient's params block the hepatic vein the HVPG is taken in (the engine's own rule: pressure-cuts.js hvBlocked). */
export const hvpgBlockedBy = (params: unknown): boolean => !!params && typeof params === 'object' && !!(cuts.hvBlocked as (p: unknown) => boolean)(params);
/** Whether a state's HVPG cannot be measured: its fingerprint (or a readings record) carries the flag. */
export const hvpgNotMeasurable = (fp: Readonly<Record<string, unknown>> | null | undefined): boolean => !!fp && fp[HV_BLOCKED_KEY] === 1;
/** The readings taken through the blocked hepatic vein: the wedged and free pressures, their gradient, and the EUS-guided gradient (also read across a hepatic vein). */
export const HV_READINGS: readonly string[] = ['hvpg', 'whvp', 'fhvp', 'eus'];
/** Whether the reading `key` of this state cannot be taken (review 28 Nov, pattern 1: every table, tile and card says "Not measurable" for each of them, not only the HVPG). */
export const readingNotMeasurable = (key: string, fp: Readonly<Record<string, unknown>> | null | undefined): boolean => HV_READINGS.includes(key) && hvpgNotMeasurable(fp);
/** `fp` with the flag put in when `params` block the vein (the same object back for a patient whose vein is open: no copy, no new key). */
export function flagFp<T extends object>(fp: T, params: unknown): T {
  return fp && hvpgBlockedBy(params) && !hvpgNotMeasurable(fp as Record<string, unknown>) ? { ...fp, [HV_BLOCKED_KEY]: 1 } : fp;
}
/** An engine step ({ fp, params, start?, before?, … }) with its fingerprint, and the fingerprints of its `start` and `before` states, flagged by their own params. Mutates nothing it was given. */
export function flagStep<T extends { fp?: unknown; params?: unknown; start?: unknown; before?: unknown }>(step: T): T {
  if (!step || typeof step !== 'object') return step;
  type S = { fp?: object; params?: unknown };
  const one = (s: unknown, params: unknown): unknown => (s && typeof s === 'object' && (s as S).fp ? { ...(s as S), fp: flagFp((s as S).fp as object, (s as S).params ?? params) } : s);
  const fp = step.fp && typeof step.fp === 'object' ? flagFp(step.fp, step.params) : step.fp;
  const start = one(step.start, step.params), before = one(step.before, step.params);
  return fp === step.fp && start === step.start && before === step.before ? step : { ...step, fp, ...(step.start !== undefined ? { start } : {}), ...(step.before !== undefined ? { before } : {}) };
}

/** Whether a built-in patient (a preset's id: the menu's patient list and its snapshots) has the hepatic vein blocked, from the preset's own parameters. */
export function presetBlocked(id: string): boolean {
  const d = (PRESETS as { id: string; apply?: (p: unknown) => unknown }[]).find((x) => x.id === id);
  return !!d?.apply && hvpgBlockedBy(d.apply((defaultParams as () => unknown)()));
}

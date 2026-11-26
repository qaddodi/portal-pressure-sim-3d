// The patient of a summary-table row that no slide shows (a preset and its changes), as the engine is asked for it. ONE place for the step, used by the
// table's live rows (table-rows.ts) and by the build's baked rows
// (baked/make.ts), so the two can never disagree, and a row of its own is the state a slide with the same fields would stand at (cause treated 15, review 3531bdfa C-D12).
//
// The root of that capture's "Still drinking HVPG 14.3, platelets 90 (the slides say 13.3 and 75)": a slide's `relax` (the days the patient lives at the
// state just set, before any ramp, so the slow organs settle:
// the spleen, and with it the platelets) was dropped for a row of its own, which stood at the bare preset. Every state field a slide's step carries is
// passed here; a field no row can carry is listed in `NOT_STATE`.
import type { TableRowSpec } from '../../decks/schema.ts';

/** The keys of a row that are words, marks or a link, never part of the patient. Every other key of a row of its own must be one `ownStepOf` passes on. */
export const NOT_STATE: ReadonlySet<string> = new Set(['id', 'title', 'kicker', 'site', 'key', 'vs', 'ref', 'blank', 'miss', 'missPart', 'calm', 'note', 'wave']);
/** The keys `ownStepOf` reads, and what it makes of each. `days` is the patient's age at the preset (the engine's `presetDays`), as a slide's `model.days` is. */
export const STATE_KEYS: readonly string[] = ['preset', 'params', 'days', 'relax'];

/** One engine step for a row of its own. */
export function ownStepOf(sp: TableRowSpec): { preset?: string; params?: unknown; presetDays?: number; relax?: number } {
  return { preset: sp.preset, ...(sp.params ? { params: sp.params } : {}), ...(sp.days != null ? { presetDays: sp.days } : {}), ...(sp.relax != null ? { relax: sp.relax } : {}) };
}

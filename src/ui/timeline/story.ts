// The story of a patient's history (docs/approved/timeline-story.md, option A): which of History's entries are the moments a reader comes back for. One rule, read by the
// histories' generator (it bakes the model's state at the end of each such day, so "Show on the figure" can go back to it) and by the timeline panel. Pure: no engine, no page.

/** The fields of an entry the rule reads (a baked EntryOut and a page's Entry both have them). */
export interface StoryEntryIn { kind: string; sev?: string; step?: string }

/** A key moment: anything a course step wrote (a Doppler note), a change (a medicine, a procedure, an action), or an event that is dangerous, critical, or a bleed brought under control.
 *  The rest (a collateral recruited, a caution) is the quiet part of the story: counted, not headlined. */
export const isKeyEntry = (e: StoryEntryIn): boolean =>
  !!e.step || e.kind === 'change' || e.sev === 'critical' || e.sev === 'danger' || e.sev === 'ok';

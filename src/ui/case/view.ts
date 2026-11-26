// The story the case plays, as its bar and cards read it: History's own view of the patient (timeline/story-view.ts viewOf, as run.ts caseStops reads it), made once when a case starts,
// with each stop's moment, its tone and short name, and the smaller events between the stops (the story's quiet lines) the card on the way passes.
import { useMemo } from 'react';
import { timeline, getInterventionLabels } from '../timeline/index.ts';
import { viewOf, momentKey, type View } from '../timeline/story-view.ts';
import type { Moment, Tone } from '../timeline/story.ts';
import { record } from '../tests/feed.ts';
import { historyOf } from '../histories/meta.ts';
import { useCase } from './store.ts';
import { shortName, type PassNote } from './words.ts';
import type { Stop } from './types.ts';

export interface CaseView {
  v: View;
  /** each stop's story moment (null when the story has none by its key) */
  moments: (Moment | null)[];
  tones: Tone[];
  shorts: string[];
  /** the smaller events, in order */
  notes: PassNote[];
}

/** The case's view of a story: pure, so a test reads it from a baked history. */
export function caseViewOf(v: View, stops: readonly Stop[]): CaseView {
  const all = v.chapters.flatMap((c) => c.moments), byKey = new Map(all.map((m) => [momentKey(m), m] as const));
  const moments = stops.map((s) => byKey.get(s.key) ?? null);
  const tones = moments.map((m): Tone => (m?.type === 'key' ? m.head.tone : 'info'));
  const notes: PassNote[] = [];
  for (const m of all) if (m.type === 'quiet') for (const it of m.items) notes.push({ day: it.day, title: it.title });
  notes.sort((a, b) => a.day - b.day);
  return { v, moments, tones, shorts: stops.map(shortName), notes };
}

/** The story as it stood when the case started, by the case's first stop (each start makes its stops anew), kept for the whole case: once the days run, the record moves the
 *  course's points from its future into its days and a landing can let the future go (tests/feed.ts), so a view made again then would end at the stop the case is at. */
const kept = new WeakMap<Stop, View>();
function storyOf(id: string, first: Stop): View {
  let v = kept.get(first);
  if (!v) {
    v = viewOf({ tl: timeline, days: record.days, future: record.future, hidden: null, labelsOf: getInterventionLabels(), chapters: historyOf(id)?.chapters ?? null });
    kept.set(first, v);
  }
  return v;
}

/** The case's view: the story kept for this case, with its stops as they are now. */
export function useCaseView(): CaseView | null {
  const id = useCase((s) => s.id), stops = useCase((s) => s.stops);
  return useMemo(() => (!id || !stops[0] ? null : caseViewOf(storyOf(id, stops[0]), stops)), [id, stops]);
}

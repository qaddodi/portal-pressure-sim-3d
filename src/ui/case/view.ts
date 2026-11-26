// The story the case plays, as its bar and cards read it: History's own view of the patient (timeline/story-view.ts viewOf), made once when a case starts, from the baked course
// (case/story.ts, never the live record), with each stop's moment, its tone and short name, and the smaller events between the stops (the story's quiet lines) the card on the way passes.
import { useMemo } from 'react';
import { momentKey, type View } from '../timeline/story-view.ts';
import type { Moment, Tone } from '../timeline/story.ts';
import { useCase } from './store.ts';
import { shortName, type PassNote } from './words.ts';
import type { Stop } from './types.ts';
import { setStopSource, stopReadsOf, type StopReads } from './stop-read.ts';

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

/** The case's view: the story made from the baked course when the case started (run.ts startCase), with its stops as they are now. */
export function useCaseView(): CaseView | null {
  const story = useCase((s) => s.story), stops = useCase((s) => s.stops);
  return useMemo(() => (!story || !stops[0] ? null : caseViewOf(story, stops)), [story, stops]);
}

// The readings the stop's card names, for every Tests card: the same numbers as its "that day" line (stop-read.ts).
// Only while the case waits at a stop; the story is the case's own, made from the baked course; the same object for the same stop.
let stopKept: { v: View; day: number; reads: StopReads } | null = null;
setStopSource(() => {
  const s = useCase.getState(), stop = s.stops[s.at], v = s.story;
  if (s.phase !== 'stop' || !stop || !v) return null;
  if (stopKept && stopKept.v === v && stopKept.day === stop.day) return stopKept.reads;
  stopKept = { v, day: stop.day, reads: stopReadsOf(v.series, stop.day) };
  return stopKept.reads;
});

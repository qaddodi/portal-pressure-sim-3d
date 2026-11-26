// The story a case plays, made from the COURSE (the baked days) and nothing live. Mohammad's capture 0bc14020 (26 Nov): the same stop read PPG 8.4 on an iPad and 8.5 on an iPhone and a Mac,
// because the story was made from the page's day record, whose newest point the running model rewrites in place with each frame it draws, and a card's numbers depended on how
// many frames had come in by the time it was made. A stop is a day of the course, so its numbers are the course's own for that day: the same on every device, however fast it draws.
// Pure: the baked history and History's entries in, the story and the stops out (tests/case-numbers.test.ts).
import { viewOf, type View } from '../timeline/story-view.ts';
import type { Entry } from '../timeline/model.ts';
import type { Series } from '../bigtime/record.ts';
import { stopsOf } from './stops.ts';
import { ascDays } from './rate.ts';
import type { CaseRamp, CaseStopBaked, Stop } from './types.ts';

/** What the story needs of History (the page's timeline, or a test's). */
export interface StoryTimeline { entries(): readonly Entry[]; isFuture(i: number): boolean; isLive(i: number): boolean; trimmed(): boolean }
/** What a course says of itself (histories/meta.ts HistoryMeta, the part the case reads). */
export interface CourseMeta { chapters?: readonly { from: number; label: string }[]; play?: { stops?: readonly CaseStopBaked[]; ramps?: readonly CaseRamp[] } }

type Days = readonly { day: number; v: Record<string, number>; start?: boolean }[];
type Labels = (p: unknown) => Map<string, string>;
/** The story of a baked course: History's own view (timeline/story-view.ts viewOf) over the course's days, whole (the whole course is the case's past and its future at once). */
export function bakedStory(tl: StoryTimeline, days: Days, meta: CourseMeta | undefined, labelsOf: Labels): View {
  return viewOf({ tl, days, future: [], hidden: null, labelsOf, chapters: meta?.chapters ?? null });
}

/** A case's story and its stops, both from the baked course. */
export function caseOf(tl: StoryTimeline, days: Days, meta: CourseMeta | undefined, labelsOf: Labels): { story: View; stops: Stop[]; asc: Series } {
  const story = bakedStory(tl, days, meta, labelsOf);
  return { story, stops: stopsOf(story.chapters, tl.entries(), meta?.play?.stops ?? [], meta?.play?.ramps), asc: ascDays(days) };
}

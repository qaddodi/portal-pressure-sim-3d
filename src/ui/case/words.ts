// What the case bar, the stop card and the card on the way say (docs/approved/play-the-case.md, the mock's words). Pure: the stops, the day and the story's chapters in, words out.
import type { Stop, StopShot } from './types.ts';

export const CASE = {
  prev: 'Previous stop',
  next: 'Next stop',
  play: 'Play',
  pause: 'Pause',
  leave: 'Leave the case',
  leaveShort: 'Leave',
  look: 'Look closer here',
  back: 'Back to this view',
  moved: 'You moved the figure.',
  waits: 'The case waits',
  onTheWay: 'On the way',
  end: 'The end of the case',
  strip: 'The case along its days: drag to a stop',
  tests: 'Tests',
  pullUp: (n: number) => `Pull up: look closer here (${n})`,
  pullDown: 'Pull down for less',
} as const;

const day = (d: number): string => `Day ${Math.round(d)}`;

/** The chapter a day is in (its name), or '' with none named. */
export function chapterAt(chapters: readonly { from: number; label: string }[], d: number): string {
  let label = '';
  for (const c of chapters) if (d >= c.from) label = c.label;
  return label;
}

export interface BarIn { phase: string; stops: readonly Stop[]; at: number; to: number | null; day: number }
/** The bar's two lines: the day (the one the days have reached on the way) and under it where the case is ("Stop 6 of 8", "to Day 70", or "The case waits" while a Tests card is open at a stop). */
export function barWords(s: BarIn, exploring = false): { day: string; small: string } {
  const to = s.to != null ? s.stops[s.to] : null;
  if (s.phase === 'travel' && to) return { day: day(s.day), small: `to ${day(to.day)}` };
  return { day: day(s.day), small: exploring ? CASE.waits : `Stop ${s.at + 1} of ${s.stops.length}` };
}

/** The playhead let go of over `stop` (while it is dragged): the day it stands on, and the stop it would go to. */
export function dragWords(d: number, stops: readonly Stop[], i: number): { day: string; small: string } {
  return { day: day(d), small: `Stop ${i + 1} of ${stops.length}` };
}

/** The stop card's kicker: "Stop 6 of 8 · Day 70 · The bleed" (the chapter the stop is in, when one is named). */
export function kickerWords(stops: readonly Stop[], at: number, chapter: string): string {
  const s = stops[at];
  if (!s) return '';
  return [`Stop ${at + 1} of ${stops.length}`, day(s.day), chapter].filter(Boolean).join(' · ');
}

/** A stop's name after Continue: today's is "today", the rest their title. */
const nextName = (s: Stop): string => (s.type === 'today' ? 'today' : s.title);
/** Continue's words at stop `at`: "Continue to Day 73 · TIPS 8 mm" ("Continue to Day 73" where room is short), null at the last stop. */
export function continueWords(stops: readonly Stop[], at: number, short = false): string | null {
  const n = stops[at + 1];
  if (!n) return null;
  return short ? `Continue to ${day(n.day)}` : `Continue to ${day(n.day)} · ${nextName(n)}`;
}

/** The days left to the next stop, in words ("in 18 days", "in a day", "now"). */
export const inDays = (n: number): string => (n <= 0 ? 'now' : n === 1 ? 'in a day' : `in ${n} days`);
/** What the next stop is called on the way: the chapter that starts on its day ("The bleed"), else its own title. */
export function stopName(s: Stop, chapters: readonly { from: number; label: string }[]): string {
  const c = chapters.find((x) => Math.round(x.from) === Math.round(s.day) && x.label);
  return c ? c.label : s.type === 'today' ? 'Today' : s.title;
}
/** The card on the way: "Next stop: Day 70", "The bleed, in 18 days"; on a phone one line, "Next stop: Day 70 · The bleed". */
export function travelWords(stops: readonly Stop[], to: number, d: number, chapters: readonly { from: number; label: string }[]): { kicker: string; head: string; sub: string; line: string } {
  const s = stops[to];
  if (!s) return { kicker: CASE.onTheWay, head: '', sub: '', line: '' };
  const name = stopName(s, chapters), chapter = chapterAt(chapters, d);
  return {
    kicker: [CASE.onTheWay, chapter].filter(Boolean).join(' · '),
    head: `Next stop: ${day(s.day)}`,
    sub: `${name}, ${inDays(Math.round(s.day - d))}`,
    line: `Next stop: ${day(s.day)} · ${name}`,
  };
}

/** What a named camera shows, in words (decks/hp/cams.ts names; a camera not listed says its view only). */
const CAM_WORDS: Record<string, string> = {
  fit: 'the whole figure', route: 'the whole figure', bleed: 'the bleeding varix', fundus: 'the gastric varices', varices: 'the varices', tips: 'the stent',
  portal: 'the portal vein', hepatic: 'the hepatic veins', heart: 'the heart', spleen: 'the spleen', liver: 'the liver', 'lobule:sinusoid': 'the sinusoid', lobule: 'the lobule',
};
const VIEW_WORDS: Record<string, string> = { anatomic: 'Anatomy', circuit: 'Circuit', lobule: 'Lobule', sinusoid: 'Sinusoid' };
/** The line under the stop: "The figure: the varices, Anatomy" (a flow lens says so: "the portal vein's flow, Circuit"). */
export function shotWords(s: StopShot): string {
  const what = CAM_WORDS[s.cam], view = VIEW_WORDS[s.view] ?? s.view;
  if (!what) return `The figure: ${view}`;
  return `The figure: ${s.lens === 'flow' ? `${what}, its flow` : what}, ${view}`;
}

/** A Look closer item's word at the right: a view's name, or "Tests" for a Tests card. */
export const lookSide = (tool: string): string => VIEW_WORDS[tool] ?? CASE.tests;

/** A stop's short name over its line on the strip: the start and today, a known moment by its standard short form, else its title's first words (at most 12 letters). */
const SHORT: readonly [RegExp, string][] = [
  [/clinically significant portal hypertension/i, 'CSPH'],
  [/varix ruptured|variceal bleed|bleed(ing)? (again|recurred)|rebleed/i, 'Bleed'],
  [/bleeding more likely/i, 'Bleed risk'],
  [/^TIPS\b/, 'TIPS'],
  [/red wale/i, 'Red wale'],
  [/paracentesis/i, 'Paracentesis'],
  [/band(ing)?\b.*\(EVL\)|^band/i, 'EVL'],
];
export function shortName(s: Pick<Stop, 'type' | 'title'>): string {
  if (s.type === 'start') return 'Start';
  if (s.type === 'today') return 'Today';
  for (const [re, w] of SHORT) if (re.test(s.title)) return w;
  const words = s.title.split(/\s+/);
  let out = words[0] ?? s.title;
  for (const w of words.slice(1)) { if ((out + ' ' + w).length > 12) break; out += ' ' + w; }
  return out;
}

/** A smaller event passed on the way (the story's quiet lines): its day and its words. */
export interface PassNote { day: number; title: string }
/** The notes the card on the way shows: the latest `n` passed after `from` up to the day the days have reached, oldest first. */
export function passedNotes(notes: readonly PassNote[], from: number, d: number, n = 2): PassNote[] {
  return notes.filter((x) => x.day > from && x.day <= d).slice(-n);
}

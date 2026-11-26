// What the timeline panel shows, gathered from the page's two records (History's entries and the day record) in one place: the story, the series its cards and its strip read (the days kept as
// the future included, so a moment ahead of the figure reads its own numbers), the key moments and medicines the strip marks, and where the figure is. Pure: a test drives it with a baked history.
import { calmedDays } from '../../engine/hales/portal/trail-calm.js';
import type { Series } from '../bigtime/record.ts';
import { drawable } from '../bigtime/data.ts';
import { marksOf, type EntryIn, type MedBar } from '../bigtime/marks.ts';
import type { Entry } from './model.ts';
import { storyEntries, storyOf, type Chapter, type ChapterStart, type Moment, type Tone } from './story.ts';
import { STRIP_METRICS, type StripMetric } from './strip.ts';

export interface DayIn { day: number; v: Record<string, number>; start?: boolean }
export interface ViewIn {
  tl: { entries(): readonly Entry[]; isFuture(i: number): boolean; isLive(i: number): boolean; trimmed(): boolean };
  days: readonly DayIn[];
  future: readonly DayIn[];
  /** the record's own calmed series (cached by the feed) when there is no future to add */
  calm?: (key: string) => { x: number[]; mid: number[] } | null;
  hidden: ReadonlySet<string> | null;
  labelsOf: (p: unknown) => Map<string, string>;
  chapters?: readonly ChapterStart[] | null;
}
export interface View {
  chapters: Chapter[];
  series: Record<string, Series>;
  /** the readings the strip may show (a hidden one, not yet measured, is not offered) */
  metrics: StripMetric[];
  marks: { day: number; tone: Tone }[];
  meds: MedBar[];
  full: [number, number];
  /** the moment the figure is at (its key), and its day */
  here: string;
  hereDay: number;
  /** the figure is at the last moment (today) */
  atToday: boolean;
  /** the day the future starts after, when there is a future */
  cut: number | null;
}

/** a moment's name in the list (stable while History does not change) */
export const momentKey = (m: Moment): string => `${m.type}:${m.ids[0] ?? Math.round(m.day)}`;

export function viewOf(i: ViewIn): View {
  const all = i.future.length ? [...i.days, ...i.future] : i.days;
  const series: Record<string, Series> = {}, metrics: StripMetric[] = [];
  const shown = new Set(drawable(i.hidden).map((m) => m.id));
  for (const m of STRIP_METRICS) {
    if (!shown.has(m.id)) continue;
    const c = i.future.length || !i.calm ? calmedDays(all as DayIn[], m.id) : i.calm(m.id);
    if (c && c.x.length) { series[m.id] = { x: c.x, y: c.mid }; metrics.push(m.id); }
  }
  const es = i.tl.entries(), entries = storyEntries(i.tl, i.labelsOf);
  const lastDay = all.length ? all[all.length - 1]!.day : 0;
  const end = Math.max(lastDay, ...es.map((e) => e.day));
  const chapters = storyOf({ entries, end, series, chapters: i.chapters ?? null, trimmed: i.tl.trimmed() });
  const moments = chapters.flatMap((c) => c.moments);
  // where the figure is: the last entry not ahead of it (an earlier moment History went back to), else today
  const ahead = entries.some((e) => e.future);
  const hereI = ahead ? entries.filter((e) => !e.future).pop()?.i ?? 0 : -1;
  const hereM = (hereI >= 0 ? moments.find((m) => m.ids.includes(hereI)) : null) ?? moments[moments.length - 1]!;
  const marks = moments.filter((m): m is Extract<Moment, { type: 'key' }> => m.type === 'key').map((m) => ({ day: m.day, tone: m.head.tone }));
  // the medicines from every entry, the ones ahead included (the strip draws the whole course; the future part is veiled)
  const ins: EntryIn[] = es.map((e) => ({
    id: e.id, kind: e.kind, label: e.label, day: e.day, ...(e.sev ? { sev: e.sev } : {}), ...(e.keys ? { keys: e.keys } : {}), ...(e.action ? { action: true } : {}),
    ...(e.snap ? { params: e.snap.params } : e.params != null ? { params: e.params } : {}) }));
  const { meds } = marksOf(ins, i.labelsOf);
  const begin = es[0]?.day ?? 0;
  return {
    chapters, series, metrics, marks, meds, full: [begin, Math.max(begin + 1, end)], here: momentKey(hereM), hereDay: hereM.day, atToday: !ahead, cut: ahead ? hereM.day : null,
  };
}

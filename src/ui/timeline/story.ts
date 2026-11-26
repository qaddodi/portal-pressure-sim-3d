// The story of a patient's history (docs/approved/timeline-story.md, option A): History's entries told as the course a reader comes back for. One card a day for a day that
// matters (a key moment), the days between folded into a quiet run, the whole cut into chapters (authored for a model patient, derived for any other), and on each key card
// the readings before and after. Read by the histories' generator (isKeyEntry: it bakes the model at the end of each such day) and by the timeline panel. Pure: no engine, no page.
import { valueAt, type Series } from '../bigtime/record.ts';
import { before, beforeAction, SETTLE_DAYS } from '../bigtime/facts.ts';
import type { Entry } from './model.ts';

/** The fields of an entry the rule reads (a baked EntryOut and a page's Entry both have them). */
export interface StoryEntryIn { kind: string; sev?: string; step?: string; evId?: string }

/** A key moment: anything a course step wrote (a Doppler note), a change (a medicine, a procedure, an action), or an event that is dangerous, critical, or a bleed brought under control.
 *  The rest (a collateral recruited, a caution) is the quiet part of the story: counted, not headlined. */
export const isKeyEntry = (e: StoryEntryIn): boolean =>
  !!e.step || e.kind === 'change' || e.sev === 'critical' || e.sev === 'danger' || e.sev === 'ok';

/** One of History's entries as the story reads it: its place in History (`i`), whether it can be shown on the figure (`go`), whether it is ahead of the moment the model is at. */
export interface StoryEntry extends StoryEntryIn {
  i: number; label: string; day: number; detail?: string; keys?: readonly string[]; action?: boolean;
  go?: boolean; future?: boolean;
  /** the medicines on at this entry, [key, label] (the start's: a patient who comes on diuretics begins "On diuretics", not "Before treatment") */
  on?: readonly (readonly [string, string])[];
}

export type Tone = 'change' | 'danger' | 'ok' | 'caution' | 'info';
/** A line of a card or of a quiet run. `times`: the same event again in the run, said once. */
export interface Item { i: number; day: number; title: string; also: string[]; detail: string; tone: Tone; go: boolean; times: number; lastDay: number }
/** A reading before and after a change ("PPG 18.2 → 9.6 mmHg"), or on the day (`a` absent). Shunt in %, the rest in mmHg or L. */
export interface Reading { k: string; name: string; unit: string; a?: number; b: number; up?: boolean }
export interface Numbers { mode: 'change' | 'day'; when: string; rows: Reading[] }

export type Moment =
  | { type: 'start'; day: number; ids: number[]; head: Item; future: boolean }
  /** the entries before were let go (History keeps its last 300) */
  | { type: 'trimmed'; day: number; ids: number[]; future: boolean }
  | { type: 'key'; day: number; ids: number[]; kind: string; head: Item; then: Item[]; minor: number; nums: Numbers; future: boolean }
  | { type: 'quiet'; day: number; to: number; ids: number[]; items: Item[]; future: boolean }
  /** where the patient is now: the last line "Day N, today" when there is one (`i`, can be come back to), else the day the model is at */
  | { type: 'today'; day: number; ids: number[]; head: Item | null; future: boolean };

export interface Chapter { from: number; to: number; label: string; moments: Moment[] }
/** A chapter's start: authored for a model patient (courses.ts, anchored to a step or a ramp, baked as a day), derived for any other (chapterStarts). */
export interface ChapterStart { from: number; label: string }

export interface StoryIn {
  entries: readonly StoryEntry[];
  /** the day the model is at, or the last day recorded */
  end: number;
  /** the day record's series, by measure id (bigtime/data.ts buildData: the same series the Over time lanes draw, so a card and the chart read the same number) */
  series: Readonly<Record<string, Series | undefined>>;
  chapters?: readonly ChapterStart[] | null;
  /** History let go of its earliest entries */
  trimmed?: boolean;
}

/** History's entries as the story reads them (the panel and the tests: one way). */
export function storyEntries(tl: { entries(): readonly Entry[]; isFuture(i: number): boolean }, labelsOf?: (p: unknown) => Map<string, string>): StoryEntry[] {
  return tl.entries().map((e, i) => {
    const p = e.snap?.params ?? e.params, on = e.kind === 'start' && labelsOf && p != null ? [...labelsOf(p)].filter(([k]) => MEDICINE(k)) : null;
    return {
      i, kind: e.kind, label: e.label, day: e.day, ...(e.sev ? { sev: e.sev } : {}), ...(e.step ? { step: e.step } : {}), ...(e.evId ? { evId: e.evId } : {}),
      ...(e.detail ? { detail: e.detail } : {}), ...(e.keys ? { keys: e.keys } : {}), ...(e.action ? { action: true } : {}), go: !!e.snap, future: tl.isFuture(i),
      ...(on?.length ? { on } : {}),
    };
  });
}

/** A chapter shorter than this merges into its neighbour (derived chapters only). */
export const MIN_CHAPTER_DAYS = 3;

const MEDICINE = (k: string): boolean => k.startsWith('drug:') || k === 'diuretics' || k === 'anticoag';
const PROCEDURES = new Set(['tips', 'dips', 'portocaval', 'dsrs', 'mesocaval', 'rex', 'splenicRx', 'occ:C5']);
const PROCEDURE = (k: string): boolean => PROCEDURES.has(k) || k.startsWith('cs:');
const isMedicine = (e: StoryEntry): boolean => !!e.keys?.length && e.keys.every(MEDICINE);
const isProcedure = (e: StoryEntry): boolean => e.kind === 'change' && !e.action && !!e.keys?.some(PROCEDURE);

/** "No carvedilol" in a change's label is a stop, said as one ("Carvedilol stopped"); the rest is the change itself, "+2 more" and all. */
export function humanize(label: string): { title: string; also: string[] } {
  const parts = label.split(' · ');
  const stop = (p: string) => /^No /.test(p);
  const main = parts.filter((p) => !stop(p));
  const stops = parts.filter(stop).map((p) => p.replace(/^No /, '').replace(/^./, (c) => c.toUpperCase()) + ' stopped');
  return main.length ? { title: main.join(' · '), also: stops } : { title: stops.join(' · '), also: [] };
}

const tone = (e: StoryEntry): Tone =>
  e.kind === 'change' ? 'change' : e.sev === 'critical' || e.sev === 'danger' ? 'danger' : e.sev === 'ok' ? 'ok' : e.sev === 'caution' ? 'caution' : 'info';
/** which entry heads a day's card: an emergency, then a procedure, an action, a dangerous line the course wrote about the day (it says what the engine's own line means), a dangerous event,
 *  a medicine, a bleed controlled, a course note */
const rank = (e: StoryEntry): number =>
  e.sev === 'critical' ? 90 : isProcedure(e) ? 85 : e.kind === 'change' && e.action ? 80 : e.sev === 'danger' ? (e.step ? 71 : 70) : e.kind === 'change' ? 60 : e.step ? 55 : e.sev === 'ok' ? 50
    : e.sev === 'caution' ? 30 : 10;
const kindWord = (e: StoryEntry): string =>
  e.kind === 'change' ? (isMedicine(e) ? 'Medicine' : e.action || isProcedure(e) ? 'Procedure' : 'Change') : e.sev === 'critical' ? 'Emergency' : 'Event';
const itemOf = (e: StoryEntry): Item => {
  const h = e.kind === 'change' ? humanize(e.label) : { title: e.label, also: [] };
  return { i: e.i, day: e.day, title: h.title, also: h.also, detail: e.detail ?? '', tone: tone(e), go: !!e.go, times: 1, lastDay: e.day };
};

/** the readings a card compares, in the order a hepatologist reads them: id, name, unit, the least change worth saying (the model's own noise is less), decimals, scale */
const READ: readonly [string, string, string, number, number, number][] = [
  ['ppg', 'PPG', 'mmHg', 0.6, 1, 1], ['hvpg', 'HVPG', 'mmHg', 0.6, 1, 1], ['asc', 'Ascites', 'L', 0.25, 1, 1], ['shunt', 'Shunt', '%', 0.08, 0, 100],
  ['ra', 'RA', 'mmHg', 0.5, 1, 1],
];
/** the readings a card can compare, by the measure's id (the view makes a series for each; the strip draws only some of them) */
export const CARD_READINGS: readonly string[] = READ.map((r) => r[0]);
const MAX_ROWS = 3;

/** What a change acts on, by the key of the change (Treat's keys): the readings that step is made to move, said first when they moved. Any other reading that moved follows in the usual
 *  order, and one that did not move stays out. A tricuspid repair acts on the right atrium, so its card leads with RA, not with the portal gradient it only touches. */
const ACTS_ON: readonly (readonly [(k: string) => boolean, readonly string[]])[] = [
  [(k) => k === 'tr' || k === 'contractility', ['ra']],
  [(k) => k === 'tips' || k === 'dips' || k === 'portocaval' || k === 'dsrs' || k === 'mesocaval' || k === 'rex' || k === 'splenicRx' || k.startsWith('cs:'), ['ppg', 'shunt']],
  [(k) => k.startsWith('occ:'), ['shunt', 'ppg']],
];
/** the readings the changes' keys act on, in order, without repeats */
export function actsOn(keys: readonly string[]): string[] {
  const out: string[] = [];
  for (const k of keys) for (const [test, ids] of ACTS_ON) if (test(k)) for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

/** What a key day did to the readings.
 *  - An action (a band, a tap) acts at once: the reading before it and right after it, on its own day.
 *  - A procedure settles: the reading SETTLE_DAYS later, but never past the day before the next change (a drug started 3 days before a TIPS is not credited with the TIPS's drop).
 *  - A medicine's start, or an event, shows the day's readings (a slow drug under a disease that keeps moving would read as the drug failing). */
export function numbers(series: StoryIn['series'], es: readonly StoryEntry[], day: number, end: number, nextChange: number | null): Numbers {
  const changes = es.filter((e) => e.kind === 'change' && !isMedicine(e)), acts = changes.some((e) => e.action);
  const moved = changes.length ? compare(series, day, end, nextChange, acts, actsOn(changes.flatMap((e) => e.keys ?? []))) : null;
  // (a change that moved none of them (a band, a drug stopped) says where the readings stand that day instead of an empty line)
  return moved?.rows.length ? moved : dayReadings(series, day);
}
export function dayReadings(series: StoryIn['series'], day: number): Numbers {
  const rows: Reading[] = [];
  for (const [k, name, unit, , dp, scale] of READ) {
    const v = valueAt(series[k], day);
    // (the right atrium is compared for the steps that act on it, never said on a day's card: the day's card is the portal readings)
    if (v == null || k === 'shunt' || k === 'ra' || (k === 'asc' && v < 0.2)) continue;
    rows.push({ k, name, unit, b: +(v * scale).toFixed(dp) });
  }
  return { mode: 'day', when: 'that day', rows: rows.slice(0, MAX_ROWS) };
}
function compare(series: StoryIn['series'], day: number, end: number, nextChange: number | null, acts: boolean, focus: readonly string[]): Numbers {
  const rows: Reading[] = [];
  const after = acts ? day : Math.max(day, Math.min(end, day + SETTLE_DAYS, nextChange != null ? nextChange - 1 : Infinity));
  for (const [k, name, unit, min, dp, scale] of READ) {
    const s = series[k], f = (v: number) => +(v * scale).toFixed(dp);
    const a = acts ? beforeAction(s, day) : before(s, day), b = valueAt(s, after);
    if (a == null || b == null || Math.abs(b - a) < min) continue;
    rows.push({ k, name, unit, a: f(a), b: f(b), up: b > a });
  }
  // (what the step acts on first; the sort is stable, so the rest keep the usual order)
  const first = (k: string) => { const i = focus.indexOf(k); return i < 0 ? focus.length : i; };
  rows.sort((x, y) => first(x.k) - first(y.k));
  const n = after - day;
  return { mode: 'change', when: n === 0 ? 'right after' : n === 1 ? '1 day later' : `${n} days later`, rows: rows.slice(0, MAX_ROWS) };
}

const lowerFirst = (s: string) => s.replace(/^\S+/, (w) => (/^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w));
/** a change's name without its size or its gloss: "TIPS 8 mm" is "TIPS", "BRTO (gastrorenal shunt occluded)" is "BRTO" */
const bareName = (label: string) => label.replace(/\s*\(.*$/, '').replace(/\s*[\d×].*$/, '') || label;
const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** A patient's chapters when none are authored: one starts at each procedure and at the first start of each medicine ("Before treatment", "On carvedilol", "After the TIPS").
 *  A chapter under MIN_CHAPTER_DAYS merges into its neighbour (the last one stays: the patient is in it). No treatment, or a patient whose clock has not run days: one chapter, unnamed. */
export function chapterStarts(entries: readonly StoryEntry[], begin: number, end: number): ChapterStart[] {
  const on = entries[0]?.on ?? [];
  const starts: ChapterStart[] = [{ from: begin, label: on.length ? `On ${and(on.map(([, l]) => lowerFirst(bareName(l))))}` : 'Before treatment' }];
  const seen = new Set<string>(on.map(([k]) => k));
  for (const e of entries) {
    if (e.kind !== 'change' || e.day <= begin) continue;   // (the moments ahead keep their chapters: going back does not rename the course)
    const parts = e.label.split(' · ');
    if (isProcedure(e)) {
      const word = parts.find((p) => !/^No /.test(p) && !/^\+\d+ more$/.test(p)) ?? e.label;
      starts.push({ from: e.day, label: `After the ${lowerFirst(bareName(word))}` });
      continue;
    }
    const fresh = (e.keys ?? []).filter((k) => MEDICINE(k) && !seen.has(k));
    for (const k of e.keys ?? []) if (MEDICINE(k)) seen.add(k);
    if (!fresh.length) continue;
    const names = parts.filter((p) => !/^No /.test(p) && !/^\+\d+ more$/.test(p)).slice(0, fresh.length).map((p) => lowerFirst(bareName(p)));
    starts.push({ from: e.day, label: `On ${and(names)}` });
  }
  // (two on one day are one chapter, the later's words)
  const one: ChapterStart[] = [];
  for (const s of starts) { if (one.length && one[one.length - 1]!.from === s.from) one[one.length - 1] = s; else one.push(s); }
  if (one.length < 2 || end - begin < MIN_CHAPTER_DAYS) return [{ from: begin, label: '' }];
  for (let i = 0; i < one.length - 1;) {
    if (one[i + 1]!.from - one[i]!.from >= MIN_CHAPTER_DAYS) { i++; continue; }
    // (a short first chapter takes the next one's name from the start; any other short one joins the one before it)
    if (i === 0) one.splice(0, 2, { from: one[0]!.from, label: one[1]!.label }); else one.splice(i, 1);
    if (i > 0) i--;
  }
  return one;
}

/** The story: chapters, each with its moments in order (the start, key days, quiet runs, today). Every entry is in exactly one moment (`ids`). */
export function storyOf(s: StoryIn): Chapter[] {
  const es = s.entries, begin = es[0]?.day ?? 0, end = Math.max(s.end, ...es.map((e) => e.day));
  const starts = (s.chapters?.length ? [...s.chapters] : chapterStarts(es, begin, end)).sort((a, b) => a.from - b.from);
  starts[0] = { ...starts[0]!, from: Math.min(begin, starts[0]!.from) };
  const chapters: Chapter[] = starts.map((c, k) => ({ from: c.from, to: k + 1 < starts.length ? starts[k + 1]!.from : end, label: c.label, moments: [] }));
  const chapterOf = (day: number): Chapter => { let c = chapters[0]!; for (const x of chapters) if (day >= x.from) c = x; return c; };

  const startEntry = es[0]?.kind === 'start' ? es[0] : null;
  const last = es[es.length - 1];
  const todayEntry = last && last.kind === 'jump' && last !== startEntry && last.day >= end ? last : null;
  if (startEntry) chapters[0]!.moments.push({ type: 'start', day: startEntry.day, ids: [startEntry.i], head: itemOf(startEntry), future: !!startEntry.future });
  if (s.trimmed) chapters[0]!.moments.push({ type: 'trimmed', day: begin, ids: [], future: false });

  // the days, in order, each split where the model's moment is (the past and the future of one day are two cards)
  const groups: StoryEntry[][] = [];
  for (const e of es) {
    if (e === startEntry || e === todayEntry) continue;
    const g = groups[groups.length - 1], h = g?.[0];
    if (g && h!.day === e.day && !!h!.future === !!e.future) g.push(e); else groups.push([e]);
  }
  const changeDays = [...new Set(es.filter((e) => e.kind === 'change').map((e) => e.day))].sort((a, b) => a - b);
  let run: Extract<Moment, { type: 'quiet' }> | null = null, runIn: Chapter | null = null;
  const flush = () => { if (run) runIn!.moments.push(run); run = null; runIn = null; };
  for (const g of groups) {
    const day = g[0]!.day, future = !!g[0]!.future, ch = chapterOf(day), ids = g.map((e) => e.i);
    if (g.some(isKeyEntry)) {
      flush();
      const head = g.reduce((a, b) => (rank(b) > rank(a) ? b : a));
      const rest = g.filter((e) => e !== head), said = rest.filter((e) => isKeyEntry(e) || e.sev === 'caution');
      const next = changeDays.find((d) => d > day) ?? null;
      ch.moments.push({
        type: 'key', day, ids, kind: kindWord(head), head: itemOf(head), then: said.map(itemOf), minor: rest.length - said.length,
        nums: numbers(s.series, g, day, end, next), future,
      });
      continue;
    }
    // a quiet day joins the run before it unless a chapter starts between them or the model's moment is between them
    if (run && (runIn !== ch || run.future !== future)) flush();
    if (!run) { run = { type: 'quiet', day, to: day, ids: [], items: [], future }; runIn = ch; }
    const r: Extract<Moment, { type: 'quiet' }> = run;
    r.to = day; r.ids.push(...ids);
    for (const e of g) {
      // (the same event again in one run is said once, with how many times: a live patient raises "Ascites forming" every half minute of page time)
      const same = e.kind === 'event' ? r.items.find((x) => x.title === e.label && x.tone === tone(e)) : undefined;
      if (same) { same.times++; same.lastDay = e.day; if (e.go) { same.go = true; same.i = e.i; } } else r.items.push(itemOf(e));
    }
  }
  flush();
  const lastCh = chapters[chapters.length - 1]!;
  lastCh.moments.push({ type: 'today', day: todayEntry?.day ?? end, ids: todayEntry ? [todayEntry.i] : [], head: todayEntry ? itemOf(todayEntry) : null, future: !!todayEntry?.future });
  return chapters;
}

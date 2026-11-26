// The story of a patient's history (src/ui/timeline/story.ts; docs/approved/timeline-story.md, plan rows 7 to 12, 16 and 18): every entry in one moment, the chapters covering the
// course with no gap, no quiet run across a chapter or the model's moment, "after" read before the next change, repeats said once, labels kept whole. On all 12 baked histories and
// on live fixtures. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyOf, storyEntries, chapterStarts, humanize, isKeyEntry, MIN_CHAPTER_DAYS, type Chapter, type StoryEntry, type StoryIn } from '../src/ui/timeline/story.ts';
import { Timeline, type TimelineHost } from '../src/ui/timeline/model.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { buildData } from '../src/ui/bigtime/data.ts';
import { valueAt } from '../src/ui/bigtime/record.ts';
import { before, SETTLE_DAYS } from '../src/ui/bigtime/facts.ts';
import { calmedDays } from '../src/engine/hales/portal/trail-calm.js';
import { activeInterventions } from '../src/ui/action/changes.ts';
import type { Baked } from '../src/ui/histories/types.ts';

const noop = () => undefined;
const host = (): TimelineHost => ({
  snapshot: async () => ({ t: 0, day: 0, params: {} }), restore: noop, frame: () => null, params: () => ({}), advance: noop, scenarioLabel: () => 'Healthy',
  labelsOf: () => new Map(), say: noop, announce: noop, now: () => 0, later: () => 0, cancel: noop,
});
const labelsOf = (p: unknown) => new Map(activeInterventions(p as never).map((c) => [c.key, c.label]));
/** the page's own path: History's entries, and the series the Over time lanes draw */
const seriesOf = (b: Baked) => buildData({ calm: (k) => calmedDays(b.days, k), entries: [], labelsOf, hidden: null }).series;
async function storyIn(id: string, at?: (tl: Timeline) => void): Promise<{ s: StoryIn; b: Baked; tl: Timeline }> {
  const h = HISTORIES.find((x) => x.id === id)!, b = await LOAD[id]!();
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, h.name), b.snap.params);
  at?.(tl);
  return { s: { entries: storyEntries(tl, labelsOf), end: b.snap.day, series: seriesOf(b) }, b, tl };
}

function checkShape(name: string, s: StoryIn, ch: Chapter[]) {
  const ids = ch.flatMap((c) => c.moments.flatMap((m) => m.ids)).sort((a, b) => a - b);
  assert.deepEqual(ids, s.entries.map((e) => e.i), `${name}: every entry is in exactly one moment`);
  assert.equal(ch[0]!.from, s.entries[0]!.day, `${name}: the first chapter starts at the start`);
  for (let k = 0; k < ch.length; k++) {
    const c = ch[k]!, to = k + 1 < ch.length ? ch[k + 1]!.from : c.to;
    assert.equal(c.to, to, `${name}: chapter ${k} ends where the next begins`);
    assert.ok(c.to > c.from || k === ch.length - 1, `${name}: chapter ${k} is not empty`);
    for (const m of c.moments) {
      if (m.type === 'today') continue;
      const last = m.type === 'quiet' ? m.to : m.day;
      assert.ok(m.day >= c.from && (last < c.to || k === ch.length - 1), `${name}: a ${m.type} moment (Day ${m.day} to ${last}) sits inside "${c.label}" (${c.from} to ${c.to})`);
    }
  }
  const all = ch.flatMap((c) => c.moments);
  assert.equal(all[0]!.type, 'start'); assert.equal(all[all.length - 1]!.type, 'today');
  for (const m of all) {
    if (m.type !== 'key' && m.type !== 'quiet') continue;
    const es = m.ids.map((i) => s.entries[i]!);
    assert.ok(es.every((e) => !!e.future === m.future), `${name} Day ${m.day}: a moment is all past or all future`);
    if (m.type === 'quiet') assert.ok(es.every((e) => !isKeyEntry(e)), `${name}: a quiet run holds no key entry`);
    else assert.ok(es.every((e) => e.day === m.day), `${name}: a key card is one day`);
  }
}

test('every baked history tells a story: one moment for each entry, chapters from the start to today, every moment inside its chapter', async () => {
  for (const h of HISTORIES) {
    const { s } = await storyIn(h.id);
    const ch = storyOf(s);
    checkShape(h.id, s, ch);
    const keys = ch.flatMap((c) => c.moments).filter((m) => m.type === 'key');
    assert.ok(keys.length >= 2, `${h.id}: the story has its key moments`);
    for (const m of keys) assert.ok(m.nums.rows.length > 0, `${h.id} Day ${m.day}: "${m.head.title}" says a reading`);
  }
});

test('a change\'s "after" is read on its own day for an action, a week on for a procedure but never on or past the next change, and both ends are the chart\'s own numbers', async () => {
  for (const h of HISTORIES) {
    const { s } = await storyIn(h.id);
    const changeDays = s.entries.filter((e) => e.kind === 'change').map((e) => e.day);
    for (const m of storyOf(s).flatMap((c) => c.moments)) {
      if (m.type !== 'key' || m.nums.mode !== 'change') continue;
      const n = m.nums.when === 'right after' ? 0 : m.nums.when === '1 day later' ? 1 : +/^(\d+) days later$/.exec(m.nums.when)![1]!;
      const next = changeDays.find((d) => d > m.day);
      assert.ok(n <= SETTLE_DAYS, `${h.id} Day ${m.day}`);
      if (next != null) assert.ok(m.day + n < next, `${h.id} Day ${m.day}: "after" (Day ${m.day + n}) is before the next change (Day ${next})`);
      for (const r of m.nums.rows) {
        const sc = r.k === 'shunt' ? 100 : 1, ser = s.series[r.k]!;
        assert.equal(r.a, +(before(ser, m.day)! * sc).toFixed(r.k === 'shunt' ? 0 : 1), `${h.id} Day ${m.day} ${r.name} before`);
        assert.equal(r.b, +(valueAt(ser, m.day + n)! * sc).toFixed(r.k === 'shunt' ? 0 : 1), `${h.id} Day ${m.day} ${r.name} after`);
      }
    }
  }
});

test('the cirrhosis bleed reads as the course: a tap and a TIPS show what they did, a medicine shows the day', async () => {
  const { s } = await storyIn('hist-bleed');
  const keys = storyOf(s).flatMap((c) => c.moments).filter((m) => m.type === 'key');
  const tips = keys.find((m) => m.head.title === 'TIPS 8 mm')!;
  assert.deepEqual(tips.head.also, ['Carvedilol stopped', 'Terlipressin stopped'], '"No carvedilol" is said as a stop');
  assert.equal(tips.kind, 'Procedure');
  assert.equal(tips.nums.when, '8 days later');
  const ppg = tips.nums.rows.find((r) => r.k === 'ppg')!;
  assert.ok(ppg.a! > 12 && ppg.b < 12 && !ppg.up, 'the TIPS brings the PPG under 12');
  const bleed = keys.find((m) => m.day === 70)!;
  assert.equal(bleed.kind, 'Emergency'); assert.equal(bleed.head.title, 'Esophageal varix ruptured');
  assert.deepEqual(bleed.then.map((t) => t.title), ['Terlipressin', 'Bleeding controlled by banding', 'Band (EVL)']);
  const carv = keys.find((m) => m.head.title === 'Carvedilol')!;
  assert.equal(carv.nums.mode, 'day', 'a medicine\'s start is not credited with a week of the disease');
  const { s: a } = await storyIn('hist-ascites');
  const tap = storyOf(a).flatMap((c) => c.moments).find((m) => m.type === 'key' && m.head.title.startsWith('Paracentesis'));
  assert.ok(tap && tap.type === 'key');
  const asc = tap.nums.rows.find((r) => r.k === 'asc')!;
  assert.equal(tap.nums.when, 'right after');
  assert.ok(asc.a! > 4 && asc.b < 0.5, `the tap drains the belly in the record the chart draws (${asc.a} → ${asc.b} L)`);
});

test('the derived chapters: before treatment, the first start of each medicine, each procedure; a patient who comes on a medicine begins on it', async () => {
  const { s } = await storyIn('hist-bleed');
  assert.deepEqual(storyOf(s).map((c) => [c.from, c.label]), [[0, 'Before treatment'], [19, 'On carvedilol'], [70, 'On terlipressin'], [73, 'After the TIPS']]);
  const { s: a } = await storyIn('hist-ascites');
  assert.deepEqual(storyOf(a).map((c) => [c.from, c.label]), [[0, 'On diuretics'], [110, 'After the TIPS']]);
  const { s: g } = await storyIn('hist-brto');
  assert.ok(storyOf(g).some((c) => c.label === 'After the BRTO'), 'a procedure is named without its gloss');
});

test('authored chapters win, and a short derived chapter merges into its neighbour', async () => {
  const { s } = await storyIn('hist-bleed');
  const ch = storyOf({ ...s, chapters: [{ from: 0, label: 'Before treatment' }, { from: 19, label: 'On carvedilol' }, { from: 70, label: 'The bleed' }, { from: 73, label: 'After the TIPS' }] });
  assert.deepEqual(ch.map((c) => c.label), ['Before treatment', 'On carvedilol', 'The bleed', 'After the TIPS']);
  checkShape('authored', s, ch);
  const e = (i: number, day: number, label: string, keys: string[], o: Partial<StoryEntry> = {}): StoryEntry => ({ i, kind: 'change', label, day, keys, ...o });
  const es: StoryEntry[] = [{ i: 0, kind: 'start', label: 'x', day: 0 }, e(1, 10, 'Carvedilol', ['drug:carvedilol']), e(2, 11, 'TIPS 10 mm', ['tips']), e(3, 40, 'Diuretics', ['diuretics'])];
  const st = chapterStarts(es, 0, 90);
  assert.deepEqual(st.map((c) => [c.from, c.label]), [[0, 'Before treatment'], [11, 'After the TIPS'], [40, 'On diuretics']], `a chapter under ${MIN_CHAPTER_DAYS} days joins the one before it`);
  assert.deepEqual(chapterStarts(es.slice(0, 1), 0, 90).map((c) => c.label), [''], 'no treatment: one chapter, unnamed');
  assert.deepEqual(chapterStarts(es.map((x) => ({ ...x, day: 0 })), 0, 0).map((c) => c.label), [''], 'a patient whose clock has not run days: one chapter, unnamed');
});

test('going back: the moments after it are the future, and no card or run mixes the two', async () => {
  for (const h of HISTORIES) {
    const { s, tl } = await storyIn(h.id, (t) => { const i = t.entries().findIndex((e) => e.snap && e.past); t.goTo(i, { quiet: true }); });
    const ch = storyOf(s);
    checkShape(`${h.id} gone back`, s, ch);
    const all = ch.flatMap((c) => c.moments), firstFuture = all.findIndex((m) => m.future);
    assert.ok(firstFuture > 0, `${h.id}: there is a future`);
    assert.ok(all.slice(firstFuture).every((m) => m.future || m.type === 'trimmed'), `${h.id}: after the moment, everything is the future`);
    assert.ok(tl.isFuture(tl.entries().length - 1));
  }
});

test('a live patient: repeats in a run said once, "+2 more" kept whole, a long run keeps its start and says the rest was let go', () => {
  const tl = new Timeline(host());
  tl.reset();
  const ev = (k: number, day: number) => ({ id: 'ASC', title: 'Ascites forming', severity: 'caution', t: k * 100, day });
  let now = 0;
  const h = { ...host(), now: () => now };
  const live = new Timeline(h);
  live.reset();
  for (let k = 0; k < 4; k++) { now += 60_000; live.addEvents([ev(k, 5 + k)]); }
  const s1 = storyOf({ entries: storyEntries(live), end: 9, series: {} });
  const runs = s1.flatMap((c) => c.moments).filter((m) => m.type === 'quiet');
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.type === 'quiet' && runs[0]!.items.length, 1, 'four "Ascites forming" are one line');
  assert.equal(runs[0]!.type === 'quiet' && runs[0]!.items[0]!.times, 4);
  assert.equal(humanize('Carvedilol · Diuretics · Albumin 3.0 g/dL · +2 more').title, 'Carvedilol · Diuretics · Albumin 3.0 g/dL · +2 more');
  assert.deepEqual(humanize('No carvedilol · No terlipressin'), { title: 'Carvedilol stopped · Terlipressin stopped', also: [] });
  for (let k = 0; k < 400; k++) { now += 60_000; tl.addEvents([{ id: `E${k}`, title: `Event ${k}`, severity: 'info', t: k, day: k }]); }
  assert.ok(tl.trimmed());
  const s2: StoryIn = { entries: storyEntries(tl), end: 400, series: {}, trimmed: tl.trimmed() };
  const all = storyOf(s2).flatMap((c) => c.moments);
  assert.equal(all[0]!.type, 'start', 'the start stays first');
  assert.equal(all[1]!.type, 'trimmed', 'and says the earlier moments were not kept');
  checkShape('400 entries', s2, storyOf(s2));
  tl.reset();
  assert.equal(tl.trimmed(), false, 'a new patient starts whole');
});

test('the 12 histories carry their approved chapters, each anchored to a step or a ramp of the course, and the story keeps every moment inside them', async () => {
  const { COURSES } = await import('../src/ui/histories/courses.ts');
  const { chaptersOf } = await import('../src/ui/histories/play.ts');
  for (const c of COURSES) {
    assert.ok(c.chapters.length >= 2 && !c.chapters[0]!.at, `${c.id}: a first chapter from Day 0, then at least one anchored`);
    for (const ch of c.chapters.slice(1)) {
      const at = ch.at!;
      const ok = typeof at === 'string' ? c.steps.some((s) => s.id === at) : !!c.ramps?.some((r) => r.key === at.ramp);
      assert.ok(ok, `${c.id}: "${ch.label}" names a step or a ramp of the course`);
    }
    const h = HISTORIES.find((x) => x.id === c.id)!;
    assert.deepEqual(h.chapters, chaptersOf(c), `${c.id}: the baked chapters are the course's`);
    const days = h.chapters!.map((x) => x.from);
    assert.deepEqual(days, [...days].sort((a, b) => a - b), `${c.id}: in order`);
    const { s } = await storyIn(c.id);
    const ch = storyOf({ ...s, chapters: h.chapters! });
    assert.deepEqual(ch.map((x) => x.label), c.chapters.map((x) => x.label));
    checkShape(`${c.id} authored`, s, ch);
  }
  const bad = { ...COURSES[0]!, chapters: [{ label: 'A' }, { at: 'nope', label: 'B' }] };
  assert.throws(() => chaptersOf(bad), /anchored to "nope"/, 'an anchor that names nothing stops the generator');
});

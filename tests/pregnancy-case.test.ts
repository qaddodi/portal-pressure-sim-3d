// The pregnancy case (capture 0bc14020, owner, 26 Nov: "can only scope in second trimester", and the gestational week on every pregnancy stop). The general rules, pinned on every course:
//  1. What only an endoscopy sees (large varices, red wale signs) is told on the day of a scope, never on the model's own clock (Course.scoped, histories/play.ts).
//  2. A course with its own clock (the gestation ramp) says it on every stop it has reached (case/when.ts), and a course without one says nothing extra.
//  3. A line the course wrote about a day heads that day's stop over the engine's own line of the same tone (timeline/story.ts rank).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { COURSES } from '../src/ui/histories/courses.ts';
import { ENDOSCOPIC } from '../src/ui/histories/play.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { Timeline, type TimelineHost, type Snap } from '../src/ui/timeline/model.ts';
import { viewOf } from '../src/ui/timeline/story-view.ts';
import { stopsOf } from '../src/ui/case/stops.ts';
import { kickerWords, continueWords, chapterAt, travelWords } from '../src/ui/case/words.ts';
import { whenWords } from '../src/ui/case/when.ts';
import type { CaseRamp } from '../src/ui/case/types.ts';

const host = (): TimelineHost => ({
  snapshot: async () => ({ t: 0, day: 0, params: {} }), restore: (_s: Snap) => undefined,
  frame: () => null, params: () => ({}), advance: () => undefined, scenarioLabel: () => '', labelsOf: () => new Map(), say: () => undefined, announce: () => undefined,
  now: () => 0, later: () => 0, cancel: () => undefined,
});
async function caseOf(id: string) {
  const b = await LOAD[id]!(), meta = HISTORIES.find((h) => h.id === id)!;
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, meta.name), b.snap.params);
  const v = viewOf({ tl, days: b.days, future: [], hidden: null, labelsOf: () => new Map(), chapters: meta.chapters ?? null });
  return { b, meta, v, stops: stopsOf(v.chapters, tl.entries(), meta.play?.stops ?? [], meta.play?.ramps) };
}
const weekOf = (d: number): number => 6 + (d - 30) / 7;

test('a scoped course tells what only a scope sees on the day of a scope, never before', async () => {
  const scoped = COURSES.filter((c) => c.scoped);
  assert.ok(scoped.some((c) => c.id === 'hist-pregnancy'), 'the pregnancy is scoped');
  for (const c of scoped) {
    const b = await LOAD[c.id]!();
    const scopeDays = new Set(c.steps.filter((s) => s.scope || s.act === 'band').map((s) => s.day));
    const seen = b.entries.filter((e) => (ENDOSCOPIC as readonly string[]).includes(e.evId ?? ''));
    assert.ok(seen.length > 0, `${c.id}: the scope finds something`);
    for (const e of seen) assert.ok(scopeDays.has(e.day), `${c.id}: "${e.label}" on Day ${e.day}, which is not a scope day (${[...scopeDays]})`);
  }
});

test('Pregnancy: no scope in the first trimester, the first scope in the second with its findings and the treatment, none in the third', async () => {
  const { b } = await caseOf('hist-pregnancy');
  const c = COURSES.find((x) => x.id === 'hist-pregnancy')!;
  const egd = c.steps.find((s) => s.id === 'egd')!, prop = c.steps.find((s) => s.id === 'prop')!;
  assert.ok(weekOf(egd.day) >= 14 && weekOf(egd.day) <= 26, `the screening scope at ${weekOf(egd.day)} weeks is in the second trimester (13 to 26)`);
  assert.equal(prop.day, egd.day, 'the treatment is started at the scope');
  const scopes = c.steps.filter((s) => s.scope || s.act === 'band');
  for (const s of scopes) assert.ok(weekOf(s.day) >= 14 && weekOf(s.day) < 28, `a scope at ${weekOf(s.day)} weeks is in the second trimester`);
  for (const id of ENDOSCOPIC) {
    const e = b.entries.find((x) => x.evId === id);
    assert.equal(e?.day, egd.day, `${id}: first known at the screening scope, not on the model's clock`);
  }
  // (from 27 weeks: the climb begins at the turn of the third trimester. Since the course's daily look runs the breath and the beat as every course's does
  // (hales-engine 8608956, no `still`), the wall index's two-breath mean crosses a day earlier, at 27.9 weeks, against 28.1 held still.)
  const risk = b.entries.find((e) => e.evId === 'BLEED_RISK' && weekOf(e.day) >= 27);
  assert.ok(risk, 'the pressure climbs into the third trimester, and that is told');
});

test('Pregnancy: the screening scope and the third-trimester warning head their own stops, in the chapter of their trimester', async () => {
  const { stops, v } = await caseOf('hist-pregnancy');
  const at = (week: number) => stops.find((s) => Math.round(weekOf(s.day)) === week)!;
  assert.equal(at(18).title, 'Screening endoscopy', 'the course\'s own line heads the day, over the engine\'s "Red wale signs"');
  assert.equal(at(29).title, 'Pressure climbing, no scope now', 'and over "Bleeding more likely"');
  assert.match(chapterAt(v.chapters, at(18).day), /^Second trimester/);
  assert.match(chapterAt(v.chapters, at(29).day), /^Third trimester/);
  assert.equal(chapterAt(v.chapters, at(38).day), 'After delivery');
  assert.ok(!stops.some((s) => Math.round(weekOf(s.day)) === 10), 'no stop at 10 weeks (the red wale signs were the model\'s, not seen)');
});

test('every stop of a pregnancy says its week, and a course with no such clock says none', async () => {
  for (const h of HISTORIES) {
    const { stops, meta } = await caseOf(h.id);
    const clock = meta.play?.ramps?.find((r) => r.key === 'gestation');
    for (const s of stops) {
      if (!clock || s.day < clock.from) { assert.equal(s.when ?? '', '', `${h.id} Day ${s.day}: no clock, no words`); continue; }
      assert.ok(s.when && /week/.test(s.when) || s.when === 'Just delivered', `${h.id} Day ${s.day}: says its week ("${s.when}")`);
    }
  }
  const { stops, v } = await caseOf('hist-pregnancy');
  const egd = stops.findIndex((s) => s.title === 'Screening endoscopy');
  assert.equal(stops[egd]!.when, '18 weeks');
  assert.equal(kickerWords(stops, egd, chapterAt(v.chapters, stops[egd]!.day)), `Stop ${egd + 1} of ${stops.length} · Day 114 · 18 weeks · Second trimester: scope, propranolol, bands`);
  assert.match(continueWords(stops, egd - 1)!, /^Continue to Day 114 · 18 weeks · Screening endoscopy$/);
  assert.equal(continueWords(stops, egd - 1, true), 'Continue to Day 114', 'the short form on a phone is unchanged');
  assert.match(travelWords(stops, egd, 100, v.chapters).head, /^Next stop: Day 114 · 18 weeks$/);
  assert.equal(stops[0]!.when, '', 'before the pregnancy there is no week');
});

test('the weeks come from the gestation ramp: 6 weeks at its start, 38 at term, then the weeks after the delivery', () => {
  const ramp: CaseRamp[] = [{ key: 'gestation', from: 30, to: 254, a: 6, b: 38 }];
  assert.equal(whenWords(ramp, 10), '');
  assert.equal(whenWords(ramp, 30), '6 weeks');
  assert.equal(whenWords(ramp, 58), '10 weeks');
  assert.equal(whenWords(ramp, 191), '29 weeks');
  assert.equal(whenWords(ramp, 254), '38 weeks');
  assert.equal(whenWords(ramp, 257), 'Just delivered');
  assert.equal(whenWords(ramp, 261), '1 week after delivery');
  assert.equal(whenWords(ramp, 330), '10 weeks after delivery');
  assert.equal(whenWords([{ key: 'cirrhosis', from: 0, to: 55, a: 0.4, b: 0.86 }], 40), '', 'a ramp that is not a pregnancy says nothing');
  assert.equal(whenWords(undefined, 40), '');
});

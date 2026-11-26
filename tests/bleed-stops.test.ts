// The bleed's stops (capture 0bc14020 review, Mohammad 26 Nov: "need for bleed for sure", "we have EUS glue of gastric varix animation", "we have that endoscopically, yes do it").
// Three rules, each for every course that has a bleed, not for one patient:
//  1. Antibiotic prophylaxis is part of every variceal bleed (First bleed and PSVD never said it): the course's text says it, from one constant.
//  2. The bleed is seen bleeding: its model is kept as it bled, the story ends the bleed's moment there, and the case has two stops on that day, the bleeding and what is done about it.
//  3. The scope is where the bleed is: an esophageal bleed opens the Endoscopy card by itself (its own bleed view); a fundal one never offers the esophageal scope (it shows no varix there)
//     and looks at the fundus and watches the EUS coils and glue that stop it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { ANTIBIOTICS, COURSES } from '../src/ui/histories/courses.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { Timeline, type TimelineHost, type Snap } from '../src/ui/timeline/model.ts';
import { viewOf } from '../src/ui/timeline/story-view.ts';
import { storyOf, endsBleed, type StoryEntry } from '../src/ui/timeline/story.ts';
import { stopsOf } from '../src/ui/case/stops.ts';
import { GLUE_LOOK, SCOPE_LOOK } from '../src/ui/case/looks.ts';
import { dayShift, SAME_DAY_PX, stripNames } from '../src/ui/case/strip.ts';
import { lookSide, shortName, stopName } from '../src/ui/case/words.ts';
import { specOf } from '../src/scene/procedures/copied/proc-anim.js';
import { PROCEDURE_PLAYS } from '../src/scene/procedures/plays.ts';
import { VIEWS } from '../src/ui/shell/views.ts';
import type { Baked } from '../src/ui/histories/types.ts';

const host = (): TimelineHost => ({
  snapshot: async () => ({ t: 0, day: 0, params: {} }), restore: (_s: Snap) => undefined, frame: () => null, params: () => ({}), advance: () => undefined, scenarioLabel: () => '',
  labelsOf: () => new Map(), say: () => undefined, announce: () => undefined, now: () => 0, later: () => 0, cancel: () => undefined,
});
const bleeds = COURSES.filter((c) => c.steps.some((s) => s.act === 'bleed'));
async function stopsOfCourse(id: string) {
  const b: Baked = await LOAD[id]!(), meta = HISTORIES.find((h) => h.id === id)!;
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, meta.name), b.snap.params);
  const v = viewOf({ tl, days: b.days, future: [], hidden: null, labelsOf: () => new Map(), chapters: meta.chapters ?? null });
  return { b, es: tl.entries(), stops: stopsOf(v.chapters, tl.entries(), meta.play?.stops ?? []), v };
}
const active = (snap: unknown): boolean => !!(snap as { bleed?: { active?: boolean } } | undefined)?.bleed?.active;

test('there are courses with a bleed, a gastric one among them', () => {
  assert.ok(bleeds.length >= 4);
  assert.ok(bleeds.some((c) => c.steps.some((s) => s.site === 'GV')) && bleeds.some((c) => c.steps.some((s) => s.act === 'bleed' && s.site !== 'GV')));
});

test('every variceal bleed in every course carries antibiotic prophylaxis the day it happens', async () => {
  for (const c of bleeds) {
    const b: Baked = await LOAD[c.id]!();
    for (const r of b.entries.filter((e) => e.evId === 'VARIX_RUPTURE')) {
      const said = b.entries.filter((e) => e.day === r.day).some((e) => /ceftriaxone/i.test(e.detail ?? ''));
      assert.ok(said, `${c.id}: the bleed of Day ${r.day} names its antibiotic prophylaxis`);
    }
    // (and in the course itself, so a rebake cannot lose it: the step that gives the vasoactive drug says it from the one constant)
    const bleedDays = c.steps.filter((s) => s.act === 'bleed').map((s) => s.day);
    for (const d of bleedDays) assert.ok(c.steps.some((s) => s.day === d && s.detail?.includes(ANTIBIOTICS)), `${c.id}: Day ${d}'s steps say "${ANTIBIOTICS}"`);
  }
});

test('the story ends a bleed\'s moment at its rupture when the model was kept there, and only then', () => {
  const e = (i: number, o: Partial<StoryEntry>): StoryEntry => ({ i, kind: 'event', label: 'x', day: 5, ...o });
  const rupture = { evId: 'VARIX_RUPTURE', sev: 'critical', label: 'Esophageal varix ruptured' };
  const tail = e(2, { kind: 'change', label: 'Terlipressin', go: true });
  const moments = (es: StoryEntry[]) => storyOf({ entries: es, end: 9, series: {} }).flatMap((c) => c.moments).filter((m) => m.type === 'key');
  const kept = moments([e(0, { kind: 'start', day: 0 }), e(1, { ...rupture, go: true }), tail]);
  assert.deepEqual(kept.map((m) => m.ids), [[1], [2]], 'the bleeding, then what is done about it');
  const unkept = moments([e(0, { kind: 'start', day: 0 }), e(1, { ...rupture }), tail]);
  assert.deepEqual(unkept.map((m) => m.ids), [[1, 2]], 'no model kept at the rupture: one moment, as before');
  assert.ok(endsBleed(e(1, { ...rupture, go: true })) && !endsBleed(e(1, { ...rupture })) && !endsBleed(tail));
});

test('every bleed is two stops on its day: the model as it bled, then the model after what was done', async () => {
  for (const c of bleeds) {
    const { b, es, stops } = await stopsOfCourse(c.id);
    for (const r of b.entries.filter((x) => x.evId === 'VARIX_RUPTURE')) {
      const at = stops.map((s, i) => ({ s, i })).filter(({ s }) => s.day === r.day);
      assert.equal(at.length, 2, `${c.id}: Day ${r.day} has two stops, the bleeding and what is done about it`);
      const [first, second] = at as [typeof at[number], typeof at[number]];
      assert.equal(second.i, first.i + 1);
      assert.equal(es[first.s.entry]!.evId, 'VARIX_RUPTURE', `${c.id}: the first stands on the rupture's own model`);
      assert.ok(active(es[first.s.entry]!.snap), `${c.id}: that model is bleeding`);
      assert.ok(!active(es[second.s.entry]!.snap), `${c.id}: the day's end is not (a band, glue or the drug has stopped it)`);
      assert.equal(first.s.kind, 'Emergency');
      assert.ok(first.s.say && first.s.say.length > 20, `${c.id}: the bleeding says what it is`);
    }
  }
});

test('the scope is where the bleed is: esophageal bleeds open the Endoscopy card, a fundal one looks at the fundus and watches the glue, and never offers the esophageal scope', async () => {
  for (const c of bleeds) {
    const { b, stops } = await stopsOfCourse(c.id);
    for (const r of b.entries.filter((x) => x.evId === 'VARIX_RUPTURE')) {
      const gastric = /gastric/i.test(r.label);
      const [first, second] = stops.filter((s) => s.day === r.day) as [typeof stops[number], typeof stops[number]];
      if (!gastric) {
        assert.equal(first.open?.tool, SCOPE_LOOK.tool, `${c.id}: the bleeding opens the Endoscopy card by itself (its own bleed view)`);
        assert.ok(first.look.some((l) => l.tool === 'endoscopy'));
        assert.ok(second.look.some((l) => l.tool === 'endoscopy'), `${c.id}: and the band is looked at in it`);
        assert.equal(first.shot.cam, 'bleed');
      } else {
        for (const s of [first, second]) {
          assert.equal(s.shot.cam, 'fundus', `${c.id}: a fundal bleed is framed at the fundus`);
          assert.ok(!s.look.some((l) => l.tool === 'endoscopy'), `${c.id}: the esophageal scope shows no varix at a fundal bleed: it is not offered`);
          assert.equal(s.open, null);
        }
        assert.deepEqual(second.look, [GLUE_LOOK], `${c.id}: the glue stop watches the EUS coils and glue`);
      }
    }
  }
});

test('the gastric course glues the varix the day it bleeds, and the days list says how the bleed stopped', async () => {
  const c = COURSES.find((x) => x.id === 'hist-brto')!;
  const glue = c.steps.find((s) => s.id === 'glue')!;
  assert.equal(glue.day, c.steps.find((s) => s.act === 'bleed')!.day);
  assert.deepEqual(glue.set, { occluded: { C2: true } }, 'the engine\'s own EUS coils and glue (C2: the varix obliterated, the shunt left open)');
  const b: Baked = await LOAD[c.id]!();
  assert.ok(b.entries.some((e) => e.evId === 'BLEED_STOPPED' && /EUS coils and glue/.test(e.label)));
  assert.ok(b.entries.some((e) => e.kind === 'change' && e.label === 'EUS coils and glue'));
});

test('the glue look plays a real procedure of the figure on the anatomy, and a look to watch opens no Tests card', () => {
  assert.equal(GLUE_LOOK.pane?.watch, 'eusglue');
  assert.ok(PROCEDURE_PLAYS.has('eusglue'), 'the scene plays it');
  assert.ok(specOf('eusglue'), 'and the 2D choreography has it');
  assert.ok(VIEWS.some((v) => v.id === GLUE_LOOK.tool), 'it is a view\'s look (the body, where the scope and the varix are drawn), not a card that would fold the stop');
  assert.equal(lookSide(GLUE_LOOK.tool), 'Anatomy');
});

test('two stops on one day stand apart on the strip and the second is named by its own title', async () => {
  const { stops, v } = await stopsOfCourse('hist-bleed');
  const i = stops.findIndex((s, k) => k > 0 && s.day === stops[k - 1]!.day);
  assert.ok(i > 0);
  assert.equal(dayShift(stops, i), SAME_DAY_PX);
  assert.equal(dayShift(stops, i - 1), 0);
  const boxes = stripNames({ keyDays: v.marks.map((m) => m.day), full: [v.full[0], v.full[1]], at: i, stops: stops.map((s) => ({ day: s.day, tone: 'info' as const, short: shortName(s) })) }, 960);
  assert.ok(boxes[i], 'the stop the case is at keeps its name');
  assert.equal(stopName(stops[i]!, v.chapters, false), stops[i]!.title, 'a chapter begins at the first stop of its day');
  assert.equal(shortName({ type: 'key', title: 'EUS coils and glue' }), 'Glue');
});

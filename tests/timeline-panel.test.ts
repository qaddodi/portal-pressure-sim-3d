// History as the patient's timeline (docs/approved/timeline-story.md, step 3; plan rows 4 to 7, 13, 18 and 20): the strip as a frame for the chart GPU in every look, its playhead placed by the
// same paced axis, the view the panel reads (where the figure is, the future, the days kept ahead), and the rules the panel keeps: no restore on a scroll, no layout read, the panel's places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripScene, stripAxis, STRIP_METRICS } from '../src/ui/timeline/strip.ts';
import { viewOf, momentKey } from '../src/ui/timeline/story-view.ts';
import { Timeline, type TimelineHost } from '../src/ui/timeline/model.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { activeInterventions } from '../src/ui/action/changes.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import type { Baked } from '../src/ui/histories/types.ts';

const noop = () => undefined;
const host = (): TimelineHost => ({
  snapshot: async () => null, restore: noop, frame: () => null, params: () => ({}), advance: noop, scenarioLabel: () => 'x', labelsOf: () => new Map(),
  say: noop, announce: noop, now: () => 0, later: () => 0, cancel: noop,
});
const labelsOf = (p: unknown) => new Map(activeInterventions(p as never).map((c) => [c.key, c.label]));
async function open(id: string, back?: boolean): Promise<{ b: Baked; tl: Timeline }> {
  const h = HISTORIES.find((x) => x.id === id)!, b = await LOAD[id]!();
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, h.name), b.snap.params);
  if (back) tl.goTo(tl.entries().findIndex((e) => e.snap && e.past), { quiet: true });
  return { b, tl };
}
/** the day record as the feed keeps it after going back to `day`: the days up to it, the rest kept as the future */
const split = (b: Baked, day: number | null) => ({ days: day == null ? b.days : b.days.filter((d) => d.day <= day), future: day == null ? [] : b.days.filter((d) => d.day > day) });

test('the strip is a frame for the chart GPU in every look and every reading: words 12 px or more that read on the card, nothing outside its box', async () => {
  const { b, tl } = await open('hist-bleed');
  const v = viewOf({ tl, ...split(b, null), hidden: null, labelsOf });
  eachLook((look) => {
    for (const m of v.metrics) {
      for (const w of [330, 436]) {
        const f = stripScene({ series: v.series, metric: m, chapters: v.chapters, marks: v.marks, meds: v.meds, full: v.full, cut: v.cut }, ctxOf(look, w));
        judge(f, look);
        assert.ok(f.shapes.some((s) => s.k === 'path'), `${look} ${m}: the line is drawn`);
      }
    }
  });
  assert.deepEqual(v.metrics, STRIP_METRICS.map((m) => m.id), 'all four readings are offered when none is hidden');
  const hidden = viewOf({ tl, ...split(b, null), hidden: new Set(['pv', 'trueHVPG']), labelsOf });
  assert.deepEqual(hidden.metrics, ['asc', 'shunt'], 'a gradient the learner has not measured is not offered');
});

test('the playhead and the strip share one paced axis: the start at 0, today at 1, a busy stretch wider than a quiet one', async () => {
  const { b, tl } = await open('hist-bleed');
  const v = viewOf({ tl, ...split(b, null), hidden: null, labelsOf });
  const a = stripAxis(v.marks.map((m) => m.day), v.full);
  assert.equal(a.frac(v.full[0]), 0); assert.equal(a.frac(v.full[1]), 1);
  for (let d = v.full[0]; d < v.full[1]; d++) assert.ok(a.frac(d + 1) >= a.frac(d), 'never backwards');
  assert.ok((a.frac(73) - a.frac(70)) / 3 > (a.frac(110) - a.frac(100)) / 10, 'a day of the bleed and the TIPS is wider than a quiet day after');
});

test('the view: the figure at today, or at the moment History went back to with the course after it ahead, its days still read from the record\'s future', async () => {
  for (const h of HISTORIES) {
    const { b, tl } = await open(h.id);
    const v = viewOf({ tl, ...split(b, null), hidden: null, labelsOf });
    const all = v.chapters.flatMap((c) => c.moments);
    assert.equal(v.here, momentKey(all[all.length - 1]!), `${h.id}: the figure is at today`);
    assert.equal(v.atToday, true); assert.equal(v.cut, null);
    const back = await open(h.id, true);
    const day = back.tl.entries()[back.tl.entries().findIndex((_, i) => back.tl.isFuture(i)) - 1]!.day;
    const w = viewOf({ tl: back.tl, ...split(b, day), hidden: null, labelsOf });
    assert.equal(w.atToday, false); assert.equal(w.cut, day, `${h.id}: the strip veils the days after Day ${day}`);
    assert.equal(w.hereDay, day);
    const ser = w.series.hvpg ?? w.series.asc!;
    assert.equal(ser.x[ser.x.length - 1], b.days[b.days.length - 1]!.day, `${h.id}: the days kept ahead are read, so a moment ahead has its own numbers`);
    const ahead = w.chapters.flatMap((c) => c.moments).filter((m) => m.future);
    assert.ok(ahead.length > 0 && ahead.every((m) => m.day >= day), `${h.id}: the moments ahead are after the figure's`);
  }
});

test('the panel keeps the rules: a scroll moves only the playhead (no restore, no layout read), the figure moves on its button, the playhead is a transform on the clock', () => {
  const src = readFileSync('src/ui/history/HistoryList.tsx', 'utf8');
  assert.equal((src.match(/timeline\.goTo\(/g) ?? []).length, 1, 'one way to move the figure');
  assert.match(src, /className="hs-go" onClick=\{\(\) => \{[^}]*timeline\.goTo\(go\)/, 'and it is the button');
  assert.match(src, /new IntersectionObserver\(/, 'the browser says which card crosses the line');
  assert.doesNotMatch(src, /addEventListener\('scroll'|onScroll=/, 'no work on every scroll event');
  assert.doesNotMatch(src, /getBoundingClientRect|offsetTop|offsetHeight/);
  assert.match(src, /clock\.on\('tween', apply/);
  assert.match(src, /style\.transform = `translateX\(/);
  const css = readFileSync('src/ui/history/history.css', 'utf8');
  assert.match(css, /\.sh-sheet\[data-kind="history"\] \{ width: min\(460px/, 'Mac and iPad on its side: about 460 px at the right');
  assert.match(css, /\[data-device="phone-landscape"\] \.sh-sheet\[data-kind="history"\] \{\s*left:[^}]*width: clamp\(290px, 38vw, 360px\)/, 'held sideways: the one column at the left');
  assert.match(css, /\.hs-ch-h \{ position: sticky;[^}]*background: var\(--surface\)/, 'the chapter headings are solid where they stick (no blur to ghost through)');
});

test('going back does not change the chapters: the course ahead keeps its own', async () => {
  for (const h of HISTORIES) {
    const { b, tl } = await open(h.id), back = await open(h.id, true);
    const day = back.tl.entries()[back.tl.entries().findIndex((_, i) => back.tl.isFuture(i)) - 1]!.day;
    const names = (v: ReturnType<typeof viewOf>) => v.chapters.map((c) => [c.from, c.label]);
    assert.deepEqual(names(viewOf({ tl: back.tl, ...split(b, day), hidden: null, labelsOf })), names(viewOf({ tl, ...split(b, null), hidden: null, labelsOf })), h.id);
  }
});

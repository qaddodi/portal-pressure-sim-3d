// A stop's numbers are the course's (Mohammad, capture 0bc14020, 26 Nov: "PPG 8.4 on iPad, 8.5 elsewhere"; "the ascites rate at cardiac day 20 reads down 1,700, down 1,000, and Steady on the three devices").
// Root: the case's story was made from the page's day record, whose newest point the running model rewrites with every frame it draws, and the Ascites card's rate was the live balance
// held over whatever seconds the card had been open. The general rule pinned here: a stop's card, and the Ascites card at a stop, read the BAKED course, never anything live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { Timeline, type TimelineHost, type Snap } from '../src/ui/timeline/model.ts';
import { caseOf } from '../src/ui/case/story.ts';
import { caseViewOf } from '../src/ui/case/view.ts';
import { dayRate } from '../src/ui/case/rate.ts';
import { abView } from '../src/ui/tests/abdomen/model.ts';
import { calmedDays } from '../src/engine/hales/portal/trail-calm.js';
import { valueAt } from '../src/ui/bigtime/record.ts';

const host = (): TimelineHost => ({
  snapshot: async () => ({ t: 0, day: 0, params: {} }), restore: (_s: Snap) => undefined,
  frame: () => null, params: () => ({}), advance: () => undefined, scenarioLabel: () => '', labelsOf: () => new Map(), say: () => undefined, announce: () => undefined,
  now: () => 0, later: () => 0, cancel: () => undefined,
});
const READ: Record<string, [number, number]> = { ppg: [1, 1], hvpg: [1, 1], asc: [1, 1] };

test('every stop of every course says the baked day\'s numbers, whatever the live record holds', async () => {
  let checked = 0;
  for (const h of HISTORIES) {
    const b = await LOAD[h.id]!();
    const tl = new Timeline(host());
    tl.adopt(entriesOf(b, h.name), b.snap.params);
    const { story, stops } = caseOf(tl, b.days, h, () => new Map());
    const cv = caseViewOf(story, stops);
    // (made twice, the same: nothing in it moves with a frame)
    const again = caseOf(tl, b.days, h, () => new Map());
    assert.deepEqual(again.story.series, story.series, `${h.id}: the story is the course's, the same each time`);
    stops.forEach((s, i) => {
      const m = cv.moments[i];
      if (!m || (m.type !== 'start' && m.type !== 'today' && m.type !== 'key')) return;
      const nums = m.type === 'key' ? m.nums : null;
      if (nums && nums.mode === 'change') return;   // (a change's after-number is read some days later in the same calmed course series, below)
      // (the day's readings, worked here from the baked days alone: the calmed series' value at the day, to one decimal)
      for (const row of nums ? nums.rows : []) {
        const c = calmedDays(b.days as never, row.k === 'ppg' ? 'ppg' : row.k);
        const want = +(valueAt({ x: c.x, y: c.mid }, s.day)! * 1).toFixed(READ[row.k]?.[1] ?? 1);
        assert.equal(row.b, want, `${h.id} Day ${s.day}: ${row.name} is the baked day's ${want}`);
        checked++;
      }
    });
    // (the start and today: the card's readings are the baked days' at 0 and at today)
    for (const k of [0, stops.length - 1]) {
      const m = cv.moments[k];
      assert.ok(m && (m.type === 'start' || m.type === 'today'), `${h.id}: stop ${k} is the start or today`);
    }
  }
  assert.ok(checked > 50, `numbers were checked (${checked})`);
});

test('the first bleed starts at PPG 8.4, the baked day 0, not the live 8.5', async () => {
  const h = HISTORIES.find((x) => x.id === 'hist-bleed')!, b = await LOAD[h.id]!();
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, h.name), b.snap.params);
  const { story, stops } = caseOf(tl, b.days, h, () => new Map());
  assert.equal(b.days[0]!.v.ppg, 8.4);
  const m = caseViewOf(story, stops).moments[0]!;
  assert.ok(m.type === 'start');
  assert.equal(m.type === 'start' ? (await import('../src/ui/timeline/story.ts')).dayReadings(story.series, 0).rows.find((r) => r.k === 'ppg')?.b : null, 8.4);
});

test('the ascites balance at a stop is the course\'s day-scale trend: one number for a day, from the baked days alone', async () => {
  const h = HISTORIES.find((x) => x.id === 'hist-cardiac')!, b = await LOAD[h.id]!();
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, h.name), b.snap.params);
  const { story, asc } = caseOf(tl, b.days, h, () => new Map());
  const last = story.full[1], r20 = dayRate(asc, 20, last)!;
  assert.ok(r20 < -100 && r20 > -1000, `diuretics at day 20 take the belly down at a day's pace (${Math.round(r20)} mL/day)`);
  assert.equal(Math.round(r20), -340, 'the baked 6.068 L to 5.728 L (6.138 to 5.802 before the engine placed the take-offs on the junction table)');
  assert.equal(dayRate(asc, 20, last), r20, 'the same each time');
  // (the last day has none after it: the day before)
  assert.equal(dayRate(asc, last, last), dayRate(asc, last - 1, last), 'the last day reads the day before it');
  assert.equal(dayRate(undefined, 20, last), null);
  // (the Ascites card says it: the line and the words under the litres, whatever the live rate is)
  const m = { ascites: { volume: 6138, ratePerDay: -1700, iap: 10, grade: 2, albumin: 1.2, totalProtein: 2, highProtein: false } };
  const live = abView(m as never, { albumin: 3 } as never, -1700);
  const cs = abView(m as never, { albumin: 3 } as never, -1700, r20);
  assert.equal(live!.rate, '1,700 mL/day');
  assert.notEqual(cs!.rate, live!.rate);
  const other = abView({ ascites: { ...m.ascites, ratePerDay: 0 } } as never, { albumin: 3 } as never, 0, r20);
  const third = abView({ ascites: { ...m.ascites, ratePerDay: -1000 } } as never, { albumin: 3 } as never, -1000, r20);
  assert.equal(other!.rate, cs!.rate, 'three devices with three live rates read one balance');
  assert.equal(third!.rate, cs!.rate);
  assert.equal(other!.trend, cs!.trend);
  assert.equal(abView({ ascites: { ...m.ascites, ratePerDay: 3 } } as never, {} as never, 0, 30)!.rate, 'Steady', 'a day-scale 30 mL/day is steady, as its words say');
});

test('the case never reads the page\'s day record: its story and balance are made from the baked course', () => {
  for (const f of ['story.ts', 'view.ts', 'rate.ts']) {
    const src = readFileSync(new URL(`../src/ui/case/${f}`, import.meta.url), 'utf8');
    assert.ok(!/from '.*tests\/feed/.test(src), `case/${f} does not import the day record`);
  }
  const run = readFileSync(new URL('../src/ui/case/run.ts', import.meta.url), 'utf8');
  assert.ok(!/record\.(days|future)/.test(run), 'run.ts does not read the record\'s days to make the story');
});

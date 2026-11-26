// Going back to a moment of a patient's course (docs/approved/timeline-story.md, step 1 of the build): the day record keeps the days after it as the future (Redo comes back to the whole
// course, not to a straight line across a gap), a new change lets them go with History's later entries, and every moment a baked history headlines can be shown on the figure:
// it carries the model at that day's end, and the model restored from it reads what the day record says. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SampleFeed, type FeedFrame } from '../src/ui/tests/feed.ts';
import { Timeline, type TimelineHost, type Snap } from '../src/ui/timeline/model.ts';
import { isKeyEntry } from '../src/ui/timeline/story.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { Engine } from '../src/engine/hales/portal/engine.js';
import { computeMetrics } from '../src/engine/hales/portal/metrics.js';
import { detectEvents } from '../src/engine/hales/portal/events.js';

const metrics = (hvpg: number) => ({ hvpg, pv: 18, whvp: 14, fhvp: 3, ra: 5, ivc: 4, sv: 17, ascites: { volume: 500 }, shuntFraction: 0.2, co: 6, ppg: 12 });
const frame = (day: number, o: Partial<FeedFrame> = {}): FeedFrame => ({ jump: false, clock: 'disease', day, metrics: metrics(10 + day / 10), gen: 1, params: {}, bands: 0, ...o });
const course = (f: SampleFeed) => JSON.stringify(f.days.map((d) => [d.day, d.v.hvpg, !!d.start]));

test('going back keeps the later days as the future, and coming forward again gives the same course', () => {
  const f = new SampleFeed();
  f.adopt(frame(0, { jump: true, gen: 1 }), 0);
  for (let d = 1; d <= 20; d++) f.adopt(frame(d), 0);
  const whole = course(f);
  f.keepDaysTo(8); f.adopt(frame(8, { jump: true, gen: 2 }), 0);
  assert.equal(f.days[f.days.length - 1]!.day, 8, 'the figure is at Day 8');
  assert.deepEqual(f.future.map((d) => d.day), Array.from({ length: 12 }, (_, i) => 9 + i), 'Days 9 to 20 are kept as the future');
  f.adopt(frame(8, { gen: 2 }), 0);
  assert.equal(f.future.length, 12, 'a frame of the same moment keeps them');
  f.keepDaysTo(20); f.adopt(frame(20, { jump: true, gen: 3 }), 0);
  assert.equal(course(f), whole, 'Redo to today: the record is what it was before going back');
  assert.equal(f.future.length, 0);
});

test('the future goes when the patient moves on from the moment, or when something new is done there', () => {
  const f = new SampleFeed();
  f.adopt(frame(0, { jump: true, gen: 1 }), 0);
  for (let d = 1; d <= 20; d++) f.adopt(frame(d), 0);
  f.keepDaysTo(8); f.adopt(frame(8, { jump: true, gen: 2 }), 0);
  f.adopt(frame(9, { gen: 2 }), 0);
  assert.equal(f.future.length, 0, 'a new Day 9 is not the old one');
  assert.equal(f.days[f.days.length - 1]!.day, 9);
  f.keepDaysTo(4); f.adopt(frame(4, { jump: true, gen: 3 }), 0);
  assert.ok(f.future.length > 0);
  const ver = f.daysVer;
  f.dropFuture();
  assert.equal(f.future.length, 0, 'a branch lets the days after it go');
  assert.ok(f.daysVer > ver, 'and the charts hear of it');
  f.adopt(frame(3, { jump: true, gen: 4 }), 0);
  assert.equal(f.days.length, 1, 'a new patient (no moment kept) starts the record again');
});

const host = (log: string[]): TimelineHost => ({
  snapshot: async () => ({ t: 0, day: 0, params: {} }), restore: (s) => { log.push(`restore ${s.day}`); }, frame: () => null, params: () => ({}), advance: () => undefined,
  scenarioLabel: () => 'x', labelsOf: () => new Map(), say: () => undefined, announce: () => undefined, now: () => 0, later: () => 0, cancel: () => undefined,
  branched: () => { log.push('branched'); },
});

test('a history\'s moments can be shown on the figure; Undo and Redo walk only this page\'s changes; a new change branches the record too', async () => {
  const b = await LOAD['hist-bleed']!();
  const log: string[] = [];
  const tl = new Timeline(host(log));
  tl.adopt(entriesOf(b, 'x'), b.snap.params);
  const es = tl.entries();
  // (the first moment after the start: the start keeps the model too, as the patient came, where playing the case begins)
  const moment = es.findIndex((e, i) => i > 0 && e.snap && e.past);
  assert.ok(moment > 0, 'a baked moment carries the model');
  assert.equal(tl.canUndo(), false, 'Undo does not walk the history\'s past');
  assert.ok(tl.goTo(moment));
  assert.deepEqual(log, [`restore ${es[moment]!.day}`]);
  assert.ok(tl.isFuture(es.length - 1), 'today is ahead of it');
  assert.equal(tl.canRedo(), true, 'Redo comes back to today');
  tl.redo();
  assert.equal(log[1], `restore ${b.snap.day}`);
  assert.ok(tl.isLive(es.length - 1));
  tl.goTo(moment);
  tl.recordAction('Band (EVL)');
  assert.ok(log.includes('branched'), 'something new done at the moment drops the days after it, as it drops the entries');
  assert.equal(tl.entries().length, moment + 2);
});

test('every day a baked history headlines carries the model at its end, on its last line, and the restored model reads the day record; what it re-raises keeps the future', async () => {
  for (const h of HISTORIES) {
    const b = await LOAD[h.id]!();
    // (and Day 0: the patient as they came, where playing the case starts)
    const keyDays = new Set([0, ...b.entries.filter(isKeyEntry).map((e) => e.day).filter((d) => d < b.snap.day)]);
    // (a bleed also keeps the model as it bleeds, on its rupture's line, before what is done about it: the case's bleeding stop; every other kept model is a day's end)
    const bled = b.entries.filter((e) => e.snap && e.evId === 'VARIX_RUPTURE');
    for (const e of bled) {
      assert.equal(e.snap!.day, e.day, `${h.id} Day ${e.day}: the bleeding is kept that day`);
      assert.ok((e.snap as unknown as { bleed: { active: boolean } }).bleed.active, `${h.id} Day ${e.day}: and it is bleeding`);
    }
    const snapped = b.entries.filter((e) => e.snap && !bled.includes(e));
    assert.deepEqual(snapped.map((e) => e.day), [...keyDays].sort((x, y) => x - y), `${h.id}: one moment for each key day, and Day 0`);
    for (const e of snapped) {
      const sameDay = b.entries.filter((x) => x.day === e.day);
      assert.equal(sameDay[sameDay.length - 1], e, `${h.id} Day ${e.day}: the moment is the day's last line`);
      assert.equal(e.snap!.day, e.day);
      const eng = new Engine() as { restore(s: Snap): void; step(dt: number): void; newEvents: { id: string; title: string }[] };
      eng.restore(e.snap!);
      const m = computeMetrics(eng) as { hvpg: number; ppg: number };
      const rec = b.days.filter((d) => d.day === e.day).pop()!;
      // (within one printed step: the readings' dead band (engine holdShown) starts over on a restore, so a reading that sat on a rounding edge can print 0.1 apart)
      for (const k of ['hvpg', 'ppg'] as const) {
        const v = (m as Record<string, number>)[k]!, r = rec.v[k]!;
        assert.ok(Math.abs(v - r) <= 0.1 + 1e-9, `${h.id} Day ${e.day}: ${k} ${v.toFixed(2)} restored, ${r} in the day record`);
      }
      eng.newEvents.splice(0);
      for (let i = 0; i < 40; i++) { eng.step(0.1); detectEvents(eng); }
      // (the model restored re-raises what the moment is (a bleed still in shock): History keeps its future)
      const tl = new Timeline(host([]));
      tl.adopt(entriesOf(b, h.name), b.snap.params);
      const at = tl.entries().findIndex((x) => x.snap === e.snap);
      tl.goTo(at);
      const n = tl.entries().length;
      tl.addEvents(eng.newEvents.map((x) => ({ id: x.id, title: x.title, t: e.snap!.t + 1, day: e.day, severity: 'danger' })));
      assert.equal(tl.entries().length, n, `${h.id} Day ${e.day}: what the moment re-raises does not end its future`);
      assert.ok(tl.isFuture(n - 1));
    }
  }
});

test('an event on another day than the moment\'s is the patient moving on: it is recorded and ends the future', async () => {
  const b = await LOAD['hist-bleed']!();
  const tl = new Timeline(host([]));
  tl.adopt(entriesOf(b, 'x'), b.snap.params);
  const at = tl.entries().findIndex((e) => e.snap && e.past);
  tl.goTo(at);
  const day = tl.entries()[at]!.day;
  tl.addEvents([{ id: 'ASCITES', title: 'Ascites forming', t: 0, day: day + 1, severity: 'caution' }]);
  assert.equal(tl.entries().length, at + 2);
  assert.equal(tl.entries()[at + 1]!.label, 'Ascites forming');
});

test('a tap is a step of the day record, as a treatment is: the calmed lane drops at the tap instead of smoothing it away', async () => {
  const { calmedDays } = await import('../src/engine/hales/portal/trail-calm.js');
  const f = new SampleFeed();
  const asc = (day: number, L: number, o: Partial<FeedFrame> = {}) => frame(day, { metrics: { ...metrics(12), ascites: { volume: L * 1000 } }, ...o });
  f.adopt(asc(0, 4, { jump: true }), 0);
  for (let d = 1; d <= 10; d++) f.adopt(asc(d, 4 + d * 0.1), 0);
  f.markStep();
  f.adopt(asc(10, 0.1), 0);
  for (let d = 11; d <= 14; d++) f.adopt(asc(d, 0.1 + (d - 10) * 0.3), 0);
  assert.equal(f.days.filter((d) => d.start).length, 1, 'one step, at the tap');
  const c = calmedDays(f.days, 'asc'), at = c.x.lastIndexOf(10);
  assert.ok(c.mid[at - 1]! > 4.5 && c.mid[at]! < 0.5, `the lane reads ${c.mid[at - 1]!.toFixed(1)} L before the tap and ${c.mid[at]!.toFixed(1)} L after it`);
  const { STEPS } = await import('../src/ui/action/send.ts').catch(() => ({ STEPS: null }));
  if (STEPS) { assert.ok(STEPS({ kind: 'paracentesis', mL: 4000 })); assert.equal(STEPS({ kind: 'band' }), false, 'a band is counted by the feed itself'); }
});

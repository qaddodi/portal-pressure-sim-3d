// Playing a model patient's case (docs/approved/play-the-case.md; Mohammad's picks, 26 Nov: every key moment is a stop, the case waits at each for Continue, a change leaves the case).
// Step 1, the logic: the stops of every one of the twelve histories, each on a model the course kept, each with a shot the slides' own planner can take; a course's own word on a stop;
// the walk's ramps and pace; the record laying in the course's own days as they are reached, never ending the course; the timeline landing on a stop eased.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { COURSES } from '../src/ui/histories/courses.ts';
import { playOf } from '../src/ui/histories/play.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { Timeline, type TimelineHost, type Snap } from '../src/ui/timeline/model.ts';
import { viewOf } from '../src/ui/timeline/story-view.ts';
import { isKeyEntry } from '../src/ui/timeline/story.ts';
import { stopsOf, nearestStop } from '../src/ui/case/stops.ts';
import { shotScene } from '../src/ui/case/shot-plan.ts';
import { legMs, legRamp, rampValue, LEG_MAX_MS, LEG_MIN_MS, CAMERA_LEAD_MS } from '../src/ui/case/walk.ts';
import { SampleFeed, type FeedFrame } from '../src/ui/tests/feed.ts';
import type { Baked } from '../src/ui/histories/types.ts';
import type { CaseStopBaked } from '../src/ui/case/types.ts';

const host = (log: string[] = []): TimelineHost => ({
  snapshot: async () => ({ t: 0, day: 0, params: {} }), restore: (s: Snap, ease?: number) => { log.push(`restore ${s.day}${ease ? ` eased ${ease}` : ''}`); },
  frame: () => null, params: () => ({}), advance: () => undefined, scenarioLabel: () => '', labelsOf: () => new Map(), say: () => undefined, announce: () => undefined,
  now: () => 0, later: () => 0, cancel: () => undefined,
});
const opened = (b: Baked, name: string, log: string[] = []) => { const tl = new Timeline(host(log)); tl.adopt(entriesOf(b, name), b.snap.params); return tl; };
const stopsFor = (b: Baked, tl: Timeline, own: readonly CaseStopBaked[] = []) => {
  const meta = HISTORIES.find((h) => h.id === b.id)!;
  const v = viewOf({ tl, days: b.days, future: [], hidden: null, labelsOf: () => new Map(), chapters: meta.chapters ?? null });
  return stopsOf(v.chapters, tl.entries(), own);
};

test('every history plays from the patient as they came to today, stopping at every key moment, each on the model the course kept that day', async () => {
  assert.equal(HISTORIES.length, 12);
  for (const h of HISTORIES) {
    const b = await LOAD[h.id]!();
    const tl = opened(b, h.name), es = tl.entries();
    const stops = stopsFor(b, tl, h.play?.stops ?? []);
    assert.equal(stops[0]!.type, 'start', `${h.id}: the case starts at the start`);
    assert.equal(stops[0]!.day, 0);
    assert.equal(stops[stops.length - 1]!.type, 'today', `${h.id}: and ends today`);
    assert.equal(stops[stops.length - 1]!.day, b.snap.day);
    // (one stop a day, in order; but a bleed's own stop, on the model as it bled, stands before what is done about it the same day)
    const bleeding = (i: number) => es[stops[i]!.entry]!.evId === 'VARIX_RUPTURE';
    for (let i = 1; i < stops.length; i++) assert.ok(stops[i]!.day > stops[i - 1]!.day || (stops[i]!.day === stops[i - 1]!.day && bleeding(i - 1)), `${h.id}: one stop a day, in order`);
    const dropped = new Set((h.play?.stops ?? []).filter((s) => s.drop).map((s) => s.day));
    const keyDays = [...new Set(b.entries.filter(isKeyEntry).map((e) => e.day))].filter((d) => d > 0 && d < b.snap.day && !dropped.has(d));
    assert.deepEqual([...new Set(stops.filter((s) => s.type === 'key').map((s) => s.day))], keyDays.sort((x, y) => x - y), `${h.id}: every key moment is a stop`);
    for (const [i, s] of stops.entries()) {
      const e = es[s.entry]!;
      assert.ok(e.snap, `${h.id} Day ${s.day}: the stop stands on a kept model`);
      assert.equal(e.snap!.day, s.day, `${h.id} Day ${s.day}: kept that day`);
      if (bleeding(i)) assert.equal(e.evId, 'VARIX_RUPTURE', `${h.id} Day ${s.day}: the bleeding, on the model as it bled`);
      else assert.equal(es.filter((x) => x.day === s.day).pop(), e, `${h.id} Day ${s.day}: at the day's end, as Show on the figure has it`);
      assert.ok(s.title.length > 0 && s.kind.length > 0);
      // (the slides' own planner takes the shot, or throws on a camera or lens neither app has)
      const sc = shotScene(s.shot);
      assert.equal(sc.view === 'body' ? 'anatomic' : sc.view, s.shot.view, `${h.id} Day ${s.day}: the view the shot names (${s.shot.cam})`);
      assert.ok(s.look.length <= 3, 'up to three things to look closer at');
    }
  }
});

test('the first bleed stops where the mock does, each on the shot its moment calls for', async () => {
  const b = await LOAD['hist-bleed']!();
  const stops = stopsFor(b, opened(b, 'Cirrhosis, first bleed'));
  const shot = (day: number) => { const s = stops.find((x) => x.day === day)!.shot; return [s.view, s.cam, s.lens ?? ''].join(' '); };
  assert.deepEqual(stops.map((s) => s.day), [0, 19, 20, 32, 41, 70, 70, 73, 120], 'the bleed is two stops on its day: the bleeding, then the band');
  assert.equal(shot(19), 'lobule lobule:sinusoid ', 'portal hypertension clinically significant: the sinusoid, where the resistance is');
  assert.equal(shot(20), 'circuit portal flow', 'a medicine: the portal flow on the Circuit');
  assert.equal(shot(41), 'anatomic varices ', 'red wale signs: the varices');
  assert.equal(shot(70), 'anatomic bleed ', 'the bleed: the bleeding varix');
  assert.equal(stops[6]!.shot.cam, 'varices', 'the band, after the bleed: the varices');
  assert.equal(shot(73), 'circuit tips ', 'the TIPS: the Circuit at the stent');
  assert.equal(shot(0), 'anatomic fit ');
  assert.equal(stops.find((s) => s.day === 70)!.kind, 'Emergency');
  assert.equal(nearestStop(stops, 60), 5, 'the strip let go of at Day 60 goes to the bleed (Day 70), the nearer');
  assert.equal(nearestStop(stops, 25), 2, 'a tie goes to the earlier');
});

test('a course changes a stop\'s shot, drops one, or adds a look closer; the start and today stay', async () => {
  const b = await LOAD['hist-bleed']!();
  const tl = opened(b, 'x');
  const stops = stopsFor(b, tl, [
    { day: 70, cam: 'varices', look: [{ tool: 'endoscope', label: 'Endoscopy' }, { tool: 'a', label: 'a' }, { tool: 'b', label: 'b' }, { tool: 'c', label: 'c' }], say: 'The varix bled.' },
    { day: 32, drop: true }, { day: 0, drop: true }, { day: 20, lens: 'pressure' },
  ]);
  assert.deepEqual(stops.map((s) => s.day), [0, 19, 20, 41, 70, 70, 73, 120], 'Day 32 dropped; the start cannot be');
  // (a course's word on a day is on the day's last stop, what is done about the bleed; the bleeding itself keeps its own)
  assert.equal(stops[4]!.shot.cam, 'bleed');
  const bleed = stops[5]!;
  assert.deepEqual(bleed.shot, { view: 'anatomic', cam: 'varices' }, 'its own camera is its own shot');
  assert.equal(bleed.look.length, 3, 'three at most');
  assert.equal(bleed.say, 'The varix bled.');
  assert.deepEqual(stops.find((s) => s.day === 20)!.shot, { view: 'circuit', cam: 'portal', lens: 'pressure' }, 'a lens alone keeps the default camera');
});

test('a course stop anchored to nothing stops the generator; one on a day the story no longer headlines is let go', async () => {
  const c = COURSES.find((x) => x.id === 'hist-bleed')!, b = await LOAD['hist-bleed']!();
  assert.throws(() => playOf({ ...c, play: { stops: [{ at: 'nope' }] } }, b), /does not have/);
  // (a day the story does not headline: the engine's events can move with a re-sync, so the stop is let go with a word, never put on a day with no kept model)
  assert.equal(playOf({ ...c, play: { stops: [{ at: { day: 50 } }] } }, b).play?.stops, undefined);
  assert.deepEqual(playOf({ ...c, play: { stops: [{ at: 'bleed', cam: 'varices' }] } }, b).play?.stops, [{ day: 70, step: 'bleed', cam: 'varices' }], 'a step\'s word names the step, so a day with two stops tells them apart');
  assert.deepEqual(HISTORIES.find((h) => h.id === 'hist-bleed')!.play?.ramps, c.ramps, 'the ramps are baked for the walk');
});

test('a leg runs the course\'s ramps from its first day to its last, and takes a time a viewer can follow', () => {
  const r = { key: 'cirrhosis', from: 0, to: 55, a: 0.4, b: 0.86 };
  assert.deepEqual(legRamp([r], 0, 18), { cirrhosis: [0.4, rampValue(r, 18)] });
  assert.ok(Math.abs(rampValue(r, 18) - (0.4 + 0.46 * 18 / 55)) < 1e-12, 'the generator\'s own rule');
  assert.equal(legRamp([r], 70, 73), null, 'a ramp that is over moves nothing');
  assert.deepEqual(legRamp([r], 40, 70), { cirrhosis: [rampValue(r, 40), 0.86] }, 'it holds after its end');
  assert.equal(legMs(1), LEG_MIN_MS, 'a day is not a blink');
  assert.equal(legMs(500), LEG_MAX_MS, 'a year is not a wait');
  assert.ok(legMs(18) > legMs(1) && legMs(47) > legMs(18), 'a longer leg takes longer');
  assert.ok(LEG_MIN_MS > CAMERA_LEAD_MS, 'the camera sets off within the leg');
});

const metrics = (hvpg: number) => ({ hvpg, pv: 18, whvp: 14, fhvp: 3, ra: 5, ivc: 4, sv: 17, ascites: { volume: 500 }, shuntFraction: 0.2, co: 6, ppg: 12 });
const frame = (day: number, o: Partial<FeedFrame> = {}): FeedFrame => ({ jump: false, clock: 'disease', day, metrics: metrics(10 + day / 10), gen: 1, params: {}, bands: 0, ...o });

test('on the way, the record lays in the course\'s own days as the model reaches them; it never ends the course, and lands with it', () => {
  const f = new SampleFeed();
  f.adopt(frame(0, { jump: true, gen: 1 }), 0);
  for (let d = 1; d <= 20; d++) f.adopt(frame(d), 0);
  const whole = JSON.stringify(f.days.map((d) => [d.day, d.v.hvpg]));
  f.keepDaysTo(5); f.adopt(frame(5, { jump: true, gen: 2 }), 0);
  assert.equal(f.future.length, 15);
  f.replay(true);
  // (the walk's own days read a little apart from the course's: the course's are the ones kept)
  for (const d of [5.5, 6, 7, 8, 9]) f.adopt(frame(d, { gen: 2, metrics: metrics(99) }), 0);
  assert.equal(f.days[f.days.length - 1]!.day, 9, 'the record has reached Day 9');
  assert.equal(f.future.length, 11, 'the course after it is still kept');
  assert.ok(f.days.every((d) => d.v.hvpg !== 99), 'the points are the course\'s own');
  // (the landing: the model eased onto the stop's kept state, a new generation)
  f.keepDaysTo(10); f.adopt(frame(10, { jump: true, gen: 3 }), 0);
  f.adopt(frame(10, { gen: 3 }), 0);
  f.replay(false);
  f.adopt(frame(10, { gen: 3 }), 0);
  assert.equal(f.future.length, 10, 'at the stop, the course ahead is kept');
  f.keepDaysTo(20); f.adopt(frame(20, { jump: true, gen: 4 }), 0);
  assert.equal(JSON.stringify(f.days.map((d) => [d.day, d.v.hvpg])), whole, 'played to today, the record is the course, whole');
  // (and off the case, a day of the learner's own ends the course ahead, as before)
  f.keepDaysTo(5); f.adopt(frame(5, { jump: true, gen: 5 }), 0);
  f.adopt(frame(6, { gen: 5 }), 0);
  assert.equal(f.future.length, 0);
});

test('the timeline lands on a stop eased (the case) or at once (History\'s Show on the figure)', async () => {
  const b = await LOAD['hist-bleed']!();
  const log: string[] = [];
  const tl = opened(b, 'x', log);
  const stops = stopsFor(b, tl);
  tl.goTo(stops[0]!.entry, { quiet: true });
  tl.goTo(stops[1]!.entry, { quiet: true, ease: 600 });
  assert.deepEqual(log, ['restore 0', 'restore 19 eased 600']);
  assert.ok(tl.isFuture(stops[2]!.entry), 'the stops ahead are the future');
  assert.ok(!tl.isFuture(stops[1]!.entry));
});

test('on the way, what the model raises is the course\'s own: History keeps the course ahead, and takes news again once the stop has landed', async () => {
  const b = await LOAD['hist-bleed']!();
  const tl = opened(b, 'x');
  const stops = stopsFor(b, tl), n = tl.entries().length;
  tl.goTo(stops[0]!.entry, { quiet: true });
  tl.follow(true);
  tl.addEvents([{ id: 'CSPH', title: 'Clinically significant portal hypertension', t: 1, day: 19, severity: 'danger' }]);
  assert.equal(tl.entries().length, n, 'the walk raised what the course already holds: nothing new, the course ahead kept');
  tl.goTo(stops[1]!.entry, { quiet: true, ease: 600 });
  tl.follow(false);
  tl.addEvents([{ id: 'X', title: 'Something new', t: 2, day: 20, severity: 'danger' }]);
  assert.equal(tl.entries().length, stops[1]!.entry + 2, 'off the walk, a new day\'s news is the learner\'s own course');
});


// Playing a case, step 3: the bar, the stop card and the card on the way (docs/approved/play-the-case.md). The pure parts: what the bar and the cards say, the strip's playhead to its
// stop, the names over the strip, the foot's lift for the bar, and the room the stop card leaves the figure. Read from the baked "Cirrhosis, first bleed", the mock's own patient.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { Timeline, type TimelineHost, type Snap } from '../src/ui/timeline/model.ts';
import { viewOf } from '../src/ui/timeline/story-view.ts';
import { stopsOf } from '../src/ui/case/stops.ts';
import { caseViewOf } from '../src/ui/case/view.ts';
import { caseAxis, placeNames, stopAtFrac, stripNeeds } from '../src/ui/case/strip.ts';
import { caseLiftFor, caseRoom, CASE_BAR_H, CASE_BAR_ROWS, CASE_BAR_THUMB_H, CASE_STRIP_H } from '../src/ui/case/room.ts';
import { M } from '../src/ui/shell/metrics.ts';
import { barWords, chapterAt, continueWords, dragWords, inDays, kickerWords, passedNotes, shortName, shotWords, travelWords, lookSide } from '../src/ui/case/words.ts';

const host = (): TimelineHost => ({
  snapshot: async () => ({ t: 0, day: 0, params: {} }), restore: (_s: Snap) => undefined,
  frame: () => null, params: () => ({}), advance: () => undefined, scenarioLabel: () => '', labelsOf: () => new Map(), say: () => undefined, announce: () => undefined,
  now: () => 0, later: () => 0, cancel: () => undefined,
});
async function bleed() {
  const b = await LOAD['hist-bleed']!();
  const meta = HISTORIES.find((h) => h.id === 'hist-bleed')!;
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, meta.name), b.snap.params);
  const v = viewOf({ tl, days: b.days, future: [], hidden: null, labelsOf: () => new Map(), chapters: meta.chapters ?? null });
  const stops = stopsOf(v.chapters, tl.entries(), []);
  return { v, stops, cv: caseViewOf(v, stops) };
}

test('the bar says the day and where the case is: the stop at a stop, the next stop\'s day on the way, and that the case waits while a Tests card is open', async () => {
  const { stops } = await bleed();
  assert.deepEqual(barWords({ phase: 'stop', stops, at: 5, to: null, day: 70 }), { day: 'Day 70', small: 'Stop 6 of 8' });
  assert.deepEqual(barWords({ phase: 'travel', stops, at: 4, to: 5, day: 52 }), { day: 'Day 52', small: 'to Day 70' });
  assert.deepEqual(barWords({ phase: 'stop', stops, at: 5, to: null, day: 70 }, true), { day: 'Day 70', small: 'The case waits' });
  assert.deepEqual(dragWords(61.4, stops, 5), { day: 'Day 61', small: 'Stop 6 of 8' });
});

test('the stop card: its kicker names the stop, its day and its chapter; Continue names the next stop; the line under it says what the figure shows', async () => {
  const { v, stops } = await bleed();
  assert.equal(kickerWords(stops, 5, chapterAt(v.chapters, 70)), 'Stop 6 of 8 · Day 70 · The bleed');
  assert.equal(continueWords(stops, 5), 'Continue to Day 73 · TIPS 8 mm');
  assert.equal(continueWords(stops, 5, true), 'Continue to Day 73');
  assert.equal(continueWords(stops, 6), 'Continue to Day 120 · today');
  assert.equal(continueWords(stops, 7), null, 'the last stop has no Continue');
  assert.equal(shotWords(stops[5]!.shot), 'The figure: the bleeding varix, Anatomy');
  assert.equal(shotWords(stops[6]!.shot), 'The figure: the stent, Circuit');
  assert.equal(shotWords(stops[2]!.shot), 'The figure: the portal vein, its flow, Circuit');
  assert.equal(shotWords({ view: 'anatomic', cam: 'nowhere' }), 'The figure: Anatomy', 'a camera with no words says its view');
  assert.equal(lookSide('lobule'), 'Lobule');
  assert.equal(lookSide('endoscopy'), 'Tests');
});

test('on the way: the next stop, by the chapter that starts there, and the days to it counting down; the smaller events passed, the latest last', async () => {
  const { v, stops, cv } = await bleed();
  const t = travelWords(stops, 5, 52, v.chapters);
  assert.equal(t.head, 'Next stop: Day 70');
  assert.equal(t.sub, 'The bleed, in 18 days');
  assert.equal(t.line, 'Next stop: Day 70 · The bleed');
  assert.equal(t.kicker, `On the way · ${chapterAt(v.chapters, 52)}`);
  assert.equal(travelWords(stops, 5, 69, v.chapters).sub, 'The bleed, in a day');
  assert.equal(inDays(0), 'now');
  // (the smaller events are the story's quiet lines)
  assert.ok(cv.notes.length > 0, 'the course has smaller events between its stops');
  const between = cv.notes.filter((n) => n.day > 40 && n.day <= 70);
  const passed = passedNotes(cv.notes, 40, 70, 2);
  assert.deepEqual(passed, between.slice(-2));
  assert.deepEqual(passedNotes(cv.notes, 40, 40), [], 'none before the days have run');
  for (let i = 1; i < cv.notes.length; i++) assert.ok(cv.notes[i]!.day >= cv.notes[i - 1]!.day, 'in order');
});

test('the strip: a short name over each stop, the stop tones from the story, and the playhead let go of goes to the stop nearest its day', async () => {
  const { v, stops, cv } = await bleed();
  assert.deepEqual(cv.shorts, ['Start', 'CSPH', 'Carvedilol', 'Bleed risk', 'Red wale', 'Bleed', 'TIPS', 'Today']);
  assert.equal(cv.tones[5], 'danger', 'the bleed is red');
  assert.equal(cv.tones[6], 'change', 'the TIPS is a change');
  assert.equal(cv.tones[0], 'info');
  assert.equal(shortName({ type: 'key', title: 'Ascites, grade 2 now' }), 'Ascites,', 'a long title keeps its first words, at most 12 letters');
  const axis = caseAxis(v.marks.map((k) => k.day), v.full);
  for (const d of [0, 18, 40, 70, 73, 100, 120]) assert.ok(Math.abs(axis.dayAt(axis.frac(d)) - d) < 1e-6, `Day ${d}: the place and the day agree`);
  assert.equal(axis.dayAt(0), v.full[0]);
  assert.equal(axis.dayAt(1), v.full[1]);
  for (let i = 0; i < stops.length; i++) assert.equal(stopAtFrac(stops, axis, axis.frac(stops[i]!.day)), i, `let go on stop ${i + 1}'s line: that stop`);
  assert.equal(stopAtFrac(stops, axis, axis.frac(66)), 5, 'let go at Day 66: the bleed (Day 70)');
  assert.equal(stopAtFrac(stops, axis, -1), 0, 'past the start: the start');
  assert.equal(stopAtFrac(stops, axis, 2), stops.length - 1, 'past today: today');
});

test('the names over the strip never touch: one that would is left out, the stop the case is at never is, and every name stays inside the strip', () => {
  const xs = placeNames([{ x: 0, w: 30, first: true }, { x: 20, w: 40 }, { x: 120, w: 40 }, { x: 140, w: 40, keep: true }, { x: 300, w: 40 }], 320);
  assert.equal(xs[0], 0);
  assert.ok(Number.isNaN(xs[1]!), 'touches the first: left out');
  assert.ok(Number.isNaN(xs[2]!), 'touches the kept name after it: left out');
  assert.equal(xs[3], 120, 'the stop the case is at keeps its name');
  assert.equal(xs[4], 280, 'held inside the strip');
});

test('the bar lifts the foot by what it takes over the play bar\'s row, the same on every sum (the figure\'s room, the cards on the dock, the zoom and view pills)', () => {
  assert.equal(caseLiftFor('desktop', true), CASE_BAR_H - M.timelineH);
  assert.equal(caseLiftFor('desktop', false), 0);
  assert.ok(caseLiftFor('phone-portrait', true) > 0);
  assert.equal(caseLiftFor('tablet-portrait', true), caseLiftFor('phone-portrait', true));
});

// (owner, 26 Nov, iPhone: "still not 100% the bottom portion": the thumb bar was a fixed 96 px over 103 px of rows, so the chapters' names spilled out of it onto the tab row, and it
// stood 6 px over the tab row as a second slab. Root cause: a height set apart from its parts. Now it is their sum, and it stands flush on the tab row, one dock.)
test('the thumb bar is the sum of its rows, its strip has the room its drawing needs, and it stands flush on the tab row as one dock', () => {
  const R = CASE_BAR_ROWS;
  assert.equal(CASE_BAR_THUMB_H, R.PAD_T + R.ROW + R.GAP + CASE_STRIP_H.bare + R.PAD_B);
  assert.ok(stripNeeds(false) <= CASE_STRIP_H.bare, `the phone strip draws ${stripNeeds(false)} px in ${CASE_STRIP_H.bare}`);
  assert.ok(stripNeeds(true) <= CASE_STRIP_H.names, `the strip with names draws ${stripNeeds(true)} px in ${CASE_STRIP_H.names}`);
  assert.ok(R.PAD_T + CASE_STRIP_H.names + R.PAD_B <= CASE_BAR_H, 'the one-row bar holds the strip with its names');
  assert.equal(caseLiftFor('phone-portrait', true), CASE_BAR_THUMB_H - M.phoneTimelineH, 'no gap between the bar and the tab row');
  const css = readFileSync(new URL('../src/ui/case/case.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const px = (sel: string, prop: string) => Number(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*?${prop}:\\s*(\\d+)px`).exec(css)?.[1]);
  // the buttons' row: the buttons, the group's padding and its edge, both sides
  assert.equal(R.ROW, px('.cb-ib', 'height') + 2 * px('.cb-ctl', 'padding') + 2, 'the buttons fit their row');
  const thumb = /\.case-layer\[data-thumb\] \.case-bar \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const bottom = /bottom:\s*calc\(([^;]*)\);/.exec(thumb)?.[1] ?? '';
  assert.deepEqual(bottom.split('+').map((t) => t.trim().replace(/,.*$/, '').replace(/^var\(/, '')).sort(),
    ['--m-phone-inset', '--m-phone-tab-h', '--m-phone-tabs-pad-bottom', '--m-phone-tabs-pad-top', '--safe-b'], 'the bar rests on the tab row\'s top line, no gap');
  assert.match(thumb, /border-radius:\s*var\(--r-sheet\) var\(--r-sheet\) 0 0/, 'round only at the dock\'s top');
  assert.match(thumb, /border-bottom:\s*0/);
  assert.match(css, /\.app\.thumb\.case-on \.vdock:not\(\.mini\) > \.thumb-bar \{[^}]*border-top-left-radius:\s*0/, 'the tab row is square at the top under the bar');
  assert.match(css, /@media \(min-width: 700px\) and \(max-width: 1100px\) and \(orientation: portrait\) \{ \.case-layer\[data-thumb\] \.case-bar \{ left: 15%; right: 15%; \} \}/,
    'an upright iPad: the bar at the dock\'s 70 %');
});

test('the stop card leaves the figure its room: the same size, centred in what the card leaves (it pans, never zooms)', () => {
  const room = { x: 0, y: 60, w: 1440, h: 700 };
  const left = caseRoom(room, { kind: 'left', x: 412 });
  assert.equal(left.w, room.w); assert.equal(left.h, room.h);
  assert.equal(left.x, (412 + 8) / 2, 'centred in the part right of the card');
  const foot = caseRoom(room, { kind: 'foot', y: 560 });
  assert.equal(foot.h, room.h);
  assert.equal(foot.y, room.y - (room.y + room.h - (560 - 8)) / 2, 'centred in the part above the sheet');
  assert.deepEqual(caseRoom(room, null), room);
});

// (iPhone capture, 26 Nov: the Tests sheet opened at a stop stood behind the case bar. Its place was a memo made before the case started, so the foot the bar raises never reached it.)
test('every sheet placed on the foot is placed again when the case bar comes and goes', () => {
  const layer = readFileSync(new URL('../src/ui/tests/TestsLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /const caseUp = useCaseBarUp\(\);\n\s*const place = useMemo\(\(\) => testsPlace\([^\n]*\[[^\]\n]*caseUp\]\)/, 'the Tests sheet');
  assert.match(readFileSync(new URL('../src/ui/action/ActionCard.tsx', import.meta.url), 'utf8'), /useCaseBarUp\(\);/, 'the action card');
});

// (Mac capture, 26 Nov: after a leg was played, paused and played on, the strip ended at the stop and the card lost what followed. The view was made again from the record, which the leg
//  had moved along. It is kept by the case's first stop, made once a case.)
test('the case keeps the story it started with', () => {
  // (the story is made once, from the baked course, when the case starts (case/story.ts) and kept in the case's state: the bar and cards only read it; tests/case-numbers.test.ts)
  const src = readFileSync(new URL('../src/ui/case/view.ts', import.meta.url), 'utf8');
  assert.match(src, /useCase\(\(s\) => s\.story\)/);
  assert.match(src, /caseViewOf\(story, stops\)/);
  assert.match(readFileSync(new URL('../src/ui/case/run.ts', import.meta.url), 'utf8'), /stops, story, asc, at: 0/);
});

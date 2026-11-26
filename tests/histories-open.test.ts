// Opening a model patient: the days the feed keeps (an action is a jump frame and must not empty them; a replaced state is a new patient and does), the history the timeline adopts, what the chart
// reads from both, and the menu's third list. Node only: the worker and the page are not started.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SampleFeed, bandsOn, type FeedFrame } from '../src/ui/tests/feed.ts';
import { Timeline, type TimelineHost } from '../src/ui/timeline/model.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { historyOf, isHistory, historyName, shareableId } from '../src/ui/histories/meta.ts';
import { activeInterventions } from '../src/ui/action/changes.ts';
import { actionLabel } from '../src/ui/action/action-label.ts';
import { actionLabel as sent } from '../src/ui/action/send.ts';
import { marksOf, type EntryIn } from '../src/ui/bigtime/marks.ts';
import { tipsFacts, isTips } from '../src/ui/bigtime/facts.ts';
import { MENU_TABS, stepTab, emptyNoteOf, emptyNote, filterRows, fold } from '../src/ui/menu/umenu-logic.ts';
import { TABS } from '../src/ui/menu/swipe-tabs.ts';

const metrics = (hvpg: number) => ({ hvpg, pv: 18, whvp: 14, fhvp: 3, ra: 5, ivc: 4, sv: 17, ascites: { volume: 500 }, shuntFraction: 0.2, co: 6, ppg: 12 });
const frame = (day: number, o: Partial<FeedFrame> = {}): FeedFrame => ({ jump: false, clock: 'disease', day, metrics: metrics(10 + day / 100), gen: 1, params: {}, bands: 0, ...o });

test('the days are the patient\'s: a jump frame that is an action or a change of clock keeps them, a replaced state (a new gen) starts them again', () => {
  const f = new SampleFeed();
  f.adopt(frame(1, { jump: true, gen: 1 }), 0);
  for (let d = 2; d <= 5; d++) f.adopt(frame(d), 0);
  assert.equal(f.days.length, 5);
  f.adopt(frame(5, { jump: true, gen: 1 }), 0);   // (a paracentesis, a band, the clock moving to the disease clock: a jump frame of the same state)
  assert.equal(f.days.length, 5, 'an action does not empty the record');
  f.adopt(frame(6, { jump: true, gen: 2 }), 0);   // (a restore, a new patient)
  assert.equal(f.days.length, 1, 'a replaced state does');
});

test('a banded patient\'s days are not a step a day: bands are counted, not how much of the last is left', () => {
  assert.equal(bandsOn(0.98), 1); assert.equal(bandsOn(1), 1); assert.equal(bandsOn(0), 0); assert.equal(bandsOn(2.4), 3); assert.equal(bandsOn(undefined), undefined);
  const f = new SampleFeed();
  f.adopt(frame(1, { jump: true, bands: 1 }), 0);
  for (let d = 2; d <= 30; d++) f.adopt(frame(d, { bands: 1 - 0.02 * d }), 0);
  assert.equal(f.days.filter((d) => d.start).length, 0, 'no step while a band wears off');
  f.adopt(frame(31, { bands: 0 }), 0);
  f.adopt(frame(32, { bands: 0 }), 0);
  assert.equal(f.days.filter((d) => d.start).length, 1, 'one step when the last band is gone');
});

test('a history\'s days are laid in when the frame that replaced the state arrives, and the first live frame goes on from them', async () => {
  const b = await LOAD['hist-bleed']!();
  const f = new SampleFeed();
  f.adopt(frame(3, { jump: true, gen: 4 }), 0);
  f.seedDays(b.days);
  f.adopt(frame(3, { gen: 4 }), 0);
  assert.equal(f.days.length <= 4, true, 'a frame of the same state brings nothing in');
  f.adopt(frame(b.snap.day, { jump: true, gen: 5, params: b.snap.params, bands: 0 }), 0);
  assert.equal(f.days.length, b.days.length, 'the whole history is the days');
  assert.equal(f.days[0]!.day, 0);
  assert.equal(f.days[f.days.length - 1]!.day, b.snap.day);
  f.adopt(frame(b.snap.day + 1, { gen: 5, params: b.snap.params }), 0);
  assert.equal(f.days.length, b.days.length + 1, 'tomorrow is one more day');
  assert.equal(f.days.filter((d) => d.start).length, b.days.filter((d) => d.start).length, 'and the steps are the history\'s own (treatment key and bands do not add one)');
  f.seedDays(b.days); f.seedDays(null);
  f.adopt(frame(1, { jump: true, gen: 6 }), 0);
  assert.equal(f.days.length, 1, 'a seed that was let go is not laid in on another patient');
});

const host = (): TimelineHost => ({
  snapshot: async () => null, restore: () => undefined, frame: () => null, params: () => ({}), advance: () => undefined, scenarioLabel: () => 'x',
  labelsOf: (p) => new Map(activeInterventions(p as never).map((c) => [c.key, c.label])), say: () => undefined, announce: () => undefined, now: () => 0, later: () => 0, cancel: () => undefined,
});

test('the timeline adopts a history: its entries in order, a today line that can be come back to, and Undo has nowhere earlier to go', async () => {
  for (const h of HISTORIES) {
    const b = await LOAD[h.id]!();
    const tl = new Timeline(host());
    tl.adopt(entriesOf(b, h.name), b.snap.params);
    const es = tl.entries();
    assert.equal(es[0]!.kind, 'start'); assert.equal(es[0]!.label, h.name);
    assert.deepEqual(es.map((e) => e.id), es.map((_, i) => i + 1), 'ids are this page\'s');
    const last = es[es.length - 1]!;
    assert.equal(last.kind, 'jump'); assert.equal(last.day, b.snap.day); assert.ok(last.snap, 'today carries the model\'s snapshot');
    assert.ok(tl.isLive(es.length - 1), 'the model is at today');
    assert.equal(tl.canUndo(), false, 'the earlier lines are the past, not changes for Undo to walk');
    assert.equal(tl.count(), es.length - 1);
    assert.equal(es.filter((e) => e.snap && !e.past).length, 1, 'today is the one moment Undo and Redo walk to');
    assert.ok(es.some((e) => e.snap && e.past), 'the moments the story headlines can be shown on the figure');
  }
});

test('the chart reads the medicines and the procedures from a history', async () => {
  const b = await LOAD['hist-bleed']!();
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, 'Cirrhosis, first bleed'), b.snap.params);
  const labelsOf = (p: unknown) => new Map(activeInterventions(p as never).map((c) => [c.key, c.label]));
  const entries: EntryIn[] = tl.entries().map((e) => ({ id: e.id, kind: e.kind, label: e.label, day: e.day, ...(e.sev ? { sev: e.sev } : {}), ...(e.keys ? { keys: e.keys } : {}), ...(e.action ? { action: true } : {}), ...(e.detail ? { detail: e.detail } : {}), ...(e.snap ? { params: e.snap.params } : e.params != null ? { params: e.params } : {}) }));
  const m = marksOf(entries, labelsOf);
  const carv = m.meds.find((x) => x.key === 'drug:carvedilol')!, vaso = m.meds.find((x) => x.key === 'drug:terlipressin')!;
  assert.deepEqual(carv.spans, [{ from: 20, to: 73 }]);
  assert.deepEqual(vaso.spans, [{ from: 70, to: 73 }]);
  const words = m.lines.map((l) => l.label);
  for (const w of ['Esophageal varix ruptured', 'Band (EVL)', 'TIPS 8 mm']) assert.ok(words.includes(w), `${w} is a line of the chart`);
  const tips = tl.entries().find((e) => e.label.startsWith('TIPS'))!;
  assert.ok(isTips(tips.keys, tips.params), 'the TIPS row opens to its facts');
  const rows = tipsFacts(tips.params as never, tips.day, b.snap.day, {});
  assert.ok(rows.some(([, v]) => /8 mm × 8 cm/.test(v)), 'the TIPS row names the stent');
});

test('History names an action as the page does, from one table', () => {
  assert.equal(sent, actionLabel);
  assert.equal(actionLabel({ kind: 'paracentesis', mL: 3800, albumin: true }), 'Paracentesis 3.8 L + albumin');
  assert.equal(actionLabel({ kind: 'band' }), 'Band (EVL)');
});

test('the third list: the tabs are Present, Patients and Histories in that order; the arrows and the swipe go round the three', () => {
  assert.deepEqual([...MENU_TABS], ['present', 'patients', 'histories']);
  assert.deepEqual([...TABS], [...MENU_TABS]);
  assert.equal(stepTab('present', 1), 'patients'); assert.equal(stepTab('histories', 1), 'present'); assert.equal(stepTab('present', -1), 'histories');
  const src = readFileSync('src/ui/menu/UMenu.tsx', 'utf8');
  assert.match(src, /id: 'histories', label: 'Histories'/);
  assert.match(src, /data-col="histories"/);
  assert.match(src, /Find a presentation, patient or history/);
});

test('the search finds a history by its name, its path, its state and its story, and the note names the list that has the matches', () => {
  const rows = HISTORIES.map((h) => ({ key: h.id, find: fold([h.name, h.group, h.where, h.state.map((s) => s.text).join(' '), h.path].join(' ')), more: fold(h.story) }));
  assert.deepEqual([...filterRows(rows, 'budd')].map((r) => r.key), ['hist-bcs']);
  assert.deepEqual([...filterRows(rows, 'paracentesis')].map((r) => r.key), ['hist-ascites'], 'a path word finds it');
  assert.ok([...filterRows(rows, 'tips')].length >= 3);
  assert.equal(emptyNoteOf('histories', { present: 0, patients: 2, histories: 0 }, 'x').other, '2 patients match ›');
  assert.equal(emptyNoteOf('histories', { present: 0, patients: 2, histories: 0 }, 'x').otherTab, 'patients');
  assert.equal(emptyNoteOf('present', { present: 0, patients: 1, histories: 3 }, 'x').other, '3 histories match ›', 'the list with the most');
  assert.equal(emptyNoteOf('present', { present: 0, patients: 0, histories: 1 }, 'x').other, '1 history matches ›');
  assert.equal(emptyNoteOf('histories', { present: 0, patients: 0, histories: 0 }, 'x').text, 'No history matches.');
  assert.equal(emptyNoteOf('histories', { present: 0, patients: 0, histories: 0 }, '').show, false);
  assert.equal(emptyNoteOf('present', { present: 0, patients: 2, histories: 0 }, 'x').text, emptyNote('present', 0, 2, 'x').text, 'the same words as the two-list note');
});

test('a model patient is known by its id: its name for the bar and History, the preset a shared link carries', () => {
  for (const h of HISTORIES) { assert.ok(isHistory(h.id)); assert.equal(historyName(h.id), h.name); assert.equal(historyOf(h.id), h); assert.equal(shareableId(h.id), h.preset); }
  assert.equal(isHistory('healthy'), false); assert.equal(historyName('healthy'), ''); assert.equal(shareableId('healthy'), 'healthy');
  assert.equal(isHistory(null), false);
});

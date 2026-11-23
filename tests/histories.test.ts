// The model patients (the Histories tab): each course is played on the real engine, so what is checked here is what the page opens. Two kinds of check: the files that ship are exactly what the courses
// play (change a course or re-sync the engine without running scripts/gen-histories.mjs and this fails), and each history is medicine a US physician would recognise under Baveno VIII, in its order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COURSES, storyOf } from '../src/ui/histories/courses.ts';
import { playCourse, metaOf } from '../src/ui/histories/play.ts';
import { render } from '../src/ui/histories/render.ts';
import { stateOf, stateLine, lengthWords } from '../src/ui/histories/state-words.ts';
import type { Baked, EntryOut } from '../src/ui/histories/types.ts';

const played = COURSES.map((c) => { const b = playCourse(c); return { c, b, meta: metaOf(c, b) }; });
const by = (id: string) => played.find((p) => p.c.id === id)!.b;
const find = (b: Baked, f: (e: EntryOut) => boolean) => b.entries.find(f);
const at = (b: Baked, day: number) => b.days.filter((d) => d.day === day).pop()!.v;

test('the files that ship are what the courses play on the engine pinned here', () => {
  const files = render(played);
  for (const [name, text] of Object.entries(files)) assert.equal(readFileSync(`src/ui/histories/${name}`, 'utf8'), text, `${name} is out of date: run node scripts/gen-histories.mjs`);
});

test('a course is played the same each time (the model, the events and the days are deterministic)', () => {
  const again = playCourse(COURSES[1]!);
  assert.deepEqual(again, by('hist-ascites'));
});

test('every history is a record the chart and History can use: ordered, with the start first and the settings on every change', () => {
  for (const { c, b } of played) {
    assert.equal(b.entries[0]!.kind, 'start', c.id);
    assert.equal(b.entries[0]!.day, 0);
    const abs = b.entries.map((e) => e.day * 86400 + e.t);
    assert.deepEqual(abs, [...abs].sort((x, y) => x - y), `${c.id}: entries in the order they happened`);
    for (const e of b.entries) if (e.kind === 'change' || e.kind === 'start') assert.ok(e.params || e.action, `${c.id}: ${e.label} carries the settings after it (the medicine bars read them)`);
    const d = b.days.map((x) => x.day);
    assert.deepEqual(d, [...d].sort((x, y) => x - y), `${c.id}: days run forward`);
    assert.equal(d[d.length - 1], c.days, `${c.id}: the record ends on the last day`);
    assert.equal(b.snap.day, c.days);
    for (const k of ['hvpg', 'asc', 'shunt', 'ppg', 'CONF']) assert.ok(Number.isFinite(at(b, c.days)[k]), `${c.id}: ${k} is on the last day`);
    // a line of the course's own steps is there for each step that names a day
    for (const s of c.steps) if (s.id) assert.ok(b.entries.some((e) => e.step === s.id), `${c.id}: step ${s.id} made an entry`);
  }
});

test('Cirrhosis, first bleed: carvedilol first, a bleed on it, a vasoactive drug and a band the same day, a TIPS within 72 hours (pre-emptive), PPG under 12 after', () => {
  const b = by('hist-bleed');
  const carv = find(b, (e) => e.step === 'carvedilol')!, bleed = find(b, (e) => e.evId === 'VARIX_RUPTURE')!, band = find(b, (e) => e.step === 'band')!, vaso = find(b, (e) => e.step === 'vasoactive')!, tips = find(b, (e) => e.step === 'tips')!;
  assert.ok(carv.day < bleed.day, 'the beta-blocker comes before the bleed');
  assert.equal(bleed.sev, 'critical');
  assert.equal(band.day, bleed.day, 'banded at the first endoscopy, the same day');
  assert.equal(vaso.day, bleed.day);
  assert.ok(tips.day - bleed.day <= 3 && tips.day >= bleed.day, 'pre-emptive: within 72 hours');
  assert.deepEqual(tips.keys, ['tips']);
  assert.equal((tips.params as { drugs: { terlipressin: boolean; carvedilol: boolean } }).drugs.terlipressin, false, 'the vasoactive drug is over (2 to 5 days)');
  assert.ok(find(b, (e) => e.evId === 'BLEED_STOPPED' && e.day === bleed.day), 'the model says the bleeding was controlled');
  assert.ok(b.now.tipsMm === 8 && b.now.ppg < 12 && b.now.ppg > 0, `PPG ${b.now.ppg} after the TIPS (Baveno VIII: under 12)`);
  assert.ok(at(b, bleed.day - 1).ppg > 12, 'the gradient was over 12 before it');
});

test('Refractory ascites: diuretics from the start, three large taps with albumin, then a TIPS; the fluid is back before each tap and the gradient is under 12 after the TIPS', () => {
  const b = by('hist-ascites');
  assert.equal((b.entries[0]!.params as { diuretics: boolean }).diuretics, true, 'on diuretics from the first day');
  const taps = b.entries.filter((e) => e.action && /^Paracentesis/.test(e.label));
  assert.equal(taps.length, 3);
  for (const t of taps) assert.match(t.label, /\+ albumin$/, 'a large tap is given with albumin');
  const tips = find(b, (e) => e.step === 'tips')!;
  assert.ok(taps.every((t) => t.day < tips.day), 'the TIPS is after the taps: refractory, not first line');
  for (const t of taps) assert.ok(at(b, t.day - 1).asc > 2, 'there is fluid to take (over 2 L) before each tap');
  assert.ok(b.now.ppg < 12 && b.now.tipsMm === 8);
  assert.ok(at(b, tips.day - 1).asc > 2.5, 'the fluid had come back by the time of the TIPS');
});

test('Acute portal vein thrombosis: anticoagulation at once, and the clot clears under it', () => {
  const b = by('hist-pvt');
  const a = find(b, (e) => e.step === 'anticoag')!;
  assert.ok(a.day <= 2, 'at once');
  assert.deepEqual(a.keys, ['anticoag']);
  assert.ok(b.now.clot! < 0.6 && b.now.clot! > 0, `the clot is partly cleared (${b.now.clot})`);
  assert.ok(b.now.meds.includes('Anticoagulation'));
  assert.ok(at(b, b.snap.day).ppg < at(b, 1).ppg / 2, 'the gradient came down with it');
  assert.ok(!b.entries.some((e) => e.params && (e.params as { tips: { on: boolean } }).tips.on), 'no TIPS: it is not first line');
});

test('Budd-Chiari: anticoagulation, then an angioplasty of a hepatic vein; the ascites clears and no TIPS was needed', () => {
  const b = by('hist-bcs');
  const a = find(b, (e) => e.step === 'anticoag')!, p = find(b, (e) => e.step === 'angioplasty')!;
  assert.ok(a.day < p.day, 'anticoagulation first');
  assert.equal(p.label, 'Angioplasty, right hepatic vein');
  assert.ok(at(b, p.day - 1).asc > 5, 'massive ascites before');
  assert.ok(b.now.ascitesL < 0.15, 'cleared after');
  assert.equal(b.now.tipsMm, null);
});

test('TIPS that has narrowed: the TIPS first brings the gradient under 12; months later the stent narrows and it is back over 12 with the fluid, and Doppler picks it up', () => {
  const b = by('hist-tips-narrowed');
  const tips = find(b, (e) => e.step === 'tips')!, dop = find(b, (e) => e.step === 'doppler')!;
  assert.ok(at(b, tips.day + 8).ppg < 12, 'it worked at first');
  assert.ok(b.now.ppg >= 12, `the gradient is high again (${b.now.ppg})`);
  assert.ok(b.now.ascitesL > 2, 'and the fluid is back');
  assert.ok(dop.day > tips.day + 60 && dop.day < b.snap.day);
  assert.equal(dop.kind, 'event');
  assert.equal((b.snap.params as { stenosis: { TIPS: number } }).stenosis.TIPS > 0.3, true, 'the stent really is narrowed in the model');
  assert.ok(!b.entries.some((e) => e.kind === 'change' && /narrowed/.test(e.label)), 'the disease moving is not a line of History');
});

test('what shows on screen names no guideline but Baveno VIII (the others are for the speaker notes)', () => {
  const words = [...COURSES.flatMap((c) => [c.name, c.where, c.path, storyOf(c), ...c.steps.flatMap((s) => [s.label ?? '', s.detail ?? '', s.note?.title ?? '', s.note?.detail ?? ''])]), ...played.flatMap((p) => p.b.entries.map((e) => `${e.label} ${e.detail ?? ''}`))].join('\n');
  assert.doesNotMatch(words, /AASLD|EASL|Baveno VII\b(?! ?I)|Baveno 7|ESGE|\bAGA\b/);
  for (const c of COURSES) assert.doesNotMatch(storyOf(c), /\{|NaN|undefined/, `${c.id}: every day in the story is filled in`);
});

test('the row says where the patient is today, in the model\'s numbers', () => {
  for (const { c, b, meta } of played) {
    assert.deepEqual(meta.state, stateOf(b.now, c.state));
    assert.ok(stateLine(meta.state).length <= 48, `${c.id}: one line on a phone (${stateLine(meta.state)})`);
  }
  assert.equal(stateLine(stateOf(by('hist-tips-narrowed').now, ['tips', 'ppg'])), `TIPS 8 mm, PPG ${by('hist-tips-narrowed').now.ppg.toFixed(1)} · high`);
  assert.equal(stateOf({ ...by('hist-bleed').now, ppg: 11.99 }, ['ppg'])[0]!.tone, undefined, 'under the red line it is not coloured');
  assert.equal(lengthWords(120), '4 months in');
  assert.equal(lengthWords(30), '4 weeks in');
});

test('the little course: one portal vein pressure in about three days, and the steps in the course\'s words', () => {
  for (const { meta } of played) {
    assert.ok(meta.pv.length >= 20 && meta.pv.length <= 60);
    assert.ok(meta.marks.length >= 1 && meta.marks.every((m) => m.word && m.day >= 0 && m.day <= meta.days));
    assert.ok(Math.max(...meta.pv) <= meta.max);
  }
  assert.deepEqual(played[0]!.meta.marks.map((m) => m.word), ['Carvedilol', 'Bled', 'Banded', 'TIPS']);
});

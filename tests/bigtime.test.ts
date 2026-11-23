import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marksOf, isMed, type EntryIn } from '../src/ui/bigtime/marks.ts';
import { valueAt, tickStep, pointsIn, type Series } from '../src/ui/bigtime/record.ts';
import { buildData, baseName } from '../src/ui/bigtime/data.ts';
import { bigFrame, stripFrame, leadOf, type BigIn } from '../src/ui/bigtime/frame.ts';
import { before, isTips, tipsFacts, readingsAt } from '../src/ui/bigtime/facts.ts';
import { zoomed, slid } from '../src/ui/bigtime/store.ts';
import { dayExtras } from '../src/ui/bigtime/day-keys.ts';
import { MEASURES, MEASURE_OF } from '../src/ui/bigtime/measures.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

const E = (id: number, kind: EntryIn['kind'], day: number, label: string, x: Partial<EntryIn> = {}): EntryIn => ({ id, kind, day, label, ...x });
const LABELS = (p: unknown) => new Map(Object.entries(p as Record<string, string>));
const ENTRIES: EntryIn[] = [
  E(1, 'start', 0, 'Patient', { params: {} }),
  E(2, 'change', 36, 'Carvedilol', { keys: ['drug:carvedilol'], params: { 'drug:carvedilol': 'Carvedilol' } }),
  E(3, 'event', 52, 'Ascites forming', { sev: 'caution', detail: 'Lymph formation exceeds drainage.' }),
  E(4, 'event', 63, 'Esophageal varix ruptured', { sev: 'critical' }),
  E(5, 'change', 63, 'No carvedilol', { params: {} }),
  E(6, 'change', 70, 'Paracentesis', { action: true, params: {} }),
  E(7, 'change', 72, 'Carvedilol', { keys: ['drug:carvedilol'], params: { 'drug:carvedilol': 'Carvedilol' } }),
  E(8, 'change', 84, 'TIPS 8 mm', { keys: ['tips'], params: { 'drug:carvedilol': 'Carvedilol', tips: 'TIPS 8 mm' } }),
  E(9, 'jump', 90, '+1 week'),
  E(10, 'change', 100, 'TIPS 10 mm', { keys: ['tips'], params: { 'drug:carvedilol': 'Carvedilol', tips: 'TIPS 10 mm' } }),
];

test('medicines are bars (start to stop, one still running), procedures and events are lines, a jump is neither', () => {
  const m = marksOf(ENTRIES, LABELS);
  assert.deepEqual(m.meds.map((b) => [b.name, b.spans]), [['Carvedilol', [{ from: 36, to: 63 }, { from: 72, to: null }]]]);
  assert.deepEqual(m.lines.map((l) => [l.day, l.label, l.tone, l.kind]), [[52, 'Ascites forming', 'caution', 'event'], [63, 'Esophageal varix ruptured', 'danger', 'event'], [70, 'Paracentesis', 'change', 'change'], [84, 'TIPS 8 mm', 'change', 'change'], [100, 'TIPS 10 mm', 'change', 'change']]);
  assert.ok(isMed('drug:x') && isMed('diuretics') && isMed('anticoag') && !isMed('tips'));
});

test('a change that only started or stopped a medicine draws no line; one that did both a medicine and a procedure draws the procedure', () => {
  const both = marksOf([E(1, 'start', 0, 'P', { params: {} }), E(2, 'change', 10, 'Carvedilol · TIPS 8 mm', { keys: ['drug:c', 'tips'], params: { 'drug:c': 'Carvedilol', tips: 'TIPS 8 mm' } })], LABELS);
  assert.deepEqual(both.lines.map((l) => l.label), ['TIPS 8 mm']);
  assert.equal(both.meds[0]!.spans[0]!.from, 10);
});

test('a reading at a day: the later point of a step, the straight line between, the ends held', () => {
  const s: Series = { x: [0, 10, 10, 20], y: [5, 5, 9, 9] };
  assert.equal(valueAt(s, 9.99), 5);
  assert.equal(valueAt(s, 10), 9);
  assert.equal(valueAt({ x: [0, 10], y: [0, 10] }, 5), 5);
  assert.equal(valueAt(s, -4), 5);
  assert.equal(valueAt(s, 99), 9);
  assert.equal(valueAt(null, 3), null);
  assert.equal(before(s, 10), 5);
  assert.deepEqual(pointsIn({ x: [0, 1, 2, 3, 4], y: [0, 1, 2, 3, 4] }, 1.5, 2.5, (d) => d, (v) => v), [1.5, 1.5, 2, 2, 2.5, 2.5]);
  assert.equal(tickStep(54, 600), 5);
});

test('the zoom keeps the day under the pointer, stays inside the run and never goes under three days', () => {
  const full: [number, number] = [0, 100];
  const z = zoomed([0, 100], full, 2, 25);
  assert.deepEqual(z.map((v) => Math.round(v)), [13, 63]);
  assert.deepEqual(zoomed([40, 45], full, 50, 42).map((v) => +(v).toFixed(2)), [40.8, 43.8]);
  assert.deepEqual(slid([95, 110], full), [85, 100]);
  assert.deepEqual(zoomed([10, 20], full, 0.01, 15), [0, 100]);
});

test('the day record takes ascites in litres, the shunt as a share, the cardiac output, and a varix pressure only when the frame has one', () => {
  const x = dayExtras({ metrics: { ascites: { volume: 1600 }, shuntFraction: 0.25, co: 6.5, ppg: 11.4 } });
  assert.deepEqual(x, { asc: 1.6, shunt: 0.25, co: 6.5, ppg: 11.4 });
  assert.deepEqual(dayExtras({ metrics: {} }), {});
  assert.deepEqual(dayExtras({}), {});
});

const run = (n: number, f: (d: number) => number): Series => ({ x: Array.from({ length: n }, (_, i) => i), y: Array.from({ length: n }, (_, i) => f(i)) });
const SER: Record<string, Series> = {
  pv: run(121, (d) => (d < 84 ? 17 : 12.5)), wedge: run(121, (d) => (d < 84 ? 16 : 12)), hv: run(121, (d) => (d < 84 ? 5 : 7.7)), ivc: run(121, (d) => (d < 84 ? 4.5 : 7.4)),
  asc: run(121, (d) => (d < 70 ? 0.5 + d / 40 : 1.2)), shunt: run(121, (d) => (d < 84 ? 0.22 : 0.42)),
};
const HV = run(121, (d) => (d < 84 ? 11.7 : 5.3));
const DATA = buildData({ calm: (k) => ({ CONF: SER.pv, whvp: SER.wedge, RHV: SER.hv, IVCS: SER.ivc, asc: SER.asc, shunt: SER.shunt, hvpg: HV }[k] ? { x: ({ CONF: SER.pv, whvp: SER.wedge, RHV: SER.hv, IVCS: SER.ivc, asc: SER.asc, shunt: SER.shunt, hvpg: HV } as Record<string, Series>)[k]!.x as number[], mid: ({ CONF: SER.pv, whvp: SER.wedge, RHV: SER.hv, IVCS: SER.ivc, asc: SER.asc, shunt: SER.shunt, hvpg: HV } as Record<string, Series>)[k]!.y as number[] } : null), entries: ENTRIES, labelsOf: LABELS, hidden: null });
const inp = (o: Partial<BigIn> = {}): BigIn => ({ series: DATA.series, hvpg: DATA.hvpg, on: ['pv', 'wedge', 'hv', 'ivc', 'asc', 'shunt'], lines: DATA.lines, meds: DATA.meds, full: DATA.full, win: [58, 112], cursor: 84, h: 760, ...o });

test('the data: the run is the days recorded, the hidden measures are left out, the list is events and changes in order', () => {
  assert.deepEqual(DATA.full, [0, 120]);
  assert.equal(DATA.empty, false);
  assert.deepEqual(Object.keys(DATA.series).sort(), ['asc', 'hv', 'ivc', 'pv', 'shunt', 'wedge']);
  assert.deepEqual(DATA.happened.map((h) => h.day), [36, 52, 63, 63, 70, 72, 84, 100]);
  const hid = buildData({ calm: (k) => (k === 'hvpg' ? { x: HV.x as number[], mid: HV.y as number[] } : k === 'CONF' ? { x: SER.pv!.x as number[], mid: SER.pv!.y as number[] } : k === 'whvp' ? { x: SER.wedge!.x as number[], mid: SER.wedge!.y as number[] } : null), entries: [], labelsOf: LABELS, hidden: new Set(['trueHVPG']) });
  assert.equal(hid.hvpg, null);
  assert.ok(!hid.series.wedge && hid.series.pv);
  assert.equal(buildData({ calm: () => null, entries: [], labelsOf: LABELS, hidden: null }).empty, true);
  assert.equal(baseName('TIPS 8 mm'), 'TIPS');
  assert.equal(baseName('Paracentesis'), 'Paracentesis');
});

test('one day only: the run is shown over thirty days and each reading is a dot, not a blank card', () => {
  const one = buildData({ calm: (k) => (k === 'CONF' || k === 'hvpg' ? { x: [0], mid: [k === 'hvpg' ? 2.3 : 9] } : null), entries: [], labelsOf: LABELS, hidden: null });
  assert.equal(one.empty, false); assert.equal(one.short, true); assert.deepEqual(one.full, [0, 30]);
  const f = bigFrame({ ...inp(), series: one.series, hvpg: one.hvpg, on: ['pv'], lines: [], meds: [], full: one.full, win: one.full, cursor: null }, ctxOf('light', 760)).frame;
  assert.equal(f.shapes.filter((s) => s.k === 'circle').length, 2);
});

test('the TIPS opens to its route, its stent and the numbers before and after', () => {
  const rows = tipsFacts({ tips: { on: true, d: 8 }, stentGeom: { TIPS: { len: 8 } } }, 84, 120, { shunt: SER.shunt, pv: SER.pv, ivc: SER.ivc, hvpg: HV, asc: SER.asc });
  const get = (k: string) => rows.find((r) => r[0] === k)?.[1];
  assert.equal(get('Stent'), '8 mm × 8 cm');
  assert.equal(get('Shunt fraction'), '22% → 42%');
  assert.equal(get('HVPG'), '11.7 → 5.3 mmHg');
  assert.equal(get('Route'), 'Right portal vein to right hepatic vein');
  assert.ok(isTips(['tips'], { tips: { on: true } }) && !isTips(['drug:x'], { tips: { on: true } }) && !isTips(['tips'], { tips: { on: false } }));
  assert.equal(readingsAt(84, { pv: SER.pv, ivc: SER.ivc, hvpg: HV }), 'HVPG 5.3 · PV 12.5 · PPG 5.1');
});

test('the frame, every look and width: words 12 px and over, in the box, readable on the card, a lane for each unit, a line for each event in the window', () => {
  eachLook((look) => {
    for (const w of [380, 760, 1200]) {
      const c = ctxOf(look, w);
      const { frame, geo } = bigFrame(inp(), c);
      const { words } = judge(frame, look);
      assert.equal(geo.lanes.map((l) => l.id).join(), 'p,hvpg,asc,shunt', `${look} ${w}`);
      assert.ok(words.some((t) => t.s === 'Day 84' && t.weight === 700), `${look} ${w}: the crosshair's day`);
      assert.ok(words.some((t) => t.s === 'TIPS 8 mm'), `${look} ${w}: a procedure's name`);
      assert.ok(words.some((t) => t.s === 'Carvedilol'), `${look} ${w}: a medicine's name`);
      assert.ok(words.some((t) => t.s === 'CSPH 10') && words.some((t) => t.s === 'Bleed risk 12') && words.some((t) => t.s === 'Large shunt 30%') && words.some((t) => t.s === 'Grade 2 · 1.5 L'), `${look} ${w}: the cut-offs`);
      const s = stripFrame(inp(), c, leadOf(w));
      judge(s.frame, look);
    }
  });
});

test('a phone sets the event names upright; a wide card sets them in rows above the plot, none over another', () => {
  const phone = bigFrame(inp(), ctxOf('light', 380)).frame.shapes.filter((s): s is TextShape => s.k === 'text' && s.rot === -90);
  assert.ok(phone.length >= 3 && phone.every((t) => t.anchor === 'start'));
  const wide = bigFrame(inp(), ctxOf('light', 1200)).frame.shapes.filter((s): s is TextShape => s.k === 'text' && ['Paracentesis', 'TIPS 8 mm', 'TIPS 10 mm', 'High portosystemic shunt fraction'].includes(s.s) && !s.rot);
  assert.ok(wide.length >= 3);
  for (const a of wide) for (const b of wide) if (a !== b && Math.abs(a.y - b.y) < 1) assert.ok(a.x + a.s.length * 6 < b.x || b.x + b.s.length * 6 < a.x, `${a.s} over ${b.s}`);
});

test('no cursor: the lane titles read the newest day and there is no crosshair; nothing chosen says so', () => {
  const f = bigFrame(inp({ cursor: null }), ctxOf('light', 760)).frame;
  assert.ok(!f.shapes.some((s) => s.k === 'text' && /^Day \d/.test(s.s)));
  const none = bigFrame(inp({ on: [], hvpg: null, meds: [], lines: [] }), ctxOf('light', 760)).frame.shapes.filter((s): s is TextShape => s.k === 'text');
  assert.ok(none.some((t) => /Nothing chosen/.test(t.s)));
});

test('every measure has a unit lane and a colour the palette (or its own fallback) gives', () => {
  for (const m of MEASURES) assert.ok(MEASURE_OF[m.id] === m && m.name && m.short && m.words(1).length > 0);
  assert.equal(MEASURE_OF.shunt!.words(0.254), '25%');
  assert.equal(MEASURE_OF.asc!.words(1.55), '1.6 L');
});

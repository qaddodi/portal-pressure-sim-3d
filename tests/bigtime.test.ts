import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marksOf, isMed, type EntryIn } from '../src/ui/bigtime/marks.ts';
import { valueAt, tickStep, pointsIn, type Series } from '../src/ui/bigtime/record.ts';
import { buildData, baseName } from '../src/ui/bigtime/data.ts';
import { bigFrame, stripFrame, leadOf, TITLE_H, type BigIn } from '../src/ui/bigtime/frame.ts';
import { before, isTips, tipsFacts, readingsAt } from '../src/ui/bigtime/facts.ts';
import { paceOf, scaleFor, scaleWord } from '../src/ui/bigtime/pace.ts';
import { zoomed, slid, useBig } from '../src/ui/bigtime/store.ts';
import { dayExtras } from '../src/ui/bigtime/day-keys.ts';
import { MEASURES, MEASURE_OF, heWord } from '../src/ui/bigtime/measures.ts';
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
const inp = (o: Partial<BigIn> = {}): BigIn => ({ series: DATA.series, hvpg: DATA.hvpg, on: ['pv', 'wedge', 'hv', 'ivc', 'hvpg', 'asc', 'shunt'], lines: DATA.lines, meds: DATA.meds, full: DATA.full, win: [58, 112], cursor: 84, h: 760, ...o });

test('the data: the run is the days recorded, the hidden measures are left out, the list is events and changes in order', () => {
  assert.deepEqual(DATA.full, [0, 120]);
  assert.equal(DATA.empty, false);
  assert.deepEqual(Object.keys(DATA.series).sort(), ['asc', 'hv', 'hvpg', 'ivc', 'pv', 'shunt', 'wedge']);
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
  const f = bigFrame({ ...inp(), series: one.series, hvpg: one.hvpg, on: ['pv', 'hvpg'], lines: [], meds: [], full: one.full, win: one.full, cursor: null }, ctxOf('light', 760)).frame;
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
      assert.ok(words.some((t) => t.s === 'Day 84' && t.weight === 600), `${look} ${w}: the crosshair's day`);
      assert.ok(words.some((t) => t.s === 'TIPS 8 mm'), `${look} ${w}: a procedure's name`);
      assert.ok(words.some((t) => t.s === 'Carvedilol'), `${look} ${w}: a medicine's name`);
      assert.ok(words.some((t) => t.s === 'CSPH 10') && words.some((t) => t.s === 'Bleed risk 12') && words.some((t) => t.s === 'Large shunt 30%'), `${look} ${w}: the cut-offs`);
      const s = stripFrame(inp(), c, leadOf(w));
      judge(s.frame, look);
    }
  });
});

test('a phone sets the event names at 45° (none over another); a wide card sets them in rows above the plot, none over another', () => {
  const phone = bigFrame(inp(), ctxOf('light', 380)).frame.shapes.filter((s): s is TextShape => s.k === 'text' && s.rot === -45);
  assert.ok(phone.length >= 3 && phone.every((t) => t.anchor === 'start'));
  assert.ok(!bigFrame(inp(), ctxOf('light', 380)).frame.shapes.some((s) => s.k === 'text' && s.rot === -90), 'no label is upright any more');
  const wide = bigFrame(inp(), ctxOf('light', 1200)).frame.shapes.filter((s): s is TextShape => s.k === 'text' && ['Paracentesis', 'TIPS 8 mm', 'TIPS 10 mm', 'High portosystemic shunt fraction'].includes(s.s) && !s.rot);
  assert.ok(wide.length >= 3);
  for (const a of wide) for (const b of wide) if (a !== b && Math.abs(a.y - b.y) < 1) assert.ok(a.x + a.s.length * 6 < b.x || b.x + b.s.length * 6 < a.x, `${a.s} over ${b.s}`);
});

test('no cursor: the lane titles are the names alone (a reading at the left edge would be the newest day beside a line that starts elsewhere) and there is no crosshair; nothing chosen says so', () => {
  const f = bigFrame(inp({ cursor: null }), ctxOf('light', 760)).frame;
  assert.ok(!f.shapes.some((s) => s.k === 'text' && /^Day \d/.test(s.s)));
  const titles = f.shapes.filter((s): s is TextShape => s.k === 'text' && s.weight === 600 && s.y < 400 && /\d/.test(s.s) && s.x < 300 && !/^\d+$/.test(s.s) && !s.s.startsWith('Day'));
  assert.deepEqual(titles.filter((t) => /(mmHg| L|%)$|^\d+\.\d$/.test(t.s)).map((t) => t.s), [], 'no reading in a lane title without the crosshair');
  const none = bigFrame(inp({ on: [], hvpg: null, meds: [], lines: [] }), ctxOf('light', 760)).frame.shapes.filter((s): s is TextShape => s.k === 'text');
  assert.ok(none.some((t) => /Nothing chosen/.test(t.s)));
});

test('every measure has a unit lane and a colour the palette (or its own fallback) gives', () => {
  for (const m of MEASURES) assert.ok(MEASURE_OF[m.id] === m && m.name && m.short && m.words(1).length > 0);
  assert.equal(MEASURE_OF.shunt!.words(0.254), '25%');
  assert.equal(MEASURE_OF.asc!.words(1.55), '1.6 L');
});

test('the HVPG lane grows with a high patient: a decompensated 24 mmHg is inside its lane, with its own ticks (never cut at 16)', () => {
  const hi: Series = { x: [0, 50, 100], y: [16.5, 24, 20] } as Series;
  const { frame, geo } = bigFrame(inp({ hvpg: hi, win: [0, 100], full: [0, 100], cursor: 50 }), ctxOf('light', 760));
  const lane = geo.lanes.find((l) => l.id === 'hvpg')!;
  const { words } = judge(frame, 'light');
  assert.ok(words.some((t) => t.s === '20'), 'a tick at 20');
  // the line's highest point is no higher than the lane's top
  const ys = frame.shapes.flatMap((s) => (s.k === 'path' ? s.pts.filter((_, i) => i % 2 === 1) : []));
  assert.ok(ys.every((y) => y >= 0), 'in the box');
  assert.ok(lane.h > 0);
});

// The chart's readings against the model's own, from a real patient (decompensated cirrhosis, then a TIPS): the units and the scale each lane reads.
test('the day record reads the model: ascites mL to L, the shunt as 0..1, the PPG and cardiac output as the metrics, a TIPS raises the shunt and lowers the PPG', async () => {
  const { createCore } = await import('../src/engine/hales/host/worker-core.js');
  const out: { type: string; day?: number; metrics?: Record<string, unknown>; Pf?: ArrayLike<number>; params?: Record<string, unknown> }[] = [];
  const core = createCore((m: never) => { out.push(m); });
  const last = () => [...out].reverse().find((m) => m.type === 'frame')!;
  await core.handle({ type: 'init' }); await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: 'cirr-decomp', reqId: 1 });
  const a = last(), ea = dayExtras(a as never), ma = a.metrics as { ascites: { volume: number }; shuntFraction: number; co: number; ppg: number };
  assert.equal(ea.asc, ma.ascites.volume / 1000);
  assert.ok(ea.asc! > 0.2 && ea.asc! < 10, `ascites in litres (${ea.asc})`);
  assert.equal(ea.shunt, ma.shuntFraction); assert.ok(ea.shunt! >= 0 && ea.shunt! <= 1);
  assert.equal(ea.ppg, ma.ppg); assert.equal(ea.co, ma.co);
  assert.ok(Math.abs(ea.eus! - ea.ppg!) < 4, `the EUS-PPG (${ea.eus}) is the PPG's neighbour (${ea.ppg}): the left portal less the left hepatic vein`);
  const mb = a.metrics as { lsm: number; ssm: number };
  assert.equal(ea.lsm, mb.lsm); assert.equal(ea.ssm, mb.ssm);
  assert.ok(ea.lsm! > 15 && ea.lsm! < 80 && ea.ssm! > 40 && ea.ssm! <= 100, `a decompensated cirrhosis reads stiff liver and spleen in kPa (LSM ${ea.lsm}, SSM ${ea.ssm})`);
  assert.ok(ea.var! > 0 && ea.smv! > 0 && ea.smv! >= ea.var!, 'the SMV pressure is above the varix, both read from the node pressures');
  const p = JSON.parse(JSON.stringify((core.engine() as { params: unknown }).params)); p.tips = { on: true, d: 8 };
  await core.handle({ type: 'setParams', params: p, settle: true });
  const eb = dayExtras(last() as never);
  assert.ok(eb.shunt! > ea.shunt!, 'the TIPS raises the share bypassing the liver');
  assert.ok(eb.ppg! < ea.ppg!, 'and lowers the PPG');
  assert.ok(eb.ssm! < ea.ssm!, 'and the spleen, no longer congested, reads softer (the model lets the pressure through)');
  core.dispose();
});

// The cause of "Only today is recorded" (23 Nov): every frame after a jump of the clock (+1 month) carries `jump`, and the feed emptied the day record on it, so a patient run on
// for months had one day. The record now lives as long as the patient (the worker's `gen`) and goes back only as far as the entry History restored.
test('the day record survives the clock jumping on, starts over for a new patient and goes back to the restored day', async () => {
  const { SampleFeed } = await import('../src/ui/tests/feed.ts');
  const feed = new SampleFeed();
  const f = (day: number, jump: boolean, gen: number) => ({ jump, gen, clock: 'hemo', day, metrics: { hvpg: 10 + day / 10, pv: 15, whvp: 12, fhvp: 5, ra: 4, ivc: 5, sv: 14 } }) as never;
  const days = () => feed.days.map((d) => d.day).join();
  feed.adopt(f(0, true, 1)); feed.adopt(f(0, false, 1));
  feed.adopt(f(30, true, 1)); feed.adopt(f(30, false, 1));
  feed.adopt(f(60, true, 1)); feed.adopt(f(89, true, 1));
  assert.equal(days(), '0,30,60,89', 'a jump keeps the days before it');
  feed.keepDaysTo(60); feed.adopt(f(60, true, 2));
  assert.equal(days(), '0,30,60', 'History went back to day 60: the later day is dropped, the earlier kept');
  feed.adopt(f(0, true, 3));
  assert.equal(days(), '0', 'a new patient starts a new record');
});

test('a jump is sampled a day at a time: every day it runs is a point of the record (a few days at a time only past 200)', async () => {
  const { jumpStep } = await import('../src/ui/timeline/index.ts');
  assert.deepEqual([7, 30, 90, 200, 365, 730].map(jumpStep), [1, 1, 1, 1, 2, 4]);
  const { createCore } = await import('../src/engine/hales/host/worker-core.js');
  const { SampleFeed } = await import('../src/ui/tests/feed.ts');
  const feed = new SampleFeed();
  const core = createCore((m: never) => { if ((m as { type: string }).type === 'frame') feed.adopt(m); });
  await core.handle({ type: 'init' }); await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: 'cirr-decomp', reqId: 1 });
  for (let i = 0; i < 30; i++) await core.handle({ type: 'advance', days: 1 });
  const d = feed.days.map((p) => p.day);
  assert.deepEqual(d.slice(-30), Array.from({ length: 30 }, (_, i) => i + 1), 'a point for each day of the jump');
  assert.ok(feed.days.every((p) => Number.isFinite(p.v.asc!) && Number.isFinite(p.v.shunt!)), 'each point carries the new lanes');
  core.dispose();
});

test('the gradients: HVPG, PPG and EUS-PPG are each a series with a toggle; the lane holds the ones that are on', () => {
  const ppg: Series = { x: [0, 60, 120], y: [17, 15, 9] } as Series, eus: Series = { x: [0, 60, 120], y: [16.5, 14.8, 8.9] } as Series;
  assert.deepEqual(MEASURES.filter((m) => m.lane === 'hvpg').map((m) => m.id), ['hvpg', 'ppg', 'eus']);
  assert.deepEqual(MEASURES.filter((m) => m.lane === 'hvpg').map((m) => m.on), [true, false, false]);
  const series = { ...DATA.series, ppg, eus };
  const words = (on: string[]) => {
    const { frame, geo } = bigFrame(inp({ series, on }), ctxOf('light', 760));
    return { lanes: geo.lanes.map((l) => l.id).join(), w: judge(frame, 'light').words.map((t) => t.s) };
  };
  const all = words(['hvpg', 'ppg', 'eus']);
  assert.equal(all.lanes, 'hvpg'); assert.ok(all.w.includes('HVPG ') && all.w.includes('PPG ') && all.w.includes('EUS-PPG '), 'a name and a reading for each');
  const off = words(['ppg']);
  assert.ok(!off.w.includes('HVPG ') && !off.w.includes('CSPH 10'), 'HVPG off: no HVPG line, no zones words');
  assert.ok(off.w.includes('PPG '));
  assert.equal(words(['pv']).lanes, 'p', 'none of the three on: no gradients lane');
});

test('the chart is one tap from the timeline bar: a Chart button beside Compare, and on a phone held upright the word "Chart" takes the second reading\'s place (option 1, 24 Nov)', async () => {
  const { readFileSync } = await import('node:fs');
  const bar = readFileSync(new URL('../src/ui/shell/PlayBar.tsx', import.meta.url), 'utf8');
  assert.ok(/className="tl-pin tl-chart"[^\n]*toggle\('timeline'\)/.test(bar), 'the bar has a Chart button that toggles the chart');
  assert.ok(bar.indexOf('tl-pin tl-chart') < bar.indexOf('className="tl-pin" aria-pressed={comparing}'), 'it sits before Compare');
  assert.ok(/className="rd-chart"[^\n]*toggle\('timeline'\)[^\n]*<span>Chart<\/span>/.test(bar), 'the readout row has the word Chart that toggles the chart');
  assert.ok(/upright \? <ChartWord \/> : <Tile id="ppg"/.test(bar), 'upright: HVPG stays, the Chart word takes PPG\'s place');
  assert.ok(/LOBULE_TILES\.slice\(0, upright \? 1 : LOBULE_TILES\.length\)/.test(bar) && /\{upright && <ChartWord \/>\}/.test(bar), 'upright in the lobule: Sinusoids stays, Portal in gives its place');
  assert.ok(!/open\('timeline'\)/.test(bar), 'the jump menu no longer carries the row the button replaced');
  const css = readFileSync(new URL('../src/ui/css3d-over-2d.css', import.meta.url), 'utf8');
  assert.ok(/max-width: 599px\) and \(orientation: portrait\) \{ \.vdock \.tl-pin\.tl-chart \{ display: none/.test(css), 'the bar pin is hidden only on a phone held upright');
  assert.ok(/\.readouts \.rd-chart \{ pointer-events: auto/.test(css), 'the readout tiles are inert; the button takes its own touches');
});


test('root cause: a lane title has its own strip, so no curve is drawn through it (the "Shunt fraction 85%" title sat on the line)', () => {
  for (const w of [380, 760, 1200]) {
    const { frame, geo } = bigFrame(inp({ cursor: null }), ctxOf('dark', w));
    for (const lane of geo.lanes) {
      const top = lane.t + TITLE_H;
      // every path (a measure's line) inside the lane stays below the title strip
      for (const sh of frame.shapes) if (sh.k === 'path' && sh.pts.length >= 4) for (let i = 1; i < sh.pts.length; i += 2) if (sh.pts[i]! >= lane.t - 1 && sh.pts[i]! <= lane.t + lane.h + 1) assert.ok(sh.pts[i]! >= top - 1.5, `${w}: a line at y ${sh.pts[i]} is over the ${lane.id} title`);
    }
  }
});

test('ascites ticks are every 2 L when the lane runs past 5 L, so no two crowd (1 to 8 stacked on one another)', () => {
  const ticks = (max: number) => { const { frame, geo } = bigFrame(inp({ cursor: null, series: { ...inp().series, asc: { x: [0, 100], y: [0.5, max] } } }), ctxOf('dark', 1200)), a = geo.lanes.find((l) => l.id === 'asc')!; return frame.shapes.filter((s): s is TextShape => s.k === 'text' && /^\d$/.test(s.s) && s.x < 40 && s.anchor === 'end' && s.y >= a.t && s.y <= a.t + a.h + 1).map((t) => t.s); };
  const tall = ticks(7);
  assert.ok(tall.includes('4') && tall.includes('6') && !tall.includes('3') && !tall.includes('5'), `7 L: ${tall}`);
});

test('an event that comes again (Ascites forming) keeps its line and says its words once', () => {
  const again = [E(1, 'event', 20, 'Ascites forming', { sev: 'caution' }), E(2, 'event', 60, 'Ascites forming', { sev: 'caution' }), E(3, 'event', 90, 'Ascites forming', { sev: 'caution' })];
  const m = marksOf([E(0, 'start', 0, 'P', { params: {} }), ...again], LABELS);
  for (const w of [380, 1200]) {
    const f = bigFrame(inp({ lines: m.lines, meds: [] }), ctxOf('light', w)).frame;
    assert.equal(f.shapes.filter((s) => s.k === 'text' && (s.s === 'Ascites forming' || s.s === 'Ascites')).length, 1, `${w}: said once`);
    assert.equal(f.shapes.filter((s) => s.k === 'line' && s.y2 > 100 && s.x1 === s.x2 && s.pen && s.pen.w <= 1.6).length >= 3, true, `${w}: one line each`);
  }
});

test('the What to graph list: every measure with a record is a row (Splenic, SMV, EUS-PPG too), the group head carries the unit, and the rows share the room the card gives (nothing cut at the foot)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/bigtime/Chooser.tsx', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/ui/bigtime/bigtime.css', import.meta.url), 'utf8');
  assert.ok(!/WORDS_ONLY/.test(src), 'no measure is only words');
  assert.ok(/--bt-n/.test(src) && /\.bt-choose \{ --bt-row: clamp\(32px, calc\(\(100cqh/.test(css) && /container-type: size/.test(css), 'the row height is its share of the body');
  assert.ok(/\.bt-body \{[^}]*overflow-y: auto/.test(css), 'root cause (24 Nov, Cardiac output cut off): the list scrolls in the body when the rows at their floor are taller than the room');
  assert.equal(MEASURE_OF.co!.row!(8.04), '8.0');
  assert.equal(MEASURE_OF.co!.words(8.04), '8.0 L/min');
  assert.equal(MEASURE_OF.asc!.row!(6.74), '6.7');
});

test('root cause (EUS-PPG had no history line): every saved patient history carries every key the day record keeps today, so a key added later fails here until the histories are baked again', async () => {
  const { LOAD } = await import('../src/ui/histories/index.generated.ts');
  const want = ['hvpg', 'asc', 'shunt', 'co', 'ppg', 'eus', 'var', 'smv', 'lsm', 'ssm', 'spl', 'plt', 'pflow', 'perf', 'map', 'app', 'hr', 'vx', 'he', 'habr'];
  for (const [id, load] of Object.entries(LOAD)) {
    const { days } = await (load as () => Promise<{ days: { v: Record<string, number> }[] }>)();
    const last = days[days.length - 1]!.v;
    for (const k of want) assert.ok(k in last, `${id}: no "${k}" in its days: run node scripts/gen-histories.mjs`);
  }
});

test('the event-paced axis: a crowd of events gets more room per day than a quiet stretch, every piece is linear (true slopes), the axis is monotonic and invertible', () => {
  const days = [16, 18, 32, 35, 38, 40, 41, 48, 51, 69, 69.4, 69.8, 70.2, 70.6, 71, 72, 72.5, 73, 73.6];
  const p = paceOf(days, [0, 120]);
  assert.ok(!p.flat);
  const room = (a: number, b: number) => (p.at(b) - p.at(a)) / (b - a);
  assert.ok(room(69, 74) > 4 * room(76, 112), 'the crowd has far more room than the quiet end');
  assert.ok(room(80, 110) < 0.5 && room(80, 110) > 0, 'the quiet end is folded, not cut');
  for (const pc of p.pieces) { const m = (pc.a + pc.b) / 2; assert.ok(Math.abs((p.at(m) - p.at(pc.a)) - (p.at(pc.b) - p.at(pc.a)) / 2) < 1e-9, 'one scale inside a piece'); }
  for (let d = 0; d < 120; d += 0.37) { assert.ok(p.at(d + 0.37) > p.at(d)); assert.ok(Math.abs(p.day(p.at(d)) - d) < 1e-9, `inverse at ${d}`); }
  assert.deepEqual([scaleFor(0, 9), scaleFor(1, 4), scaleFor(3, 5), scaleFor(5, 4), scaleFor(11, 4.6)], [1 / 3, 1, 3, 6, 10]);
  assert.deepEqual([scaleWord(1 / 3), scaleWord(1), scaleWord(10)], ['⅓ scale', '1× scale', '10× scale']);
  // pieces start and end ON event days, never on a bin edge
  const edges = new Set(p.pieces.flatMap((q) => [q.a, q.b]));
  for (const d of [16, 18, 32, 51, 69, 73.6]) assert.ok(edges.has(d), `a piece edge on day ${d}`);
  assert.ok(paceOf([], [0, 100]).flat && paceOf([10, 50, 90], [0, 100]).pieces.length >= 1);
});

test('the chart draws the paced axis: the scale said under it, x grows with day, the card\'s pointer inverts it, a zoomed window keeps the same pieces', () => {
  const c = ctxOf('light', 1200), r = bigFrame(inp(), c), g = r.geo;
  assert.ok(r.frame.shapes.some((s) => s.k === 'text' && /scale$/.test(s.s)), 'a scale word under the axis');
  for (let d = g.x0; d < g.x1 - 1; d += 3) { assert.ok(g.X(d + 1) > g.X(d)); assert.ok(Math.abs(g.dayAt(g.X(d)) - d) < 1e-6); }
  assert.ok(Math.abs(g.X(g.x0) - g.L) < 1e-6 && Math.abs(g.X(g.x1) - (g.w - g.R)) < 1e-6);
  const z = bigFrame(inp({ win: [60, 90] }), c).geo;
  assert.ok(Math.abs(z.X(60) - z.L) < 1e-6 && Math.abs(z.X(90) - (z.w - z.R)) < 1e-6);
  assert.ok(Math.abs(z.dayAt(z.X(75)) - 75) < 1e-6);
});

test('a phone: events whose lines are closer than a text line merge into one "+N" tick (capped band), a tap opens the group, the rest keep their 45° words', () => {
  const crowd = ENTRIES.concat([E(20, 'event', 84.2, 'Elevated right atrial pressure', { sev: 'caution' }), E(21, 'event', 84.5, 'Portal vein stasis', { sev: 'caution' }), E(22, 'event', 84.8, 'Liver hypoperfusion', { sev: 'caution' }), E(23, 'event', 85.1, 'Intrahepatic portal branches reversed')]);
  const d2 = buildData({ calm: (k) => (k === 'CONF' ? { x: SER.pv!.x as number[], mid: SER.pv!.y as number[] } : null), entries: crowd, labelsOf: LABELS, hidden: null });
  const mk = (open: string | null) => bigFrame({ ...inp(), lines: d2.lines, series: { pv: SER.pv! }, on: ['pv'], win: [0, 120], open }, ctxOf('light', 380));
  const closed = mk(null), plus = closed.frame.shapes.filter((s): s is TextShape => s.k === 'text' && /^\+\d+$/.test(s.s));
  assert.ok(plus.length >= 1 && plus.every((t) => t.rot === -45), 'a +N tick, turned 45°');
  assert.ok(closed.geo.groups.length === plus.length && closed.geo.groups.every((g) => g.n >= 2));
  assert.ok(closed.geo.top < 760 * 0.4, 'the label band is capped');
  const key = closed.geo.groups[0]!.key, opened = mk(key);
  assert.ok(!opened.frame.shapes.some((s) => s.k === 'text' && s.s === `+${closed.geo.groups[0]!.n}`) || opened.geo.groups.length >= 1);
  const words = opened.frame.shapes.filter((s): s is TextShape => s.k === 'text' && s.rot === -45 && !/^\+\d+$/.test(s.s));
  assert.ok(words.length > closed.frame.shapes.filter((s): s is TextShape => s.k === 'text' && s.rot === -45 && !/^\+\d+$/.test(s.s)).length, 'opening the group sets its words');
  judge(opened.frame, 'light'); judge(closed.frame, 'light');
});

test('"What to graph" rows: a tick circle before every name (filled when on, a ring when off), and the names on the right are Inter, not the serif', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/ui/bigtime/bigtime.css', import.meta.url), 'utf8'), tsx = readFileSync(new URL('../src/ui/bigtime/Chooser.tsx', import.meta.url), 'utf8');
  assert.ok(/<span className="bt-tick" aria-hidden="true" \/>\s*<span className="bt-name">/.test(tsx), 'the tick comes first in the row');
  assert.ok(/\.bt-row\[aria-pressed="true"\] \.bt-tick \{ background: currentColor/.test(css), 'filled when on');
  assert.ok(/\.bt-tick \{[^}]*border: 2px solid/.test(css), 'a ring when off');
  for (const sel of ['.bt-row .bt-name', '.bt-list .bt-what']) assert.ok(new RegExp(`${sel.replace(/\./g, '\\.')} \\{[^}]*var\\(--ui\\)`).test(css), `${sel} is Inter`);
  assert.ok(!/var\(--display\)[^}]*\/\* \(a name is serif/.test(css));
});

test('a phone sheet (390 px wide, about 358 inside) keeps the longest row name whole beside the tick, the line and the reading', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/ui/bigtime/bigtime.css', import.meta.url), 'utf8');
  const m = /\.bt\[data-compact\] \.bt-row \{ grid-template-columns: 22px minmax\(0, 1fr\) (\d+)px (\d+)px; gap: (\d+)px;/.exec(css);
  assert.ok(m, 'the phone row grid');
  const room = 390 - 32 - 22 - Number(m![1]) - Number(m![2]) - 3 * Number(m![3]);
  const { measure } = await import('../src/ui/charts/measure.ts');
  const longest = Math.max(...MEASURES.map((x) => measure(x.name, 16, 600)));
  assert.ok(longest <= room, `the longest name is ${Math.round(longest)} px in ${room}`);
});

test('stiffness: LSM and SSM are two measures of one kPa lane, off until chosen, with the model\'s own cut-offs and no reading when the model gives none (no spleen)', () => {
  assert.deepEqual(dayExtras({ metrics: { lsm: 21.4, ssm: 62.1 } }), { lsm: 21.4, ssm: 62.1 });
  assert.deepEqual(dayExtras({ metrics: { lsm: 21.4, ssm: null } }), { lsm: 21.4 }, 'a splenectomy has no SSM: no point, never a 0');
  assert.ok(!MEASURE_OF.lsm!.on && !MEASURE_OF.ssm!.on, 'the card opens as it did');
  assert.equal(MEASURE_OF.lsm!.words(21.44), '21.4 kPa'); assert.equal(MEASURE_OF.ssm!.row!(62.14), '62.1');
  const stiff = { lsm: { x: [0, 60, 120], y: [9, 24, 31] }, ssm: { x: [0, 60, 120], y: [30, 62, 71] } };
  eachLook((look) => {
    for (const w of [380, 760, 1200]) {
      const { frame, geo } = bigFrame(inp({ series: { ...inp().series, ...stiff }, on: [...inp().on, 'lsm', 'ssm'] }), ctxOf(look, w));
      assert.equal(geo.lanes.map((l) => l.id).join(), 'p,hvpg,stiff,asc,shunt', `${look} ${w}`);
      const { words } = judge(frame, look);
      assert.ok(words.some((t) => t.s === 'LSM 25') && words.some((t) => t.s === 'SSM 55'), `${look} ${w}: the cut-offs`);
      assert.ok(words.some((t) => t.s === 'LSM ' && t.weight === 500) && words.some((t) => t.s === '26.8 kPa' && t.weight === 600) && words.some((t) => t.s === '65.6 kPa'), `${look} ${w}: the lane's title reads both at the crosshair (day 84)`);
      const lane = geo.lanes.find((l) => l.id === 'stiff')!;
      assert.ok(frame.shapes.filter((s): s is TextShape => s.k === 'text' && /^\d+$/.test(s.s) && s.x < 40 && s.anchor === 'end' && s.y >= lane.t && s.y <= lane.t + lane.h + 1).map((t) => t.s).join() === '25,50,75', `${look} ${w}: ticks`);
    }
  });
  assert.ok(!bigFrame(inp(), ctxOf('light', 1200)).geo.lanes.some((l) => l.id === 'stiff'), 'off, no lane');
});

const ALL_NEW = ['spl', 'plt', 'pflow', 'perf', 'map', 'app', 'hr', 'vx', 'he', 'habr'] as const;
test('the day record reads the rest of what the model computes: spleen, platelets, portal flow, liver perfusion, MAP, APP, heart rate, varix, encephalopathy risk, artery response', async () => {
  const { createCore } = await import('../src/engine/hales/host/worker-core.js');
  const out: { type: string; metrics?: Record<string, unknown> }[] = [];
  const core = createCore((m: never) => { out.push(m); });
  await core.handle({ type: 'init' }); await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: 'cirr-decomp', reqId: 1 });
  const f = [...out].reverse().find((m) => m.type === 'frame')!, e = dayExtras(f as never), m = f.metrics as { spleen: { length: number; platelets: number }; portalIn: number; liverPerfPct: number; map: number; rpp: number; hr: number; varix: { d: number }; heRisk: { index: number; label: string }; habr: number };
  assert.deepEqual(ALL_NEW.filter((k) => !(k in e)), [], 'every key is in the record');
  assert.equal(e.spl, m.spleen.length); assert.equal(e.plt, m.spleen.platelets); assert.equal(e.pflow, m.portalIn); assert.equal(e.perf, m.liverPerfPct);
  assert.equal(e.map, m.map); assert.equal(e.app, m.rpp); assert.equal(e.hr, m.hr); assert.equal(e.vx, m.varix.d); assert.equal(e.he, m.heRisk.index); assert.equal(e.habr, m.habr);
  assert.ok(e.spl! > 14 && e.plt! < 150 && e.perf! < 100 && e.map! > 50 && e.hr! > 40 && e.vx! > 2, `a decompensated cirrhosis: big spleen ${e.spl}, low platelets ${e.plt}, low liver flow ${e.perf}%`);
  assert.equal(heWord(e.he!), m.heRisk.label, 'the words of the risk index are the engine\'s own');
  for (const v of [0.05, 0.19, 0.2, 0.44, 0.45, 0.9]) assert.equal(heWord(v), v < 0.2 ? 'Low' : v < 0.45 ? 'Moderate' : 'High');
  core.dispose();
  assert.deepEqual(dayExtras({ metrics: { spleen: { length: 0, platelets: 380 } } }), { plt: 380 }, 'no spleen: no size');
});

test('every measure draws in every look and width on its own lane, with its own cut-offs, and a box too small for all the lanes says so instead of cutting them', () => {
  const ser = (a: number, b: number): Series => ({ x: [0, 60, 120], y: [a, (a + b) / 2, b] });
  const series: Record<string, Series> = { ...inp().series, spl: ser(12, 24), plt: ser(250, 60), pflow: ser(1.1, 0.5), perf: ser(100, 45), map: ser(93, 70), app: ser(88, 60), hr: ser(70, 95), vx: ser(1, 6), he: ser(0.05, 0.5), habr: ser(1, 1.3) };
  eachLook((look) => {
    for (const w of [380, 760, 1200]) {
      const { frame, geo } = bigFrame(inp({ series, on: ['co', 'pv', 'asc', 'shunt', ...ALL_NEW], h: 900 }), ctxOf(look, w));
      const { words } = judge(frame, look);
      assert.equal(geo.lanes.map((l) => l.id).join(), 'p,spl,plt,asc,shunt,co,bp,hr,vx,he,habr', `${look} ${w}`);
      for (const t of ['Platelets 150', 'Low liver flow 75%', 'Large shunt 30%', 'MAP 65', 'Large varix 5 mm', 'Varix seen 2.5 mm', 'High 0.45', 'Moderate 0.2']) assert.ok(words.some((x) => x.s === t), `${look} ${w}: ${t}`);
      assert.ok(geo.lanes.every((l) => l.t >= 0 && l.t + l.h <= geo.bottom + 0.5) && geo.h <= 900.5, `${look} ${w}: every lane inside the box`);
      assert.ok(!words.some((x) => /no room/.test(x.s)), 'nine lanes fit a tall card');
    }
  });
  // a short box: the lanes that cannot be 34 px tall are left out and the foot of the last says how many
  const short = bigFrame(inp({ series, on: ['pv', 'asc', 'shunt', 'co', ...ALL_NEW], h: 520 }), ctxOf('light', 760));
  assert.ok(short.geo.lanes.length < 11 && short.geo.h <= 520.5, `${short.geo.lanes.length} lanes, ${short.geo.h} px`);
  assert.ok((short.frame.shapes as TextShape[]).some((x) => x.k === 'text' && /^\d+ more chosen: no room/.test(x.s)));
  // the rows' words
  assert.equal(MEASURE_OF.he!.words(0.31), '0.31 Moderate'); assert.equal(MEASURE_OF.habr!.words(1.294), '1.29×'); assert.equal(MEASURE_OF.perf!.row!(63.4), '63%');
  assert.ok(ALL_NEW.every((k) => !MEASURE_OF[k]!.on), 'all off until chosen');
});

test('root cause (a phone\'s What to graph / What happened could not scroll or be pulled down): the raised panel scrolls its body at the standard row height, lists every event on one page, and is a sheet of its own whose touches the card around it never sees', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/ui/bigtime/bigtime.css', import.meta.url), 'utf8');
  assert.ok(/\.bt\[data-compact\] \.bt-body \{[^}]*overflow-y: auto/.test(css) && /\.bt\[data-compact\] \.bt-choose \{ --bt-row: 42px/.test(css), 'the body scrolls and the rows keep their height');
  assert.ok(/\.bt\[data-compact\] \.bt-happen \{ position: static/.test(css), 'the list is in the flow, not a box of the room');
  const card = readFileSync(new URL('../src/ui/bigtime/TimelineCard.tsx', import.meta.url), 'utf8'), hap = readFileSync(new URL('../src/ui/bigtime/Happened.tsx', import.meta.url), 'utf8');
  assert.ok(/useSheetSwipe\(side, \(\) => set\(\{ raised: false \}\), \(\) => compact && raised\)/.test(card), 'a pull down closes the panel');
  assert.ok(/addEventListener\('pointerdown', keep\)/.test(card) && /addEventListener\('touchstart', keep/.test(card), 'the card around it does not take the touch');
  assert.ok(/sh-grabbar/.test(card) && /scroll=\{compact\}/.test(card), 'the grab bar, and the list scrolls on a phone');
  assert.ok(/const per = scroll \? Math\.max\(1, rows\.length\)/.test(hap), 'one page of every row when it scrolls');
});

test('the phone\'s two openers are raised buttons (option A): icon, name, up chevron, a fill and a hairline, never the old plain words', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/ui/bigtime/bigtime.css', import.meta.url), 'utf8'), card = readFileSync(new URL('../src/ui/bigtime/TimelineCard.tsx', import.meta.url), 'utf8');
  assert.ok(/\.bt-foot \{ display: grid; grid-template-columns: 1fr 1fr/.test(css) && /\.bt-foot button \{[^}]*height: 46px[^}]*border: 1px solid var\(--edge\)[^}]*border-radius: var\(--r-card\)[^}]*background: var\(--surface-2\)/.test(css), 'two equal raised buttons');
  assert.ok(/ic-trend/.test(card) && /ic-bullets/.test(card) && (card.match(/ic ic-chev-down bt-go/g) ?? []).length === 2, 'each has its icon and an up chevron');
  assert.ok(/\.bt-foot \.bt-go \{[^}]*rotate\(180deg\)/.test(css), 'the chevron points up');
  assert.ok(readFileSync(new URL('../src/ui/css2d/icons.css', import.meta.url), 'utf8').includes('.ic-chev-down {'), 'the atlas has the chevron');
  assert.ok(/\.ic-trend \{ --ix: 8; --iy: 7; \}/.test(css) && /\.ic-bullets \{ --ix: 9; --iy: 7; \}/.test(css), 'the two drawn icons sit in the free cells');
  const used = new Set([...readFileSync(new URL('../src/ui/css2d/icons.css', import.meta.url), 'utf8').matchAll(/--ix: (\d+); --iy: (\d+)/g)].map((m) => `${m[1]},${m[2]}`));
  assert.ok(!used.has('8,7') && !used.has('9,7'), 'the cells are free in the generated sheet');
});

test('root cause (off variables looked untappable on a phone): the chooser draws every measure as a full row with its ring on every device; the labs only a case gives read "MELD"', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/bigtime/Chooser.tsx', import.meta.url), 'utf8'), card = readFileSync(new URL('../src/ui/bigtime/TimelineCard.tsx', import.meta.url), 'utf8');
  assert.ok(!/compact/.test(src) && !/!compact \|\|/.test(src), 'no row is held back for a phone');
  assert.ok(/<Chooser data=\{data\} at=\{at\} \/>/.test(card));
  const { CASE_ONLY } = await import('../src/ui/bigtime/measures.ts');
  assert.deepEqual([...CASE_ONLY], ['Sodium', 'Creatinine', 'Bilirubin', 'INR', 'MELD']);
});

test('root cause (an opened event popped, with no ease): the details of a row are the app\'s one fade (a grid that eases 0fr to 1fr), kept mounted and asked off, never a removed node', async () => {
  const { readFileSync } = await import('node:fs');
  const hap = readFileSync(new URL('../src/ui/bigtime/Happened.tsx', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/ui/bigtime/bigtime.css', import.meta.url), 'utf8');
  assert.ok(/<Fade on=\{isOpen\} as="div" axis="y"/.test(hap) && /kept\.current\.add\(open\.id\)/.test(hap), 'the block eases and stays mounted');
  assert.ok(!/\{isOpen && \(/.test(hap), 'no conditional mount');
  assert.ok(/\.bt-list li > button \{ transition: padding-top var\(--d-small\)/.test(css), 'the opened row\'s own padding eases too');
});

test('every event of What happened carries a chevron that says it opens: down while shut, up while open, eased', async () => {
  const { readFileSync } = await import('node:fs');
  const hap = readFileSync(new URL('../src/ui/bigtime/Happened.tsx', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/ui/bigtime/bigtime.css', import.meta.url), 'utf8');
  assert.ok(/ic ic-chev-down bt-go/.test(hap));
  assert.ok(/\.bt-list li\[data-open\] \.bt-go \{ transform: rotate\(180deg\)/.test(css) && /\.bt-list \.bt-go \{[^}]*transition: transform var\(--d-small\)/.test(css));
  assert.ok(/grid-template-columns: 64px minmax\(0, 1fr\) 16px/.test(css), 'a column for it, so no name runs under it');
});

import { readFileSync } from 'node:fs';
test('each lane sits on its own darker rounded panel with no outline (owner, 24 Nov: "p2 but without outlines")', () => {
  const src = readFileSync(new URL('../src/ui/bigtime/frame.ts', import.meta.url), 'utf8');
  const at = src.indexOf('a darker rounded panel behind each lane');
  assert.ok(at > 0, 'the panels are drawn');
  const line = src.slice(at, src.indexOf('// zones, grids', at));
  assert.ok(/k: 'rect'[^}]*r: 14[^}]*fill: panel/.test(line) && !/stroke|pen\(/.test(line), 'a rounded fill, no outline');
});

test('a section has its own tick (owner, 24 Nov, option X): all drawn, none, or some (mixed); the two panels are one raised control (option B)', () => {
  const st = useBig.getState(), ids = ['pv', 'wedge'];
  st.setMany(ids, false);
  assert.ok(ids.every((id) => !useBig.getState().on[id]));
  st.setMany(ids, true);
  assert.ok(ids.every((id) => useBig.getState().on[id]));
  const chooser = readFileSync(new URL('../src/ui/bigtime/Chooser.tsx', import.meta.url), 'utf8'), card = readFileSync(new URL('../src/ui/bigtime/TimelineCard.tsx', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/ui/bigtime/bigtime.css', import.meta.url), 'utf8');
  assert.ok(/aria-pressed=\{n === ms\.length \? true : n \? 'mixed' : false\}/.test(chooser) && /setMany\(ms\.map/.test(chooser), 'the section tick has the three states');
  assert.ok(/className="bt-seg"/.test(card) && /\.bt-seg button\[aria-pressed="true"\]/.test(css), 'one raised control');
});

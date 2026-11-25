import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventGraphOf, eventLines, eventScale, eventScales, endMix, evSample, goalSpot, procKindOf, EvRun, valAt, evGeo, evX, EVENT_S, PRE_S, EVENT_WORD } from '../src/ui/charts/evgraph/model.ts';
import { evGraphFrame } from '../src/ui/charts/evgraph/frame.ts';
import { evgraphEntry } from '../src/ui/charts/evgraph/entry.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import type { TextShape, PathShape } from '../src/ui/charts/scene.ts';

// (The 2D numbers below were computed once by running event-graph.js's own functions in Node on the same inputs: eventScale('ppg', [19.3, 11], 12), eventScale('liver', …) and so on.)
const TIPS = eventGraphOf({ procedure: 'tips', tiles: ['ppg', 'liver'] })!;

test('which slides carry a graph, and its two lines', () => {
  assert.deepEqual(TIPS, { kind: 'tips', word: 'Stent open', lines: ['ppg', 'liver'], target: 12 });
  assert.deepEqual(eventLines({ procedure: 'brto', tiles: ['gv', 'ppg'] }), ['ppg', 'gv'], 'a pressure takes the lower place');
  assert.equal(eventGraphOf({ procedure: 'eus', tiles: ['ppg', 'liver'] }), null, 'a measurement changes nothing');
  assert.equal(eventGraphOf({ procedure: 'tips', tiles: ['ppg', 'liver'], graph: false }), null);
  assert.equal(eventGraphOf({ procedure: 'tips', tiles: ['ppg'] }), null, 'two lines or none');
  assert.equal(eventGraphOf({ procedure: 'tips', tiles: ['ppg', 'liver'], visual: 'table' }), null);
  assert.deepEqual(eventLines({ procedure: 'tips', tiles: ['hvpg', 'liver'], graph: ['ppg', 'varix', 'liver'] }), ['ppg', 'varix']);
  assert.equal(eventGraphOf({ procedure: 'brto', tiles: ['ppg', 'gv'] })!.target, null, 'only a stent has the PPG goal');
  assert.equal(procKindOf({ kind: 'brto', target: 'C6' }), 'brtoC6');
  assert.equal(procKindOf({ kind: 'tips', target: 'C1a', stented: true }), 'tipscoilin');
  assert.equal(procKindOf('tips'), 'tips');
  assert.equal(procKindOf(null), null);
  assert.deepEqual(Object.keys(EVENT_WORD), ['tips', 'tipscoil', 'tipscoilin', 'brto', 'brtoC6', 'bato']);
});

test('the scales are fixed before drawing: from zero for a pressure, a round top over the highest value, the goal as one green zone', () => {
  const g = eventScale('ppg', [19.3, 11], 12);
  assert.deepEqual(g, { min: 0, max: 25, cuts: [{ v: 12, rate: 'ok' }], zones: [{ a: 0, b: 12, rate: 'ok', target: true }] });
  const p = eventScale('ppg', [16.9, 18]);
  assert.equal(p.min, 0);
  assert.ok(p.max >= 18 * 1.12 && p.max % 5 === 0);
  assert.deepEqual(p.cuts.map((c) => c.v), [12], 'a pressure keeps its red cut-off only');
  for (const z of p.zones) assert.ok(z.rate === 'mid' || z.rate === 'hi');
  const l = eventScale('liver', [61, 32]);
  assert.ok(l.max >= 61 * 1.12, 'the top holds the highest value with room for its head');
  assert.ok(l.min < 32);
  // a room above stretches the axis, never past STRETCH_MAX of the plain fit
  const wide = eventScale('ppg', [19.3, 11], 12, 2);
  assert.ok(wide.max > g.max);
  const [a, b] = eventScales(TIPS, [19.3, 61], [11, 32]);
  assert.equal(a.max, 25);
  assert.ok(b.max > b.min);
  // the two lines end on one spot when both axes are plain: one axis gets room until they stand clear
  const near = eventScales(TIPS, [19.3, 61], [11, 33]);
  const fr = (S: typeof near, j: number, v: number) => (v - S[j]!.min) / (S[j]!.max - S[j]!.min);
  assert.ok(Math.abs(fr(near, 0, 11) - fr(near, 1, 33)) >= 0.28 - 1e-9 || near[1].max >= b.max);
});

test('the numbers equal the 2D file\'s own for the same inputs (event-graph.js run in Node on them once)', () => {
  const two: any = {"a": {"min": 0, "max": 25, "cuts": [{"v": 12, "rate": "ok"}], "zones": [{"a": 0, "b": 12, "rate": "ok", "target": true}]}, "b": {"min": 0, "max": 25, "cuts": [{"v": 12, "rate": "hi"}], "zones": [{"a": 0, "b": 12, "rate": "mid"}, {"a": 12, "b": 25, "rate": "hi"}]}, "c": {"min": 0, "max": 100, "cuts": [{"v": 55, "rate": "hi"}, {"v": 75, "rate": "mid"}], "zones": [{"a": 0, "b": 55, "rate": "hi"}, {"a": 55, "b": 75, "rate": "mid"}]}, "d": {"min": 0, "max": 8, "cuts": [{"v": 2.5, "rate": "mid"}, {"v": 5, "rate": "hi"}], "zones": [{"a": 2.5, "b": 5, "rate": "mid"}, {"a": 5, "b": 8, "rate": "hi"}]}, "e": [{"min": 0, "max": 25, "cuts": [{"v": 12, "rate": "ok"}], "zones": [{"a": 0, "b": 12, "rate": "ok", "target": true}]}, {"min": 0, "max": 200, "cuts": [{"v": 55, "rate": "hi"}, {"v": 75, "rate": "mid"}], "zones": [{"a": 0, "b": 55, "rate": "hi"}, {"a": 55, "b": 75, "rate": "mid"}]}], "f": [{"min": 0, "max": 25, "cuts": [{"v": 12, "rate": "ok"}], "zones": [{"a": 0, "b": 12, "rate": "ok", "target": true}]}, {"min": 0, "max": 250, "cuts": [{"v": 55, "rate": "hi"}, {"v": 75, "rate": "mid"}], "zones": [{"a": 0, "b": 55, "rate": "hi"}, {"a": 55, "b": 75, "rate": "mid"}]}], "g": [{"min": 0, "max": 25, "cuts": [{"v": 12, "rate": "hi"}], "zones": [{"a": 0, "b": 12, "rate": "mid"}, {"a": 12, "b": 25, "rate": "hi"}]}, {"min": 0, "max": 8, "cuts": [{"v": 2.5, "rate": "mid"}, {"v": 5, "rate": "hi"}], "zones": [{"a": 2.5, "b": 5, "rate": "mid"}, {"a": 5, "b": 8, "rate": "hi"}]}], "h": [0.5000000000000001, [46.5, "start", 113], [293.5, "end", 113]], "spec": [{"kind": "brto", "word": "Shunt occluded", "lines": ["ppg", "gv"], "target": null}, {"kind": "tips", "word": "Stent open", "lines": ["ppg", "varix"], "target": 12}]};
  assert.deepEqual(eventScale('ppg', [19.3, 11], 12), two.a);
  assert.deepEqual(eventScale('ppg', [16.9, 18]), two.b);
  assert.deepEqual(eventScale('liver', [61, 32]), two.c);
  assert.deepEqual(eventScale('gv', [6.8, 0.4]), two.d);
  assert.deepEqual(eventScales(TIPS, [19.3, 61], [11, 32]), two.e, 'the liver line is given room so the two ends stand clear');
  assert.deepEqual(eventScales(TIPS, [19.3, 61], [11, 33]), two.f);
  assert.deepEqual(eventScales(eventGraphOf({ procedure: 'brto', tiles: ['ppg', 'gv'] })!, [16.9, 6.8], [18, 0.4]), two.g);
  assert.ok(Math.abs(endMix(17, 20) - two.h[0]) < 1e-12);
  assert.deepEqual(goalSpot(40, 300, 13, 100, 180, [20, 30], [40, 50]), two.h[1]);
  assert.deepEqual(goalSpot(40, 300, 13, 100, 180, [112, 150], [40, 50]), two.h[2]);
  assert.deepEqual(eventGraphOf({ procedure: 'brto', tiles: ['gv', 'ppg'] }), two.spec[0]);
  assert.deepEqual(eventGraphOf({ procedure: 'tips', tiles: ['hvpg', 'liver'], graph: ['ppg', 'varix', 'liver'] }), two.spec[1]);
});

test('the end mix: none for 70% of the seconds, then a smooth glide, whole at the end; the sample takes the settled numbers', () => {
  assert.equal(endMix(0, 20), 0);
  assert.equal(endMix(14, 20), 0);
  assert.equal(endMix(20, 20), 1);
  assert.ok(endMix(17, 20) > 0 && endMix(17, 20) < 1);
  assert.deepEqual(evSample(TIPS, 5, { ppg: 14, liver: 50 }, { ppg: 11, liver: 32 }), [14, 50]);
  assert.deepEqual(evSample(TIPS, EVENT_S, { ppg: 14, liver: 50 }, { ppg: 11, liver: 32 }), [11, 32]);
  assert.deepEqual(evSample(TIPS, EVENT_S, { ppg: 14, liver: 50 }, null), [14, 50]);
});

test('the run keeps the points after the change and reads the value between them', () => {
  const r = new EvRun(TIPS.lines);
  r.push(1, 18, 0.6);
  assert.equal(r.n, 0, 'nothing before the change');
  r.start();
  r.push(1, 18, 60); r.push(2, 16, 55); r.push(2, 1, 1); r.push(40, 10, 30);
  assert.equal(r.n, 3, 'a time not after the last is dropped; the newest is held at the end of the clock');
  assert.equal(r.pts[3 * 2]!, EVENT_S);
  assert.equal(r.goal, EVENT_S);
  const before = [19.3, 61];
  assert.equal(valAt(r, before, 0, 0), 19.3);
  assert.equal(valAt(r, before, 0, 0.5), 19.3 + (18 - 19.3) * 0.5);
  assert.equal(valAt(r, before, 0, 1.5), 17);
  assert.equal(valAt(r, before, 0, 99), 10);
  assert.equal(valAt(null, before, 1, 5), 61);
  const k = r.kept()!, r2 = new EvRun(TIPS.lines);
  r2.restore(k);
  assert.equal(r2.n, 3);
  assert.equal(r2.on, true);
  r.reset();
  assert.equal(r.kept(), null);
  // the liver (a share) is printed in percent: the multiplier of its line is applied at the push
  const s = new EvRun(['ppg', 'asc']); s.start(); s.push(1, 10, 2000);
  assert.equal(s.pts[2], 2000 * 0.001);
});

test('the goal names itself at the first spot no line stands in', () => {
  assert.deepEqual(goalSpot(40, 300, 13, 100, 180, [20, 30], [40, 50]), [40 + 6.5, 'start', 113]);
  assert.deepEqual(goalSpot(40, 300, 13, 100, 180, [112, 150], [40, 50]), [300 - 6.5, 'end', 113]);
});

test('every look, width and head position: a sound frame, 12 px words, the heads on their values, the event drawn at 0', () => {
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [330, 'phone-landscape']] as const) {
      const c = ctxOf(look, w, d);
      for (const e of evgraphEntry.specimens) judge(e.build(c), look, { slack: 6, onCard: false });
    }
  });
  const c = ctxOf('light', 400);
  const run = new EvRun(TIPS.lines); run.start();
  for (let t = 1; t <= 20; t++) run.push(t, 19.3 - 8.3 * (1 - Math.exp(-t / 3)), 61 - 29 * (1 - Math.exp(-t / 3)));
  const before = evGraphFrame({ spec: TIPS, before: [19.3, 61], end: [11, 32] }, 0, c);
  const done = evGraphFrame({ spec: TIPS, before: [19.3, 61], end: [11, 32], run }, 20, c);
  const words = (f: typeof done) => f.shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s);
  assert.ok(words(done).includes('Stent open'));
  assert.ok(words(done).includes('Variceal <12'));
  assert.ok(words(done).includes('s'));
  assert.ok(!done.shapes.some((s) => s.k === 'text' && s.s === 's' && s.upper), 'the seconds unit is never capitals (+20 S, capture 52ef8e63)');
  assert.ok(words(before).includes('19.3 mmHg') && words(before).includes('61%'), 'before the change the heads read where the lines start');
  assert.ok(words(done).some((w) => /^11\.\d mmHg$/.test(w) || w === '11.0 mmHg'), 'the PPG head reads where it ended');
  assert.match(before.label, /^PPG and sinusoidal flow, before stent open: PPG 19\.3 mmHg, Sinusoidal flow 61%$/);
  assert.match(done.label, /^PPG and sinusoidal flow, 20 s after stent open: PPG 19\.3 mmHg to 11\.\d mmHg, Sinusoidal flow 61% to 3\d%$/);
  // before the change the line is flat at its start; after it, each point passed is on the path
  const paths = (f: typeof done) => f.shapes.filter((s): s is PathShape => s.k === 'path');
  assert.equal(paths(before)[0]!.pts.length, 4);
  assert.equal(paths(done)[0]!.pts.length, 4 + 2 * 19 + 2);
  const G = evGeo(TIPS, eventScales(TIPS, [19.3, 61], [11, 32]), 400, done.h, c.type.sm);
  assert.equal(paths(done)[0]!.pts[0], evX(G, -PRE_S));
  assert.equal(paths(done)[0]!.pts[2], evX(G, 0));
  assert.equal(paths(done)[0]!.pts.at(-2), evX(G, EVENT_S));
  // the lines never leave the plot
  for (const p of paths(done)) for (let i = 1; i < p.pts.length; i += 2) assert.ok(p.pts[i]! >= G.T - 0.5 && p.pts[i]! <= G.B + 0.5);
});

test('data: the lines start where the slide opened (or its before state) and end on its own state; a frame feeds the run until the seconds have run', async () => {
  const { evBounds, evFeeder, liveFp, feedRun } = await import('../src/ui/charts/evgraph/data.ts');
  const { csphFingerprint } = await import('../scripts/gen-engine-fixture.mjs');
  const opened = { ppg: 19.3, liver: 61 }, own = { fp: { ppg: 11, liver: 32 }, before: { fp: { ppg: 19, liver: 60 } } };
  assert.deepEqual(evBounds(TIPS, opened), { before: [19.3, 61], end: null });
  assert.deepEqual(evBounds(TIPS, opened, { fp: own.fp }), { before: [19.3, 61], end: null }, 'a state with no before: the scale holds the start alone');
  assert.deepEqual(evBounds(TIPS, opened, own), { before: [19, 60], end: [11, 32] });
  assert.equal(evBounds(TIPS, null), null);
  const run = new EvRun(TIPS.lines), feed = evFeeder(run, TIPS, own.fp);
  const fr = (t: number, ppg: number) => ({ t, metrics: null as unknown }) as never;
  assert.equal(feed.frame(fr(5, 18)), false, 'no frame counts before the change');
  assert.equal(run.n, 0);
  assert.equal(feedRun(run, TIPS, 3, { ppg: 15, liver: 50 }, own.fp), false);
  assert.equal(run.n, 0, 'not started: nothing is kept');
  run.start();
  assert.equal(feedRun(run, TIPS, 3, { ppg: 15, liver: 50 }, own.fp), false);
  assert.equal(feedRun(run, TIPS, EVENT_S, { ppg: 14, liver: 50 }, own.fp), true);
  assert.deepEqual([...run.pts.slice(3, 6)], [EVENT_S, 11, 32], 'the run ends on the settled numbers');
  // the engine's own reading carries the tiles' keys the graph's lines name
  const fp = await csphFingerprint('cirr-decomp');
  for (const k of TIPS.lines) assert.ok(Number.isFinite(fp[k] as number), `${k} is a number of the engine's reading`);
  assert.equal(typeof liveFp, 'function');
});

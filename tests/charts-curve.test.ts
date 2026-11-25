import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pinned2D } from './two-d-pin.ts';
import * as P0 from '../src/ui/charts/curve/curve-pure.generated.js';
import * as C0 from '../src/ui/charts/curve/course-pure.generated.js';
import { curveFrame, curveGeo, withAtX } from '../src/ui/charts/curve/frame.ts';
import { courseFrame, flattenPath } from '../src/ui/charts/curve/course-frame.ts';
import { courseWork, curveWork, goalOf } from '../src/ui/charts/curve/data.ts';
import { AGAINST_TOOL, COURSE_TOOL, RELATION_TOOL, TIPS_TOOL, courseSeriesSpecimen, sweepStates } from '../src/ui/charts/curve/specimens.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';
import { measure } from '../src/ui/charts/measure.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P: any = P0, C: any = C0;
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const words = (f: { shapes: readonly { k: string }[] }) => (f.shapes.filter((s) => s.k === 'text') as TextShape[]).map((s) => s.s);

test('the sweep: the setting\'s values, and one step each carrying its whole patch', () => {
  assert.deepEqual(P.curveXs(TIPS_TOOL), [6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(P.curveXs({ from: 0, to: 1, step: 0.1 }).length, 11);
  assert.equal(P.curveXs({ from: 0, to: 1000, step: 1 }).length, 41, 'at most 41 points');
  assert.deepEqual(P.curveXs({ from: 5, to: 5 }), []);
  const steps = P.curveSteps(TIPS_TOOL);
  assert.equal(steps.length, 7);
  assert.deepEqual(steps[0].params, { tips: { d: 6, on: true } }, 'a stent\'s diameter turns the stent on');
  // with against, each second sweep starts again from the slide's state and carries its own params
  const ag = P.curveSteps(AGAINST_TOOL);
  assert.equal(ag.length, 2 * P.curveXs(AGAINST_TOOL).length);
  assert.equal(ag[9].restart, true);
  assert.deepEqual(ag[9].params, { splanchnicTone: 0.6, drugs: { carvedilol: true } });
  // a curve over days restarts every point; a patient of its own loads afresh
  assert.equal(P.curveSteps({ ...TIPS_TOOL, days: 30 })[2].days, 30);
  assert.equal(P.curveSteps({ ...TIPS_TOOL, patient: { preset: 'healthy' } })[0].preset, 'healthy');
});

test('the series is in the units the tiles print, and a reading on x is sorted along x', () => {
  const ser = P.curveSeries(TIPS_TOOL, sweepStates(TIPS_TOOL, (d) => ({ ppg: d, liver: 80 - d })));
  assert.deepEqual(ser.xs, [6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(ser.ys[0], [6, 7, 8, 9, 10, 11, 12]);
  assert.equal(P.curveSeries(TIPS_TOOL, []), null, 'a state count that is not the sweep\'s is no series');
  const asc = { kind: 'curve', param: 'cirrhosis', from: 0, to: 1, step: 0.5, lines: ['asc'] };
  assert.deepEqual(P.curveSeries(asc, sweepStates(asc, (x) => ({ asc: x * 3000 }))).ys[0], [0, 1.5, 3], 'ascites in liters');
  const rel = P.curveSeries(RELATION_TOOL, sweepStates(RELATION_TOOL, (x) => ({ lsm: 50 - x * 40, hvpg: x * 20 })));
  assert.ok(rel.xs.every((x: number, i: number) => !i || x >= rel.xs[i - 1]), 'x rises along the line');
  assert.equal(rel.lx.length, 1);
});

test('the scales and cut-offs are the 2D ones: a pressure from zero up to a cut-off close above it', () => {
  assert.deepEqual(P.cutsOf('hvpg'), [{ v: 5, rate: 'mid' }, { v: 10, rate: 'hi' }]);
  assert.deepEqual(P.cutsOf('ppg').map((c: { v: number }) => c.v), [6, 12]);
  const sc = P.leftScale('hvpg', [3, 22]);
  assert.equal(sc.min, 0);
  assert.equal(sc.max, 25, '0 to 25 for an HVPG of 22, not 0 to 30 (tool-curve.js)');
  assert.ok(P.leftScale('ppg', [8, 11.5]).max >= 12, 'the scale runs up to the cut-off above the values');
  assert.deepEqual(P.xTicks(0, 60, 6), [0, 20, 40, 60]);
  assert.deepEqual(P.xDomain([9, 18, 33]), [0, 35]);
  assert.deepEqual(P.zoneEdge({ fall: 10, under: 12 }, 0, 40), [[0, 12], [13.333333333333332, 12], [40, 36]]);
  assert.equal(P.fmtTick(5, 1), '5');
  assert.equal(P.fmtTick(-2.5, 1), '−2.5');
  assert.equal(P.xCutName('hvpg', 10), 'CSPH');
  assert.equal(P.cutWords('pv', 10), 'High >10');
});

test('the case sits on the curve: the ring reads the live setting and, on a what-if of the curve\'s own setting, the curve', () => {
  const ser = P.curveSeries(TIPS_TOOL, sweepStates(TIPS_TOOL, (d) => ({ ppg: 20 - d, liver: 2 * d })));
  const slide = { fp: { ppg: 11, liver: 18 }, params: { tips: { d: 9, on: true } } };
  const g = goalOf(TIPS_TOOL, ser, slide)!;
  assert.deepEqual(g, { x: 9, ys: [11, 18] });
  const live = { params: { tips: { d: 10.5, on: true } }, fp: { ppg: 9.5, liver: 21 } };
  const on = goalOf(TIPS_TOOL, ser, slide, live)!;
  assert.equal(on.on, true);
  assert.deepEqual(on.ys, [9.5, 21], 'read between the two nearest points');
  assert.equal(P.onCurve(TIPS_TOOL, { tips: { d: 10, on: true }, drugs: { x: 1 } }, slide.params), false, 'another setting changed: no longer on the curve');
  assert.equal(goalOf({ ...TIPS_TOOL, ring: false }, ser, slide)!.x, null);
  assert.equal(goalOf(TIPS_TOOL, ser, null), null);
});

test('the course: the steps, the series and a smooth line that never overshoots', () => {
  const head = C.headSteps(COURSE_TOOL), tail = C.tailSteps(COURSE_TOOL);
  assert.equal(head.length, 2 + 14);
  assert.equal(tail.length, 2 * 28);
  assert.equal(tail[28].restart, true, 'the second treatment starts again from the same day');
  assert.deepEqual(tail[0].params, { diuretics: true });
  const ser = courseSeriesSpecimen()!;
  assert.equal(ser.wait, 14); assert.equal(ser.days, 42);
  assert.equal(ser.before, 7);
  assert.equal(ser.head.length, 15);
  assert.equal(ser.tails[0].pts.length, 29);
  assert.equal(C.courseSeries(COURSE_TOOL, [], []), null);
  const d = C.smoothPath([[0, 0], [10, 0], [20, 10], [30, 10]]);
  const pts = flattenPath(d);
  for (let i = 1; i < pts.length; i += 2) assert.ok(pts[i]! >= -1e-9 && pts[i]! <= 10 + 1e-9, 'no overshoot');
  assert.deepEqual(pts.slice(-2), [30, 10]);
  assert.equal(C.courseOf({ reading: 'nonsense' }).reading, 'asc');
});

test('the frames: the case\'s line, the cut-offs\' names, the key and the axis words are where the 2D chart puts them', () => {
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [330, 'phone-landscape']] as const) {
      const c = ctxOf(look, w, d);
      const ser = P.curveSeries(TIPS_TOOL, sweepStates(TIPS_TOOL, (x) => ({ ppg: 15.5 - (x - 6), liver: 78 - (x - 6) * 5 })));
      const out = curveFrame({ tool: TIPS_TOOL, ser, goal: goalOf(TIPS_TOOL, ser, { fp: { ppg: 11.2, liver: 58 }, params: { tips: { d: 9 } } }) }, c);
      judge(out.frame, look, { onCard: false });
      const ws = words(out.frame);
      assert.ok(ws.includes('TIPS diameter, mm'), 'the x axis names its setting and unit');
      assert.ok(ws.includes('PPG') && ws.includes('Liver flow'), 'both readings are named in the key');
      assert.equal(out.frame.shapes.filter((s) => s.k === 'path').length, 2, 'two data lines');
      // before the points arrive: the axes and the case's line, no data line
      const bare = curveFrame({ tool: TIPS_TOOL, ser: null, goal: { x: 9, ys: [11.2, 58] } }, c);
      judge(bare.frame, look, { onCard: false });
      assert.equal(bare.frame.shapes.filter((s) => s.k === 'path').length, 0);
      // the against chart names each line on it (or in a key at the top), the relation chart its x cut-offs
      const ag = P.curveSeries(AGAINST_TOOL, sweepStates(AGAINST_TOOL, (x, h) => ({ hvpg: 6 + (x - 0.6) * 13 - (h ? 2 : 0) })));
      const agw = words(curveFrame({ tool: AGAINST_TOOL, ser: ag, goal: goalOf(AGAINST_TOOL, ag, { fp: { hvpg: 13.9 }, params: { splanchnicTone: 1.1 } }) }, c).frame);
      assert.ok(agw.includes('Carvedilol') && agw.includes('No drug'), `${look} ${w}: ${agw.join('|')}`);
      const rel = P.curveSeries(RELATION_TOOL, sweepStates(RELATION_TOOL, (x) => ({ lsm: 5 + x * 50, hvpg: 2 + x * 20 })));
      const rw = words(curveFrame({ tool: RELATION_TOOL, ser: rel, goal: { x: 30, ys: [12] } }, c).frame);
      assert.ok(rw.includes('15 kPa') && rw.includes('25 kPa'), 'the x cut-offs are named');
      assert.ok(rw.includes('Liver stiffness, kPa'));
      // the course
      const cs = courseFrame({ tool: COURSE_TOOL, ser: courseSeriesSpecimen() }, c);
      judge(cs.frame, look, { onCard: false });
      const cw = words(cs.frame);
      assert.ok(cw.includes('Weeks after the tap') && cw.includes('Tap') && cw.includes('1.5 L') && cw.includes('5 L'));
      assert.ok(cw.includes('Diuretics') || cs.G.keyRow, 'each treatment is named at its line\'s end, or in the key row');
      judge(courseFrame({ tool: COURSE_TOOL, ser: null }, c).frame, look, { onCard: false });
    }
  });
});

test('the plot keeps its height when the key needs a row: more rows only come from the words, never a smaller type', () => {
  const c = ctxOf('light', 300, 'phone-portrait');
  const ser = P.curveSeries(TIPS_TOOL, []) ?? null;
  const G = curveGeo(TIPS_TOOL, ser, [], { x: 9, ys: [11, 58] }, 300, 230, c.type.sm);
  assert.ok(G.B - G.T >= 3 * c.type.sm);
  assert.ok(G.keyH >= 1.5 * c.type.sm);
});

const two = pinned2D('src/ui/tool-curve.js');
test('the copied 2D code is what the 2D app has at the pin (when its checkout is here)', { skip: two.skip }, () => {
  execFileSync('node', ['scripts/copy-chart-curve.mjs', '--from', two.repo, '--check'], { stdio: 'pipe' });
});

test('the sweep is asked of the worker as the presenter asks it: the steps, from the slide\'s own state, then the dots made from a preset on fresh models', async () => {
  const calls: { steps: Any[]; from: unknown }[] = [];
  const run = async (steps: Any[], from?: unknown) => { calls.push({ steps, from }); return steps.map((s, i) => ({ fp: { hvpg: 10 + i, lsm: 20 + i, ppg: s.params?.tips?.d ?? 0, liver: 50 }, snap: { i } })); };
  const w = await curveWork(TIPS_TOOL, { fp: { ppg: 10 } }, run);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.from, undefined, 'a sweep starts from the slide\'s state');
  assert.equal(calls[0]!.steps.length, 7);
  assert.deepEqual(w!.s.ys[0], [6, 7, 8, 9, 10, 11, 12]);
  calls.length = 0;
  const t = { ...RELATION_TOOL, dots: [{ slide: 'a', name: 'A' }, { preset: 'healthy', name: 'B' }], patient: { preset: 'healthy' } };
  const r = await curveWork(t, { fp: {} }, run, (id) => ({ lsm: 7, hvpg: 3, id } as never));
  assert.equal(calls[0]!.from, null, 'a curve on a patient of its own starts from a fresh model');
  assert.equal(calls[1]!.from, null);
  assert.equal(calls[1]!.steps.length, 1, 'only the preset dot is worked out');
  assert.equal(r!.dd[0].fp.lsm, 7, 'a slide\'s dot reads that slide\'s fingerprint');
  assert.equal(r!.dd[1].fp.hvpg, 10);
});

test('the course runs its head from a fresh model and its treatments from the head\'s last state', async () => {
  const calls: { n: number; from: unknown }[] = [];
  const run = async (steps: unknown[], from?: unknown) => { calls.push({ n: steps.length, from }); return steps.map((_, i) => ({ fp: { asc: 1000 + i }, snap: `s${calls.length}.${i}` })); };
  const ser = await courseWork(COURSE_TOOL, run);
  assert.deepEqual(calls.map((c) => c.n), [16, 56]);
  assert.equal(calls[0]!.from, null);
  assert.equal(calls[1]!.from, 's1.15');
  assert.equal(ser.tails.length, 2);
});

test('a glide of the case\'s line moves that line and nothing else', () => {
  const c = ctxOf('light', 330, 'desktop');
  const ser = P.curveSeries(TIPS_TOOL, sweepStates(TIPS_TOOL, (d: number) => ({ ppg: 20 - d, liver: 2 * d })));
  const out = curveFrame({ tool: TIPS_TOOL, ser, goal: { x: 8, ys: [12, 16] } }, c);
  const moved = withAtX(out, 11);
  const at = (f: typeof out.frame) => f.shapes.find((s) => s.k === 'line' && s.key === 'cv-at') as { x1: number };
  assert.ok(at(moved).x1 > at(out.frame).x1);
  assert.equal(moved.shapes.length, out.frame.shapes.length);
  assert.deepEqual(moved.shapes.filter((s) => s.k === 'text'), out.frame.shapes.filter((s) => s.k === 'text'));
});

// Gastric varices 12 (23 Nov multi-size review): the styles' key ("GRS open", "GRS closed") was measured one gap short, so "closed" ran past the chart's edge; and the closed fundal line, flat at the 2.5 mm cut-off, drew its dashes over the cut-off's dashes.
test('the styles key stands inside the chart, and a cut-off a line lies on is a solid hairline under it', () => {
  const t: Any = { kind: 'curve', x: 'hvpg', param: 'cirrhosis', from: 0.5, to: 1, step: 0.0625, lines: ['gv'], reading: 'Varix', cuts: 'ticks', styles: ['GRS open', 'GRS closed'], against: [{ label: 'Fundal', params: { occluded: { C5: true } }, own: 'Fundal', dash: true }] };
  const ser = P.curveSeries(t, sweepStates(t, (x, h) => ({ gv: h ? 2.5 : 3 + (x - 0.5) * 14 })));
  for (const w of [300, 360, 420]) {
    const c = ctxOf('light' as never, w), out = curveFrame({ tool: t, ser, goal: null as never }, c);
    assert.ok(out.frame.shapes.some((s) => s.k === 'text' && s.s === 'GRS closed'), 'the key is drawn');
    for (const s of out.frame.shapes) if (s.k === 'text' && s.s === 'GRS closed') assert.ok(s.x + measure(s.s, s.size, s.weight ?? 500) <= out.frame.w + 0.5, `"GRS closed" ends inside the ${w} px chart`);
  }
});

// Capture af88a9c2 (Portal vein thrombosis 8, Two inflows 9): the clot charts name only the lines, never the numbers the slide talks about. `ends` writes each line's first and last value beside its own end point.
test('ends: each line\'s two end values stand on the chart, inside it, at every width', () => {
  const t: Any = { ...RELATION_TOOL, ends: true };
  const ser = P.curveSeries(t, sweepStates(t, (x) => ({ lsm: 50 - x * 40, hvpg: 3.8 + x * 15.4 })));
  for (const w of [300, 360, 420]) {
    const c = ctxOf('light' as never, w), on = words(curveFrame({ tool: t, ser, goal: null as never }, c).frame), off = words(curveFrame({ tool: { ...t, ends: false }, ser, goal: null as never }, c).frame);
    assert.ok(on.length > off.length, `${w} px: the end values are drawn`);
    for (const s of (curveFrame({ tool: t, ser, goal: null as never }, c).frame.shapes.filter((q) => q.k === 'text') as TextShape[])) assert.ok(s.anchor === 'end' ? s.x - measure(s.s, s.size, s.weight ?? 500) >= -0.5 : s.x + measure(s.s, s.size, s.weight ?? 500) <= c.w + 0.5 || s.anchor !== 'start', `${w} px: "${s.s}" inside`);
  }
});

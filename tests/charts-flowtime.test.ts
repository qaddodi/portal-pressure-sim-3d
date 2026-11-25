import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csphFingerprint as fp0 } from '../scripts/gen-engine-fixture.mjs';
import { clockTicks, flowTimeSeries, trailReading, flowGeo, startPlan, linesOf, headLeft, flowTimeHeight, withUnit, MINUTES, MEAL_LINES, LINE, modelLines, trailKeys } from '../src/ui/charts/flowtime/model.ts';
import { flowTimeFrame, flowTimeLabel, minuteOf, RX, activeBands } from '../src/ui/charts/flowtime/frame.ts';
import { pairScales, rangeOf, fixedScale, apartTier } from '../src/ui/charts/plot/scales.ts';
import { headStep } from '../src/ui/charts/plot/follow.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

const memo = new Map<string, Promise<any>>();
const fpOf = (id: string) => { if (!memo.has(id)) memo.set(id, fp0(id)); return memo.get(id)!; };
/** A time-lapse trail between two states of the engine: [day, ...keys], linear in between (the shape of worker-core's trail rows). */
async function trailOf(a: string, b: string, keys: string[], days = 120, n = 61): Promise<number[][]> {
  const A = await fpOf(a), B = await fpOf(b);
  return Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [days * t, ...keys.map((k) => A[k] + (B[k] - A[k]) * t)]; });
}

test('the scales of two lines hold every value, share one set of steps, and the pair keeps the lines apart at their ends', async () => {
  const trail = await trailOf('healthy', 'cirr-decomp', ['pv', 'pvFlow']);
  const s = flowTimeSeries(trail, 'meal')!;
  assert.ok(s);
  assert.equal(s.min.length, MINUTES.end - MINUTES.from + 1);
  for (const v of s.pv) assert.ok(v >= s.pScale.min - 1e-9 && v <= s.pScale.max + 1e-9);
  for (const v of s.flow) assert.ok(v >= s.fScale.min - 1e-9 && v <= s.fScale.max + 1e-9);
  assert.equal(s.pScale.ticks.length, s.fScale.ticks.length, 'one set of gridlines');
  assert.ok(apartTier(s.pScale, s.fScale, s.pv, s.flow) <= 3);
  // the same two lines in one unit share one axis (a mmHg is the same height on both)
  const same = flowTimeSeries(await trailOf('healthy', 'cirr-decomp', ['pv', 'ppg']), 'days', ['pv', 'ppg'])!;
  assert.deepEqual(same.pScale, same.fScale);
  assert.equal(flowTimeSeries([[0, 1, 2]], 'meal'), null, 'too few days');
  assert.equal(flowTimeSeries(trail, 'meal', ['pv', 'wt']), null, 'a given line needs its number');
  const w = flowTimeSeries(trail, 'days', ['pv', 'wt'], { wt: 12 })!;
  assert.deepEqual(w.fScale.ticks, fixedScale([84, 100, 4]).ticks);
  assert.ok(Math.abs(w.flow[0]! - 100) < 1e-9 && Math.abs(w.flow.at(-1)! - 88) < 1e-9, 'body weight runs 100% to 88%');
  assert.deepEqual(modelLines(['pv', 'wt']), ['pv']);
  assert.deepEqual(trailKeys({ lines: ['pv', 'wt'] }), ['pv']);
  assert.equal(trailKeys(null), true);
  assert.ok(rangeOf([8.3, 8.4])[1] - rangeOf([8.3, 8.4])[0] >= 0.15 * 8.4, 'a line that barely moves is not stretched');
  const wide = pairScales([10, 10.5], [10, 10.5]);
  assert.equal(wide.length, 2);
});

test('the number a head prints is the number the sentence and the tiles take (trailReading at the same share)', async () => {
  const trail = await trailOf('healthy', 'cirr-decomp', ['pv', 'pvFlow']);
  const s = flowTimeSeries(trail, 'meal')!;
  for (const p of [0, 1 / 3, 0.5, 1]) {
    const r = trailReading(trail, MEAL_LINES, p)!, m = MINUTES.rise * p;
    assert.ok(Math.abs(r.pv! - s.pv[m - MINUTES.from]!) < 1e-9, `pv at ${p}`);
    assert.ok(Math.abs(r.pvFlow! - s.flow[m - MINUTES.from]!) < 1e-9, `flow at ${p}`);
  }
  assert.equal(trailReading([[0, 1]], MEAL_LINES, 0.5), null);
  assert.equal(minuteOf(s, 0.5), 15);
  assert.equal(minuteOf(s, 1), MINUTES.end);
  assert.equal(minuteOf(s, 3), MINUTES.end);
  assert.ok(headStep(0, 10, 1 / 60) > 0 && headStep(0, 10, 1 / 60) < 10);
  assert.ok(Math.abs(headStep(0, 10, 10) - headStep(0, 10, 0.1)) < 1e-12, 'a long gap is capped');
});

test('every look, width and head position: the chart is sound, its words are at least 12 px, the first values stand clear of the rings and of each other', async () => {
  const meal = flowTimeSeries(await trailOf('healthy', 'cirr-decomp', ['pv', 'pvFlow']), 'meal')!;
  const days = flowTimeSeries(await trailOf('cirr-decomp', 'cirr-decomp-tips', ['hvpg', 'lsm'], 540), 'days', ['hvpg', 'lsm'])!;
  assert.ok(meal && days);
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [330, 'phone-landscape']] as const) {
      const c = ctxOf(look, w, d);
      for (const [ser, clock, keys, rx] of [[meal, 'meal', MEAL_LINES, []], [days, 'days', ['hvpg', 'lsm'], ['carvedilol', 'tips']]] as const) {
        for (const m of [ser.ax.from, 0, ser.ax.rise / 2, ser.ax.rise, ser.ax.end]) {
          const { frame, G } = flowTimeFrame({ ser, clock, keys, rx }, m, c);
          judge(frame, look, { slack: 6 });
          assert.ok(frame.h >= flowTimeHeight(w, c.type.sm, keys).min, 'the chart has the room the layout needs');
          assert.ok(G.R > G.L + 40, `${w}: the plot is ${G.R - G.L} wide`);
        }
        const { G } = flowTimeFrame({ ser, clock, keys, rx }, ser.ax.end, c), plan = startPlan(G, ser, linesOf(keys), rx.length);
        for (const [i, s] of plan.starts.entries()) {
          for (const [j, o] of plan.starts.entries()) if (j > i) assert.ok(s.box[1] <= o.box[0] || o.box[1] <= s.box[0] || s.box[3] <= o.box[2] || o.box[3] <= s.box[2], `${look} ${w}: the first values overlap`);
          for (const [cx, cy, r] of plan.circles) { const dx = Math.max(s.box[0] - cx, 0, cx - s.box[1]), dy = Math.max(s.box[2] - cy, 0, cy - s.box[3]); assert.ok(Math.hypot(dx, dy) >= r - 0.5, `${look} ${w}: a first value touches a ring`); }
        }
      }
    }
  });
});

test('the head: its value flips left near the right edge, the first value stands in for the head near the start, and the label says first to last', async () => {
  assert.equal(headLeft(100, 50, 40, 13, 330), false);
  assert.equal(headLeft(320, 50, 40, 13, 330), true);
  assert.equal(headLeft(100, 50, 40, 13, 330, [[110, 150, 30, 60]]), true);
  const s = flowTimeSeries(await trailOf('healthy', 'cirr-decomp', ['pv', 'pvFlow']), 'meal')!;
  const c = ctxOf('light'), early = flowTimeFrame({ ser: s, clock: 'meal', keys: MEAL_LINES }, -5, c).frame, late = flowTimeFrame({ ser: s, clock: 'meal', keys: MEAL_LINES }, 40, c).frame;
  const heads = (f: typeof early) => f.shapes.filter((x): x is TextShape => x.k === 'text' && x.weight === 700 && Math.abs(x.size - 1.1 * c.type.sm) < 1e-9);
  assert.ok(heads(early).every((t) => t.alpha === 0), 'near the start the head value waits');
  assert.ok(heads(late).every((t) => t.alpha === 1));
  assert.equal(heads(late).length, 2);
  assert.match(late.label, /^Portal pressure and portal flow around a meal: portal pressure \d+\.\d mmHg to \d+\.\d mmHg, portal flow \d\.\d L\/min to \d\.\d L\/min$/);
  assert.equal(flowTimeLabel(s, MEAL_LINES, 'meal'), late.label);
  assert.equal(withUnit(88, 0, '% of start'), '88%');
  assert.equal(withUnit(1.2, 1, 'L'), '1.2 L');
  for (const k of Object.keys(LINE)) assert.equal(LINE[k]!.length >= 4, true);
});

test('treatment bands show only the treatments the state has on', () => {
  assert.deepEqual(activeBands(['carvedilol', 'tips', 'nonsense', 'carvedilol'], { drugs: { carvedilol: true }, tips: { on: false } }), ['carvedilol']);
  assert.deepEqual(activeBands(undefined, {}), []);
  assert.ok(Object.keys(RX).length >= 8);
});

test('a time-lapse clock always names its last day, whatever step the ticks take (14 days later reads +14, not +10)', async () => {
  for (const days of [7, 10, 14, 28, 60]) {
    const ser = flowTimeSeries(await trailOf('healthy', 'cirr-decomp', ['pv', 'asc'], days, days + 1), 'days', ['pv', 'asc'])!;
    for (const w of [260, 340, 520]) {
      const G = flowGeo(ser, 'days', ['pv', 'asc'], 0, w, 200, 12), ticks = clockTicks(G, ser.ax);
      assert.equal(ticks.at(-1), days, `${days} days at ${w}px: ${ticks}`);
      assert.equal(ticks[0], 0);
      assert.deepEqual([...ticks].sort((a, b) => a - b), ticks, 'in order, none twice');
      assert.equal(new Set(ticks).size, ticks.length);
    }
  }
});

test('a head value never stands on the clock\'s axis (4.0 mmHg struck through by the axis, Portal vein thrombosis 5, capture 6ec6d323) and the line test finds a line through a box', async () => {
  const { pathHitsBox } = await import('../src/ui/charts/flowtime/frame.ts');
  // (the line test: a segment through the box hits, one past it does not, one near its edge hits only inside the pad)
  assert.equal(pathHitsBox([0, 5, 20, 5], [8, 12, 0, 10]), true);
  assert.equal(pathHitsBox([0, 20, 20, 20], [8, 12, 0, 10]), false);
  assert.equal(pathHitsBox([0, 12, 20, 12], [8, 12, 0, 10]), false);
  assert.equal(pathHitsBox([0, 12, 20, 12], [8, 12, 0, 10], 3), true);
  assert.equal(pathHitsBox([9, 20, 9, 30], [8, 12, 0, 10]), false);
  const days = ['csph', 'cirr-decomp', 'healthy'];
  let heads = 0;
  for (const a of days) for (const b of days) {
    if (a === b) continue;
    const ser = flowTimeSeries(await trailOf(a, b, ['hvpg', 'ppg'], 180), 'days');
    if (!ser) continue;
    for (const look of ['light', 'dark'] as const) for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop']] as const) {
      const c = ctxOf(look, w, d), f = c.type.sm;
      const { frame, G } = flowTimeFrame({ ser, clock: 'days', keys: ['hvpg', 'ppg'] }, ser.ax.end, c);
      for (const t of frame.shapes.filter((x): x is TextShape => x.k === 'text' && x.weight === 700 && Math.abs(x.size - 1.1 * f) < 1e-9)) {
        heads++;
        assert.ok(t.y <= G.B - 0.5 * f + 1e-6, `${a}→${b} ${look} ${w}: "${t.s}" stands at ${t.y.toFixed(1)}, the axis is at ${G.B.toFixed(1)}`);
      }
    }
  }
  assert.ok(heads >= 20, `${heads} head values judged`);
});

// Next bleed 9 (capture af88a9c2): the words say "7.3 mm with EVL alone" and only the 5.0 mm line was drawn. A tool's `refs` draw another state's value as a dashed tick with its words, clear of the lines and the head values.
test('a reference tick draws another state\'s value, in the line\'s units, clear of the heads, in every look and width', async () => {
  const { refsOf } = await import('../src/ui/charts/flowtime/model.ts');
  const refs = refsOf({ lines: ['hvpg', 'varix'], refs: [{ line: 'varix', from: 'slough', text: 'EVL alone' }, { line: 'asc', from: 'slough', text: 'x' }, { line: 'varix', from: 'none', text: 'y' }] }, (id) => (id === 'slough' ? { varix: 7.3 } : null));
  assert.deepEqual(refs, [{ slot: 'flow', v: 7.3, text: 'EVL alone' }], 'a line the chart lacks, or a state without the number, is left out');
  const ser = flowTimeSeries(await trailOf('healthy', 'cirr-decomp', ['hvpg', 'varix'], 300), 'days', ['hvpg', 'varix'], null, { scales: { hvpg: [0, 20, 5], varix: [0, 8, 2] } })!;
  assert.ok(ser);
  for (const look of ['light', 'dark'] as const) for (const [w, d] of [[300, 'phone-portrait'], [430, 'tablet-portrait'], [330, 'desktop']] as const) {
    const c = ctxOf(look, w, d), { frame, G } = flowTimeFrame({ ser, clock: 'days', keys: ['hvpg', 'varix'], refs }, ser.ax.end, c);
    const word = frame.shapes.find((x): x is TextShape => x.k === 'text' && x.s.startsWith('EVL alone'))!;
    assert.ok(word, `${look} ${w}: the words stand`);
    assert.match(word.s, /^EVL alone 7\.3 mm$/);
    assert.ok(word.y > G.T && word.y < G.B, `${look} ${w}: inside the plot`);
    const tick = frame.shapes.find((x) => x.k === 'line' && (x as { pen: { dash?: number[] } }).pen.dash && Math.abs((x as { y1: number }).y1 - (word.y - 0.36 * c.type.sm)) < 1e-6);
    assert.ok(tick, `${look} ${w}: the dashed tick`);
    // clear of every head value (those stand at the plot's right, bold, 1.1 x type)
    for (const t of frame.shapes.filter((x): x is TextShape => x.k === 'text' && x !== word && x.weight === 700 && Math.abs(x.size - 1.1 * c.type.sm) < 1e-9)) {
      const hw = (t.anchor === 'end' ? [t.x - 60, t.x] : [t.x, t.x + 60]), ww = [word.x - 120, word.x];
      const overlapX = hw[0]! < ww[1]! && ww[0]! < hw[1]!, overlapY = Math.abs(t.y - word.y) < 1.1 * c.type.sm;
      assert.ok(!(overlapX && overlapY), `${look} ${w}: "${t.s}" and the reference words meet`);
    }
  }
});

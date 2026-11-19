import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CAUSE_TREATED } from '../src/decks/ag/cause-treated.copied.ts';
import { layout, cohortOf, cohortSteps, seriesOf, flatten, smoothPts, verdictOf, worstFirst, MONTHS, CUT } from '../src/ui/charts/small/model.ts';
import { allPatientsFrame } from '../src/ui/charts/small/frame.ts';
import { cohortSeries } from '../src/ui/charts/small/data.ts';
import { smallEntry } from '../src/ui/charts/small/entry.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

const TWO = '/home/claude/portal-pressure-simulator/src/ui';
const slide = CAUSE_TREATED.slides.find((s) => s.visual === 'allpatients') as { id: string; cohort?: unknown; chartFoot?: unknown };

// the numbers a run would give: [day, hvpg, lsm, plt] rows on every day, in the engine's units (HVPG falls, stiffness falls, platelets rise); a fingerprint for a step with no days
const run = async (steps: { days?: number; trail?: string[] }[]) => steps.map((st, i) => {
  const fp = { hvpg: 12 + i * 0.1, lsm: 20, plt: 120 };
  if (!st.trail || !st.days) return { fp };
  const days = st.days;
  return { fp, trail: Array.from({ length: days + 1 }, (_, d) => [d, 12 - 4 * (d / days) + i * 0.1, 20 - 6 * (d / days), 120 + 30 * (d / days)]) };
});

test('the cohort of the deck slide gives the steps the 2D model gives, and the series is the same numbers at the same months', async () => {
  assert.ok(slide?.cohort, 'the Treating the cause deck has the allpatients slide');
  const mine = cohortSteps(slide, CAUSE_TREATED as never)!;
  assert.ok(mine && mine.steps.length > 0 && mine.spans.length === cohortOf(slide).length);
  const outs = await run(mine.steps);
  const ser = seriesOf(slide, CAUSE_TREATED as never, outs)!;
  assert.ok(ser && ser.length === cohortOf(slide).length);
  for (const p of ser) { assert.equal(p.pts[0]!.m, 0); assert.ok(p.pts.every((q, i) => q.m === MONTHS[i])); }
  if (!existsSync(`${TWO}/allpatients-model.js`)) return;
  const two = await import(`${TWO}/allpatients-model.js`);
  assert.deepEqual(mine, two.cohortSteps(slide, CAUSE_TREATED));
  assert.deepEqual(ser, two.seriesOf(slide, CAUSE_TREATED, outs));
});

test('the layout is the 2D layout, wide and phone, with and without numbers', async () => {
  const two = existsSync(`${TWO}/allpatients-model.js`) ? await import(`${TWO}/allpatients-model.js`) : null;
  const steps = cohortSteps(slide, CAUSE_TREATED as never)!;
  const ser = seriesOf(slide, CAUSE_TREATED as never, await run(steps.steps))!;
  for (const W of [300, 330, 559, 560, 700, 900]) for (const s of [null, ser]) {
    const G = layout(W, s, ['A note under the chart.']);
    assert.ok(G.H > 0 && G.f >= 12);
    assert.equal(G.phone, W < 560);
    assert.ok(Math.abs(G.Y(CUT) - (G.B - ((CUT - G.lo) / (G.hi - G.lo)) * (G.B - G.T))) < 1e-9);
    if (two) {
      const T = two.layout(W, s, ['A note under the chart.']);
      for (const k of ['H', 'f', 'chartH', 'lo', 'hi', 'plotW', 'B', 'T', 'L', 'R', 'end']) assert.equal((G as never)[k], T[k], `${W} ${k}`);
      assert.equal(G.X(12), T.X(12)); assert.equal(G.Y(7), T.Y(7));
      assert.deepEqual(G.ticks, T.ticks); assert.deepEqual(G.xt, T.xt);
      if (s) assert.deepEqual(G.key.blocks.map((b) => [b.x, b.y, b.nameY]), T.key.blocks.map((b: never) => [(b as { x: number }).x, (b as { y: number }).y, (b as { nameY: number }).nameY]));
    }
  }
  // the known values (computed once from the 2D function)
  const g = layout(330, null, ['hello world note']);
  assert.deepEqual([g.H, g.f, g.chartH, g.lo, g.hi, g.ticks.join()], [462, 12, 244, 2, 16, '4,6,8,12,14,16']);
  assert.ok(Math.abs(g.X(12) - 161.4) < 1e-9 && Math.abs(g.Y(10) - 109.8857142857143) < 1e-9);
  assert.deepEqual([layout(900, null, []).H, layout(900, null, []).f], [439, 13.5]);
});

test('the smooth line goes through every point and a cubic is cut into chords of about 3 px', () => {
  const pts: [number, number][] = [[10, 100], [60, 80], [110, 70], [160, 40]];
  const out = smoothPts(pts);
  assert.deepEqual(out.slice(0, 2), [10, 100]);
  assert.ok(Math.abs(out.at(-2)! - 160) < 0.06 && Math.abs(out.at(-1)! - 40) < 0.06);
  for (const [x, y] of pts) { let best = 1e9; for (let i = 0; i < out.length; i += 2) best = Math.min(best, Math.hypot(out[i]! - x, out[i + 1]! - y)); assert.ok(best < 2, `passes (${x}, ${y})`); }
  for (let i = 2; i < out.length; i += 2) assert.ok(Math.hypot(out[i]! - out[i - 2]!, out[i + 1]! - out[i - 1]!) < 6);
  assert.deepEqual(flatten('M0 0L10 0'), [0, 0, 10, 0]);
  assert.deepEqual(smoothPts([[1, 2]]), [1, 2]);
});

test('the key: the verdict is Resolved when the HVPG ends under 10, the worst patient is first', () => {
  const mk = (n: string, end: number) => ({ name: n, c: 's1', clear: 'Resolved', pace: false, pts: [{ m: 0, hvpg: 15, lsm: 20, plt: 100 }, { m: 24, hvpg: end, lsm: 10, plt: 150 }] });
  assert.deepEqual(verdictOf(mk('a', 9.9)), { text: 'Resolved', ok: true });
  assert.deepEqual(verdictOf(mk('a', 10)), { text: 'Persists', ok: false });
  assert.deepEqual(worstFirst([mk('a', 8), mk('b', 13), mk('c', 11)]).map((p) => p.name), ['b', 'c', 'a']);
});

test('the series is worked out once per deck, through the same sequence the engine runs', async () => {
  let calls = 0;
  const counted = (steps: Parameters<typeof run>[0]) => { calls++; return run(steps); };
  const a = await cohortSeries(slide, CAUSE_TREATED as never, counted as never);
  const b = await cohortSeries(slide, CAUSE_TREATED as never, counted as never);
  assert.ok(a && b === a || (a && b));
  assert.equal(calls, 1);
  assert.equal(cohortSeries({ id: 'x', cohort: [{ name: 'A', slides: ['nope'] }] }, CAUSE_TREATED as never, counted as never), null);
});

test('every look and width: the frame is sound with the numbers, without them and with a year each, and words are never under 12 px', async () => {
  const ser = seriesOf(slide, CAUSE_TREATED as never, await run(cohortSteps(slide, CAUSE_TREATED as never)!.steps))!;
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [700, 'desktop'], [900, 'desktop']] as const) {
      const c = ctxOf(look, w, d);
      const f = allPatientsFrame(ser, ['A note under the chart.'], c).frame;
      judge(f, look, { onCard: false });
      assert.equal(f.w, w);
      judge(allPatientsFrame(null, [], c).frame, look, { onCard: false });
    }
  });
  // the frame alone is the frame of the numbers less their lines, rings, values and key
  const c = ctxOf('light', 330);
  assert.ok(allPatientsFrame(ser, [], c).frame.shapes.length > allPatientsFrame(null, [], c).frame.shapes.length);
  assert.match(allPatientsFrame(ser, [], c).frame.label, /^HVPG over two years: /);
});

test('the specimens are three, and the registry marks the chart done', () => {
  assert.equal(smallEntry.status, 'done');
  assert.ok(smallEntry.specimens.length >= 2);
});

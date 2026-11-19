// The IR pane (Tests > IR): the 2D app's monitor, copied whole and drawn on a recording context, reads what 2D's does at each moment of the HVPG catheter's clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monitorFrame, type MonitorState } from '../src/ui/tests/ir/monitor.ts';
import { HVPG_SCRIPT, STEPS, TB, measureLabel } from '../src/ui/tests/ir/hvpg.ts';
import { T, newWave } from '../src/ui/tests/copied/hvpg-clock.copied.js';
import type { TextShape } from '../src/ui/charts/scene.ts';

const V = { fhvp: 8.2, whvp: 22.6, hvpg: 14.4 };
const words = (f: { shapes: readonly { k: string }[] }) => (f.shapes.filter((s) => s.k === 'text') as TextShape[]).map((s) => s.s);
const st = (ph: MonitorState['ph'], t: number): MonitorState => ({ ph, t, v: V, running: true, wave: newWave(), probing: false });

test('the monitor before the tip is in says so, with the 2D words', () => {
  const key = {};
  const f = monitorFrame(key, HVPG_SCRIPT, st('idle', 0), 460, 240, 'x');
  const w = words(f);
  assert.ok(w.includes('Ready'), w.join('|'));
  assert.ok(w.some((s) => /tracing starts once the tip is in the hepatic vein/i.test(s)), w.join('|'));
});

test('the free sweep reads FHVP, then the balloon and the wedge, then HVPG with its band, as the 2D monitor does', () => {
  const key = {};
  // the tape records as the clock passes: step through the run the way a frame loop would
  let f = monitorFrame(key, HVPG_SCRIPT, st('run', T.free), 460, 240, 'x');
  for (let t = T.free; t <= T.sum + 1200; t += 50) {
    f = monitorFrame(key, HVPG_SCRIPT, st('run', t), 460, 240, 'x');
    if (t === Math.floor((T.inflate - 100) / 50) * 50) assert.ok(words(f).includes('FHVP'), `free at ${t}: ${words(f).join('|')}`);
  }
  const w = words(f);
  assert.ok(w.includes('HVPG'), w.join('|'));
  assert.ok(w.includes('14.4'), `the HVPG number: ${w.join('|')}`);
  assert.ok(w.includes('8.2') && w.includes('22.6'), `both levels' tags: ${w.join('|')}`);
  assert.ok(f.shapes.some((s) => s.k === 'path'), 'the trace is a line');
  assert.ok(f.shapes.length < 1500, `the frame stays small (${f.shapes.length} shapes)`);
});

test('a thrombosed hepatic vein aborts: the probe and the abort words', () => {
  const f = monitorFrame({}, HVPG_SCRIPT, { ...st('abort', TB.abort), probing: true }, 460, 240, 'x');
  assert.ok(words(f).some((s) => /Unable to cannulate/.test(s)), words(f).join('|'));
  assert.ok(words(f).includes('Aborted'));
});

test('the steps are the 2D four; the button says what is happening', () => {
  assert.deepEqual(STEPS.map((s) => s[3]), ['Catheter', 'Free', 'Wedged', 'HVPG']);
  assert.equal(measureLabel(false, false), 'Measure HVPG');
  assert.equal(measureLabel(true, false), 'Measuring…');
  assert.equal(measureLabel(true, true), 'Withdrawing the catheter…');
  assert.equal(measureLabel(false, true), 'Measure again');
});

test('the side words: idle says the 2D line; a finished measurement prints the three readings', async () => {
  const { sideOf, IDLE_CAPTION } = await import('../src/ui/tests/ir/side.ts');
  const v = { fhvp: 4, whvp: 16, hvpg: 12 };
  const idle = sideOf({ ph: 'idle', t: 0, started: false, blocked: false, blockedNow: false, v, hasFrame: true });
  assert.equal(idle.caption, IDLE_CAPTION);
  const done = sideOf({ ph: 'result', t: T.end, started: true, blocked: false, blockedNow: false, v, hasFrame: true });
  assert.ok(done.texts.hvpg.includes('12'), done.texts.hvpg);
});

// The monitor's WHVP−FHVP callout, 2D's result bar: an arrowed bar from the FHVP line to the WHVP line, with the "HVPG x.x" pill on it, tinted by the band.
test('the trace\'s subtraction: the bar grows from the FHVP line to the WHVP line at T.result, the HVPG pill follows, tinted by the band, the two readings dropped as dots', () => {
  const play = (v: { fhvp: number; whvp: number; hvpg: number }, to: number) => {
    const key = {}; let f = monitorFrame(key, HVPG_SCRIPT, { ph: 'run', t: T.free, v, running: true, wave: newWave(), probing: false }, 460, 240, 'x');
    for (let t = T.free; t <= to; t += 50) f = monitorFrame(key, HVPG_SCRIPT, { ph: 'run', t, v, running: true, wave: newWave(), probing: false }, 460, 240, 'x');
    return f;
  };
  const bar = (f: { shapes: readonly { k: string }[] }) => f.shapes.filter((s) => s.k === 'rect' && Math.abs((s as unknown as { w: number }).w - 1.6) < 1e-6) as unknown as { x: number; y: number; h: number; fill: number[] }[];
  const before = play(V, T.result - 450);
  assert.equal(bar(before).length, 0, 'no bar before it is due');
  assert.ok(!words(before).includes('HVPG 14.4'));
  const after = play(V, T.sum + 1200), b = bar(after);
  assert.equal(b.length, 1, 'one bar');
  assert.ok(b[0].h > 20, `the bar spans the two levels (${b[0].h}px)`);
  assert.ok(words(after).includes('HVPG 14.4'), 'the pill reads the gradient');
  assert.ok(after.shapes.filter((s) => s.k === 'path').length >= 3, 'an arrowhead at each end');
  assert.ok(after.shapes.filter((s) => s.k === 'circle').length >= 2, 'a dot where each reading is taken');
  const low = play({ fhvp: 4, whvp: 8, hvpg: 4 }, T.sum + 1200), hi = bar(after)[0].fill, lo = bar(low)[0].fill;
  assert.notDeepEqual(hi, lo, 'the bar takes the band: red over 10, not the normal colour under 5');
});

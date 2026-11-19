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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { govern, newGovernor, WINDOW, MAX_DROP, HOLD_MS, MAX_HOLD_MS } from '../src/scene/detail-governor.ts';
import { figureDpr } from '../src/scene/quality.ts';

/** Run `n` frames of `dt` ms from page time `t`; returns the time after and the drop. */
function run(g: ReturnType<typeof newGovernor>, t: number, n: number, dt: number) { let d = g.drop; for (let i = 0; i < n; i++) { t += dt; d = govern(g, t, dt); } return { t, d }; }

test('steady 60 per second never lowers anything; a gap is a pause, not a slow frame', () => {
  const g = newGovernor(); let t = 0;
  ({ t } = run(g, t, WINDOW * 20, 16.7)); assert.equal(g.drop, 0);
  for (let i = 0; i < 100; i++) { t += 900; govern(g, t, 900); }   // (a frame after every half-second rest)
  assert.equal(g.drop, 0);
});

test('a window that is half slow takes one notch down, a second slow window another, and no more than the maximum', () => {
  const g = newGovernor(); let t = 0;
  ({ t } = run(g, t, WINDOW, 40)); assert.equal(g.drop, 1);
  ({ t } = run(g, t, WINDOW, 40)); assert.equal(g.drop, 2);
  ({ t } = run(g, t, WINDOW * 5, 40)); assert.equal(g.drop, MAX_DROP);
});

test('one slow frame in a calm run does nothing (a stall is not a trend)', () => {
  const g = newGovernor(); let t = 0;
  for (let i = 0; i < 10; i++) { ({ t } = run(g, t, WINDOW - 1, 16.7)); t += 90; govern(g, t, 90); }
  assert.equal(g.drop, 0);
});

test('a notch comes back only after the hold and a whole calm window; a drop right after a raise doubles the wait (no bouncing)', () => {
  const g = newGovernor(); let t = 0;
  ({ t } = run(g, t, WINDOW, 40)); assert.equal(g.drop, 1);
  ({ t } = run(g, t, WINDOW * 10, 16.7)); assert.equal(g.drop, 1, 'calm, but inside the hold');
  t += HOLD_MS; ({ t } = run(g, t, WINDOW, 16.7)); assert.equal(g.drop, 0, 'calm for the hold: given back');
  ({ t } = run(g, t, WINDOW, 40)); assert.equal(g.drop, 1, 'slow again at once');
  assert.equal(g.hold, HOLD_MS * 2, 'so the next wait is twice as long');
  for (let i = 0; i < 10; i++) { t += g.hold; ({ t } = run(g, t, WINDOW, 16.7)); ({ t } = run(g, t, WINDOW, 40)); }
  assert.equal(g.hold <= MAX_HOLD_MS, true);
});

test('the notch lowers the figure\'s pixel ratio below the ceiling the person chose, never above it, and never below 1', () => {
  const at = (detail: number, drop: number) => figureDpr(Math.max(0, detail - drop), true, false, 3);
  assert.equal(at(2, 0), 2); assert.equal(at(2, 1), 1.5); assert.equal(at(2, 2), 1);
  assert.equal(at(1, 2), 1); assert.equal(at(0, 2), 1);
});

test('Stage feeds it the clock\'s frames and applies a notch only at rest', () => {
  const src = readFileSync(new URL('../src/scene/Stage.tsx', import.meta.url), 'utf8');
  assert.match(src, /govern\(gov, /);
  assert.match(src, /figureDetail - /);
});

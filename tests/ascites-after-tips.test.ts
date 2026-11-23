// "Clear slowly after TIPS like real life" (Mohammad, 23 Nov 2026): the pressure falls at once, the ascites clears over weeks to months, so the
// timeline chart shows a curve and not a drop to nothing within a day. The lag is the engine's (hales-engine ASC_HOLD); this holds the app's pinned copy to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore (the vendored engine is plain JS)
import { Engine } from '../src/engine/hales/portal/engine.js';
// @ts-ignore
import { deepMerge } from '../src/engine/hales/portal/scenario.js';

test('after a TIPS the portal pressure falls at once and the ascites clears over weeks to months', () => {
  const e: any = new Engine(); e.loadPreset('cirr-decomp-tips');
  e.setParams(deepMerge(e.params, { tips: { on: false }, cirrhosis: 1, albumin: 2.4, diuretics: false })); e.settle();
  e.advanceDays(400, { noRupture: true, silent: true }); e.settle();
  const v0 = e.slow.ascites, ppg0 = e.P[e.ni.CONF] - e.P[e.ni.IVCS];
  assert.ok(v0 > 4000, `a tense belly to start (${Math.round(v0)} mL)`);
  e.setParams(deepMerge(e.params, { tips: { on: true, d: 8 } })); e.settle();
  assert.ok(e.P[e.ni.CONF] - e.P[e.ni.IVCS] < 0.7 * ppg0, 'the portal gradient falls at once');
  assert.equal(e.slow.ascites, v0, 'the TIPS itself moves no fluid');
  const at: Record<number, number> = {}; let t = 0;
  for (const d of [1, 7, 30, 90, 365]) { e.advanceDays(d - t, { noRupture: true, silent: true }); e.settle(); t = d; at[d] = e.slow.ascites; }
  assert.ok(at[1] > 0.9 * v0, `a day after, most is still there (${Math.round(at[1])} of ${Math.round(v0)} mL)`);
  assert.ok(at[7] > 0.7 * v0, `a week after, most is still there (${Math.round(at[7])})`);
  assert.ok(at[30] < 0.6 * v0 && at[30] > 0.15 * v0, `a month after, about half has cleared (${Math.round(at[30])})`);
  assert.ok(at[90] < 0.2 * v0, `by three months most has cleared (${Math.round(at[90])})`);
  assert.ok(at[365] < 0.02 * v0, `by a year it has gone (${Math.round(at[365])})`);
});

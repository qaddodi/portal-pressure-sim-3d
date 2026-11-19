// Compare and Why?: the table's rows and change column, the pin's state, the waterfall's rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffRows, describe, ROWS, GROUPS } from '../src/ui/compare/model.ts';
import { useCompare, type Pin } from '../src/ui/compare/store.ts';
import { waterfall, shortLabel, type Explanation } from '../src/ui/why/model.ts';

const M = (o: Record<string, number> = {}) => ({ hvpg: 11.6, pv: 17.7, ppg: 13.5, pvFlow: 1.16, liverPerfPct: 70, shuntFraction: 0.1, varix: { ratioMean: 0.5 }, ascites: { ratePerDay: 1200 }, ra: 3.7, map: 85, co: 5, ...o });

test('the Compare table has the 2D rows in four groups', () => {
  assert.equal(ROWS.length, 11);
  assert.equal(GROUPS.reduce((n, g) => n + g[1], 0), ROWS.length);
  assert.deepEqual(GROUPS.map((g) => g[0]), ['Pressure', 'Flow', 'Consequences', 'Systemic']);
});

test('the change column: same, up and down, with a true minus and the 2D marks', () => {
  const rows = diffRows(M(), M({ hvpg: 8.1, pv: 17.7, co: 5.4 }), false);
  const by = (l: string) => rows.find((r) => r.label === l)!;
  assert.deepEqual([by('HVPG').a, by('HVPG').b, by('HVPG').text, by('HVPG').tri, by('HVPG').cls], ['11.6', '8.1', '−3.5', '▼', 'd down']);
  assert.deepEqual([by('Portal pressure').text, by('Portal pressure').tri, by('Portal pressure').cls], ['—', '', 'd same']);
  assert.deepEqual([by('Cardiac output').text, by('Cardiac output').tri, by('Cardiac output').cls], ['+0.4', '▲', 'd up']);
  assert.equal(by('Varix wall stress (model)').a, '50');
  assert.equal(by('Ascites formation').a, '1,200');   // (a daily volume takes its thousands comma)
});

test('describe: the first four labels, then how many more', () => {
  assert.equal(describe([]), 'No changes from the scenario');
  assert.equal(describe(['A', 'B']), 'A · B');
  assert.equal(describe(['A', 'B', 'C', 'D', 'E', 'F']), 'A · B · C · D · +2 more');
});

test('pinning sets Now, choosing a view needs a pin, stopping clears both', () => {
  const s = useCompare.getState();
  s.setView('A'); assert.equal(useCompare.getState().view, 'B', 'no pin, no view');
  const pin = { P: [1], metrics: {}, params: {}, frame: {}, label: 'csph', when: 'Day 3', changes: [] } as unknown as Pin;
  s.pin(pin); s.setView('D');
  assert.equal(useCompare.getState().view, 'D');
  s.pin(pin); assert.equal(useCompare.getState().view, 'B', 'a new pin starts on Now');
  s.stop(); assert.equal(useCompare.getState().snap, null); assert.equal(useCompare.getState().view, 'B');
});

test('Why?: bars are scaled to the largest, tiny ones are dropped, the rest is an interaction row so the bars sum to the change', () => {
  const r: Explanation = { label: 'HVPG', sentence: 's', unit: 'mmHg', digits: 1, total: 10, contributions: [{ label: 'Cirrhosis 85%', delta: 8 }, { label: 'TIPS 8 mm', delta: -2 }, { label: 'Tiny', delta: 0.01 }] };
  const rows = waterfall(r);
  assert.deepEqual(rows.map((x) => x.short), ['Cirrhosis', 'TIPS 8 mm'.replace(/\s[\d.]+\smm$/, ''), 'Interaction and other']);
  assert.equal(rows[0]!.value, '+8.0'); assert.equal(rows[1]!.value, '−2.0'); assert.equal(rows[2]!.kind, 'other'); assert.equal(rows[2]!.value, '+4.0');
  assert.equal(rows[0]!.kind, 'up'); assert.equal(rows[1]!.kind, 'down');
  assert.equal(rows[1]!.left, `${50 - (2 / 10) * 50}%`);
  assert.equal(shortLabel('Splanchnic tone ×0.80'), 'Splanchnic tone');
});

test('Why?: no contributions, no rows and no interaction row', () => {
  assert.deepEqual(waterfall({ label: 'x', sentence: '', unit: '', digits: 1, total: 3, contributions: [] }), []);
});

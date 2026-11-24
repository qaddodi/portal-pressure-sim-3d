// The case pill agrees with the case shown: a disease put on a preset renames it Custom; a treatment, a meal or a knob never does (Mohammad's capture, 24 Nov: "Healthy" on Day 180
// with the three hepatic veins blocked). Every preset must still carry its own name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, defaultParams, deepMerge } from '../src/engine/hales/portal/scenario.js';
import { isCustomCase, isDiseaseKey } from '../src/ui/action/case-name.ts';
import { activeInterventions } from '../src/ui/action/changes.ts';

const base = (id: string) => (PRESETS as { id: string; apply(p: unknown): unknown }[]).find((x) => x.id === id)!.apply(defaultParams());

test('every preset, as loaded, keeps its own name', () => {
  for (const p of PRESETS as { id: string }[]) assert.equal(isCustomCase(p.id, base(p.id)), false, p.id);
});
test('hepatic vein thrombus on Healthy is a different case', () => {
  const p = deepMerge(base('healthy'), { thrombus: { RHV_IVC: 1, MHV_IVC: 1, LHV_IVC: 1 } });
  assert.equal(isCustomCase('healthy', p), true);
});
test('cirrhosis, fibrosis and a stenosis on Healthy are different cases; a changed strength of the preset\'s own disease too', () => {
  assert.equal(isCustomCase('healthy', deepMerge(base('healthy'), { cirrhosis: 0.5 })), true);
  assert.equal(isCustomCase('healthy', deepMerge(base('healthy'), { fibrosis: { R: { sin: 3 }, L: { sin: 3 } } })), true);
  assert.equal(isCustomCase('pvt-acute', deepMerge(base('pvt-acute'), { thrombus: { PV_TRUNK: 0.5 } })), true);
});
test('treatments, a meal and a drug never rename the case', () => {
  const p = deepMerge(base('healthy'), { tips: { on: true, d: 8 }, meal: 1, drugs: { propranolol: true }, anticoag: true, diuretics: true });
  assert.equal(isCustomCase('healthy', p), false);
  const q = deepMerge(base('budd-chiari'), { tips: { on: true, d: 8 } });
  assert.equal(isCustomCase('budd-chiari', q), false);
});
test('a history or an unknown id keeps its own name', () => {
  assert.equal(isCustomCase('some-history', deepMerge(base('healthy'), { cirrhosis: 1 })), false);
  assert.equal(isCustomCase(null, base('healthy')), false);
});
test('every active change is either a disease or not, by a known rule (no key falls out of the list unseen)', () => {
  const p = deepMerge(base('healthy'), { cirrhosis: 0.5, thrombus: { PV_TRUNK: 1 }, stenosis: { PV_TRUNK: 0.4 }, tips: { on: true, d: 8 } });
  const d = activeInterventions(p).filter((c) => isDiseaseKey(c.key)).map((c) => c.key);
  assert.deepEqual(d.sort(), ['cirrhosis', 'sten:PV_TRUNK', 'thr:PV_TRUNK']);
});

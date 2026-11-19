// The Changes list and the "n running" count are the 2D app's, word for word: tests/fixtures/changes-2d.json is what 2D's inspector.js and chart.js answered
// (scripts/gen-treat.mjs) for every preset and for an edit of each branch; the 3D port must say the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS, defaultParams, deepMerge } from '../src/engine/hales/portal/scenario.js';
import { activeInterventions, treatCount, factTarget } from '../src/ui/action/changes.ts';

interface Case { name: string; preset: string; edit: Record<string, unknown> | null; changes: { key: string; label: string }[]; count: number }
const fx = JSON.parse(readFileSync('tests/fixtures/changes-2d.json', 'utf8')) as { cases: Case[] };
const paramsOf = (c: Case) => { const base = (PRESETS as { id: string; apply(p: unknown): unknown }[]).find((x) => x.id === c.preset)!.apply(defaultParams()); return c.edit ? deepMerge(base, c.edit) : base; };

test('the Changes list reads the same as the 2D app for every preset and every branch', () => {
  assert.ok(fx.cases.length >= 40);
  for (const c of fx.cases) {
    const got = activeInterventions(paramsOf(c)).map((a) => ({ key: a.key, label: a.label }));
    assert.deepEqual(got, c.changes, c.name);
  }
});

test('the count of treatments running is the 2D app\'s', () => {
  for (const c of fx.cases) assert.equal(treatCount(paramsOf(c)), c.count, c.name);
});

test('every change takes itself back: removing it leaves it out of the list', () => {
  for (const c of fx.cases) {
    const p = structuredClone(paramsOf(c));
    for (const a of activeInterventions(p)) {
      const q = structuredClone(p); a.remove(q);
      assert.ok(!activeInterventions(q).some((x) => x.key === a.key && x.label === a.label), `${c.name}: ${a.label} did not go`);
    }
  }
});

test('a patient fact opens the vessel or organ where it is set (fact-target.js)', () => {
  assert.deepEqual(factTarget('cirrhosis'), { type: 'organ', id: 'liver' });
  assert.deepEqual(factTarget('tips'), { type: 'edge', id: 'TIPS' });
  assert.deepEqual(factTarget('thr:PV_TRUNK'), { type: 'edge', id: 'PV_TRUNK' });
  assert.deepEqual(factTarget('fib:pre'), { type: 'organ', id: 'liver' });
  assert.equal(factTarget('drug:propranolol'), null);
  assert.equal(factTarget('diuretics'), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARTS, chartScore } from '../src/ui/charts/registry.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

test('every chart kind is listed once, a done one has a specimen, and every specimen is sound in every look at phone and Mac widths', () => {
  const kinds = CHARTS.map((c) => c.kind);
  assert.equal(new Set(kinds).size, kinds.length);
  for (const c of CHARTS) {
    if (c.status === 'done') assert.ok(c.specimens.length > 0, `${c.kind} is done but has no specimen`);
    for (const s of c.specimens) eachLook((look) => {
      for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [330, 'phone-landscape'], [430, 'tablet-portrait']] as const) judge(s.build(ctxOf(look, w, d)), look, { onCard: false });
    });
  }
});

test('inventory score: charts done of charts in the 2D app', () => {
  const s = chartScore();
  console.log(`# charts inventory: ${s.done} of ${s.of}`);
  assert.ok(s.done >= 1 && s.done <= s.of);
});

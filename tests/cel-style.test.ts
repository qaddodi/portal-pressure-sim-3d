import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CEL } from '../src/scene/vessels/cel-ink.ts';
import { CEL_BANDS, CEL_STYLE, celBand } from '../src/scene/cel-style.ts';

test('the figure has one cel style: three tones, and the vessels\' numbers are 2D\'s own', () => {
  assert.equal(CEL_BANDS, 3);
  assert.deepEqual({ ...CEL }, { DIR: CEL_STYLE.DIR, SHADE_AT: -0.16, LIT_AT: 0.24, SHADE: 0.17, LIT: 0.15, LINE_MIN: 1.5, LINE_MAX: 3.0, LINE_R: 0.14 });
});

test('celBand: three bands with a hard edge', () => {
  assert.equal(celBand(-0.5), 0); assert.equal(celBand(0), 1); assert.equal(celBand(0.5), 2);
  assert.deepEqual([-1, -0.17, -0.15, 0.23, 0.25, 1].map((s) => celBand(s)), [0, 0, 1, 1, 2, 2]);
  const seen = new Set(Array.from({ length: 201 }, (_, i) => celBand(-1 + i / 100)));
  assert.equal(seen.size, 3, 'exactly three tones over the whole range');
});

test('no second copy of the vessels\' band thresholds outside cel-style.ts', () => {
  for (const f of ['src/scene/vessels/cel-ink.ts']) {
    const t = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/SHADE_AT:\s*-0\.16|LIT_AT:\s*0\.24/.test(t), `${f} reads CEL_STYLE, it does not carry its own thresholds`);
  }
});

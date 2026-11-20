import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CEL } from '../src/scene/vessels/cel-ink.ts';
import { CEL_BANDS, CEL_STYLE, celBand } from '../src/scene/cel-style.ts';

test('the figure has one cel style: three tones, and the vessels\' numbers are 2D\'s own', () => {
  assert.equal(CEL_BANDS, 3);
  const S = CEL_STYLE;   // (the true-toon numbers of 20 Nov: stronger than 2D's -0.16 / 0.24 / 0.17 / 0.15 / 1.5 px, one place to change back)
  assert.deepEqual({ ...CEL }, { DIR: S.DIR, SHADE_AT: S.SHADE_AT, LIT_AT: S.LIT_AT, SHADE: S.SHADE, LIT: S.LIT, LINE_MIN: S.LINE_MIN, LINE_MAX: S.LINE_MAX, LINE_R: S.LINE_R });
  assert.ok(S.SHADE >= 0.17 && S.LIT >= 0.15 && S.LINE_MIN >= 1.5 && S.LIT_AT > S.SHADE_AT, 'never softer than 2D');
});

test('celBand: three bands with a hard edge', () => {
  assert.equal(celBand(-0.5), 0); assert.equal(celBand(0), 1); assert.equal(celBand(0.5), 2);
  const { SHADE_AT: a, LIT_AT: b } = CEL_STYLE;
  assert.deepEqual([-1, a - 0.01, a + 0.01, b - 0.01, b + 0.01, 1].map((s) => celBand(s)), [0, 0, 1, 1, 2, 2]);
  const seen = new Set(Array.from({ length: 201 }, (_, i) => celBand(-1 + i / 100)));
  assert.equal(seen.size, 3, 'exactly three tones over the whole range');
});

test('no second copy of the vessels\' band thresholds outside cel-style.ts', () => {
  for (const f of ['src/scene/vessels/cel-ink.ts']) {
    const t = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/SHADE_AT:\s*-0\.16|LIT_AT:\s*0\.24/.test(t), `${f} reads CEL_STYLE, it does not carry its own thresholds`);
  }
});

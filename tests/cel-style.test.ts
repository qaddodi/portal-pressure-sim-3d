import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CEL } from '../src/scene/vessels/cel-ink.ts';
import { CEL_BANDS, CEL_STYLE, celBand } from '../src/scene/cel-style.ts';

test('the figure has one cel style: three tones, and the vessels read every number from it', () => {
  assert.equal(CEL_BANDS, 3);
  const { DIR, SHADE_AT, LIT_AT, SHADE, LIT, LINE_MIN, LINE_MAX, LINE_R } = CEL_STYLE;
  assert.deepEqual({ ...CEL }, { DIR, SHADE_AT, LIT_AT, SHADE, LIT, LINE_MIN, LINE_MAX, LINE_R });
  // the relationships a toon look needs, whatever the numbers: the tones are told apart, the shade side is wide, the line is bold and its floor is under its cap, a band edge is under a pixel
  assert.ok(SHADE_AT < 0 && LIT_AT > SHADE_AT && LIT_AT < 1, 'three bands in order inside -1..1');
  assert.ok(SHADE >= 0.3 && LIT >= 0.2, 'tones clearly different, not soft shading');
  assert.ok(LINE_MIN >= 2 && LINE_MIN < LINE_MAX && CEL_STYLE.INK_ALPHA_MIN >= 0.85 && CEL_STYLE.EDGE_PX <= 1);
  assert.equal(CEL_STYLE.VESSEL_BANDS, 2, 'a vessel is two flat tones (lit and shade), not glassy');
  assert.ok(CEL_STYLE.VESSEL_STEP_AT > SHADE_AT && CEL_STYLE.VESSEL_STEP_AT < LIT_AT);
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
    assert.ok(!/SHADE_AT:\s*-?\d|LIT_AT:\s*\d/.test(t), `${f} reads CEL_STYLE, it does not carry its own thresholds`);
  }
});

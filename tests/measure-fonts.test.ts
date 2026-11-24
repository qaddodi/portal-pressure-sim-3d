import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeMeasure } from '../src/scene/labels/measure.ts';

// Next bleed 9, capture 2c00c0ce: "+8.3 mmHg" ran off the screen's edge. A width taken before a font finished loading was kept by text for good; it is dropped when a font loads now.
test('a width measured before a font arrives is measured again after reset', () => {
  let px = 5;
  const ctx = { font: '', measureText: (t: string) => ({ width: t.length * px }) };
  const m = makeMeasure(ctx);
  assert.equal(m('+8.3', 10, 650), 20);
  px = 6;
  assert.equal(m('+8.3', 10, 650), 20, 'cached');
  m.reset();
  assert.equal(m('+8.3', 10, 650), 24, 'measured again with the font now loaded');
});

test('the label layer resets the measure whenever a font loads', () => {
  const src = readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8');
  assert.match(src, /const refonts = \(\) => \{ measure\.reset\(\); ctl\.invalidateForms\(\);/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toolType, chartType } from '../src/ui/charts/type.ts';
import { stiffLayout, stiffWords } from '../src/ui/charts/stiff/model.ts';
import { measure } from '../src/ui/charts/measure.ts';

// 2D draws a chart in the Tests card at card-scale.js 'wide' / 'data': --pz-sm = max(12, 0.74 x clamp(1.733 vh/100, 12, 21)), never the stacked layout's. 20 Nov play-test: 3D gave an iPhone's Fibro strip
// chartType's 13.8 px, so "Platelets ..." and the verdict wrapped to two rows (164 px tall against 2D's 126) and the Half sheet cut the Rule of 5 note.
test('a chart in the Tests card is 12 px on a phone and on a Mac up to about 940 px tall, then grows as 2D\'s card scale does', () => {
  assert.equal(toolType(390, 844).sm, 12);
  assert.equal(toolType(844, 390).sm, 12);
  assert.equal(toolType(1280, 800).sm, 12);
  assert.equal(toolType(1024, 768).sm, 12);
  assert.ok(toolType(1728, 1117).sm > 12, 'a tall Mac grows');
  assert.ok(toolType(390, 844).sm < chartType('phone-portrait').sm, 'the phone no longer reads at the stacked size');
});

test('the Fibro strip at 12 px puts the platelets and the verdict on one row on a phone, as 2D does', () => {
  const W = 346;
  const at = (f: number) => stiffLayout(W, f, measure, { lsm: 5, plt: 250, note: true });
  const rows = (f: number) => new Set(at(f).texts.filter((t) => /Platelets|CSPH ruled/.test(t.t)).map((t) => Math.round(t.y))).size;
  assert.equal(rows(12), 1, 'one row at 2D\'s size');
  assert.ok(at(12).H < at(13.8).H, 'and shorter');
  assert.ok(stiffWords(5, 250, 'liver', null).includes('Platelets'));
});

test('Chart takes the tool-card size for a chart inside .t-card, and keeps a deck panel\'s own', () => {
  const src = readFileSync(new URL('../src/ui/charts/Chart.tsx', import.meta.url), 'utf8');
  assert.match(src, /setTool\(!!el\.closest\('\.t-card'\)\)/);
  assert.match(src, /tool && !env\?\.device \? toolType\(vp\.w, vp\.h\)/);
  assert.match(src, /panel && !env\?\.device \? panelType/);
});

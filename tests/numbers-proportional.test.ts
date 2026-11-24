import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 24 Nov 2026 (captures a47f69ea, cfd1b272): a tabular "1" is a cell wider than its ink ("1 00", "Below 1 2", "21 .2"). The lifted sheet's universal rule was tabular, so every new reading class had to be fixed alone.
const sheet = readFileSync('src/ui/css3d-over-2d.css', 'utf8');

test('the universal rule is proportional, and tabular is an explicit short list after it', () => {
  const star = sheet.match(/^\*, \*::before, \*::after \{ font-variant-numeric: ([^;]*?) !important;/m);
  assert.ok(star, 'universal digit rule present');
  assert.match(star![1]!, /proportional-nums/);
  assert.doesNotMatch(star![1]!, /tabular/);
  const list = sheet.match(/:where\(([^]*?)\),\n:where\(\1\) \* \{ font-variant-numeric: lining-nums tabular-nums !important; \}/);
  assert.ok(list, 'the tabular list follows the universal rule');
  assert.ok(sheet.indexOf(list![0]) > sheet.indexOf(star![0]), 'the list comes after the universal rule (equal weight, later wins)');
  for (const reading of ['.pzt-v', '.pzt-r', '.cl', '.cl-n', '.lb-val', '.cath-label', '.pz-line', '.pz-h', '.pz-table td.num']) {
    assert.ok(!list![1]!.split(',').some((x) => x.trim() === reading), `${reading} is a reading, not a column`);
  }
});

test('no stylesheet makes the universal rule tabular again', () => {
  for (const f of ['src/ui/deck-ui.css', 'src/ui/css3d-over-2d.css', 'src/scene/labels/labels.css', 'src/ui/shell/global.css']) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /^\*[^{\n]*\{[^}\n]*tabular-nums[^}\n]*!important/m, `${f}: a universal tabular rule`);
  }
});

test('the criteria card\'s case readings are named proportional (Pregnancy 7: "82 ×1 0³/µL", capture 2c00c0ce)', () => {
  assert.match(readFileSync('src/ui/css3d-over-2d.css', 'utf8'), /\.pz-crit \.pzc-end\.pzc-end \* \{ font-variant-numeric: lining-nums proportional-nums !important; \}/);
});

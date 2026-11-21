// Chart numbers for a screen reader (WCAG 1.3.1): every chart's words are also a hidden table beside the picture (charts/table.ts, written by Chart.tsx), so the numbers a chart draws are not only drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARTS } from '../src/ui/charts/registry.ts';
import { frameTable } from '../src/ui/charts/table.ts';
import { ctxOf, eachLook } from './charts-helpers.ts';
import type { Frame, TextShape } from '../src/ui/charts/scene.ts';

const t = (s: string, x: number, y: number, o: Partial<TextShape> = {}): TextShape => ({ k: 'text', s, x, y, size: 12, color: [0, 0, 0, 1], ...o });
const frame = (shapes: Frame['shapes'], label = 'A chart'): Frame => ({ w: 100, h: 60, shapes, label } as unknown as Frame);

test('rows are lines top to bottom, cells left to right; a halo drawn twice, a blank word and a hidden word are not cells', () => {
  const f = frame([t('PPG', 50, 10), t('12.0', 90, 11), t('HVPG', 10, 10), t('HVPG', 10, 10), t(' ', 5, 5), t('ghost', 30, 10, { alpha: 0 }), t('mmHg', 10, 40)], 'Two readings');
  const tab = frameTable(f);
  assert.equal(tab.caption, 'Two readings');
  assert.deepEqual(tab.rows, [['HVPG', 'PPG', '12.0'], ['mmHg']]);
});

test('every chart kind, every look: the table holds every word the chart draws, once', () => {
  let kinds = 0;
  for (const c of CHARTS) {
    if (!c.specimens.length) continue;
    kinds++;
    for (const s of c.specimens) eachLook((look) => {
      let f: Frame;
      try { f = s.build(ctxOf(look, 330, 'desktop')); } catch { return; }
      const tab = frameTable(f);
      const drawn = f.shapes.filter((x): x is TextShape => x.k === 'text' && x.s.trim() !== '' && (x.alpha ?? 1) > 0.01);
      const cells = tab.rows.flat();
      const dedup = new Set(drawn.map((w) => `${w.s.trim()}@${Math.round(w.x)},${Math.round(w.y)}`));
      assert.ok(cells.length <= drawn.length && cells.length >= dedup.size - drawn.length * 0.02 - 2, `${c.kind} ${look}: ${cells.length} cells for ${drawn.length} words`);
      for (const w of drawn) assert.ok(cells.includes(w.s.trim()), `${c.kind} ${look}: "${w.s}" is missing from its table`);
      assert.equal(tab.rows.every((r) => r.length > 0), true);
    });
  }
  assert.ok(kinds >= 10, `${kinds} chart kinds with a specimen`);
});

test('the Chart writes it as a table beside the image (an image role hides its children), out of sight and out of the Tab order', () => {
  const src = readFileSync('src/ui/charts/Chart.tsx', 'utf8');
  assert.match(src, /<table className="sr-only" data-chart-data="">/);
  assert.match(src, /<caption>\{table\.caption \|\| label\}<\/caption>/);
  assert.ok(src.indexOf('role="img"') < src.indexOf('<table'), 'a sibling after the picture, not inside it');
  assert.ok(!/<table[^>]*tabIndex/.test(src));
});

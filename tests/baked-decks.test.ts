// The rule behind tests/baked-decks.ts: a test file that reads the decks' baked chart data (a table's rows through pendingRows / bakedRows, or bakedById, trustBaked) calls ensureChartsBaked()
// first, so it is correct run on its own in a fresh container, not only after `npm test`'s pretest. (Root cause of "0 compared cells" in tests/table-arrows-unchanged.test.ts, 27 Nov.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('every test file that reads baked chart data makes sure it is baked', () => {
  const dir = new URL('./', import.meta.url);
  const reads = /\b(pendingRows|bakedRows|bakedById|trustBaked)\b/;
  const files = readdirSync(dir).filter((f) => f.endsWith('.test.ts') && f !== 'baked-decks.test.ts');
  const bare = files.filter((f) => { const t = readFileSync(new URL(f, dir), 'utf8'); return reads.test(t) && !/ensureChartsBaked\(\)/.test(t); });
  assert.deepEqual(bare, [], 'these read baked chart data without ensureChartsBaked() from tests/baked-decks.ts');
  assert.ok(files.some((f) => reads.test(readFileSync(new URL(f, dir), 'utf8'))), 'the walk finds the readers (it is not vacuous)');
});

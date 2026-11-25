// Equal-specificity rules in two sheets are decided by which sheet loads last. The lifted 2D sheets must always load first, and the app's own sheets that restate a 2D selector are held to the count they have now
// (it may go down: raise a rule's specificity so the order cannot decide it, as `.ac-card .ac-cs`; never up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sameSelectorConflicts } from '../scripts/css-same-selector.mjs';

test('main.tsx loads global.css and the lifted 2D sheets before anything else, so they sit below every component sheet', () => {
  const src = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^import\s+(?:[^'"]*from\s+)?'([^']+)'/gm)].map((m) => m[1]!);
  assert.deepEqual(imports.slice(0, 2), ['./ui/shell/global.css', './ui/styles/index.css']);
});

test('the app\'s own sheets restate no more 2D selectors with a different value than they do now (order must never decide a look)', () => {
  const at = sameSelectorConflicts().filter((x: { sheets: string[] }) => x.sheets.some((s) => s.includes('styles/')) && x.sheets.some((s) => !s.includes('styles/') && !s.includes('css3d-over-2d') && !s.includes('humanized')));
  assert.ok(at.length <= 92, `${at.length} conflicts (was 92)`);
});

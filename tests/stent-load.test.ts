// The stent editor is a chunk of its own (ui/action/stent/stent-load.ts): not in the boot entry, a card with its panel waits for it, and the preload ladder reads it in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadStentPanel, stentPanelReady, resetStentPanel } from '../src/ui/action/stent/stent-load.ts';

test('the loader reads once however often it is asked, never rejects, and tries again after a failed read', async () => {
  resetStentPanel();
  let reads = 0;
  await loadStentPanel(() => { reads++; return Promise.reject(new Error('offline')); });
  assert.equal(stentPanelReady(), false);
  const [a, b] = await Promise.all([loadStentPanel(() => { reads++; return Promise.resolve({}); }), loadStentPanel(() => { reads++; return Promise.resolve({}); })]);
  assert.deepEqual([a, b, stentPanelReady(), reads], [undefined, undefined, true, 2]);
  resetStentPanel();
});

test('boot.ts does not import the editor; the card waits for it; the ladder loads it', () => {
  const rd = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.doesNotMatch(rd('src/ui/action/boot.ts'), /^import[^\n]*StentPanel/m);
  assert.match(rd('src/ui/action/stent/stent-load.ts'), /import\('\.\/StentPanel\.tsx'\)/);
  assert.match(rd('src/ui/action/ActionCard.tsx'), /useStentPanelReady\(/);
  assert.match(rd('src/boot/warm.ts'), /module:stent/);
});

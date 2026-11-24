import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Capture f9a5d2e0: the table's upright heads (turned a quarter) came out "VAR X" and "ASQ TES": each letter was set in the width of its turned rect (the glyph's height), not its length.
test('a run turned a quarter is set at its own length, centred on its rect', async () => {
  const { unturned } = await import('../src/ui/capture/capture-dom.ts');
  const r = { left: 100, width: 10, height: 6 };
  assert.deepEqual(unturned(r, 0), { x: 100, w: 10 });
  const u = unturned(r, -Math.PI / 2);
  assert.equal(u.w, 6);
  assert.equal(u.x + u.w / 2, 105);
});
test('both text paths of the DOM reader use it', () => {
  const src = readFileSync(new URL('../src/ui/capture/capture-dom.ts', import.meta.url), 'utf8');
  assert.equal((src.match(/unturned\(/g) ?? []).length >= 5, true);
});

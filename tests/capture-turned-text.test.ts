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

// Capture 572259fd, varices 5: the wall-stress equation lost its fraction bar (the browser paints an <mfrac>'s rule itself).
test('a fraction gets its bar, full width, centred between the numerator and the denominator', async () => {
  const { fractionBar } = await import('../src/ui/capture/capture-model.ts');
  const b = fractionBar({ left: 10, width: 40 }, { bottom: 30 }, { top: 36 }, 32);
  assert.deepEqual(b, { x: 10, y: 32, w: 40, h: 2 });
  assert.equal(fractionBar({ left: 0, width: 5 }, { bottom: 1 }, { top: 1 }, 8).h, 1, 'never under a pixel');
  const src = readFileSync(new URL('../src/ui/capture/capture-dom.ts', import.meta.url), 'utf8');
  assert.match(src, /el\.localName === 'mfrac'[\s\S]*fractionBar\(/);
});

test('a non-scaling stroke is its stated width on the screen, whatever the matrix scale (the varix caliper was a white blob)', async () => {
  const { strokeWidthIn } = await import('../src/ui/capture/capture-model.ts');
  assert.equal(strokeWidthIn(1.6, 'non-scaling-stroke', { a: 6, b: 0 }).toFixed(3), '0.267');
  assert.equal(strokeWidthIn(1.6, 'none', { a: 6, b: 0 }), 1.6, 'an ordinary stroke scales with its drawing');
  assert.equal(strokeWidthIn(1.6, 'non-scaling-stroke', { a: 0, b: 0 }), 1.6, 'a degenerate matrix leaves it');
  for (const f of ['capture/capture-dom.ts', 'shell/figure-image-dom.ts']) assert.match(readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8'), /strokeWidthIn\(num\(cs\.strokeWidth\), cs\.vectorEffect, m\)/, f);
});

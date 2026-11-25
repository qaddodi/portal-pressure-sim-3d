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

// Capture af1c51a0, the gut-to-heart chart on every device: "mmHg" showed twice, one turned up the edge and one upright on the same centre. Root: the glow pass of a word with a text-shadow
// (every word in the data cards: `.pz-data { text-shadow }`) drew its copy with no turn, so only a turned word (the chart's unit, the one in the app) showed a second, upright one.
test('a turned word with a glow is turned in its glow pass too: no upright copy of it', async () => {
  const { paintScreen } = await import('../src/ui/capture/capture-dom.ts');
  const log: string[] = [];
  const g = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? (...a: unknown[]) => { log.push(k === 'rotate' ? `rotate:${a[0]}` : k); } : undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  const word = { k: 'text', text: 'mmHg', x: 10, y: 50, w: 40, font: '12px sans-serif', fill: '#fff', halo: '', haloW: 0, spacing: 0, rot: -Math.PI / 2, alpha: 1, ts: [{ color: '#000', ox: 0, oy: 0, blur: 10 }] };
  paintScreen(g, [word as never], 1);
  const fills = log.map((c, i) => (c === 'fillText' ? i : -1)).filter((i) => i >= 0);
  assert.ok(fills.length >= 2, 'the glow copy and the word');
  for (const i of fills) {
    const from = log.lastIndexOf('save', i);
    assert.ok(log.slice(from, i).includes(`rotate:${-Math.PI / 2}`), `fillText #${i} is turned`);
  }
});

// Capture 84496815, every iPad words card: the slide pill (z-index 4, first in the page) showed as a dark smudge in the card's foot. Root: the drawing list took the page's order, so the cards (z-index 2, later in the
// page) were drawn over the pill, and the card's frosted glass blurred it. The browser paints a positioned child by its z-index.
test('a positioned child is drawn by its z-index, the page order among equals', async () => {
  const { stackRank, paintOrder } = await import('../src/ui/capture/capture-model.ts');
  assert.equal(stackRank('absolute', '4'), 4);
  assert.equal(stackRank('absolute', 'auto'), 0);
  assert.equal(stackRank('static', '9'), 0, 'z-index does not apply to a static box');
  assert.equal(stackRank('relative', '-1'), -1);
  const kids = [{ n: 'scope', z: 'auto', p: 'static' }, { n: 'bar', z: '4', p: 'absolute' }, { n: 'cards', z: '2', p: 'absolute' }, { n: 'jump', z: '5', p: 'absolute' }, { n: 'black', z: 'auto', p: 'static' }];
  assert.deepEqual(paintOrder(kids, (k) => stackRank(k.p, k.z)).map((k) => k.n), ['scope', 'black', 'cards', 'bar', 'jump'], 'cards under the pill, the slide list over it');
  assert.deepEqual(paintOrder([{ n: 'a' }, { n: 'b' }, { n: 'c' }], () => 0).map((k) => k.n), ['a', 'b', 'c'], 'equal ranks keep the page order');
  const src = readFileSync(new URL('../src/ui/capture/capture-dom.ts', import.meta.url), 'utf8');
  assert.match(src, /for \(const ch of inOrder\(el\.children\)\) visit\(/);
  assert.match(src, /for \(const ch of inOrder\(document\.body\.children\)\) visit\(/);
});

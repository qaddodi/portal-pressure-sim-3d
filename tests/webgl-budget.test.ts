// The app's WebGL context budget. A browser keeps about 16 live contexts (a phone fewer) and silently drops the oldest when more are made: whatever it drew goes blank while
// the DOM around it stays (the ?charts gallery lost the shapes of its first charts that way, 19 Nov 2026). So the app makes TWO contexts, ever: the scene's (one R3F <Canvas>)
// and the charts' shared one (src/ui/charts/gl.ts). Anything else that draws on the GPU (a lobule or sinusoid view, a test card's picture, the monitor, the scope) goes through
// the scene or through the charts' drawer; it never asks for a context of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|js|jsx|mjs)$/.test(n) ? [p] : [];
});
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const files = walk('src').filter((f) => !f.startsWith(join('src', 'engine', 'hales')) && !f.startsWith(join('src', 'engine', 'host')));
const CHARTS_GL = join('src', 'ui', 'charts', 'gl.ts');
const PROBE = join('src', 'boot', 'webgl.ts');   // the no-WebGL2 check: one throwaway context, lost at once
const PLATE_WORKER = join('src', 'scene', 'lobule', 'plate-worker.ts');   // the lobule's marks plate painted off the page: a 2D OffscreenCanvas in a worker, no GL context

test('only the charts\' drawer asks a canvas for a WebGL context, or makes an OffscreenCanvas', () => {
  const bad: string[] = [];
  for (const f of files) {
    if (f === CHARTS_GL || f === PROBE) continue;
    if (f === PLATE_WORKER) { assert.ok(!/getContext\(\s*['"`](webgl|experimental)/.test(readFileSync(f, 'utf8')), 'the plate worker\'s canvas is 2D only'); continue; }
    const t = strip(readFileSync(f, 'utf8'));
    if (/getContext\(\s*['"`](webgl2?|experimental-webgl)['"`]/.test(t) || /new\s+(THREE\.)?WebGL(2)?Renderer\b/.test(t) || /new\s+OffscreenCanvas\b/.test(t)) bad.push(f);
  }
  assert.deepEqual(bad, [], 'draw through the scene (R3F) or the charts\' shared drawer (src/ui/charts/gl.ts); a context of your own is the bug that blanked the first charts of a page');
});

test('the scene has exactly one R3F <Canvas>, and the charts\' drawer makes one shared context (plus a fallback only where a browser cannot)', () => {
  const canvases: string[] = [];
  for (const f of files.filter((p) => p.endsWith('.tsx'))) {
    const n = (strip(readFileSync(f, 'utf8')).match(/<Canvas\b/g) ?? []).length;
    for (let i = 0; i < n; i++) canvases.push(f);
  }
  assert.equal(canvases.length, 1, `R3F canvases: ${canvases.join(', ')}`);
  const gl = strip(readFileSync(CHARTS_GL, 'utf8'));
  assert.equal((gl.match(/new OffscreenCanvas\(/g) ?? []).length, 1, 'one shared OffscreenCanvas');
  assert.equal((gl.match(/new Drawer\(/g) ?? []).length, 2, 'the shared drawer and the per-canvas fallback, nothing else');
});

test('a chart, a card or a deck never makes a chart canvas by hand: it goes through ChartPainter', () => {
  const bad: string[] = [];
  for (const f of files) {
    if (f === join('src', 'ui', 'charts', 'painter.ts') || f === join('src', 'scene', 'labels', 'LabelLayer.tsx') || f === PROBE) continue;
    // (the lobule's plate: the 2D painter's 2D canvas, sent as a texture of the scene's own context; it makes no GL context of its own)
    // (the organs' art, the same: 2D's gut art painted into a 2D canvas once per look and sent as a texture; organ-art.ts)
    if (f === join('src', 'scene', 'organs', 'organ-art.ts')) { assert.ok(!/getContext\(\s*['"`]webgl/.test(readFileSync(f, 'utf8')), 'the art\'s canvas is 2D only'); continue; }
    if (f === join('src', 'scene', 'lobule', 'plate.ts')) { assert.ok(!/getContext\(\s*['"`]webgl/.test(readFileSync(f, 'utf8')), 'the plate\'s canvas is 2D only'); continue; }
    // (the look board's pixel reader: a 2D canvas to read a picture's bytes, on the debug page only)
    if (f === join('src', 'debug', 'look-pixels.ts')) { assert.ok(!/getContext\(\s*['"`]webgl/.test(readFileSync(f, 'utf8')), 'the look board\'s canvases are 2D only'); continue; }
    // (Copy / Save figure: one 2D canvas made on a click to lay the labels over the canvas's picture, never per frame, no GL context; shell/figure-image-dom.ts)
    if (f === join('src', 'ui', 'shell', 'figure-image-dom.ts')) { assert.ok(!/getContext\(\s*['"`]webgl/.test(readFileSync(f, 'utf8')), 'the figure picture\'s canvas is 2D only'); continue; }
    const t = strip(readFileSync(f, 'utf8'));
    if (/createElement\(\s*['"`]canvas['"`]\s*\)/.test(t)) bad.push(f);
  }
  assert.deepEqual(bad, [], 'a canvas for a picture comes from ChartPainter (one shared GPU context); LabelLayer\'s is a text-measuring 2D canvas');
});

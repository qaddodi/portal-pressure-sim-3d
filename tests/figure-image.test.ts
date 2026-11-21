// N3: Copy figure / Save figure. The pure part (label layout to the picture) in node; the wiring in the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { figureCmds, figureFileName, MIN_ALPHA, type Seen } from '../src/ui/shell/figure-image.ts';

const font = { size: 12, weight: '600', family: 'Inter' };
const text = (over = {}) => ({ text: 'PV', x: 100, y: 50, font, fill: '#111', halo: '#fff', haloW: 2, alpha: 1, ...over });
const stage = { x: 10, y: 20, w: 400, h: 300 };

test('labels land where they stand, in the canvas\'s own pixels (the stage\'s corner is the origin, the scale is the pixel ratio)', () => {
  const seen: Seen = { texts: [text()], lines: [{ x1: 100, y1: 50, x2: 150, y2: 90, w: 1, color: '#444', alpha: 1 }], rings: [{ x: 150, y: 90, r: 3, w: 1, stroke: '#222', fill: '#fff', alpha: 1 }] };
  const c = figureCmds(seen, stage, 2);
  assert.deepEqual(c.map((x) => x.op), ['line', 'ring', 'text'], 'leaders under rings under text');
  assert.deepEqual(c[0], { op: 'line', x1: 180, y1: 60, x2: 280, y2: 140, w: 2, color: '#444', alpha: 1 });
  assert.deepEqual(c[1], { op: 'ring', x: 280, y: 140, r: 6, w: 2, stroke: '#222', fill: '#fff', alpha: 1 });
  assert.deepEqual(c[2], { op: 'text', text: 'PV', x: 180, y: 60, font: '600 24px Inter', fill: '#111', halo: '#fff', haloW: 4, alpha: 1 });
});

test('a hairline never vanishes at 1x, and what is leaving, hidden, empty or off the stage is not drawn', () => {
  const seen: Seen = {
    texts: [text({ alpha: MIN_ALPHA - 0.01 }), text({ text: '  ' }), text({ x: 900 }), text({ y: 5 }), text({ text: 'IVC', alpha: 0.9 })],
    lines: [{ x1: 20, y1: 30, x2: 30, y2: 40, w: 0.5, color: '#000', alpha: 1 }, { x1: 800, y1: 800, x2: 900, y2: 900, w: 1, color: '#000', alpha: 1 }],
    rings: [{ x: 15, y: 25, r: 3, w: 1, stroke: '#000', fill: '#fff', alpha: 0.1 }],
  };
  const c = figureCmds(seen, stage, 1);
  assert.deepEqual(c.filter((x) => x.op === 'text').map((x) => (x as { text: string }).text), ['IVC']);
  assert.equal(c.filter((x) => x.op === 'line').length, 1);
  assert.equal((c.find((x) => x.op === 'line') as { w: number }).w, 1, 'at least a pixel');
  assert.equal(c.filter((x) => x.op === 'ring').length, 0);
});

test('the file is named for what it shows', () => {
  assert.equal(figureFileName('anatomic', 'cirr-decomp'), 'portal-pressure-anatomic-cirr-decomp.png');
  assert.equal(figureFileName('Circuit view', null), 'portal-pressure-circuit-view.png');
});

test('wired: the Figure menu has Copy and Save, the canvas is read in the task that draws it (no preserveDrawingBuffer), and the picture is drawn once, on a click', () => {
  const menu = readFileSync('src/ui/shell/FigureMenu.tsx', 'utf8');
  assert.match(menu, /copyFigure\(\)/); assert.match(menu, /saveFigure\(\)/);
  const dom = readFileSync('src/ui/shell/figure-image-dom.ts', 'utf8');
  assert.match(dom, /lookCapture\.ask\(/);
  assert.ok(!/preserveDrawingBuffer/.test(dom));
  assert.ok(!/requestAnimationFrame/.test(dom), 'no frame loop of its own');
  assert.match(dom, /new CI\(\{ 'image\/png': picture \}\)/, 'the clipboard item is made inside the click, holding a promise');
  assert.ok(dom.indexOf("const picture = figurePicture()") < dom.indexOf('navigator.clipboard.write'), 'nothing is awaited before it');
});

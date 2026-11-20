import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tessellate, FLOATS, meshBounds, dashPolyline, roundRectPoints } from '../src/ui/charts/geometry.ts';
import { mix, parseColour, contrast } from '../src/ui/charts/colour.ts';
import type { Shape } from '../src/ui/charts/scene.ts';

const red = [1, 0, 0, 1] as const;
const area = (verts: Float32Array) => {
  let a = 0;
  for (let i = 0; i + 2 * FLOATS < verts.length + 1; i += 3 * FLOATS) {
    const [ax, ay, bx, by, cx, cy] = [verts[i]!, verts[i + 1]!, verts[i + FLOATS]!, verts[i + FLOATS + 1]!, verts[i + 2 * FLOATS]!, verts[i + 2 * FLOATS + 1]!];
    a += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
  }
  return a;
};

test('a rectangle fills exactly its area', () => {
  const m = tessellate([{ k: 'rect', x: 10, y: 20, w: 100, h: 40, fill: red }] as Shape[]);
  assert.ok(Math.abs(area(m.verts) - 4000) < 1e-6);
});

test('a rounded rectangle fills a little less than the square one, inside its box', () => {
  const m = tessellate([{ k: 'rect', x: 0, y: 0, w: 100, h: 40, r: 10, fill: red }] as Shape[]);
  const a = area(m.verts);
  assert.ok(a < 4000 && a > 4000 - 4 * 100 * (1 - Math.PI / 4) * 1.1, `area ${a}`);
  const b = meshBounds(m)!;
  assert.ok(b.x0 >= -1e-6 && b.y0 >= -1e-6 && b.x1 <= 100 + 1e-6 && b.y1 <= 40 + 1e-6);
});

test('a straight stroke covers length × width, a bent one has no overlap and no gap on its outside', () => {
  const straight = tessellate([{ k: 'line', x1: 0, y1: 0, x2: 50, y2: 0, pen: { color: red, w: 4 } }] as Shape[]);
  assert.ok(Math.abs(area(straight.verts) - 200) < 1e-6);
  const bent = tessellate([{ k: 'path', pts: [0, 0, 50, 0, 50, 50], pen: { color: red, w: 4 } }] as Shape[]);
  // a mitered strip's area is its centre length × its width (400), the corner counted once
  assert.ok(Math.abs(area(bent.verts) - 400) < 1e-6, `area ${area(bent.verts)}`);
});

test('a concave polygon is triangulated to its own area', () => {
  // an L shape: 10x10 square with a 5x5 corner cut out = 75
  const m = tessellate([{ k: 'path', closed: true, pts: [0, 0, 10, 0, 10, 5, 5, 5, 5, 10, 0, 10], fill: red }] as Shape[]);
  assert.ok(Math.abs(area(m.verts) - 75) < 1e-6);
});

test('a band is the area between its two lines', () => {
  const m = tessellate([{ k: 'band', top: [0, 0, 10, 0, 20, 5], bottom: [0, 10, 10, 10, 20, 10], fill: red }] as Shape[]);
  assert.ok(Math.abs(area(m.verts) - (100 + 75)) < 1e-6);
});

test('dashes: on and off lengths, and the stroke of them covers the on length only', () => {
  const runs = dashPolyline([0, 0, 100, 0], [10, 10], false);
  assert.equal(runs.length, 5);
  assert.deepEqual(runs[0], [0, 0, 10, 0]);
  const m = tessellate([{ k: 'line', x1: 0, y1: 0, x2: 100, y2: 0, pen: { color: red, w: 2, dash: [10, 10] } }] as Shape[]);
  assert.ok(Math.abs(area(m.verts) - 100) < 1e-6);
});

test('a clip makes its own operation, and what follows it is drawn after it; an unclip closes it', () => {
  const m = tessellate([
    { k: 'rect', x: 0, y: 0, w: 5, h: 5, fill: red },
    { k: 'clip', x: 0, y: 0, w: 50, h: 50, r: 8 },
    { k: 'rect', x: 0, y: 0, w: 5, h: 5, fill: red },
    { k: 'unclip' },
  ] as Shape[]);
  assert.deepEqual(m.ops.map((o) => o.op), ['draw', 'clip', 'draw', 'unclip']);
});

test('a translucent colour is premultiplied in the vertices', () => {
  const m = tessellate([{ k: 'rect', x: 0, y: 0, w: 4, h: 4, fill: [1, 0.5, 0, 0.5] }] as Shape[]);
  assert.deepEqual([...m.verts.subarray(2, 6)], [0.5, 0.25, 0, 0.5]);
});

test('rounded rectangle outlines stay inside their box', () => {
  const p = roundRectPoints(0, 0, 30, 20, 50);
  for (let i = 0; i < p.length; i += 2) assert.ok(p[i]! >= -1e-9 && p[i]! <= 30 + 1e-9 && p[i + 1]! >= -1e-9 && p[i + 1]! <= 20 + 1e-9);
});

test('colour mixes follow CSS: a mix with transparent lowers the alpha, srgb halfway is the midpoint, oklab keeps black and white grey', () => {
  const a = mix('srgb', parseColour('#ff0000'), 22, parseColour('transparent'));
  assert.deepEqual(a.map((v) => +v.toFixed(3)), [1, 0, 0, 0.22]);
  assert.deepEqual(mix('srgb', parseColour('#000'), 50, parseColour('#fff')).map((v) => +v.toFixed(3)), [0.5, 0.5, 0.5, 1]);
  const g = mix('oklab', parseColour('#000'), 50, parseColour('#fff'));
  assert.ok(Math.abs(g[0] - g[1]) < 1e-3 && Math.abs(g[1] - g[2]) < 1e-3 && g[0] > 0.3 && g[0] < 0.5);
  assert.ok(contrast(parseColour('#000'), parseColour('#fff')) > 20.9);
});

test('a radial gradient is a ring of triangles with the colour of each stop on its own ring, blended between them (the balloon\'s highlight, a spot)', async () => {
  const { tessellate } = await import('../src/ui/charts/geometry.ts');
  const m = tessellate([{ k: 'radial', cx: 50, cy: 50, stops: [{ r: 0, c: [1, 0, 0, 1] }, { r: 20, c: [0, 0, 1, 0] }] }]);
  assert.ok(m.triangles >= 48);
  const cols = new Set<string>();
  for (let i = 0; i < m.verts.length; i += 6) cols.add(`${m.verts[i + 2]!.toFixed(2)}|${m.verts[i + 4]!.toFixed(2)}`);
  assert.equal(cols.size, 2, 'red at the centre, clear blue at the edge: the GPU blends between');
});

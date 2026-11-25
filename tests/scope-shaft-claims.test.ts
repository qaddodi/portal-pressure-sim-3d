import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringsClaims } from '../src/scene/devices/probes/cover.ts';
import type { Box } from '../src/scene/labels/geometry.ts';

// Capture 52ef8e63 and af88a9c2: the scope's shaft was drawn over the names ("Varices 18.4 mmHg" lost its V behind it). The shaft's rings are claimed as boxes the label solver keeps clear of, like the probe's body.
const env = { project: (v: { x: number; y: number }, o: { x: number; y: number }) => { o.x = v.x; o.y = v.y; } };
const ring = (x: number, y: number, r = 5) => ({ c: { x, y, z: 0 }, r });

test('the shaft is claimed from its first ring to its last, as wide as the tube plus the pad', () => {
  const rings = Array.from({ length: 23 }, (_, i) => ring(100 + i * 10, 200 + i * 4)) as never[];
  const out: Box[] = [];
  ringsClaims(env as never, [{ rings, from: 0, to: 22 }], 1, out, 6, 5);
  assert.ok(out.length >= 4 && out.length <= 12, `${out.length} boxes`);
  const lo = Math.min(...out.map((b) => b.x0)), hi = Math.max(...out.map((b) => b.x1));
  assert.ok(lo <= 100 - 11 && hi >= 320 + 11, 'covers both ends with the tube width and pad');
  for (let i = 0; i < 23; i++) { const x = 100 + i * 10, y = 200 + i * 4; assert.ok(out.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1), `ring ${i} inside a box`); }
});
test('no rings, no claim; a short scope still claims its stretch', () => {
  const out: Box[] = [];
  ringsClaims(env as never, [{ rings: [] as never[], from: 0, to: -1 }], 1, out);
  assert.equal(out.length, 0);
  ringsClaims(env as never, [{ rings: [ring(10, 10), ring(20, 10), ring(30, 10)] as never[], from: 0, to: 2 }], 1, out);
  assert.ok(out.length >= 1);
});

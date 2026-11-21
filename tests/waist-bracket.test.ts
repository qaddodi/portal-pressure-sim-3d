// The stent's waist bracket in the figure (Mohammad, 21 Nov: 2D showed a bracket over the TIPS waist; 3D showed only "6 mm × 0.5 cm"). Pure placing, node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAP, placeBracket, waistOn } from '../src/scene/labels/waist-place.ts';

test('it eases in with the waist: nothing without one, whole from 3.4 %, never a step', () => {
  assert.equal(waistOn(0), 0);
  assert.equal(waistOn(0.004), 0);
  assert.equal(waistOn(0.034), 1);
  assert.equal(waistOn(0.6), 1);
  let prev = 0;
  for (let r = 0; r <= 0.04; r += 0.002) { const v = waistOn(r); assert.ok(v >= prev && v - prev < 0.1, `smooth at ${r}`); prev = v; }
});
test('it stands one wall plus a gap off the axis, spans the waist, and prefers up and left', () => {
  const p = placeBracket({ x: 100, y: 200 }, { x: 100, y: 260 }, 6, { x: 1, y: 0 })!;   // a vertical stent, normal along x
  assert.ok(p.x < 100 && Math.abs(100 - p.x - (6 + GAP)) < 1e-6, 'on the left, wall + gap away');
  assert.ok(Math.abs(p.len - 60) < 1e-6 && Math.abs(p.angle - Math.PI / 2) < 1e-6, 'as long as the waist, parallel to the stent');
  assert.ok(Math.abs(p.tickAngle) < 1e-6, 'its ticks point back at the stent (+x)');
  const h = placeBracket({ x: 0, y: 100 }, { x: 80, y: 100 }, 5, { x: 0, y: -1 })!;   // a horizontal stent: above it
  assert.ok(h.y < 100 && Math.abs(100 - h.y - (5 + GAP)) < 1e-6);
  assert.equal(placeBracket({ x: 5, y: 5 }, { x: 5, y: 5 }, 4, { x: 1, y: 0 }), null, 'no span, no bracket');
});
test('the figure paints it from the stents, and the stent device gives it the waist\'s own span and ramp', () => {
  const layer = readFileSync(new URL('../src/scene/labels/LabelLayer.tsx', import.meta.url), 'utf8');
  const dev = readFileSync(new URL('../src/scene/devices/stent/stent-device.ts', import.meta.url), 'utf8');
  assert.match(layer, /waistBrackets\.paint\(cel\.procs\.stents\)/);
  assert.match(dev, /waistMark\(a: Vector3, b: Vector3\)/);
  assert.match(dev, /waistSpan\(g\)/);
  assert.match(dev, /this\.amount \* Math\.min\(1, Math\.max\(0, \(\(g\.red \|\| 0\) - 0\.004\) \/ 0\.03\)\)/);
});

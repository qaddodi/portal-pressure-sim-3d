// The scopes read slim and real, not toy-like (owner, 20 Nov 2026: "too cartoony and too prominent"): round tubes (not 8 facets), slimmer than 2D's radius, fine depth marks, a soft black.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARK_HALF, SCOPE_RADIAL, SCOPE_SLIM, SCOPE_TUBE } from '../src/scene/devices/probes/scope.ts';
import { DEVICE_TOKENS } from '../src/scene/procedures/copied/device-tokens.copied.ts';

test('scope tubes are round, slim, with fine marks and a soft black', () => {
  assert.ok(SCOPE_RADIAL >= 20, 'round, not faceted');
  assert.ok(SCOPE_SLIM < 0.8);
  assert.ok(MARK_HALF <= 0.4);
  const t = DEVICE_TOKENS.light;
  assert.notEqual(SCOPE_TUBE(t).toLowerCase(), t.scope.toLowerCase());
});

test('the plain scope has a dark rounded end, the EUS a silver one', async () => {
  const { SCOPE_DISTAL, SCOPE_SILVER } = await import('../src/scene/devices/probes/scope.ts');
  const t = DEVICE_TOKENS.light, lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  assert.ok(lum(SCOPE_DISTAL(t)) < lum(SCOPE_SILVER(t)));
});

test('the distal end is domed (whole, then rounding down), never a square box end', async () => {
  const { tipRadius, DOME_END } = await import('../src/scene/devices/probes/scope.ts');
  assert.equal(tipRadius(0), 1); assert.equal(tipRadius(0.5), 1);
  assert.ok(Math.abs(tipRadius(1) - DOME_END) < 1e-9);
  for (let u = 0; u < 1; u += 0.05) assert.ok(tipRadius(u + 0.05) <= tipRadius(u) + 1e-9);
});

test('the EUS needle reads as a needle: thin, a long bevel to a sharp point, a sheath round its base', async () => {
  const m = await import('../src/scene/devices/probes/scope.ts');
  assert.ok(m.NEEDLE_HALF < 0.5, 'thin shaft');
  assert.ok(m.NEEDLE_BEV / m.NEEDLE_HALF >= 8, 'a long bevel');
  assert.ok(m.NEEDLE_POINT <= 0.05, 'a sharp point');
  assert.ok(m.SHEATH_HALF > m.NEEDLE_HALF * 1.8 && m.SHEATH_LEN > 4, 'a sheath, wider than the needle');
});

test('the distal end is its own section: a wider creased bending cover, then a cap of the cover\'s width', async () => {
  const m = await import('../src/scene/devices/probes/scope.ts');
  assert.ok(Math.abs(m.bendRadius(0) - 1) < 0.02, 'it starts at the tube\'s width (no step)');
  let max = 0, min = Infinity; for (let u = 0.1; u <= 1; u += 0.002) { max = Math.max(max, m.bendRadius(u)); min = Math.min(min, m.bendRadius(u)); }
  assert.ok(max > 1.08, 'wider than the tube'); assert.ok(max - min > 0.05, 'creased');
  assert.ok(m.TIP_WIDE >= m.BEND_WIDE - 1e-9, 'the cap is the cover\'s width');
});

test('the bending section is long (several tube widths), on both scopes', async () => {
  const m = await import('../src/scene/devices/probes/scope.ts');
  assert.ok(m.BEND_LEN >= 35);
});

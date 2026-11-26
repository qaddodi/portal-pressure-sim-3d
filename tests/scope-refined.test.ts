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
  assert.ok(m.NEEDLE_BEV / m.NEEDLE_HALF >= 12, 'a long bevel');
  assert.ok(m.NEEDLE_POINT <= 0.02, 'a sharp point');
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
  assert.ok(m.BEND_LEN >= 60, 'the cover reaches past the second depth mark from the tip (owner, 20 Nov)');
});


test('the EUS needle tapers to a POINT: a straight cone, steepest at the very tip, never a rounded nib (owner, 25 Nov 2026: "sharper")', async () => {
  const m = await import('../src/scene/devices/probes/scope.ts');
  // the root cause was a smoothstep profile: zero slope at the point, so the last rings stayed near full width. The rule: the slope at the tip equals the slope at the shoulder, and neither is flat.
  const slope = (k: number): number => (m.needleTaper(k + 1e-4) - m.needleTaper(k)) / 1e-4;
  assert.equal(m.needleTaper(0), 1); assert.ok(Math.abs(m.needleTaper(1) - m.NEEDLE_POINT) < 1e-12);
  assert.ok(slope(0) < -0.9 && Math.abs(slope(0.999) - slope(0)) < 1e-6, 'no flat shoulder and no flat tip: one steady slope');
  for (let k = 0; k < 1; k += 0.05) assert.ok(m.needleTaper(k + 0.05) < m.needleTaper(k), 'narrower all the way');
  assert.ok(m.needleTaper(0.9) <= 0.15, 'the last tenth of the bevel is already a fine point (a smoothstep left it at 0.97)');
  // the half angle of the point, from the real figure units: under 5 degrees
  const half = Math.atan((m.NEEDLE_HALF * (1 - m.NEEDLE_POINT)) / m.NEEDLE_BEV) * 180 / Math.PI;
  assert.ok(half < 5, `point half angle ${half.toFixed(2)} degrees`);
  // the rings: the stem's few, the bevel's many, the last on the point, none out of order, at a full throw and at a short one
  for (const [nU, bev] of [[40, m.NEEDLE_BEV], [m.NEEDLE_BEV, m.NEEDLE_BEV], [3, 3]] as const) {
    let prev = -1;
    for (let i = 0; i < m.NEEDLE_RINGS; i++) { const { l, k } = m.needleRingAt(i, nU, bev); assert.ok(l >= prev - 1e-12 && l <= nU + 1e-12 && k >= 0 && k <= 1); prev = l; }
    assert.ok(Math.abs(m.needleRingAt(m.NEEDLE_RINGS - 1, nU, bev).l - nU) < 1e-9 && m.needleRingAt(m.NEEDLE_RINGS - 1, nU, bev).k === 1, 'the last ring is the point');
  }
  assert.ok(m.NEEDLE_BEV_RINGS >= 8, 'enough rings in the bevel to draw the cone, not a stepped stub');
});

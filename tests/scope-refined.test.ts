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

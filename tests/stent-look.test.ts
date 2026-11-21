import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stentGoldEdge, stentGraftEdge, stentWireEdge, STENT_GLASS } from '../src/scene/devices/stent/stent-look.ts';
import { resolveEdge } from '../src/scene/devices/edges.ts';
import { DEVICE_TOKENS } from '../src/scene/procedures/copied/device-tokens.copied.ts';

const lum = (h: string): number => { const n = parseInt(h.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
describe('stent look', () => {
  it('draws every stent edge softer than the figure ink, in warm colours for the metal', () => {
    for (const look of ['light', 'dark'] as const) {
      const ctx = { t: DEVICE_TOKENS[look], look, ink: '#14182a' };
      for (const r of [stentWireEdge, stentGoldEdge, stentGraftEdge]) assert.ok(resolveEdge(r, ctx).a < 1);
      assert.ok(lum(resolveEdge(stentWireEdge, ctx).hex) > lum(ctx.t.stentWire));
    }
  });
  it('keeps the graft a rim-edged glass', () => { assert.ok(STENT_GLASS.rim > 0 && STENT_GLASS.fill > 0); });
});

import { stentCircuitLook, STENT_FRONT_ALPHA } from '../src/scene/devices/stent/stent-look.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { readFileSync } from 'node:fs';
describe('stent look in the Circuit', () => {
  it('takes its colours and strengths from the one table, in every look', () => {
    for (const id of Object.keys(PALETTES) as (keyof typeof PALETTES)[]) {
      const l = stentCircuitLook(PALETTES[id]); assert.equal(l.wireA, STENT_FRONT_ALPHA); assert.ok(l.wire.r > 0.5 && l.goldA < 1);
    }
  });
  it('has no fixed ink or gold left in the vessel shader stent', () => {
    const src = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
    assert.ok(src.includes('stentWire.rgb') && !src.includes('mix(c, inkColor, 0.85 * cov * kS)') && !src.includes('vec3(0.86, 0.66, 0.2), gold * kS'));
  });
});

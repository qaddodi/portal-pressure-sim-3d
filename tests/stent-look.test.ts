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

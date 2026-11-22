// The bake radius of an arm (net/ranges.ts), pinned by what the acceptance on the real figure measured (WP3, 22 Nov): a fillet baked at the radii it will be drawn at has no folds, and a rest-radii start (the shader's) begins to fold a fillet when the arms
// grow by more than about 10% (uniform ratio 1.1: 0 to 1 triangles; 1.15: up to 8; 1.2: up to 12; 1.3: up to 29, on 9 of the 17 body regions). Baked at max / 1.2, an arm that never swells ([1, 1]: the permanent arms of the hepatic veins and the portal branches) sat at 1.2 in every state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARM_RANGE, BAKE_RADII, NARROW_SPAN, WIDE_TOP, bakeScaleOf } from '../src/scene/vessels/net/ranges.ts';

test('an arm that never swells is baked at the radius it is drawn at, a narrow range at its geometric mean, a wide one with its top at 1.1 of the baked radius', () => {
  assert.equal(BAKE_RADII, 'narrow');
  assert.equal(bakeScaleOf('PRE_R'), 1);
  assert.equal(bakeScaleOf('POST_R_RHV'), 1);
  for (const [id, [lo, hi]] of Object.entries(ARM_RANGE)) {
    const b = bakeScaleOf(id), top = hi / b, bottom = lo / b;
    if (hi <= NARROW_SPAN * lo) assert.ok(top <= Math.sqrt(NARROW_SPAN) + 1e-9 && bottom >= 1 / Math.sqrt(NARROW_SPAN) - 1e-9, `${id}: a narrow range is centred on its baked radius (${bottom.toFixed(2)} .. ${top.toFixed(2)})`);
    else assert.ok(Math.abs(top - WIDE_TOP) < 1e-9, `${id}: a wide range has its top at ${WIDE_TOP} of the baked radius (${top})`);
    assert.ok(top <= WIDE_TOP + 1e-9, `${id}: no state grows the arm by more than ${WIDE_TOP} over its baked radius (${top.toFixed(3)})`);
  }
  assert.equal(bakeScaleOf('NO_SUCH_EDGE'), 1);
});

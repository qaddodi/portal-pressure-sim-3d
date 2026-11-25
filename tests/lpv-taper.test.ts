// The left portal vein narrows and fades out early in the left lobe (Mohammad, 25 Nov: "taper a bit more and fade earlier ... going too far into the left lobe same caliber doesn't look good"),
// and the umbilical vein and the meso-Rex shunt still leave it at its full width (fades.ts PLACED_LIVER_FADE, shape.ts LIVER_TAPER).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { coursesOf, REST } from '../src/scene/vessels/shape.ts';
import { factorSpan } from '../src/scene/vessels/tubes.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { PLACED_EDGE_3D, shareOn } from '../src/scene/anatomy/placed-network.ts';

test('the left portal vein tapers and is gone by three quarters of its run into the lobe; its branches leave it whole', () => {
  const v = NETWORK.find((x) => x.id === 'PVH_L_1')!, c = coursesOf(v, REST)[0]!;
  const w = (u: number) => factorSpan(c.taper ?? [1, 1], c.taperSpan ?? [0.3, 0.3], u);
  const f = fadeOf('PVH_L_1', false)!;
  assert.ok(f.mode === 1 && f.to <= 0.75 && f.a1 === 0, `fades out by ${f.to}`);
  assert.ok(w(1) <= 0.45, `narrows to ${w(1).toFixed(2)} at its tip`);
  for (let u = 0.05; u <= 1; u += 0.05) assert.ok(w(u) <= w(u - 0.05) + 1e-9, 'narrows progressively');
  assert.ok(w(f.to) < 0.7, `at the end of its fade it is ${w(f.to).toFixed(2)} of its width`);
  for (const id of ['C3', 'REX']) {
    const p = PLACED_EDGE_3D[id]!, at = Math.min(shareOn('PVH_L_1', p[0]!), shareOn('PVH_L_1', p[p.length - 1]!));
    assert.ok(w(at) > 0.98 && at < f.from, `${id} leaves at ${at.toFixed(2)}, width ${w(at).toFixed(2)}, before the fade starts (${f.from})`);
  }
});

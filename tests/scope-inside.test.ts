// The scope runs through the middle of the oesophagus and stomach (owner, 20 Nov 2026: "when we're scoping the scope should be INSIDE the lumen, not outside the entire structure"): its depth is
// the organ's own middle at each point of its way, smooth along it, and never beyond the organ's faces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { bakeGeometry, centreAt, bakeCentre } from '../src/scene/organs/centre-z.ts';
import { scopeWay, glueScopeWay, scopeZ } from '../src/scene/devices/probes/scope.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

test('the middle of a slab is its centre, and a point past its edge takes the nearest', () => {
  // two triangles at z = 0.1 and z = 0.3 over the same square: middle 0.2
  const pos = [0, 0, 0.1, 1, 0, 0.1, 0, 1, 0.1, 0, 0, 0.3, 1, 0, 0.3, 0, 1, 0.3];
  const g = bakeCentre(pos, [0, 1, 2, 3, 4, 5]);
  assert.ok(Math.abs(centreAt(g, 0.2, 0.2) - 0.2) < 1e-6);
  assert.ok(Math.abs(centreAt(g, 5, 5) - 0.2) < 1e-6);
});

test('the scope\'s way runs on the oesophagus and stomach\'s middle, smoothly, inside their faces', async () => {
  await organsReady;
  const geo = ORGAN_MESHES.stomach!(), pa = geo.getAttribute('position').array;
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 2; i < pa.length; i += 3) { zmin = Math.min(zmin, pa[i]!); zmax = Math.max(zmax, pa[i]!); }
  const grid = bakeGeometry(geo);
  for (const way of [scopeWay(), glueScopeWay()]) {
    let prev: number | null = null, worst = 0, minZ = Infinity, maxZ = -Infinity;
    for (const p of way.pts) {
      const z = scopeZ(x3(p[0]), y3(p[1]));
      assert.ok(Math.abs(z - centreAt(grid, x3(p[0]), y3(p[1]))) < 1e-9);
      if (prev !== null) worst = Math.max(worst, Math.abs(z - prev));
      prev = z; minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    assert.ok(minZ >= zmin && maxZ <= zmax, `the middle stays between the organ's faces (${minZ.toFixed(3)}..${maxZ.toFixed(3)} of ${zmin.toFixed(3)}..${zmax.toFixed(3)})`);
    assert.ok(worst < 0.02, `no jump along the way (largest step ${worst.toFixed(4)})`);
  }
});

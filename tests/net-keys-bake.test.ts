// The mesher's own key bake (net/keys.ts, WP2): a wide junction's keys, fitted by continuation, are on their state's union and fold-free, at the body pose and at the map pose; a narrow junction gets none; pickKeys takes the largest state first then the farthest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh } from '../src/scene/vessels/net/mesh.ts';
import { pickKeys, isWide, MAX_KEYS } from '../src/scene/vessels/net/keys.ts';
import { keyQuality } from './net-keys-check.ts';
import { fixtures } from './net-lib.ts';

test('pickKeys: the largest state first, then the farthest in log space; duplicates once; at most four', () => {
  const s = [[1, 1], [0.4, 0.4], [1, 0.4], [0.4, 1], [0.41, 0.4], [0.7, 0.7]];
  const k = pickKeys(s);
  assert.equal(k[0], 0); assert.ok(k.length <= MAX_KEYS); assert.ok(!k.includes(4), 'a near duplicate of a chosen key is not a new key');
  assert.deepEqual(pickKeys([[1, 1], [1, 1.005]]), [1]);
  assert.deepEqual(pickKeys([]), []);
});
test('isWide: more than 2:1 on any arm', () => { assert.ok(!isWide([[1, 1], [0.6, 1.1]], 2)); assert.ok(isWide([[1, 1], [0.4, 1]], 2)); });

const GRID = [0.4, 0.65, 1.0, 1.15];
for (const fx of fixtures()) {
  const nd = fx.skel.nodes.find((n) => n.edges.length >= 3 && n.runOn);
  if (!nd) continue;
  const pair = new Set(nd.runOn!.map((i) => nd.edges[i]!.edge)), E = fx.skel.edges.length;
  const states = GRID.flatMap((a) => GRID.map((b) => Array.from({ length: E }, (_, e) => (pair.has(e) ? a : b))));
  const r = buildNetMesh(fx.skel, undefined, { states }), m = r.mesh;
  test(`${fx.name}: keys of a wide junction are on their union and fold-free at both poses; a run without states has none`, () => {
    assert.ok(m.keys && m.keys.length > 0, 'wide junction keyed');
    assert.equal(buildNetMesh(fx.skel).mesh.keys, undefined);
    for (const rk of m.keys!) {
      assert.ok(rk.keys.length >= 2 && rk.keys.length <= MAX_KEYS);
      assert.deepEqual(rk.keys[0]!.swell.map((x) => +x.toFixed(2)), rk.arms.map(() => 1.15), 'the max state comes first');
      for (let i = 0; i < rk.keys.length; i++) for (const pose of [0, 1] as const) {
        const q = keyQuality(fx.skel, r, rk, i, pose, states), tag = `${fx.name} pose ${pose} key ${rk.keys[i]!.swell.map((x) => x.toFixed(2))}`;
        assert.ok(q.res <= 0.01, `${tag}: on the union to ${q.res.toFixed(4)} R`);
        assert.equal(q.flips, 0, `${tag}: ${q.flips} folded or inward triangles`);
      }
    }
  });
}

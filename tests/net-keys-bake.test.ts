// The mesher's own key bake (net/keys.ts, WP2): a wide junction's keys, fitted by continuation, are on their state's union and fold-free, at the body pose and at the map pose; a narrow junction gets none; pickKeys takes the largest state first then the farthest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh } from '../src/scene/vessels/net/mesh.ts';
import { pickKeys, isWide, MAX_KEYS } from '../src/scene/vessels/net/keys.ts';
import { boundPositions, fitCaps, fitK, type FitRegion } from '../src/scene/vessels/net/fit.ts';
import { SKIN_K, sdUnion, sdUnionGrad } from '../src/scene/vessels/skin/sdf.ts';
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
      const rep = r.nodes.find((n) => n.node === rk.node)!, used = new Set<number>();
      for (let t = rep.triStart; t < rep.triStart + rep.triCount; t++) for (let q = 0; q < 3; q++) used.add(m.index[3 * t + q]!);
      const rg: FitRegion = { verts: [...used].sort((a, b) => a - b), tris: Array.from(m.index.subarray(3 * rep.triStart, 3 * (rep.triStart + rep.triCount))), free: [rep.vertStart, rep.vertCount], arms: rep.arms.length, caps: rep.capBones!.map((bones, i) => ({ bones, mate: rep.caps![i]!.mate })), rings: rep.rings! };
      for (const key of rk.keys) for (const pose of [0, 1] as const) {
        const fs = Float64Array.from({ length: E }, (_, e) => (key.swell[rk.arms.indexOf(e)] ?? 1)), off = Float32Array.from(pose ? m.offsetMap : m.offset);
        rg.verts.forEach((v, q) => { if (v >= rk.vertStart && v < rk.vertStart + rk.vertCount) { const src = (pose ? key.offsetMap : key.offset); for (let j = 0; j < 12; j++) off[12 * v + j] = src[12 * (v - rk.vertStart) + j]!; void q; } });
        const P = boundPositions(fx.skel, m, rg, pose, off, fs), caps = fitCaps(fx.skel, rg, pose, -1, fs), k = fitK(fx.skel, rg, pose, -1, fs), loc = new Map(rg.verts.map((v, q) => [v, q])), g = [0, 0, 0];
        let res = 0, flips = 0;
        rg.verts.forEach((v, q) => { if (v >= rk.vertStart && v < rk.vertStart + rk.vertCount) res = Math.max(res, Math.abs(sdUnion(caps, k, P[3 * q]!, P[3 * q + 1]!, P[3 * q + 2]!)) / (k / SKIN_K)); });
        for (let t = 0; t < rg.tris.length; t += 3) {
          const [a, b, c] = [loc.get(rg.tris[t]!)!, loc.get(rg.tris[t + 1]!)!, loc.get(rg.tris[t + 2]!)!], e1 = [0, 1, 2].map((q) => P[3 * b + q]! - P[3 * a + q]!), e2 = [0, 1, 2].map((q) => P[3 * c + q]! - P[3 * a + q]!);
          const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!], cx = [0, 1, 2].map((q) => (P[3 * a + q]! + P[3 * b + q]! + P[3 * c + q]!) / 3);
          sdUnionGrad(caps, k, cx[0]!, cx[1]!, cx[2]!, g);
          if (n[0]! * g[0]! + n[1]! * g[1]! + n[2]! * g[2]! < 0) flips++;
        }
        assert.ok(res <= 0.01, `${fx.name} pose ${pose} key ${key.swell.map((x) => x.toFixed(2))}: on the union to ${res.toFixed(4)} R`);
        assert.equal(flips, 0, `${fx.name} pose ${pose} key ${key.swell.map((x) => x.toFixed(2))}: ${flips} folded or inward triangles`);
      }
    }
  });
}

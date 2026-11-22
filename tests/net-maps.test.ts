// A junction region's TWO meshes (plan owner, 22 Nov): the body-built one and the map-built one, both on the same seam rings, each whole at its own layout, handing over in a t window where both are (net/window.ts), opts { maps: true }.
// Held on the fixtures: the pair exists with the same arms, seams and rings; the map mesh's open boundary is exactly those rings; each mesh is fold-free and on the union at its own layout; the window lies in the overlap, and both meshes are
// whole at every grid t inside it; a default build has no map mesh; a region whose meshes share no t is named, not hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh } from '../src/scene/vessels/net/mesh.ts';
import { RADIAL } from '../src/scene/vessels/net/mesh.ts';
import { OFF_MAX } from '../src/scene/vessels/net/window.ts';
import { fixtures } from './net-lib.ts';

test('a default build has one mesh per region and no window', () => {
  for (const fx of fixtures()) {
    const r = buildNetMesh(fx.skel);
    for (const n of r.nodes.filter((x) => x.kind === 'junction')) assert.ok((n.variant ?? 0) === 0 && n.switchT === undefined, `${fx.name} ${n.node}`);
    assert.equal(r.windows.size, 0);
  }
});

for (const fx of fixtures()) {
  const r = buildNetMesh(fx.skel, undefined, { maps: true }), regions = r.nodes.filter((n) => n.kind === 'junction');
  if (!regions.length) continue;
  test(`${fx.name}: every region has a body and a map mesh on the same seams and rings, the map mesh open exactly at its rings`, () => {
    for (const body of regions.filter((n) => (n.variant ?? 0) === 0)) {
      const map = regions.find((n) => n.node === body.node && n.variant === 1);
      assert.ok(map, `${body.node}: a map mesh`);
      assert.deepEqual(map.seams, body.seams); assert.deepEqual(map.arms, body.arms); assert.deepEqual(map.rings, body.rings);
      const edges = new Map<string, number>();
      for (let t = map.triStart; t < map.triStart + map.triCount; t++) for (let c = 0; c < 3; c++) { const a = r.mesh.index[3 * t + c]!, b = r.mesh.index[3 * t + (c + 1) % 3]!, key = a < b ? `${a}/${b}` : `${b}/${a}`; edges.set(key, (edges.get(key) ?? 0) + 1); }
      const open = [...edges.entries()].filter(([, n]) => n === 1).length;
      assert.equal(open, body.arms.length * RADIAL, `${body.node}: the open edges are the ${body.arms.length} rings`);
      assert.ok([...edges.values()].every((n) => n <= 2), `${body.node}: no edge of the map mesh has three faces`);
      const rings = new Set(body.rings!.flat());
      for (let v = map.vertStart; v < map.vertStart + map.vertCount; v++) assert.ok(!rings.has(v), 'the map mesh owns its fillet vertices, the rings are the tubes\'');
    }
  });
  test(`${fx.name}: each mesh is whole at its own layout and the window lies where both are`, () => {
    for (const [node, w] of r.windows) {
      const first = w.rows[0]!, last = w.rows[w.rows.length - 1]!;
      assert.ok(first.body.folds === 0 && first.body.off <= OFF_MAX, `${node}: body mesh whole at t = 0`);
      assert.ok(last.map.folds === 0 && last.map.off <= OFF_MAX, `${node}: map mesh whole at t = 1`);
      assert.ok(w.switchT, `${node}: the two meshes overlap`);
      const [lo, hi] = w.switchT!, body = regions.find((n) => n.node === node && (n.variant ?? 0) === 0)!, map = regions.find((n) => n.node === node && n.variant === 1)!;
      assert.deepEqual(body.switchT, w.switchT); assert.deepEqual(map.switchT, w.switchT);
      assert.ok(w.b <= lo && hi <= w.a, `${node}: window [${lo}, ${hi}] inside [${w.b}, ${w.a}]`);
      for (const row of w.rows) if (row.t >= lo - 1e-9 && row.t <= hi + 1e-9) assert.ok(row.body.folds === 0 && row.map.folds === 0 && row.body.off <= OFF_MAX && row.map.off <= OFF_MAX, `${node} t ${row.t}: both whole`);
    }
    assert.equal(r.mapNotes.length, 0, r.mapNotes.map((x) => x.why).join('; '));
  });
}

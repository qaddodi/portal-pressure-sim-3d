// A junction region's TWO meshes (plan owner, 22 Nov): the body-built one and the map-built one, both on the same seam rings, each whole at its own layout, handing over in a t window where both are (net/window.ts), opts { maps: true }.
// Held on the fixtures: the pair exists with the same arms, seams and rings; the map mesh's open boundary is exactly those rings; each mesh is fold-free and on the union at its own layout; the window lies in the overlap, and both meshes are
// whole at every grid t inside it; a default build has no map mesh; a region whose meshes share no t is named, not hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh, MAP_FILLET_OPEN, networksOf, REFINE } from '../src/scene/vessels/net/mesh.ts';
import { RADIAL } from '../src/scene/vessels/net/mesh.ts';
import { OFF_MAX } from '../src/scene/vessels/net/window.ts';
import { BODY_ONLY, regionShare } from '../src/scene/vessels/net/regions.ts';
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
  test(`${fx.name}: every mesh is whole at every grid t it is drawn at (the fillet steps aside during the move)`, () => {
    for (const [node, w] of r.windows) {
      const body = regions.find((n) => n.node === node && (n.variant ?? 0) === 0)!, map = regions.find((n) => n.node === node && n.variant === 1);
      assert.ok(w.rows[0]!.body.folds === 0 && w.rows[0]!.body.off <= OFF_MAX, `${node}: body mesh whole at t = 0`);
      assert.deepEqual(body.switchT, w.a < 1 ? [w.b, w.a] : undefined); assert.deepEqual(map?.switchT, map ? [w.b, w.a] : undefined);
      const wb = body.switchT ?? BODY_ONLY;
      for (const row of w.rows) {
        const sb = regionShare({ variant: 0, window: wb }, row.t);
        if (sb > 1e-6) assert.ok(row.body.folds === 0 && row.body.off <= OFF_MAX, `${node} t ${row.t}: the body mesh is drawn (share ${sb.toFixed(2)}) and whole`);
        if (map) { const sm = regionShare({ variant: 1, window: map.switchT! }, row.t); if (sm > 1e-6) assert.ok(row.map!.folds === 0 && row.map!.off <= OFF_MAX, `${node} t ${row.t}: the map mesh is drawn (share ${sm.toFixed(2)}) and whole`); }
      }
    }
  });
  test(`${fx.name}: a region with no map mesh, or a map mesh never whole, is named and dissolves its body fillet`, () => {
    for (const body of regions.filter((n) => (n.variant ?? 0) === 0)) {
      const map = regions.find((n) => n.node === body.node && n.variant === 1);
      if (!map) assert.ok(r.mapNotes.some((x) => x.node === body.node), `${body.node}: named in mapNotes`);
    }
  });
}

// A REGION WHOSE MAP FILLET IS OPEN (plan owner, 22 Nov: PVT_L's sliver root cause) has no map mesh: it dissolves to the plain tubes on the map, named in mapNotes.
test('a region listed in MAP_FILLET_OPEN keeps its body mesh only, with a window like a region that has no map mesh, and is named', () => {
  for (const fx of fixtures()) {
    const base = buildNetMesh(fx.skel, undefined, { maps: true }), node = base.nodes.find((n) => n.kind === 'junction' && n.variant === 1)?.node;
    if (!node) continue;
    MAP_FILLET_OPEN.set(node, 'test: open');
    try {
      const r = buildNetMesh(fx.skel, undefined, { maps: true });
      assert.ok(!r.nodes.some((n) => n.node === node && n.variant === 1), `${fx.name} ${node}: no map mesh`);
      assert.ok(r.mapNotes.some((x) => x.node === node && x.why === 'test: open'), `${fx.name} ${node}: named in mapNotes`);
      assert.ok((r.mesh.keys ?? []).every((k) => !(k.node === node && k.variant === 1)), `${fx.name}: its map keys are gone`);
    } finally { MAP_FILLET_OPEN.delete(node); }
    return;
  }
});

// THE ARMS' EXTENSIONS STAY INSIDE THE UNION THE SHADER HOLDS at every t and any swell (plan owner, 22 Nov): judged by the shared oracle (tests/net-ink.ts: the oracle's live bones and deformLive against the capsules of the shader's row), in units of the narrowest arm's radius
// (the ink hull is 0.15 R; the tolerance here is 0.01). A run-on pair's edges are one vessel and swell together, so the swells here are uniform.
import { extensionsOutside, liveGrid } from './net-ink.ts';
import { REGION_PTS, regionsOf } from '../src/scene/vessels/net/regions.ts';
for (const fx of fixtures()) {
  const r = buildNetMesh(fx.skel, undefined, { maps: true }), junctions = r.nodes.filter((n) => n.kind === 'junction' && n.caps);
  if (!junctions.length) continue;
  test(`${fx.name}: the extensions stand inside the shader's union at every t and at thin, rest and fat radii`, () => {
    const E = fx.skel.edges.length;
    for (const row of regionsOf(fx.skel, junctions)) for (const c of row.caps) assert.ok(c.bones.length === REGION_PTS, 'a row holds REGION_PTS bones a capsule');
    const lives = liveGrid(fx.skel, [new Array(E).fill(1), new Array(E).fill(1.4), new Array(E).fill(0.6)], [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    for (const w of extensionsOutside(r.mesh, fx.skel, r.nodes, lives)) assert.ok(w.worst <= 0.01, `${w.node}: an extension of ${w.edge} (vertex ${w.vertex}, bone ${w.bone}) stands ${w.worst.toFixed(3)} outside the union`);
  });
}

// J1 (22 Nov): PVT_L's map fillet was open (dropped) because its base map mesh held a 2 R edge across a crease whose split left a sliver. The crease was LGV_CONF hooking back into its node; with the skeleton's arm turn capped
// the real figure's PVT_L map mesh builds and reaches the fidelity tolerance, and no region of the portal network is left open.
import { skeleton } from '../src/scene/vessels/net/skeleton.ts';
test('J1: the real figure\'s PVT_L map fillet meshes at the tolerance (no region is open)', () => {
  assert.equal(MAP_FILLET_OPEN.size, 0, 'no region is open');
  const sk = skeleton(), g = networksOf(sk).find((e) => e.some((i) => sk.edges[i]!.id === 'LGV_CONF'))!;
  const r = buildNetMesh(sk, g, { lenient: true, maps: true, keys: false });
  assert.ok(r.nodes.some((n) => n.node === 'PVT_L' && n.variant === 1), 'PVT_L has its map mesh');
  assert.ok(!r.mapNotes.some((n) => n.node === 'PVT_L'), 'PVT_L has no map note');
  assert.deepEqual(r.failures, []);
  const w = REFINE.world.get('PVT_L#1')!, lim = REFINE.limit.get('PVT_L#1')!;
  assert.ok(w <= lim * (1 + 1e-6), `PVT_L#1 reached ${(w / lim).toFixed(2)} x the tolerance`);
});

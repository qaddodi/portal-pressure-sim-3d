// WP2 of the network geometry: the network mesher (src/scene/vessels/net/mesh.ts) on synthetic skeletons (tests/net-lib.ts), node only. What it pins: the mesh of a network is ONE closed, consistently wound surface (no seam between a vessel and its junction),
// the junction's fillet has no sliver, every vertex's binding rebuilds the rest shape, the map pose does not turn it inside out, and a junction that will not mesh fails by name instead of falling back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetMeshError, RADIAL, buildNetMesh, networksOf } from '../src/scene/vessels/net/mesh.ts';
import { minAngleDeg } from '../src/scene/vessels/skin/mesh.ts';
import { deform, fixtures, makeSkeleton, topology, volume, type FixEdge } from './net-lib.ts';

for (const fx of fixtures()) {
  const r = buildNetMesh(fx.skel), m = r.mesh, V = m.position.length / 3, T = m.index.length / 3;

  test(`${fx.name}: one closed surface, wound outward, with no degenerate triangle and no unused vertex`, () => {
    const t = topology(m.index);
    for (const [e, c] of t.use) assert.equal(c, 2, `edge ${e} is on ${c} triangles`);
    assert.equal(t.badDirected, 0, 'a directed edge is used twice: two faces wind against each other');
    assert.equal(t.degenerate, 0);
    assert.ok(volume(m.position, m.index) > 0, 'inside out');
    const used = new Uint8Array(V);
    for (const v of m.index) used[v] = 1;
    assert.equal(used.reduce((a, b) => a + b, 0), V, 'a vertex no triangle uses');
    assert.ok(T > 0 && V - t.use.size + T === 2 * (networksOf(fx.skel).length), `Euler: V - E + F = ${V - t.use.size + T} (a tree of tubes is a sphere)`);
  });

  test(`${fx.name}: every vertex is bound to at most four real bones of this network, weights sum to 1`, () => {
    const mine = new Set<number>();
    for (const i of r.edges) { const [f, c] = fx.skel.edges[i]!.bones; for (let k = 0; k < c; k++) mine.add(f + k); }
    for (let v = 0; v < V; v++) {
      let s = 0;
      for (let i = 0; i < 4; i++) { const w = m.weight[4 * v + i]!; s += w; assert.ok(w >= 0); if (w > 0) assert.ok(mine.has(m.bone[4 * v + i]!), `vertex ${v} bone ${m.bone[4 * v + i]}`); }
      assert.ok(Math.abs(s - 1) < 1e-5, `vertex ${v} weights sum ${s}`);
    }
    for (const x of m.offset) assert.ok(Number.isFinite(x));
  });

  test(`${fx.name}: the binding rebuilds the rest positions within 1e-4`, () => {
    const p = deform(m, fx.skel, 0);
    let worst = 0;
    for (let i = 0; i < p.length; i++) worst = Math.max(worst, Math.abs(p[i]! - m.position[i]!));
    assert.ok(worst < 1e-4, `worst ${worst}`);
  });

  test(`${fx.name}: the junctions' triangles have a smallest angle above 12 degrees, and none is a fold`, () => {
    for (const nd of r.nodes.filter((n) => n.kind === 'junction')) {
      let lo = 180;
      for (let t = nd.triStart; t < nd.triStart + nd.triCount; t++) lo = Math.min(lo, minAngleDeg(m.position, m.index[3 * t]!, m.index[3 * t + 1]!, m.index[3 * t + 2]!));
      assert.ok(lo > 12, `${nd.node}: smallest angle ${lo.toFixed(1)}`);
      assert.ok(nd.triCount > 0 && nd.seams.every((s) => s >= 1));
    }
    assert.equal(r.nodes.filter((n) => n.kind === 'junction').length, fx.junctions.length);
  });

  test(`${fx.name}: at the map pose the surface is still closed outward and finite`, () => {
    const p = deform(m, fx.skel, 1);
    for (const x of p) assert.ok(Number.isFinite(x));
    assert.ok(volume(p, m.index) > 0, 'the map pose turned the mesh inside out');
  });

  test(`${fx.name}: building twice gives the same bytes`, () => {
    const b = buildNetMesh(fx.skel).mesh;
    assert.deepEqual(Array.from(b.index), Array.from(m.index));
    assert.deepEqual(Array.from(b.position), Array.from(m.position));
  });
}

test('a run-on carries one ring across its node: the chain has no sliver where its frames and its direction change', () => {
  const fx = fixtures().find((f) => f.name === 'CHAIN')!, r = buildNetMesh(fx.skel), m = r.mesh;
  let lo = 180;
  for (let t = 0; t < m.index.length; t += 3) lo = Math.min(lo, minAngleDeg(m.position, m.index[t]!, m.index[t + 1]!, m.index[t + 2]!));
  assert.ok(lo > 12, `smallest angle in the chain ${lo.toFixed(1)}`);
  // the node's ring is shared: its vertices are bound to the two bones that meet there, half each
  let shared = 0;
  for (let v = 0; v < m.position.length / 3; v++) if (m.weight[4 * v] === 0.5 && m.weight[4 * v + 1] === 0.5 && fx.skel.bones[m.bone[4 * v]!]!.edge !== fx.skel.bones[m.bone[4 * v + 1]!]!.edge) shared++;
  assert.equal(shared, 2 * RADIAL, 'the two nodes of the chain each share one ring, bound half to each side');
});

test('a junction that will not mesh fails the bake and names itself (no fallback)', () => {
  const a = (o: [number, number, number], ang: number, len: number): FixEdge['curve'] => (u) => [o[0] + Math.cos(ang) * len * u, o[1] + Math.sin(ang) * len * u, o[2]];
  const edges: FixEdge[] = [
    { id: 'M', from: 'L', to: 'R', curve: a([-0.15, 0, 0], 0, 0.3), rad: () => 0.1, bones: 6 },
    { id: 'La', from: 'L', to: 'a', curve: a([-0.15, 0, 0], 2.4, 2), rad: () => 0.1 },
    { id: 'Lb', from: 'L', to: 'b', curve: a([-0.15, 0, 0], -2.4, 2), rad: () => 0.1 },
    { id: 'Rc', from: 'R', to: 'c', curve: a([0.15, 0, 0], 0.7, 2), rad: () => 0.1 },
    { id: 'Rd', from: 'R', to: 'd', curve: a([0.15, 0, 0], -0.7, 2), rad: () => 0.1 },
  ];
  const skel = makeSkeleton(['L', 'R', 'a', 'b', 'c', 'd'].map((id) => ({ id })), edges);
  assert.throws(() => buildNetMesh(skel), (e: unknown) => e instanceof NetMeshError && (e.node === 'L' || e.node === 'R' || e.node === 'M'));
});

test('networksOf groups edges that share a node, and one network builds the same as the whole skeleton', () => {
  const fx = fixtures().find((f) => f.name === 'H')!;
  const nets = networksOf(fx.skel);
  assert.equal(nets.length, 1);
  assert.equal(nets[0]!.length, fx.skel.edges.length);
  const two = makeSkeleton([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [
    { id: 'E1', from: 'a', to: 'b', curve: (u) => [u, 0, 0], rad: () => 0.05 },
    { id: 'E2', from: 'c', to: 'd', curve: (u) => [u, 1, 0], rad: () => 0.05 },
  ]);
  const g = networksOf(two);
  assert.equal(g.length, 2);
  const whole = buildNetMesh(two, g[0]!), only = buildNetMesh(two, [0]);
  assert.equal(whole.mesh.index.length, only.mesh.index.length);
});

test('the baked file round-trips a mesh bit for bit, and its digest follows the skeleton', async () => {
  const { decodeNet, encodeNet, skeletonDigest } = await import('../src/scene/vessels/net/baked.ts');
  const fx = fixtures().find((f) => f.name === 'FOUR')!, m = buildNetMesh(fx.skel).mesh, digest = skeletonDigest(fx.skel);
  const back = decodeNet(encodeNet(m, digest))!;
  assert.equal(back.digest, digest);
  for (const k of ['position', 'bone', 'weight', 'offset', 'index'] as const) assert.deepEqual(Array.from(back.mesh[k]), Array.from(m[k]), k);
  assert.equal(decodeNet(new ArrayBuffer(32)), null);
  const moved = fixtures().find((f) => f.name === 'FOUR')!.skel;
  moved.bones[3]!.pos[0] = [9, 9, 9];
  assert.notEqual(skeletonDigest(moved), digest);
});

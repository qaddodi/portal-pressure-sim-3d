// WP2 of the network geometry: the network mesher (src/scene/vessels/net/mesh.ts) on synthetic skeletons (tests/net-lib.ts), node only. What it pins: the mesh of a network is ONE closed, consistently wound surface (no seam between a vessel and its junction),
// the junction's fillet has no sliver, every vertex's binding rebuilds the rest shape, the map pose does not turn it inside out, and a junction that will not mesh fails by name instead of falling back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetMeshError, RADIAL, buildNetMesh, networksOf } from '../src/scene/vessels/net/mesh.ts';
import { minAngleDeg } from '../src/scene/vessels/skin/mesh.ts';
import { deform, deformNormals, fixtures, geometricNormals, makeSkeleton, topology, volume, type FixEdge } from './net-lib.ts';

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

/** An arm out of (x, 0, 0) along the angle `ang`, `len` long. */
const out = (x: number, ang: number, len: number): FixEdge['curve'] => (u) => [x + Math.cos(ang) * len * u, Math.sin(ang) * len * u, 0];
const ids = (xs: string[]): { id: string }[] => xs.map((id) => ({ id }));

test('two junctions joined by a short edge are ONE region: the short edge is inside the fillet, its bones carry the fillet, and it is not swept', () => {
  const fx = fixtures().find((f) => f.name === 'HS')!, r = buildNetMesh(fx.skel), m = r.mesh;
  const nodes = r.nodes.filter((n) => n.kind === 'junction');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]!.node, 'L+R');
  assert.equal(nodes[0]!.arms.length, 4, 'four arms; the short edge is not one');
  assert.ok(!nodes[0]!.arms.includes(fx.skel.edges.findIndex((e) => e.id === 'M')));
  const [first, count] = fx.skel.edges.find((e) => e.id === 'M')!.bones;
  let bound = 0;
  for (let v = 0; v < m.position.length / 3; v++) for (let i = 0; i < 4; i++) if (m.weight[4 * v + i]! > 0 && m.bone[4 * v + i]! >= first && m.bone[4 * v + i]! < first + count) { bound++; break; }
  assert.ok(bound > RADIAL, `${bound} vertices bound to the short edge's bones`);
});

test('a merged region of more than 6 arms fails the bake and names its cluster (no fallback)', () => {
  const edges: FixEdge[] = [
    { id: 'M', from: 'L', to: 'R', curve: (u) => [-0.12 + 0.24 * u, 0, 0], rad: () => 0.1, bones: 6 },
    ...[1.9, 2.5, -1.9, -2.5].map((ang, i): FixEdge => ({ id: `L${i}`, from: 'L', to: `l${i}`, curve: out(-0.12, ang, 2), rad: () => 0.06 })),
    ...[0.5, 0.9, -0.6].map((ang, i): FixEdge => ({ id: `R${i}`, from: 'R', to: `r${i}`, curve: out(0.12, ang, 2), rad: () => 0.06 })),
  ];
  const skel = makeSkeleton(ids(['L', 'R', 'l0', 'l1', 'l2', 'l3', 'r0', 'r1', 'r2']), edges);
  assert.throws(() => buildNetMesh(skel), (e: unknown) => e instanceof NetMeshError && e.node === 'L+R' && /7 arms/.test(e.message));
  // the same cluster with 6 arms meshes
  const six = makeSkeleton(ids(['L', 'R', 'l0', 'l1', 'l2', 'r0', 'r1', 'r2']), edges.filter((e) => e.id !== 'L3'));
  assert.doesNotThrow(() => buildNetMesh(six));
});

for (const fx of fixtures()) {
  const r = buildNetMesh(fx.skel), m = r.mesh, V = m.position.length / 3;
  const angle = (a: Float32Array, b: Float32Array, v: number): number => (Math.acos(Math.min(1, Math.max(-1, a[3 * v]! * b[3 * v]! + a[3 * v + 1]! * b[3 * v + 1]! + a[3 * v + 2]! * b[3 * v + 2]!))) * 180) / Math.PI;

  test(`${fx.name}: normals are bound in the bones' frames: unit, and the rest blend returns the rest normal`, () => {
    const n0 = deformNormals(m, fx.skel, 0), geo = geometricNormals(m.position, m.index);
    // (the rest normal is the blend of the rotated ones: recompute it from the stored world normal through the position's own frame to compare)
    for (let v = 0; v < V; v++) { assert.ok(Math.abs(Math.hypot(n0[3 * v]!, n0[3 * v + 1]!, n0[3 * v + 2]!) - 1) < 1e-5); for (let i = 0; i < 4; i++) if (m.weight[4 * v + i]! > 0) assert.ok(Math.abs(Math.hypot(m.normal[12 * v + 3 * i]!, m.normal[12 * v + 3 * i + 1]!, m.normal[12 * v + 3 * i + 2]!) - 1) < 1e-5, 'a stored normal is a unit vector'); }
    // tube vertices (no skin triangle uses them): the ring's direction matches the geometry's own normal within 3 degrees at rest
    const skin = new Uint8Array(V);
    for (const nd of r.nodes) if (nd.kind === 'junction') for (let t = nd.triStart; t < nd.triStart + nd.triCount; t++) for (let s = 0; s < 3; s++) skin[m.index[3 * t + s]!] = 1;
    const tube: number[] = [], fil: number[] = [];
    const endBone = new Set<number>();
    for (const nd of fx.skel.nodes) if (nd.edges.length === 1) { const x = nd.edges[0]!, e = fx.skel.edges[x.edge]!; endBone.add(x.end === 0 ? e.bones[0] : e.bones[0] + e.bones[1] - 1); }
    for (let v = 0; v < V; v++) { if (m.weight[4 * v]! === 1 && endBone.has(m.bone[4 * v]!)) continue; (skin[v] ? fil : tube).push(angle(n0, geo, v)); }   // (the dome's rings: the geometry's average over the cap's first facet is not the sphere's normal)
    tube.sort((a, b) => a - b); fil.sort((a, b) => a - b);
    assert.ok(tube[Math.floor(0.99 * (tube.length - 1))]! < 3, `tube normals p99 ${tube[Math.floor(0.99 * (tube.length - 1))]!.toFixed(2)} deg from the geometry's`);
    if (process.env.NET_DEBUG) console.log(fx.name, 'tube p99', tube[Math.floor(0.99 * (tube.length - 1))]?.toFixed(2), 'fillet p50/p90/p99', [0.5, 0.9, 0.99].map((q) => fil.length ? fil[Math.floor(q * (fil.length - 1))]!.toFixed(1) : '-').join('/'));
    // the fillet's normal is the union's gradient at the shade width: it follows the surface within 40 degrees at p99 (it is softer than the mesh on purpose, exact-normal.ts)
    if (fil.length) assert.ok(fil[Math.floor(0.99 * (fil.length - 1))]! < 40, `fillet p99 ${fil[Math.floor(0.99 * (fil.length - 1))]!.toFixed(1)}`);
  });

  test(`${fx.name}: normals at the map pose stay unit and face outward from their own bones' axes`, () => {
    const n1 = deformNormals(m, fx.skel, 1), p1 = deform(m, fx.skel, 1), geo = geometricNormals(p1, m.index), a: number[] = [];
    for (let v = 0; v < V; v++) { assert.ok(Math.abs(Math.hypot(n1[3 * v]!, n1[3 * v + 1]!, n1[3 * v + 2]!) - 1) < 1e-5); a.push(angle(n1, geo, v)); }
    a.sort((x, y) => x - y);
    assert.ok(a[Math.floor(0.9 * (a.length - 1))]! < 25, `p90 ${a[Math.floor(0.9 * (a.length - 1))]!.toFixed(1)} deg from the deformed geometry's`);
  });
}

/** The distance from the axis (x, 0, 0) to the mesh along the ray at azimuth `th`, in the plane at x (the nearest hit), or Infinity. */
function radiusAt(m: { position: Float32Array; index: Uint32Array }, x: number, th: number): number {
  const dy = Math.cos(th), dz = Math.sin(th);
  let best = Infinity;
  for (let t = 0; t < m.index.length; t += 3) {
    const P = [0, 1, 2].map((s) => m.index[t + s]! * 3);
    if (Math.min(...P.map((o) => m.position[o]!)) > x || Math.max(...P.map((o) => m.position[o]!)) < x) continue;
    // intersect the ray (x, 0, 0) + s (0, dy, dz) with the triangle (Moller-Trumbore, direction in the plane x = const)
    const a = P[0]!, b = P[1]!, c = P[2]!, e1 = [0, 1, 2].map((d) => m.position[b + d]! - m.position[a + d]!), e2 = [0, 1, 2].map((d) => m.position[c + d]! - m.position[a + d]!), D = [0, dy, dz];
    const h = [D[1]! * e2[2]! - D[2]! * e2[1]!, D[2]! * e2[0]! - D[0]! * e2[2]!, D[0]! * e2[1]! - D[1]! * e2[0]!], det = e1[0]! * h[0]! + e1[1]! * h[1]! + e1[2]! * h[2]!;
    if (Math.abs(det) < 1e-12) continue;
    const q = [x - m.position[a]!, -m.position[a + 1]!, -m.position[a + 2]!], u = (q[0]! * h[0]! + q[1]! * h[1]! + q[2]! * h[2]!) / det;
    if (u < 0 || u > 1) continue;
    const w = [q[1]! * e1[2]! - q[2]! * e1[1]!, q[2]! * e1[0]! - q[0]! * e1[2]!, q[0]! * e1[1]! - q[1]! * e1[0]!], v = (D[0]! * w[0]! + D[1]! * w[1]! + D[2]! * w[2]!) / det;
    if (v < 0 || u + v > 1) continue;
    const s = (e2[0]! * w[0]! + e2[1]! * w[1]! + e2[2]! * w[2]!) / det;
    if (s > 0 && s < best) best = s;
  }
  return best;
}

for (const name of ['T', 'FOUR', 'STUB', 'TT']) {
  test(`${name}: a through pair never necks across its junction: the trunk's radius stays between the two arms' and changes without a step in its slope`, () => {
    const fx = fixtures().find((f) => f.name === name)!, m = buildNetMesh(fx.skel).mesh;
    // the surface's radius round the axis at each station: the LOWER QUARTILE over 28 azimuths (the branches' fillets only ever add, and cover a minority of them, and the 14-gon's flats and the skin's irregular triangles average out)
    const dx = 0.02, prof: number[] = [], xs: number[] = [];
    for (let x = -0.7; x <= 0.7 + 1e-9; x += dx) { const rs: number[] = []; for (let k = 0; k < 28; k++) rs.push(radiusAt(m, x, (2 * Math.PI * (k + 0.5)) / 28)); rs.sort((a, b) => a - b); prof.push(rs[7]!); xs.push(x); }
    // the two arms' own tube radius at their stations just outside the seams (the same measure, so the 14-gon's flats cancel)
    const outer = (sign: number): number => { const x = sign * 0.62; return prof[xs.findIndex((v) => Math.abs(v - x) < 1e-6)]!; };
    const rA = outer(-1), rB = outer(1), floor = 0.98 * Math.min(rA, rB), ceil = 1.08 * Math.max(rA, rB);   // (the lower bound is the rule; the upper only stops a bulge: a fillet may add a little where the branch leaves)
    for (let i = 0; i < prof.length; i++) { assert.ok(prof[i]! >= floor, `x ${xs[i]!.toFixed(2)}: radius ${prof[i]!.toFixed(4)} is below min(RA, RB) - 2% = ${floor.toFixed(4)} (a neck)`); assert.ok(prof[i]! <= ceil, `x ${xs[i]!.toFixed(2)}: radius ${prof[i]!.toFixed(4)} is above max(RA, RB) + 8%`); }
    // no step in the slope: over a 0.06 baseline (the skin's triangles wobble the radius by about 1 %, 0.001, so a shorter one reads noise) the slope changes by under 0.08 between neighbouring stations (a taper ends in a smooth ease; a neck or a ledge of 5 % is a jump of 0.16)
    const W = 3, slope = prof.slice(W).map((v, i) => (v - prof[i]!) / (W * dx));
    for (let i = 1; i < slope.length; i++) assert.ok(Math.abs(slope[i]! - slope[i - 1]!) < 0.08, `x ${xs[i + 1]!.toFixed(2)}: the slope jumps from ${slope[i - 1]!.toFixed(3)} to ${slope[i]!.toFixed(3)}`);
  });
}

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

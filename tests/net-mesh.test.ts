// WP2 of the network geometry: the network mesher (src/scene/vessels/net/mesh.ts) on synthetic skeletons (tests/net-lib.ts), node only. What it pins: the mesh of a network is ONE closed, consistently wound surface (no seam between a vessel and its junction),
// the junction's fillet has no sliver, every vertex's binding rebuilds the rest shape, the map pose does not turn it inside out, and a junction that will not mesh fails by name instead of falling back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetMeshError, RADIAL, buildNetMesh, networksOf } from '../src/scene/vessels/net/mesh.ts';
import { minAngleDeg } from '../src/scene/vessels/skin/mesh.ts';
import { deform, deformNormals, fixtures, geometricNormals, makeSkeleton, shellProblems, topology, volume, type FixEdge } from './net-lib.ts';

for (const fx of fixtures()) {
  const r = buildNetMesh(fx.skel), m = r.mesh, V = m.position.length / 3, T = m.index.length / 3;

  test(`${fx.name}: one closed surface, wound outward, with no degenerate triangle and no unused vertex`, () => {
    assert.deepEqual(shellProblems(r), [], 'the tubes are closed and wound, the fillets open only at their seam rings');
    const t = topology(m.index);
    assert.equal(t.degenerate, 0);
    assert.ok(volume(m.position, m.index) > 0, 'inside out');
    const used = new Uint8Array(V);
    for (const v of m.index) used[v] = 1;
    assert.equal(used.reduce((a, b) => a + b, 0), V, 'a vertex no triangle uses');
    assert.ok(T > 0);
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

test('a merged region of more than 8 arms fails the bake and names its cluster (no fallback); 7 and 8 mesh', () => {
  const edges: FixEdge[] = [
    { id: 'M', from: 'L', to: 'R', curve: (u) => [-0.12 + 0.24 * u, 0, 0], rad: () => 0.1, bones: 6 },
    ...[1.9, 2.5, -1.9, -2.5, 3.14].map((ang, i): FixEdge => ({ id: `L${i}`, from: 'L', to: `l${i}`, curve: out(-0.12, ang, 2), rad: () => 0.06 })),
    ...[0.5, 0.9, -0.6, 0].map((ang, i): FixEdge => ({ id: `R${i}`, from: 'R', to: `r${i}`, curve: out(0.12, ang, 2), rad: () => 0.06 })),
  ];
  const skel = makeSkeleton(ids(['L', 'R', 'l0', 'l1', 'l2', 'l3', 'l4', 'r0', 'r1', 'r2', 'r3']), edges);
  assert.throws(() => buildNetMesh(skel), (e: unknown) => e instanceof NetMeshError && e.node === 'L+R' && /9 arms/.test(e.message));
  // the same cluster with 8 arms meshes (the skin builder's arm limit is raised for it, see SkinJunction.maxArms)
  const eight = makeSkeleton(ids(['L', 'R', 'l0', 'l1', 'l2', 'l3', 'r0', 'r1', 'r2', 'r3']), edges.filter((e) => e.id !== 'L4'));
  assert.doesNotThrow(() => buildNetMesh(eight));
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
    for (const nd of fx.skel.nodes) for (const x of nd.edges) { const e = fx.skel.edges[x.edge]!; endBone.add(x.end === 0 ? e.bones[0] : e.bones[0] + e.bones[1] - 1); }   // (the free ends' domes and the domes of the arms' extensions at their nodes)
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

/** The distance from the axis (x, 0, 0) to the mesh along the ray at azimuth `th`, in the plane at x (the OUTERMOST hit: the arms' tubes run on inside the fillet, so the nearer ones are the hidden extensions), or Infinity. */
function radiusAt(m: { position: Float32Array; index: Uint32Array }, x: number, th: number): number {
  const dy = Math.cos(th), dz = Math.sin(th);
  let best = -1;
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
    if (s > best) best = s;
  }
  return best < 0 ? Infinity : best;
}

for (const name of ['T', 'FOUR', 'STUB', 'TT', 'HT']) {
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
  for (const k of ['position', 'bone', 'weight', 'offset', 'normal', 'offsetMap', 'bakeScale', 'index'] as const) assert.deepEqual(Array.from(back.mesh[k]!), Array.from(m[k]!), k);
  assert.equal(back.mesh.keys, undefined, 'no states, no keys');
  // keys round-trip too (net/keys.ts)
  const E = fx.skel.edges.length, states = [0.4, 0.7, 1.15].map((x) => Array.from({ length: E }, () => x)), kr = buildNetMesh(fx.skel, undefined, { states, maps: true }), keyed = kr.mesh, kb = decodeNet(encodeNet(keyed, digest, kr.nodes))!;
  assert.ok(keyed.keys && keyed.keys.length > 0);
  assert.deepEqual(kb.mesh.keys!.map((r) => [r.node, r.vertStart, r.vertCount, r.arms, r.keys.map((k) => [k.state, k.swell.map((x) => Math.fround(x)), Array.from(k.offset), Array.from(k.offsetMap)])]), keyed.keys!.map((r) => [r.node, r.vertStart, r.vertCount, r.arms, r.keys.map((k) => [k.state, k.swell.map((x) => Math.fround(x)), Array.from(k.offset), Array.from(k.offsetMap)])]));
  assert.deepEqual(kb.nodes.map((n) => [n.node, n.variant, n.switchT, n.vertStart, n.triStart]), kr.nodes.filter((n) => n.kind === 'junction').map((n) => [n.node, n.variant, n.switchT, n.vertStart, n.triStart]), 'the junction reports with their variants and windows ride in the file');
  assert.equal(decodeNet(new ArrayBuffer(32)), null);
  const moved = fixtures().find((f) => f.name === 'FOUR')!.skel;
  moved.bones[3]!.pos[0] = [9, 9, 9];
  assert.notEqual(skeletonDigest(moved), digest);
});

test('every through pair, merged or not, is judged by the no-neck rule on the union it is meshed on, and none necks', () => {
  let pairs = 0;
  for (const fx of fixtures()) {
    const r = buildNetMesh(fx.skel);
    for (const nd of r.nodes) for (const p of nd.through) { pairs++; assert.ok(p.margin >= 1, `${fx.name} ${nd.node}: the pair's profile is at ${p.margin.toFixed(3)} of the floor`); }
  }
  assert.ok(pairs >= 5, `${pairs} through pairs checked`);
  const ht = buildNetMesh(fixtures().find((f) => f.name === 'HT')!.skel).nodes[0]!;
  assert.equal(ht.through.length, 1, 'the pair across the short edge is found');
  assert.equal(ht.arms.length, 4);
  assert.ok(ht.through[0]!.toggled && ht.through[0]!.mated, 'across a merged short edge the plain union bulges at each node, so the pair becomes one capsule, mated');
  const t = buildNetMesh(fixtures().find((f) => f.name === 'T')!.skel).nodes[0]!;
  assert.ok(t.through[0]!.mated && !t.through[0]!.toggled, 'at one node the pair is the mate minimum');
});

test('the neck rule itself: a continuous run passes, a gap, a pinch and a ledge (as a bulge) fail', async () => {
  const { throughNeck } = await import('../src/scene/vessels/net/neck.ts');
  const { armCapsule, skinKOf } = await import('../src/scene/vessels/skin/sdf.ts');
  const arm = { vesselId: 'x', end: 0 as const, courseIndex: 0, dataIndex: 0, lensIndex: 0, baseD: 1, widthKind: 0 as const, restR: 0.1 };
  const cap = (x0: number, x1: number, r0: number, r1: number) => armCapsule(arm, [[x0, 0, 0], [x1, 0, 0]], Math.abs(x1 - x0), (d) => r0 + (r1 - r0) * (d / Math.abs(x1 - x0)));
  const axis: [number, number, number][] = [[-0.5, 0, 0], [0.5, 0, 0]], k = skinKOf([arm]);
  const ok = throughNeck(axis, [0.1, 0.1], [{ ...cap(0, -2, 0.1, 0.1), mate: 1 }, { ...cap(0, 2, 0.1, 0.1), mate: 0 }], k);   // (a through pair is mated: united by a plain minimum, as the mesher does)
  const bump = throughNeck(axis, [0.1, 0.1], [cap(0, -2, 0.1, 0.1), cap(0, 2, 0.1, 0.1)], k);
  assert.ok(!bump.ok, 'the plain smooth union of a through pair bulges: the rule sees it');
  assert.ok(ok.ok, ok.why);
  const gap = throughNeck(axis, [0.1, 0.1], [cap(-0.2, -2, 0.1, 0.1), cap(0.2, 2, 0.1, 0.1)], k);
  assert.ok(!gap.ok && /neck/.test(gap.why), 'two capsules with a gap between their ends are a neck');
  const pinch = throughNeck(axis, [0.1, 0.1], [cap(-0.3, -2, 0.1, 0.1), cap(0.3, 2, 0.1, 0.1), cap(-0.3, 0.3, 0.06, 0.06)], k);
  assert.ok(!pinch.ok, 'a thin bridge between two fat arms is a neck');
  // a pair whose radius is smaller at the node than at the narrower arm's far end is a taper of the vessel, not a neck (real figure, CONF: the trunk is 0.0245 at the node and 0.0255 further out): the floor is the pair's own radius there
  const taperAxis: [number, number, number][] = [[-2, 0, 0], [0, 0, 0], [2, 0, 0]], taper = throughNeck(taperAxis, [0.1, 0.085, 0.1], [{ ...cap(0, -2, 0.085, 0.1), mate: 1 }, { ...cap(0, 2, 0.085, 0.1), mate: 0 }], k);
  assert.ok(taper.ok, taper.why);
  const ledge = throughNeck(axis, [0.1, 0.07], [cap(0, -2, 0.1, 0.1), cap(0, 2, 0.07, 0.07)], k);
  assert.ok(!ledge.ok && /bulge/.test(ledge.why), 'a step from 0.1 to 0.07 is not a neck, but the union humps where the two meet: a bulge (the slope check is gone; the ceiling sees it)');
});

// THE GATE IS JUDGED AT THE REAL STATES, SO THE BAKE RADIUS DOES NOT MOVE IT (plan owner, 22 Nov): the same live vessel baked at max / f for f from 1.1 to 1.3 (the skeleton's radii R / f, every state's swell f) gets the same through-pair verdict and
// margin, and meshes. A cliff at some f (a pair that passed at one bake radius and necked at another) fails here.
test('the neck gate reads the live radii: its verdict and margin do not change with the bake factor (1.1 to 1.3)', () => {
  const live = (u: number, a: number, b: number): number => a + (b - a) * u;
  for (const [ra, rb] of [[0.1, 0.1], [0.1, 0.104], [0.104, 0.1], [0.1, 0.096]] as const) {
    const out: { f: number; margin: number; mated: boolean; toggled: boolean }[] = [];
    for (const f of [1.1, 1.15, 1.2, 1.25, 1.3]) {
      const skel = makeSkeleton([{ id: 'N', runOn: ['TR0', 'TR1'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }], [
        { id: 'TR0', from: 'a', to: 'N', curve: (u) => [-3 + 3 * u, 0, 0], rad: (u) => live(u, ra, ra) / f },
        { id: 'TR1', from: 'N', to: 'b', curve: (u) => [3 * u, 0, 0], rad: (u) => live(u, rb, rb) / f },
        { id: 'BR', from: 'N', to: 'c', curve: (u) => [3 * u * Math.cos(1.2), 3 * u * Math.sin(1.2), 0], rad: () => 0.04 / f },
      ]);
      const res = buildNetMesh(skel, undefined, { states: [[f, f, f], [f * 0.9, f * 0.9, f * 0.9]] }), th = res.nodes[0]!.through[0];
      assert.ok(th, `through pair judged at f ${f}`);
      out.push({ f, margin: th!.margin, mated: th!.mated, toggled: th!.toggled });
    }
    for (const o of out) {
      assert.equal(o.mated, out[0]!.mated, `mate choice moves with the bake factor (${ra}/${rb}): ${JSON.stringify(out)}`);
      assert.equal(o.toggled, out[0]!.toggled, `toggle moves with the bake factor: ${JSON.stringify(out)}`);
      assert.ok(Math.abs(o.margin - out[0]!.margin) < 0.01, `margin moves with the bake factor (${ra}/${rb}): ${JSON.stringify(out)}`);
    }
  }
});

// ---- the real figure's lessons (WP0's skeleton, 22 Nov): what the first run on it broke, each pinned at its root ----
{
  const lin2 = (a: number, b: number) => (u: number): number => a + (b - a) * u;
  const dirAt = (deg: number): [number, number, number] => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 0];
  const along = (o: number[], d: number[], len: number) => (u: number): [number, number, number] => [o[0]! + d[0]! * len * u, o[1]! + d[1]! * len * u, o[2]! + d[2]! * len * u];
  const arc = (R: number, a0: number, a1: number, cx: number, cy: number) => (u: number): [number, number, number] => { const a = ((a0 + (a1 - a0) * u) * Math.PI) / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a), 0]; };
  const H = (L: number, A: number) => makeSkeleton([{ id: 'L' }, { id: 'R' }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [
    { id: 'M', from: 'L', to: 'R', curve: (u) => [-L / 2 + L * u, 0, 0], rad: lin2(0.1, 0.1), bones: 12 },
    { id: 'La', from: 'L', to: 'a', curve: along([-L / 2, 0, 0], dirAt(A), 2), rad: lin2(0.07, 0.06) },
    { id: 'Lb', from: 'L', to: 'b', curve: along([-L / 2, 0, 0], dirAt(-A), 2), rad: lin2(0.07, 0.06) },
    { id: 'Rc', from: 'R', to: 'c', curve: along([L / 2, 0, 0], dirAt(180 - A), 2), rad: lin2(0.07, 0.06) },
    { id: 'Rd', from: 'R', to: 'd', curve: along([L / 2, 0, 0], dirAt(A - 180), 2), rad: lin2(0.07, 0.06) },
  ]);
  const junctions = (skel: ReturnType<typeof H>): string[] => buildNetMesh(skel).nodes.filter((n) => n.kind === 'junction').map((n) => n.node);

  test('the neck rule measures about the capsules the union is made of, so a trunk on a tight arc is not read as a neck (real figure: SMV_R, IMV, CONF read 4 % necks off the bones\' line)', () => {
    // a trunk bending on an arc of 3.5 radii, a thin branch at the node: the chords of the capsules cut the arc's corner, the bones' polyline does not
    const skel = makeSkeleton([{ id: 'N', runOn: ['T0', 'T1'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }], [
      { id: 'T0', from: 'a', to: 'N', curve: arc(0.35, 180, 90, 0.35, 0), rad: lin2(0.1, 0.1), bones: 40 },
      { id: 'T1', from: 'N', to: 'b', curve: arc(0.35, 90, 0, 0.35, 0), rad: lin2(0.1, 0.1), bones: 40 },
      { id: 'BR', from: 'N', to: 'c', curve: along([0.35, 0.35, 0], dirAt(80), 3), rad: lin2(0.04, 0.03) },
    ]);
    const nd = buildNetMesh(skel).nodes[0]!;
    assert.ok(nd.through[0]!.margin >= 1, `the arc's pair is at ${nd.through[0]!.margin.toFixed(3)} of the floor`);
  });

  test('two junctions an edge cannot keep apart merge, though the edge is longer than the blend zones plus the radii; a grazing branch needs the room (real figure: the portal trunk\'s landings)', () => {
    // a thin branch leaving the trunk 10 degrees off its line needs the trunk's seam far out, and a second junction 0.8 down the trunk (more than kA + kB + RA + RB) has no room left for its own
    const trunk = (gap: number, ang: number) => makeSkeleton([{ id: 'N', runOn: ['T0', 'T1'] }, { id: 'M', runOn: ['T1', 'T2'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [
      { id: 'T0', from: 'a', to: 'N', curve: (u) => [-3 + 3 * u, 0, 0], rad: lin2(0.1, 0.1) },
      { id: 'T1', from: 'N', to: 'M', curve: (u) => [gap * u, 0, 0], rad: lin2(0.1, 0.1), bones: 16 },
      { id: 'T2', from: 'M', to: 'b', curve: (u) => [gap + 3 * u, 0, 0], rad: lin2(0.1, 0.1) },
      { id: 'G', from: 'N', to: 'c', curve: along([0, 0, 0], dirAt(ang), 3), rad: lin2(0.04, 0.03) },
      { id: 'P', from: 'M', to: 'd', curve: along([gap, 0, 0], dirAt(-90), 3), rad: lin2(0.05, 0.04) },
    ]);
    assert.deepEqual(junctions(trunk(0.8, 10) as ReturnType<typeof H>), ['N+M'], 'no room between them: one region');
    assert.deepEqual(junctions(trunk(1.2, 14) as ReturnType<typeof H>), ['N', 'M'], 'room enough: two');
    // (and a fillet is never left with a sliver: flips and a relax on the same union clean what the remesh leaves)
    for (const A of [155, 160, 165, 170]) { const r = buildNetMesh(H(0.32, A)); assert.deepEqual(shellProblems(r), [], `A=${A}: closed and consistently wound`); }
  });

  test('an edge the MAP pose collapses merges its two junctions, though the body pose keeps them apart (real figure: the five zero-length map pieces)', () => {
    const skel = H(1, 140);
    assert.deepEqual(junctions(skel), ['L', 'R'], 'a long edge keeps them apart');
    const e = skel.edges.find((x) => x.id === 'M')!, p = skel.bones[e.bones[0]]!.pos[1];
    for (let i = 0; i < e.bones[1]; i++) skel.bones[e.bones[0] + i]!.pos[1] = [...p];   // (collapsed to a point in the map)
    for (const nd of skel.nodes) if (nd.id === 'L' || nd.id === 'R') nd.pos[1] = [...p];
    const r = buildNetMesh(skel);
    assert.deepEqual(r.nodes.filter((n) => n.kind === 'junction').map((n) => n.node), ['L+R']);
    const P = deform(r.mesh, skel, 1);
    for (let i = 0; i < P.length; i++) assert.ok(Number.isFinite(P[i]!), 'no NaN at the map pose');
  });

  test('a run-on node a junction cannot be kept apart from joins its region, and the arm leaves from it (real figure: the cava landings between short pieces)', () => {
    // three thin landings 0.14 apart on a trunk: one region, five arms (the trunk's two ends and three branches)
    const xs = [0, 0.14, 0.28];
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c0' }, { id: 'c1' }, { id: 'c2' }, ...[0, 1, 2].map((i) => ({ id: `l${i}`, runOn: [`T${i}`, `T${i + 1}`] as [string, string] }))];
    const x = [-3, ...xs, 3], names = ['a', 'l0', 'l1', 'l2', 'b'];
    const edges: FixEdge[] = [0, 1, 2, 3].map((i) => ({ id: `T${i}`, from: names[i]!, to: names[i + 1]!, curve: (u: number): [number, number, number] => [x[i]! + (x[i + 1]! - x[i]!) * u, 0, 0], rad: lin2(0.1, 0.1) }));
    for (let i = 0; i < 3; i++) edges.push({ id: `B${i}`, from: `l${i}`, to: `c${i}`, curve: along([xs[i]!, 0, 0], dirAt(i % 2 ? -60 : 60), 2), rad: lin2(0.04, 0.03) });
    const r = buildNetMesh(makeSkeleton(nodes, edges));
    const jn = r.nodes.filter((n) => n.kind === 'junction');
    assert.equal(jn.length, 1);
    assert.equal(jn[0]!.arms.length, 5);
  });

  test('a node whose two edges differ in radius is a step, not a run-on: a thin vessel ending in the start of a fat one has no flat shoulder (real figure: MHV, LGV, LPV, GV)', () => {
    for (const [r0, r1] of [[0.04, 0.1], [0.06, 0.1]] as const) {
      const skel = makeSkeleton([{ id: 'N', runOn: ['A', 'B'] }, { id: 'a' }, { id: 'b' }], [
        { id: 'A', from: 'a', to: 'N', curve: (u) => [-2 + 2 * u, 0, 0], rad: lin2(r0, r0) },
        { id: 'B', from: 'N', to: 'b', curve: (u) => [2 * u, 0, 0], rad: lin2(r1, r1) },
      ]);
      const r = buildNetMesh(skel);
      assert.deepEqual(shellProblems(r), [], 'closed and wound');
      assert.deepEqual(r.nodes.filter((n) => n.kind === 'junction').map((n) => n.arms.length), [2], 'one junction of two arms');
      assert.equal(r.nodes.find((n) => n.kind === 'junction')!.through.length, 0, 'and no through pair');
      // the profile along the axis rises from the thin radius to the fat one over a stretch, not in one ring spacing: the largest radius change per ring step (about 1.5 radii) stays under half a radius
      const xs: number[] = [], prof: number[] = [];
      for (let x = -0.6; x <= 0.6; x += 0.02) { const rs = [0, 1, 2, 3, 4, 5, 6, 7].map((q) => radiusAt(r.mesh, x, (q * Math.PI) / 4 + 0.2)).filter(Number.isFinite).sort((p, q) => p - q); if (rs.length) { xs.push(x); prof.push(rs[0]!); } }
      let worst = 0;
      for (let i = 1; i < prof.length; i++) worst = Math.max(worst, Math.abs(prof[i]! - prof[i - 1]!) / 0.02);
      assert.ok(worst < 1.2, `the radius changes by ${worst.toFixed(2)} per unit length at its steepest (a flat shoulder is a jump)`);
    }
  });

  test('a lenient run lists the regions that will not mesh and builds the rest; the strict one throws (the bake is strict)', () => {
    const edges: FixEdge[] = [
      { id: 'M', from: 'L', to: 'R', curve: (u) => [-0.12 + 0.24 * u, 0, 0], rad: () => 0.1, bones: 6 },
      ...[1.9, 2.5, -1.9, -2.5, 3.14].map((ang, i): FixEdge => ({ id: `L${i}`, from: 'L', to: `l${i}`, curve: along([-0.12, 0, 0], [Math.cos(ang), Math.sin(ang), 0], 2), rad: () => 0.06 })),
      ...[0.5, 0.9, -0.6, 0].map((ang, i): FixEdge => ({ id: `R${i}`, from: 'R', to: `r${i}`, curve: along([0.12, 0, 0], [Math.cos(ang), Math.sin(ang), 0], 2), rad: () => 0.06 })),
    ];
    const skel = makeSkeleton([...['L', 'R', 'l0', 'l1', 'l2', 'l3', 'l4', 'r0', 'r1', 'r2', 'r3'].map((id) => ({ id }))], edges);
    assert.throws(() => buildNetMesh(skel), NetMeshError);
    const r = buildNetMesh(skel, undefined, { lenient: true });
    assert.equal(r.failures.length, 1);
    assert.match(r.failures[0]!.why, /9 arms/);
  });
}

// THE ARMS RUN ON TO THE NODE (plan owner, 22 Nov): each arm's sweep continues past its seam ring to the node and ends in a dome, in the same mesh, so the junction is still whole when the fillet dissolves during the Circuit move. At rest the smooth union holds every capsule,
// so every vertex of an extension lies within the union (the depth test hides it under the fillet), and the extension reaches the node end bone.
import { sdUnion, SKIN_K } from '../src/scene/vessels/skin/sdf.ts';
for (const fx of fixtures()) {
  const r = buildNetMesh(fx.skel), m = r.mesh, regions = r.nodes.filter((n) => n.kind === 'junction' && n.caps);
  if (!regions.length) continue;
  test(`${fx.name}: the arms run on past their seam rings to the node, inside the fillet`, () => {
    const inRegion = new Uint8Array(m.index.length / 3);
    for (const n of regions) inRegion.fill(1, n.triStart, n.triStart + n.triCount);
    const tubeVert = new Uint8Array(m.position.length / 3);
    for (let t = 0; t < inRegion.length; t++) if (!inRegion[t]) for (let s = 0; s < 3; s++) tubeVert[m.index[3 * t + s]!] = 1;
    for (const n of regions) {
      const caps = n.caps!.map((c) => ({ n: c.pts.length / 3, pts: Float64Array.from(c.pts), r: Float64Array.from(c.r), ...(c.mate >= 0 ? { mate: c.mate } : {}) })), k = SKIN_K * Math.min(...n.caps!.flatMap((c) => c.r));
      let reached = 0;
      n.arms.forEach((edge, i) => {
        const e = fx.skel.edges[edge]!, [first, count] = e.bones, end: 0 | 1 = n.node.split('+').includes(e.from) ? 0 : 1;
        const seamBone = end === 0 ? first + n.seams[i]! : first + count - 1 - n.seams[i]!, nodeBone = end === 0 ? first : first + count - 1, inside = (b: number): boolean => (end === 0 ? b <= seamBone : b >= seamBone);
        let worst = 0, any = 0;
        for (let v = 0; v < tubeVert.length; v++) {
          if (!tubeVert[v] || m.weight[4 * v]! < 1 - 1e-6) continue;
          const b = m.bone[4 * v]!;
          if (b < first || b >= first + count || !inside(b) || b === seamBone) continue;
          any++; if (b === nodeBone) reached++;
          const R = fx.skel.bones[b]!.r[0], x = m.position[3 * v]!, y = m.position[3 * v + 1]!, z = m.position[3 * v + 2]!;
          worst = Math.max(worst, sdUnion(caps, k, x, y, z) / R);
        }
        assert.ok(any > 0, `${n.node} arm ${e.id}: has extension vertices from its seam to the node`);
        assert.ok(worst < 0.03, `${n.node} arm ${e.id}: the extension lies within the union at rest (worst ${worst.toFixed(3)} R outside)`);
      });
      assert.ok(reached > 0, `${n.node}: an extension reaches the node's end bone`);
    }
  });
}

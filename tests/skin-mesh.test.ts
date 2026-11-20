// WP2 of the junction skins (docs: junction-skin-spec.md 4.3 to 4.5): the smooth-union SDF and the skin mesh builder, on synthetic junctions: a Y (three equal capsules at 120 degrees),
// a T (a thin branch at 70 degrees on a straight trunk, radius ratio 0.4), a T with a short stub branch (4 radii long, like PVH_R) and a 4-arm junction (a straight trunk with two side
// branches 4 trunk radii apart, on opposite sides). The seam rings sit where the spec's clearance rule (4.4.1, as amended: other arms at least k + 0.5 R away) puts them.
// No scene, no browser: numbers in, numbers out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';
import { ARM_REACH, SKIN_K, armCapsule, closestOnArm, gradient, sdArm, sdArmGrad, sdUnion, sdUnionGrad, skinKOf, smin, weights, type Capsule } from '../src/scene/vessels/skin/sdf.ts';
import { SkinBuildError, buildSkin, hullCovers, minAngleDeg } from '../src/scene/vessels/skin/mesh.ts';
import type { SkinArm, SkinCut, SkinJunction, Vec3 } from '../src/scene/vessels/skin/types.ts';

const N = TUBE_RADIAL;
const deg = (a: number) => (a * Math.PI) / 180;
const unit = (v: readonly number[]): Vec3 => { const l = Math.hypot(v[0]!, v[1]!, v[2]!); return [v[0]! / l, v[1]! / l, v[2]! / l]; };
const arm = (id: string, R: number): SkinArm => ({ vesselId: id, end: 0, courseIndex: 0, dataIndex: 0, lensIndex: 0, baseD: 1, widthKind: 0, restR: R });

/** A tube ring of radius R round the axis `dir` centred at `c`: N vertices xyz and the radial normals (what the built tube has at a ring). */
function ring(c: Vec3, dir: Vec3, R: number, phase: number): { p: Float32Array; n: Float32Array } {
  const t = unit(dir), up: Vec3 = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = unit([t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]]);
  const v: Vec3 = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  const p = new Float32Array(3 * N), n = new Float32Array(3 * N);
  for (let j = 0; j < N; j++) {
    const a = phase + (2 * Math.PI * j) / N, co = Math.cos(a), si = Math.sin(a);
    for (let k = 0; k < 3; k++) { const rad = co * u[k]! + si * v[k]!; n[3 * j + k] = rad; p[3 * j + k] = c[k]! + rad * R; }
  }
  return { p, n };
}

interface ArmSpec { origin?: Vec3; dir: Vec3; R: number; /** the length of the arm's own course from its node (default long) */ course?: number }
interface Fixture { j: SkinJunction; cuts: SkinCut[]; rings: Float32Array[]; normals: Float32Array[]; caps: Capsule[]; radii: number[]; seams: number[]; specs: ArmSpec[] }
const J: Vec3 = [0, 0, 0];
/** Build the arms' capsules, then put each arm's seam ring at the first distance (at least 1.5 R from J) where every ring vertex is at least k + 0.5 R outside every other arm. */
function fixture(node: string, specs: ArmSpec[]): Fixture {
  const arms = specs.map((s, i) => arm(`${node}_${i}`, s.R)), k = skinKOf(arms);
  const dirs = specs.map((s) => unit(s.dir));
  const caps = arms.map((a, i) => {
    const o = specs[i]!.origin ?? J, len = specs[i]!.course ?? 3, d = dirs[i]!;
    return armCapsule(a, [o, [o[0] + d[0] * len, o[1] + d[1] * len, o[2] + d[2] * len]], Math.max(ARM_REACH * a.restR, 1.5), undefined, J);
  });
  const rings: Float32Array[] = [], normals: Float32Array[] = [], seams: number[] = [];
  specs.forEach((s, i) => {
    const o = s.origin ?? J;
    for (let d = Math.max(1.5 * s.R, 1.5 * s.R - Math.hypot(...o)); d < 3; d += 0.002) {
      const c: Vec3 = [o[0] + dirs[i]![0] * d, o[1] + dirs[i]![1] * d, o[2] + dirs[i]![2] * d];
      if (Math.hypot(c[0] - J[0], c[1] - J[1], c[2] - J[2]) < 1.5 * s.R) continue;
      const r = ring(c, dirs[i]!, s.R, 0.3 * i);
      let ok = true;
      for (let j = 0; j < N && ok; j++) for (let q = 0; q < caps.length; q++) if (q !== i && sdArm(caps[q]!, r.p[3 * j]!, r.p[3 * j + 1]!, r.p[3 * j + 2]!) < k + 0.5 * s.R) { ok = false; break; }
      if (ok) { rings.push(r.p); normals.push(r.n); seams.push(d); return; }
    }
    throw new Error(`no seam for arm ${i}`);
  });
  const cuts = arms.map((a, i): SkinCut => ({ vesselId: a.vesselId, end: 0, ring: i, u: 0.5 }));
  return { j: { node, J, arms }, cuts, rings, normals, caps, radii: specs.map((s) => s.R), seams, specs };
}
const Y = () => fixture('Y', [0, 1, 2].map((i): ArmSpec => ({ dir: [Math.cos(deg(120 * i)), Math.sin(deg(120 * i)), 0], R: 0.1 })));
const T = () => fixture('T', [{ dir: [1, 0, 0], R: 0.1 }, { dir: [-1, 0, 0], R: 0.1 }, { dir: [Math.cos(deg(70)), Math.sin(deg(70)), 0], R: 0.04 }]);
const STUB = () => fixture('STUB', [{ dir: [1, 0, 0], R: 0.1 }, { dir: [-1, 0, 0], R: 0.1 }, { dir: [Math.cos(deg(80)), Math.sin(deg(80)), 0], R: 0.08, course: 0.32 }]);
const FOUR = () => fixture('FOUR', [
  { dir: [1, 0, 0], R: 0.1 }, { dir: [-1, 0, 0], R: 0.1 },
  { origin: [0.2, 0, 0], dir: [0, 1, 0], R: 0.04 }, { origin: [-0.2, 0, 0], dir: [0, -1, 0], R: 0.04 },
]);
const FIXTURES: [string, () => Fixture][] = [['Y', Y], ['T', T], ['short stub', STUB], ['4 arms', FOUR]];

const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const edgeUse = (index: Uint32Array) => {
  const m = new Map<string, number>();
  for (let i = 0; i < index.length; i += 3) for (let s = 0; s < 3; s++) { const k = edgeKey(index[i + s]!, index[i + (s + 1) % 3]!); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
};

test('the ring size the builder assumes is the tube\'s', () => { assert.equal(N, 14); });

test('smooth-min: equals the smaller value far from the blend, dips below both at a tie by k / 4, and is symmetric', () => {
  assert.equal(smin(1, 5, 0.5), 1);
  assert.equal(smin(5, 1, 0.5), 1);
  assert.ok(Math.abs(smin(2, 2, 0.8) - (2 - 0.8 / 4)) < 1e-12);
  for (const [a, b] of [[0.3, 0.5], [-0.2, 0.1], [1, 1.2]] as const) assert.ok(Math.abs(smin(a, b, 0.4) - smin(b, a, 0.4)) < 1e-12 && smin(a, b, 0.4) <= Math.min(a, b));
});

test('SKIN_K is the spec\'s 0.8 and the blend width follows the narrowest arm', () => {
  assert.equal(SKIN_K, 0.8);
  assert.ok(Math.abs(skinKOf([arm('a', 0.1), arm('b', 0.04), arm('c', 0.1)]) - 0.032) < 1e-12);
});

test('an arm capsule runs from J outward whichever end of the vessel is at the node, and carries the radius profile', () => {
  const a1: SkinArm = { ...arm('v', 0.1), end: 1 }, pts: Vec3[] = [[1, 0, 0], [0.5, 0, 0], [0, 0, 0]];
  const c = armCapsule(a1, pts, 0.6, (d) => 0.1 + d * 0.1, J);
  assert.deepEqual([c.pts[0], c.pts[1], c.pts[2]], [0, 0, 0]);
  assert.ok(Math.abs(c.pts[3 * (c.n - 1)]! - 0.6) < 1e-9, 'it runs 0.6 out along +x');
  assert.ok(Math.abs(c.r[c.n - 1]! - 0.16) < 1e-9);
  assert.ok(Math.abs(sdArm(c, 0.3, 0.2, 0) - (0.2 - 0.13)) < 1e-9, 'distance to the axis minus the radius there');
});

test('the exact gradient agrees with central differences, away from the creases', () => {
  const f = T(), k = skinKOf(f.j.arms), g = new Float64Array(3), h = new Float64Array(3);
  for (const p of [[0.3, 0.12, 0.02], [0.05, 0.3, 0.01], [-0.3, 0.14, 0.05], [0.1, 0.1, 0.1], [0.5, -0.2, 0.0]] as const) {
    sdUnionGrad(f.caps, k, p[0], p[1], p[2], g);
    gradient(f.caps, k, p[0], p[1], p[2], 1e-6, h);
    for (let d = 0; d < 3; d++) assert.ok(Math.abs(g[d]! - h[d]!) < 1e-4, `${p} axis ${d}: ${g[d]} vs ${h[d]}`);
    assert.ok(Math.abs(sdUnionGrad(f.caps, k, p[0], p[1], p[2], g) - sdUnion(f.caps, k, p[0], p[1], p[2])) < 1e-12);
  }
  const t = armCapsule(arm('t', 0.1), [J, [1, 0, 0]], 1, (d) => 0.1 - d * 0.05, J);   // a tapered arm's gradient counts the taper
  sdArmGrad(t, 0.4, 0.2, 0, g);
  const e = 1e-6, num = (sdArm(t, 0.4, 0.2 + e, 0) - sdArm(t, 0.4, 0.2 - e, 0)) / (2 * e);
  assert.ok(Math.abs(g[1]! - num) < 1e-5);
});

test('weights sum to 1, favour the nearest arm and are 1 deep in an arm\'s own stretch', () => {
  const f = T(), k = skinKOf(f.j.arms), w = new Float64Array(4);
  weights(f.caps, k, 0.9, 0.05, 0, w);
  assert.ok(Math.abs(w[0]! + w[1]! + w[2]! + w[3]! - 1) < 1e-12 && w[0]! > 0.999 && w[3] === 0);
  weights(f.caps, k, 0.2, 0.7, 0, w);   // out along the branch
  assert.ok(w[2]! > 0.999);
});

for (const [name, make] of FIXTURES) {
  const fx = make(), k = skinKOf(fx.j.arms), minR = Math.min(...fx.radii), A = fx.j.arms.length;
  const build = (axes?: readonly Capsule[]) => buildSkin(fx.j, fx.cuts, fx.rings, fx.normals, axes);
  const skin = build(fx.caps), V = skin.position.length / 3;
  if (process.env.SKIN_DEBUG) console.log(name, 'V', V, 'tris', skin.index.length / 3, 'seams', fx.seams.map((d) => d.toFixed(3)).join(' '));
  const P = (v: number): Vec3 => [skin.position[3 * v]!, skin.position[3 * v + 1]!, skin.position[3 * v + 2]!];
  const seamSet = new Set<number>(skin.seamVerts.flatMap((a) => [...a]));

  test(`${name}: the seam rings sit at the clearance rule's distance and inside each arm's own course`, () => {
    fx.seams.forEach((d, i) => { assert.ok(d >= 1.5 * fx.radii[i]! - 1e-9); const c = fx.specs[i]!.course; if (c) assert.ok(d < c, `ring ${d} past a course of ${c}`); });
  });

  test(`${name}: watertight, every interior edge on 2 triangles and every seam edge on exactly 1`, () => {
    const use = edgeUse(skin.index), ringEdges = new Set<string>();
    for (const sv of skin.seamVerts) for (let j = 0; j < sv.length; j++) ringEdges.add(edgeKey(sv[j]!, sv[(j + 1) % sv.length]!));
    for (const [e, c] of use) assert.equal(c, ringEdges.has(e) ? 1 : 2, `edge ${e}`);
    for (const e of ringEdges) assert.equal(use.get(e), 1, `seam edge ${e}`);
  });

  test(`${name}: no triangle has all 3 vertices on one ring, and every ring vertex is used`, () => {
    for (let i = 0; i < skin.index.length; i += 3) {
      const rings = [0, 1, 2].map((s) => { const v = skin.index[i + s]!; return v < A * N ? Math.floor(v / N) : -1; });
      assert.ok(!(rings[0]! >= 0 && rings[0] === rings[1] && rings[1] === rings[2]), `triangle ${i / 3}`);
    }
    const used = new Set<number>(skin.index);
    for (const v of seamSet) assert.ok(used.has(v));
  });

  test(`${name}: seam vertices equal the input rings bit for bit, with the tube's normals and weight 1 on their own arm`, () => {
    skin.seamVerts.forEach((ids, a) => ids.forEach((v, j) => {
      assert.equal(v, a * N + j);
      for (let c = 0; c < 3; c++) {
        assert.equal(skin.position[3 * v + c], fx.rings[a]![3 * j + c]);
        assert.equal(skin.normal[3 * v + c], fx.normals[a]![3 * j + c]);
      }
      for (let i = 0; i < 4; i++) assert.equal(skin.weight[4 * v + i], i === a ? 1 : 0);
    }));
  });

  test(`${name}: every free vertex lies on the smooth union (within 2 % of the narrowest radius)`, () => {
    for (let v = 0; v < V; v++) {
      if (seamSet.has(v)) continue;
      const [x, y, z] = P(v), sd = sdUnion(fx.caps, k, x, y, z);
      assert.ok(Math.abs(sd) < 0.02 * minR, `vertex ${v}: sd ${sd}`);
    }
  });

  test(`${name}: weights sum to 1 and unused arms have weight 0`, () => {
    for (let v = 0; v < V; v++) {
      let s = 0;
      for (let i = 0; i < 4; i++) { const w = skin.weight[4 * v + i]!; s += w; if (i >= A) assert.equal(w, 0); }
      assert.ok(Math.abs(s - 1) < 1e-5, `vertex ${v}: ${s}`);
    }
  });

  test(`${name}: winding is outward (the face normal agrees with every vertex normal), and the normals are unit`, () => {
    for (let v = 0; v < V; v++) assert.ok(Math.abs(Math.hypot(skin.normal[3 * v]!, skin.normal[3 * v + 1]!, skin.normal[3 * v + 2]!) - 1) < 1e-4, `normal ${v}`);
    for (let i = 0; i < skin.index.length; i += 3) {
      const [a, b, c] = [skin.index[i]!, skin.index[i + 1]!, skin.index[i + 2]!], A3 = P(a), B = P(b), C = P(c);
      const e1 = [B[0] - A3[0], B[1] - A3[1], B[2] - A3[2]], e2 = [C[0] - A3[0], C[1] - A3[1], C[2] - A3[2]];
      const f = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      for (const v of [a, b, c]) assert.ok(f[0]! * skin.normal[3 * v]! + f[1]! * skin.normal[3 * v + 1]! + f[2]! * skin.normal[3 * v + 2]! > 0, `triangle ${i / 3} vertex ${v}`);
    }
  });

  test(`${name}: no bulb (no vertex is farther from every axis than 1.05 x the widest radius plus the fillet allowance k)`, () => {
    const lim = 1.05 * Math.max(...fx.radii) + k, out = new Float64Array(7);
    for (let v = 0; v < V; v++) {
      const [x, y, z] = P(v);
      let near = Infinity;
      for (const c of fx.caps) near = Math.min(near, closestOnArm(c, x, y, z, out));
      assert.ok(near < lim, `vertex ${v}: ${near} from the nearest axis, limit ${lim}`);
    }
  });

  test(`${name}: the smallest triangle angle is above 12 degrees (the cel bands stay even)`, () => {
    let lo = 180;
    for (let i = 0; i < skin.index.length; i += 3) lo = Math.min(lo, minAngleDeg(skin.position, skin.index[i]!, skin.index[i + 1]!, skin.index[i + 2]!));
    if (process.env.SKIN_DEBUG) console.log(name, 'smallest angle', lo.toFixed(1));
    assert.ok(lo > 12, `smallest angle ${lo.toFixed(1)}`);
  });

  test(`${name}: the rest radius and nearest axis point are the arm's on its seam and near it in between`, () => {
    skin.seamVerts.forEach((ids, a) => ids.forEach((v) => assert.ok(Math.abs(skin.restR[v]! - fx.radii[a]!) < 1e-6, `seam ${a} vertex ${v}: restR ${skin.restR[v]}`)));
    for (let v = 0; v < V; v++) {
      assert.ok(skin.restR[v]! >= minR - 1e-6 && skin.restR[v]! <= Math.max(...fx.radii) + 1e-6, `restR ${v}`);
      const d = Math.hypot(skin.position[3 * v]! - skin.cen[3 * v]!, skin.position[3 * v + 1]! - skin.cen[3 * v + 1]!, skin.position[3 * v + 2]! - skin.cen[3 * v + 2]!);
      assert.ok(d < Math.max(...fx.radii) * 1.6 + k, `cen ${v}: ${d}`);
    }
  });

  test(`${name}: builds in under 60 ms in node (the fastest of 3 builds), and is deterministic`, () => {
    let best = Infinity, again = skin;
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); again = build(fx.caps); best = Math.min(best, performance.now() - t0); }
    if (process.env.SKIN_DEBUG) console.log(name, 'best of 3', best.toFixed(1), 'ms');
    assert.ok(best < 60, `${best.toFixed(1)} ms`);
    assert.deepEqual(Array.from(again.index), Array.from(skin.index));
    assert.deepEqual(Array.from(again.position), Array.from(skin.position));
  });

  test(`${name}: without axes (recovered from the rings) it is still closed, welded, outward and exact on its seams`, () => {
    const s2 = build(), use = edgeUse(s2.index);
    for (const c of use.values()) assert.ok(c === 1 || c === 2);
    assert.equal([...use.values()].filter((c) => c === 1).length, A * N);
    s2.seamVerts.forEach((ids, a) => ids.forEach((v, j) => { for (let c = 0; c < 3; c++) assert.equal(s2.position[3 * v + c], fx.rings[a]![3 * j + c]); }));
    let lo = 180;
    for (let i = 0; i < s2.index.length; i += 3) lo = Math.min(lo, minAngleDeg(s2.position, s2.index[i]!, s2.index[i + 1]!, s2.index[i + 2]!));
    assert.ok(lo > 12, `smallest angle ${lo.toFixed(1)}`);
  });

  test(`${name}: hullCovers agrees`, () => { assert.equal(hullCovers(fx.rings), true); });
}

test('a ring buried inside another arm\'s ring (arms nearly parallel, seams at the node) is a SkinBuildError, never a broken mesh', () => {
  // two arms 10 degrees apart with their rings at 1.5 R from J overlap: some ring vertices are inside the hull of the others
  const specs: ArmSpec[] = [{ dir: [1, 0, 0], R: 0.1 }, { dir: [Math.cos(deg(10)), Math.sin(deg(10)), 0], R: 0.1 }, { dir: [-1, 0, 0], R: 0.1 }];
  const arms = specs.map((s, i) => arm(`B_${i}`, s.R)), rings = specs.map((s, i) => ring([unit(s.dir)[0] * 0.15, unit(s.dir)[1] * 0.15, 0], s.dir, s.R, 0.3 * i));
  const cuts = arms.map((a, i): SkinCut => ({ vesselId: a.vesselId, end: 0, ring: i, u: 0.5 }));
  assert.equal(hullCovers(rings.map((r) => r.p)), false);
  assert.throws(() => buildSkin({ node: 'B', J, arms }, cuts, rings.map((r) => r.p), rings.map((r) => r.n)), (e: unknown) => e instanceof SkinBuildError && e.node === 'B');
});

test('seam rings far past the clearance on a thin branch (the hull bridges a deep crotch) either build a clean mesh or throw SkinBuildError', () => {
  const arms = [arm('F_0', 0.1), arm('F_1', 0.1), arm('F_2', 0.04)];
  const dirs: Vec3[] = [[1, 0, 0], [-1, 0, 0], unit([Math.cos(deg(70)), Math.sin(deg(70)), 0])];
  const rings = [0.5, 0.5, 0.4].map((d, i) => ring([dirs[i]![0] * d, dirs[i]![1] * d, dirs[i]![2] * d], dirs[i]!, arms[i]!.restR, 0.3 * i));
  const cuts = arms.map((a, i): SkinCut => ({ vesselId: a.vesselId, end: 0, ring: i, u: 0.5 }));
  try {
    const s = buildSkin({ node: 'F', J, arms }, cuts, rings.map((r) => r.p), rings.map((r) => r.n));
    const use = edgeUse(s.index);
    for (const c of use.values()) assert.ok(c === 1 || c === 2);
  } catch (e) { assert.ok(e instanceof SkinBuildError, String(e)); }
});

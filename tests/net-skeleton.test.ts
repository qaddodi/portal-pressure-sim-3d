// WP0 of the vessel-geometry plan (recs-22nov/vessel-geometry-review.md): the skeleton is the network as data, and continuity is TRUE BY CONSTRUCTION, checked here once. Root cause it pins: the scene had no node
// positions (a vessel's course ended wherever the 2D drawing ended it: 29 of 37 shared nodes had incident ends more than a radius apart), so every junction needed its own bridging code. Node only, no scene, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Vec3 } from '../src/scene/anatomy/vessels.ts';
import { COURSES } from '../src/scene/circuit/course.ts';
import { MAPPED, NETWORK, RUN_PAIRS } from '../src/scene/vessels/network.ts';
import { baseline } from '../src/scene/vessels/net/baseline.ts';
import { BONES_PER_EDGE, bonesOf, mapRadiusOf, nodeIdOf, skeleton, skeletonReport } from '../src/scene/vessels/net/skeleton.ts';

const S = skeleton();
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const angle = (a: Vec3, b: Vec3): number => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
/** The bone at an end of an edge, and the direction the edge leaves that end in, into the course (the first secant of its bones). */
const endBone = (e: number, end: 0 | 1) => S.bones[S.edges[e]!.bones[0] + (end ? BONES_PER_EDGE - 1 : 0)]!;
const into = (e: number, end: 0 | 1, pose: 0 | 1): Vec3 => {
  const f = S.edges[e]!.bones[0], a = S.bones[f + (end ? BONES_PER_EDGE - 1 : 0)]!.pos[pose], b = S.bones[f + (end ? BONES_PER_EDGE - 2 : 1)]!.pos[pose];
  return unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
};
const multi = S.nodes.filter((n) => n.edges.length >= 2);

test('the skeleton holds every drawn vessel with a map course, 64 bones each, indexed consistently', () => {
  assert.equal(S.edges.length, MAPPED.length);
  assert.equal(S.bones.length, MAPPED.length * BONES_PER_EDGE);
  assert.equal(new Set(S.edges.map((e) => e.id)).size, S.edges.length);
  S.edges.forEach((e, i) => {
    assert.equal(e.bones[1], BONES_PER_EDGE);
    const b = bonesOf(S, i);
    assert.ok(b.every((x, k) => x.edge === i && Math.abs(x.u - k / (BONES_PER_EDGE - 1)) < 1e-12), e.id);
    assert.ok(S.nodes.some((n) => n.id === e.from) && S.nodes.some((n) => n.id === e.to), `${e.id} has its nodes`);
  });
  // every node lists exactly the edge ends that name it, and no other
  for (const n of S.nodes) for (const { edge, end } of n.edges) assert.equal(end ? S.edges[edge]!.to : S.edges[edge]!.from, n.id);
  const listed = S.nodes.reduce((t, n) => t + n.edges.length, 0);
  assert.equal(listed, 2 * S.edges.length, 'each edge end is on exactly one node');
});

test('every node: the ends of all its edges coincide with it, in both poses (the measured 29 of 37 are 0)', () => {
  assert.ok(multi.length >= 30, `${multi.length} shared nodes`);
  let off = 0;
  for (const n of multi) for (const pose of [0, 1] as const) {
    for (const { edge, end } of n.edges) {
      const d = dist(endBone(edge, end).pos[pose], n.pos[pose]);
      if (d > 1e-6) off++;
      assert.ok(d <= 1e-6, `${n.id}: ${S.edges[edge]!.id} end ${end} is ${d} from the node in pose ${pose}`);
    }
  }
  assert.equal(off, 0);
});

test('the courses are read as they are: away from the ends no bone has moved (the IVC and SVC included)', () => {
  for (const v of MAPPED) {
    const g = COURSES.get(v.id)!, e = S.edges.findIndex((x) => x.id === v.id), b = bonesOf(S, e);
    // (the nearest an end's easing reaches is 45 % of the course: the middle two bones are untouched)
    for (const i of [31, 32]) {
      assert.ok(dist(b[i]!.pos[0], [g.A[i]!.x, g.A[i]!.y, g.A[i]!.z]) < 1e-9, `${v.id} body bone ${i}`);
      assert.ok(dist(b[i]!.pos[1], [g.C[i]!.x, g.C[i]!.y, g.C[i]!.z]) < 1e-9, `${v.id} map bone ${i}`);
    }
  }
  for (const id of ['IVC_IS', 'IVC_IS_1', 'IVCS_RA', 'SVC_RA', 'SVC_RA_1', 'V_UP']) assert.ok(S.edges.some((e) => e.id === id), `${id} is in the skeleton`);
});

test('the easing is bounded: no end moves past 45 % of its course, and every move is listed with its share', () => {
  const r = skeletonReport();
  assert.ok(r.ends.length > 0);
  for (const x of r.ends) assert.ok(x.reach <= 0.45 * (x.move / x.share) + 1e-12, `${x.edge} reach ${x.reach}`);
  // the largest body moves (a share of the whole course) are the data's own gaps, named in the report to the owner: they must stay few
  assert.ok(r.ends.filter((x) => x.pose === 0 && x.share > 0.25).length <= 20);
  assert.ok(r.ends.filter((x) => x.pose === 1).every((x) => x.share < 0.5), 'the map was already at its stations; only the lane tips moved');
});

test('run-ons: shared tangent under 2 degrees and equal radii where two vessels carry straight on (body; and the map where its course carries straight on too)', () => {
  const runs = S.nodes.filter((n) => n.runOn);
  assert.ok(runs.length >= 20, `${runs.length} run-on nodes`);
  for (const n of runs) {
    const [x, y] = n.runOn!.map((i) => n.edges[i]!) as [typeof n.edges[0], typeof n.edges[0]];
    for (const pose of [0, 1] as const) {
      const a = into(x.edge, x.end, pose), b = into(y.edge, y.end, pose), turn = angle(a, [-b[0], -b[1], -b[2]]);
      const rx = endBone(x.edge, x.end).r[pose], ry = endBone(y.edge, y.end).r[pose];
      assert.ok(Math.abs(rx - ry) <= 1e-9 * Math.max(rx, ry) + 1e-12, `${n.id}: radii ${rx} and ${ry} (pose ${pose})`);
      if (pose === 0 || turn < 25) assert.ok(turn < 2, `${n.id}: ${S.edges[x.edge]!.id} / ${S.edges[y.edge]!.id} differ by ${turn.toFixed(2)} degrees (pose ${pose})`);
    }
  }
});

test('every pair of the pair rule has one width at the node, in both poses', () => {
  for (const p of RUN_PAIRS) {
    const a = S.edges.findIndex((e) => e.id === p.a), b = S.edges.findIndex((e) => e.id === p.b);
    if (a < 0 || b < 0) continue;
    for (const pose of [0, 1] as const) {
      const ra = endBone(a, p.ea).r[pose], rb = endBone(b, p.eb).r[pose];
      assert.ok(Math.abs(ra - rb) <= 1e-9 * Math.max(ra, rb) + 1e-12, `${p.a}/${p.b} radii ${ra} ${rb} (pose ${pose})`);
    }
  }
});

test('a vessel with no partner keeps its own radius, on the body (network.ts) and on the map (circuit/width.ts)', () => {
  for (const v of NETWORK) {
    if (v.feeder || v.taper) continue;
    const e = S.edges.findIndex((x) => x.id === v.id);
    for (const b of bonesOf(S, e)) assert.ok(Math.abs(b.r[0] - v.radius) < 1e-12, `${v.id} body radius`);
  }
  for (const e of S.edges) {
    const v = NETWORK.find((x) => x.id === e.id)!, mid = S.bones[e.bones[0] + 31]!;
    assert.ok(Math.abs(mid.r[1] - mapRadiusOf(v)) < 1e-12, `${e.id} map radius at the middle`);
  }
});

test('frames: no flip over 30 degrees between neighbouring bones, unit and square, and continuous across a run-on', () => {
  let worst = 0;
  S.edges.forEach((e, i) => {
    const b = bonesOf(S, i);
    for (let k = 0; k < b.length; k++) {
      const [t, n, bi] = b[k]!.frame;
      assert.ok(Math.abs(Math.hypot(...t) - 1) < 1e-9 && Math.abs(Math.hypot(...n) - 1) < 1e-9 && Math.abs(Math.hypot(...bi) - 1) < 1e-9, `${e.id} unit ${k}`);
      assert.ok(Math.abs(t[0] * n[0] + t[1] * n[1] + t[2] * n[2]) < 1e-9, `${e.id} square ${k}`);
      if (k > 0) { const d = angle(b[k - 1]!.frame[1], n); worst = Math.max(worst, d); assert.ok(d <= 30, `${e.id} frame turns ${d.toFixed(1)} degrees at bone ${k}`); }
    }
  });
  for (const n of S.nodes.filter((x) => x.runOn)) {
    const [x, y] = n.runOn!.map((i) => n.edges[i]!) as [typeof n.edges[0], typeof n.edges[0]];
    const d = angle(endBone(x.edge, x.end).frame[1], endBone(y.edge, y.end).frame[1]);
    assert.ok(d < 2.5, `${n.id}: the run-on's frames differ by ${d.toFixed(2)} degrees`);
  }
  assert.ok(worst < 30);
});

test('the frame tangent is the course direction (bones agree with the frame)', () => {
  S.edges.forEach((e, i) => {
    const b = bonesOf(S, i), a = b[10]!.pos[0], c = b[12]!.pos[0];
    assert.ok(angle(unit([c[0] - a[0], c[1] - a[1], c[2] - a[2]]), b[11]!.frame[0]) < 1, e.id);
  });
});

test('the artery is its own network: its nodes are named apart, and the lane tips of the bed stay where 2D ends them', () => {
  const art = S.nodes.filter((n) => n.id.endsWith(':art'));
  assert.ok(art.length >= 3);
  for (const e of S.edges) assert.equal(e.from.endsWith(':art'), e.tone === 'artery');
  const v = MAPPED.find((x) => x.id === 'A_HR')!;
  assert.equal(nodeIdOf(v, 1), 'SIN_R:art');
  const n = S.nodes.find((x) => x.id === 'SIN_R:art')!, g = COURSES.get('A_HR')!;
  assert.ok(dist(n.pos[1], [g.C[63]!.x, g.C[63]!.y, g.C[63]!.z]) < 1e-9, 'A_HR ends at the lane tip on the map, not on the bed station');
});

test('baseline recorded: the tubes the current path builds for the Anatomy (a floor for the new mesh to beat)', () => {
  const b = baseline();
  assert.equal(b.vessels, NETWORK.length);
  assert.ok(b.courses >= b.vessels);
  assert.ok(b.tubeVertices > 50_000 && b.tubeVertices < 250_000, `${b.tubeVertices} tube vertices`);
  assert.ok(b.skeleton.boneBytes < 1_000_000, 'the bone texture stays under 1 MB');
  console.log(`baseline: ${b.vessels} vessels, ${b.courses} courses, ${b.tubeVertices} tube vertices, ${b.tubeTriangles} triangles; skeleton ${b.skeleton.nodes} nodes, ${b.skeleton.edges} edges, ${b.skeleton.bones} bones (${b.skeleton.boneBytes} bytes at 3 RGBA32F texels)`);
});

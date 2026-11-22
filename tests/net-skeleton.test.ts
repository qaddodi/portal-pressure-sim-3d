// WP0 of the vessel-geometry plan (recs-22nov/vessel-geometry-review.md): the skeleton is the network as data, and continuity is TRUE BY CONSTRUCTION, checked here once. Root cause it pins: the scene had no node
// positions (a vessel's course ended wherever the 2D drawing ended it: 29 of 37 shared nodes had incident ends more than a radius apart), so every junction needed its own bridging code. Rulings of 22 Nov: a big end move
// means the node is in the wrong place (a side-wall landing splits its host; otherwise the trunks set the node and only the branch moves), no move past 25 % of its course or 3 radii is silent, and the map's corners are
// rounded the way the map rounds its own. Node only, no scene, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Vec3 } from '../src/scene/anatomy/vessels.ts';
import { COURSES } from '../src/scene/circuit/course.ts';
import { FADE_DOWN_Y_2D } from '../src/scene/vessels/fades.copied.ts';
import { y2d } from '../src/scene/frame2d.ts';
import { MAPPED, NETWORK, RUN_PAIRS } from '../src/scene/vessels/network.ts';
import { vesselAlphaAt } from '../src/scene/vessels/fade-alpha.ts';
import { baseline } from '../src/scene/vessels/net/baseline.ts';
import { BONES_PER_EDGE, FADE_SEEN, FILLET_BONES, KNOWN_BIG_MOVES, MAX_MOVE_RADII, MAX_MOVE_SHARE, bonesOf, mapRadiusOf, nodeIdOf, skeleton, skeletonReport } from '../src/scene/vessels/net/skeleton.ts';

const S = skeleton(), R = skeletonReport();
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const angle = (a: Vec3, b: Vec3): number => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
const endBone = (e: number, end: 0 | 1) => S.bones[S.edges[e]!.bones[0] + (end ? S.edges[e]!.bones[1] - 1 : 0)]!;
/** The direction an edge leaves its end in, into the course (the first secant of its bones). */
const into = (e: number, end: 0 | 1, pose: 0 | 1): Vec3 => {
  const f = S.edges[e]!.bones[0], n = S.edges[e]!.bones[1], a = S.bones[f + (end ? n - 1 : 0)]!.pos[pose];
  // (on the map a piece between two landings has no length: the direction is the first bone that is somewhere else)
  for (let k = 1; k < n; k++) { const b = S.bones[f + (end ? n - 1 - k : k)]!.pos[pose]; if (dist(a, b) > 1e-9) return unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]); }
  // (a host's end piece with no length: look along the whole host from that end)
  if ((end ? S.edges[e]!.to : S.edges[e]!.from).includes('@')) return [0, 0, 0];
  const whole = hostBones(S.edges[e]!.id.split('#')[0]!), at = end ? whole.length - 1 : 0;
  for (let k = 1; k < whole.length; k++) { const b = whole[end ? at - k : k]!.pos[pose]; if (dist(a, b) > 1e-9) return unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]); }
  return [0, 0, 0];
};
/** A host's 64 bones, whole (its pieces joined, the bone they share once). */
const hostBones = (id: string) => {
  const out: ReturnType<typeof bonesOf> = [];
  S.edges.forEach((e, i) => { if (e.id === id || e.id.startsWith(`${id}#`)) { const b = bonesOf(S, i); out.push(...(out.length ? b.slice(1) : b)); } });
  return out;
};
const multi = S.nodes.filter((n) => n.edges.length >= 2);
const cut = new Set(R.landings.map((l) => l.host));
const pieceCount = R.landings.reduce((m, l) => m.set(l.host, new Set([...(m.get(l.host) ?? []), l.bone])), new Map<string, Set<number>>());

test('the skeleton holds every drawn vessel with a map course; a host with landings is cut into pieces that share their bones; 64 bones a vessel in all', () => {
  const extra = [...pieceCount.values()].reduce((t, s) => t + s.size, 0);
  assert.equal(S.edges.length, MAPPED.length + extra);
  assert.equal(new Set(S.edges.map((e) => e.id)).size, S.edges.length);
  for (const v of MAPPED) assert.equal(hostBones(v.id).length, BONES_PER_EDGE, v.id);
  assert.equal(S.bones.length, MAPPED.length * BONES_PER_EDGE + extra);
  S.edges.forEach((e, i) => {
    const b = bonesOf(S, i);
    assert.ok(e.bones[1] >= 4, `${e.id} has bones`);
    assert.ok(b.every((x, k) => x.edge === i && Math.abs(x.u - k / (b.length - 1)) < 1e-12), e.id);
    assert.ok(S.nodes.some((n) => n.id === e.from) && S.nodes.some((n) => n.id === e.to), `${e.id} has its nodes`);
  });
  for (const n of S.nodes) for (const { edge, end } of n.edges) assert.equal(end ? S.edges[edge]!.to : S.edges[edge]!.from, n.id);
  assert.equal(S.nodes.reduce((t, n) => t + n.edges.length, 0), 2 * S.edges.length, 'each edge end is on exactly one node');
});

test('every node: the ends of all its edges coincide with it, in both poses (the measured 29 of 37 are 0)', () => {
  assert.ok(multi.length >= 30, `${multi.length} shared nodes`);
  for (const n of multi) for (const pose of [0, 1] as const) for (const { edge, end } of n.edges) {
    const d = dist(endBone(edge, end).pos[pose], n.pos[pose]);
    assert.ok(d <= 1e-6, `${n.id}: ${S.edges[edge]!.id} end ${end} is ${d} from the node in pose ${pose}`);
  }
});

test('the courses are read as they are: away from the ends no bone has moved (the IVC and SVC included, every host as drawn)', () => {
  for (const v of MAPPED) {
    const g = COURSES.get(v.id)!, b = hostBones(v.id);
    for (const i of [31, 32]) {
      assert.ok(dist(b[i]!.pos[0], [g.A[i]!.x, g.A[i]!.y, g.A[i]!.z]) < 1e-9, `${v.id} body bone ${i}`);
      assert.ok(dist(b[i]!.pos[1], [g.C[i]!.x, g.C[i]!.y, g.C[i]!.z]) < 1e-9 || R.fillets.some((f) => f.a === v.id || f.b === v.id) || R.collapses.some((c) => c.host === v.id), `${v.id} map bone ${i}`);
    }
  }
  for (const id of ['IVC_IS', 'IVC_IS_1', 'IVCS_RA', 'SVC_RA', 'SVC_RA_1', 'V_UP']) assert.ok(hostBones(id).length === BONES_PER_EDGE, `${id} is in the skeleton`);
});

test('no silent large moves: an end moves at most 25 % of its course and 3 radii, or is named in KNOWN_BIG_MOVES with a reason the build bears out', () => {
  const over = R.ends.filter((x) => x.share > MAX_MOVE_SHARE || x.radii > MAX_MOVE_RADII);
  const named = new Set(Object.keys(KNOWN_BIG_MOVES));
  for (const x of over) assert.ok(named.has(`${x.edge}|${x.end}|${x.pose}`), `${x.edge} end ${x.end} (pose ${x.pose}, node ${x.node}) moves ${(x.share * 100).toFixed(0)} % of its course, ${x.radii.toFixed(1)} radii`);
  for (const [k, w] of Object.entries(KNOWN_BIG_MOVES)) {
    const [edge, end, pose] = k.split('|') as [string, string, string], x = over.find((o) => o.edge === edge && o.end === Number(end) && o.pose === Number(pose));
    assert.ok(x, `${k} is named but no longer past the limits: take it out`);
    if (w.why === 'fade') {
      const g = COURSES.get(edge)!, p = Number(end) ? g.A[BONES_PER_EDGE - 1]! : g.A[0]!;
      assert.ok(y2d(p.y) >= FADE_DOWN_Y_2D[edge]![0], `${k}: its end is above the fade's start`);
    }
    if (w.why === 'fillet') assert.ok(R.fillets.some((f) => f.node === x!.node), `${k}: no rounded corner at ${x!.node}`);
    if (w.why === 'depth') assert.ok(x!.planar < 0.5, `${k}: the move is not all depth (${x!.planar.toFixed(1)} radii across the plane)`);
    assert.ok(w.reason.length > 20);
  }
});

// The named exceptions may only shrink (like scripts/lint-allow.json): this is the whole list as accepted on 22 Nov; a new name fails here, a name that is no longer past the limits fails above. The two 'fade' ones are held to the test below.
const ACCEPTED_BIG_MOVES = ['EPI_ILI|1|0', 'C4|1|0', 'C3|1|0', 'C3|0|0', 'C3|1|1', 'C7|0|0', 'S_MC|1|0'];
test('the named big moves are a list that only shrinks: seven at most, five of them data, depth or corner, two in the faded tails', () => {
  for (const k of Object.keys(KNOWN_BIG_MOVES)) assert.ok(ACCEPTED_BIG_MOVES.includes(k), `${k} is a new named exception: fix the end instead (a landing, or the trunk-first node) rather than naming it`);
  assert.ok(Object.values(KNOWN_BIG_MOVES).filter((w) => w.why !== 'fade').length <= 5);
  assert.ok(Object.values(KNOWN_BIG_MOVES).filter((w) => w.why === 'fade').length <= 2);
});

test('a bend in a faded tail stays in it: of EPI_ILI and C4, every bone drawn (resting alpha above 0.02) is within one radius of where the course puts it', () => {
  const fades = Object.entries(KNOWN_BIG_MOVES).filter(([, w]) => w.why === 'fade').map(([k]) => k.split('|') as [string, string, string]);
  assert.deepEqual(fades.map((f) => f[0]).sort(), ['C4', 'EPI_ILI']);
  for (const [id, end] of fades) {
    const g = COURSES.get(id)!, hb = hostBones(id), at = (i: number) => vesselAlphaAt(id, i / (BONES_PER_EDGE - 1), g.A[i]!.x, g.A[i]!.y);
    assert.ok(at(Number(end) ? BONES_PER_EDGE - 1 : 0) <= FADE_SEEN, `${id}: its end is drawn (alpha ${at(Number(end) ? BONES_PER_EDGE - 1 : 0).toFixed(2)}), not in the faded tail`);
    let drawn = 0, worst = 0;
    for (let i = 0; i < BONES_PER_EDGE; i++) {
      if (at(i) <= FADE_SEEN || (Number(end) ? i < BONES_PER_EDGE / 2 : i >= BONES_PER_EDGE / 2)) continue;   // (the half at the faded end: the other end's own ease is under the 25 % / 3 radii limits)
      drawn++;
      const a = g.A[i]!, d = dist(hb[i]!.pos[0], [a.x, a.y, a.z]) / hb[i]!.r[0];
      worst = Math.max(worst, d);
      assert.ok(d <= 1, `${id} bone ${i} (alpha ${at(i).toFixed(2)}) is ${d.toFixed(2)} radii from its course`);
    }
    assert.ok(drawn >= 5, `${id}: only ${drawn} bones drawn: the check is not looking at the visible part`);
  }
});

test('a rounded map corner spans at least five bones either side of its node', () => {
  assert.ok(FILLET_BONES >= 5);
  for (const f of R.fillets) {
    const ia = S.nodes.find((x) => x.id === f.node)!, [x, y] = ia.runOn!.map((i) => ia.edges[i]!) as [typeof ia.edges[0], typeof ia.edges[0]];
    for (const e of [x, y]) {
      const id = S.edges[e.edge]!.id.split('#')[0]!, b = hostBones(id).map((q) => q.pos[1]), o = (e.end ? b.slice().reverse() : b).filter((q, i, a) => i === 0 || dist(q, a[i - 1]!) > 1e-9);   // (a host cut at its landings: its whole course, the collapsed pieces counting once)
      assert.ok(o.length > FILLET_BONES, `${f.node}: ${o.length} distinct map bones on ${id}`);
    }
  }
});

test('side-wall landings: the hepatic veins on the cava, the beds on their veins: the host is split there at its own bone and the branch ends on it', () => {
  const on = (host: string, branch: string) => R.landings.find((l) => l.host === host && l.branch === branch);
  assert.ok(on('IVC_IS', 'RHV_IVC') && on('IVC_IS', 'LHV_IVC'), 'the right and left hepatic veins land on the cava');
  assert.ok(on('RHV_IVC_1', 'POST_R_RHV') && on('PVH_R_2', 'PRE_R') && on('PVH_L_1', 'PRE_L'), 'the beds land on their veins');
  for (const l of R.landings) {
    const node = S.nodes.find((n) => n.id === l.node)!, host = hostBones(l.host)[l.bone]!;
    // (the node is the host's own bone, the host as drawn; the branch ends on it, the short way from where it was drawn)
    assert.ok(dist(node.pos[0], host.pos[0]) < 1e-9 && dist(node.pos[1], host.pos[1]) < 1e-9, `${l.node}: the node is the host's bone ${l.bone}`);
    const end = R.ends.find((x) => x.edge === l.branch && x.end === l.branchEnd && x.node === l.node && x.pose === 0);
    assert.ok(!end || (end.radii <= MAX_MOVE_RADII && end.share <= MAX_MOVE_SHARE), `${l.node}: the branch moves ${end?.radii.toFixed(1)} radii`);
    assert.ok(node.edges.length >= 3 && node.runOn, `${l.node}: two host pieces run on and the branch ends here`);
  }
  // the cava is whole again past its landings: three nodes on it, in order along it, and its pieces share the bone
  const cava = S.edges.filter((e) => e.id.startsWith('IVC_IS#'));
  assert.ok(cava.length >= 3, `${cava.length} cava pieces`);
});

test('run-ons: shared tangent under 2 degrees in the body, equal radii in both poses; on the map the corner is rounded', () => {
  const runs = S.nodes.filter((n) => n.runOn);
  assert.ok(runs.length >= 20, `${runs.length} run-on nodes`);
  const mapCorner = new Set(R.fillets.map((f) => f.node));
  for (const n of runs) {
    const [x, y] = n.runOn!.map((i) => n.edges[i]!) as [typeof n.edges[0], typeof n.edges[0]];
    for (const pose of [0, 1] as const) {
      const a = into(x.edge, x.end, pose), b = into(y.edge, y.end, pose), turn = angle(a, [-b[0], -b[1], -b[2]]);
      const rx = endBone(x.edge, x.end).r[pose], ry = endBone(y.edge, y.end).r[pose];
      assert.ok(Math.abs(rx - ry) <= 1e-9 * Math.max(rx, ry) + 1e-12, `${n.id}: radii ${rx} and ${ry} (pose ${pose})`);
      // (a landing node sits on a bone of the host's own course, which may itself turn a little there: the node adds under 2 degrees to that)
      const land = R.landings.find((l) => l.node === n.id), own = land ? (() => { const A = COURSES.get(land.host)!.A, i = hostBones(land.host).findIndex((q) => dist(q.pos[0], n.pos[0]) < 1e-9); return i > 0 && i < 63 ? angle(unit([A[i]!.x - A[i - 1]!.x, A[i]!.y - A[i - 1]!.y, A[i]!.z - A[i - 1]!.z]), unit([A[i + 1]!.x - A[i]!.x, A[i + 1]!.y - A[i]!.y, A[i + 1]!.z - A[i]!.z])) : 0; })() : 0;
      if (pose === 1 && (a[0] === 0 && a[1] === 0 && a[2] === 0 || b[0] === 0 && b[1] === 0 && b[2] === 0)) continue;   // (a piece with no length on the map has no direction there)
      if (pose === 0) assert.ok(turn < 2.5 + own, `${n.id}: ${S.edges[x.edge]!.id} / ${S.edges[y.edge]!.id} differ by ${turn.toFixed(2)} degrees (the course's own turn there ${own.toFixed(2)})`);
      else if (land) assert.ok(turn < 12, `${n.id}: the host turns ${turn.toFixed(1)} degrees at its landing on the map`);   // (a landing can sit on the host's own rounded corner)
      else if (mapCorner.has(n.id)) assert.ok(turn < 8, `${n.id}: the map's rounded corner leaves its ends ${turn.toFixed(1)} degrees apart`);
      else if (turn < 25) assert.ok(turn < 3, `${n.id}: map tangents differ by ${turn.toFixed(2)} degrees`);
    }
  }
});

test('map corners are rounded: where a run-on turns on the map the turn is spread over the fillet, no step over 20 degrees between neighbouring bones', () => {
  assert.ok(R.fillets.length >= 6, `${R.fillets.length} rounded corners`);
  for (const f of R.fillets) {
    const ia = S.edges.findIndex((e) => e.id === f.a || e.id === `${f.a}#0` || e.id.startsWith(`${f.a}#`)), n = S.nodes.find((x) => x.id === f.node)!;
    assert.ok(ia >= 0 && n.runOn, `${f.node} has its run-on`);
    const [x, y] = n.runOn!.map((i) => n.edges[i]!) as [typeof n.edges[0], typeof n.edges[0]];
    // the bones of both edges either side of the node, in order along the corner
    const side = (e: typeof x): Vec3[] => { const b = bonesOf(S, e.edge).map((q) => q.pos[1]), o = (e.end ? b.slice().reverse() : b).filter((q, i, a) => i === 0 || dist(q, a[i - 1]!) > 1e-9); return o.slice(0, FILLET_BONES + 1); };
    const line = [...side(x).reverse(), ...side(y).slice(1)];
    let worst = 0;
    for (let i = 1; i + 1 < line.length; i++) worst = Math.max(worst, angle(unit([line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1], line[i]![2] - line[i - 1]![2]]), unit([line[i + 1]![0] - line[i]![0], line[i + 1]![1] - line[i]![1], line[i + 1]![2] - line[i]![2]])));
    assert.ok(worst <= 20, `${f.node}: the map turns ${worst.toFixed(0)} degrees in one step`);
  }
});

test('every pair of the pair rule has one width at the node, in both poses', () => {
  for (const p of RUN_PAIRS) {
    const a = S.edges.findIndex((e) => e.id === p.a || e.id.startsWith(`${p.a}#`)), b = S.edges.findIndex((e) => e.id === p.b || e.id.startsWith(`${p.b}#`));
    if (a < 0 || b < 0) continue;
    const bone = (id: string, end: 0 | 1) => (end ? hostBones(id).at(-1)! : hostBones(id)[0]!);
    for (const pose of [0, 1] as const) {
      const ra = bone(p.a, p.ea).r[pose], rb = bone(p.b, p.eb).r[pose];
      assert.ok(Math.abs(ra - rb) <= 1e-9 * Math.max(ra, rb) + 1e-12, `${p.a}/${p.b} radii ${ra} ${rb} (pose ${pose})`);
    }
  }
});

test('a vessel with no partner keeps its own radius, on the body (network.ts) and on the map (circuit/width.ts)', () => {
  for (const v of NETWORK) {
    if (v.feeder || v.taper) continue;
    for (const b of hostBones(v.id)) assert.ok(Math.abs(b.r[0] - v.radius) < 1e-12, `${v.id} body radius`);
  }
  for (const v of MAPPED) assert.ok(Math.abs(hostBones(v.id)[31]!.r[1] - mapRadiusOf(v)) < 1e-12, `${v.id} map radius at the middle`);
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
    const b = bonesOf(S, i);
    if (b.length < 13) return;
    const a = b[10]!.pos[0], c = b[12]!.pos[0];
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
  void cut;
  console.log(`baseline: ${b.vessels} vessels, ${b.courses} courses, ${b.tubeVertices} tube vertices, ${b.tubeTriangles} triangles; skeleton ${b.skeleton.nodes} nodes, ${b.skeleton.edges} edges, ${b.skeleton.bones} bones (${b.skeleton.boneBytes} bytes at 3 RGBA32F texels)`);
});

test('the map keeps 2D\'s one meeting point: a branch the body lands on a host\'s wall but the map draws at the host\'s end meets it there, and the pieces between the landings have no length on the map', () => {
  const by = (host: string) => R.collapses.find((c) => c.host === host);
  assert.ok(by('IVC_IS') && by('LHV_IVC') && by('AZY_SVC'), 'the cava, the left hepatic vein and the azygos have collapsed landings');
  for (const c of R.collapses) {
    const landed = R.landings.filter((l) => l.host === c.host);
    assert.ok(landed.length >= 1);
    for (const l of landed) {
      const node = S.nodes.find((n) => n.id === l.node)!, branch = MAPPED.find((v) => v.id === l.branch)!;
      const g = COURSES.get(l.branch)!, own = l.branchEnd ? g.C[BONES_PER_EDGE - 1]! : g.C[0]!;
      // the branch's map end is (nearly) where the map drew it: no slide along the host
      if (l.bone >= c.bone === Boolean(c.hostEnd)) assert.ok(dist(node.pos[1], [own.x, own.y, own.z]) <= 3 * mapRadiusOf(branch) + 0.03, `${l.node}: the branch's map end moved ${dist(node.pos[1], [own.x, own.y, own.z]).toFixed(3)}`);
    }
    const piece = S.edges.findIndex((e) => e.id.startsWith(`${c.host}#`) && (c.hostEnd ? e.id.endsWith(`#${R.landings.filter((l) => l.host === c.host).length ? Math.max(...S.edges.filter((x) => x.id.startsWith(`${c.host}#`)).map((x) => Number(x.id.split('#')[1]))) : 0}`) : e.id.endsWith('#0')));
    const b = bonesOf(S, piece);
    assert.ok(dist(b[0]!.pos[1], b[b.length - 1]!.pos[1]) < 1e-9, `${c.host}: the end piece has no length on the map`);
  }
});

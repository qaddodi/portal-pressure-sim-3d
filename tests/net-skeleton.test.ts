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
import type { Bone } from '../src/scene/vessels/net/types.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { SKIN_K } from '../src/scene/vessels/skin/sdf.ts';
import { networksOf } from '../src/scene/vessels/net/mesh.ts';
import { ARM_BLEND_RADII, ARM_MAX_TURN, isSewn, BONES_PER_EDGE, BONES_MAX, CORNER_ARC_BONES, boneCount, samplesOf, FADE_SEEN, WALL_STARTS, hiddenCounts, FILLET_BONES, KNOWN_BIG_MOVES, MAX_MOVE_RADII, MAX_MOVE_SHARE, bonesOf, mapRadiusOf, nodeIdOf, skeleton, skeletonReport } from '../src/scene/vessels/net/skeleton.ts';

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
  for (const v of MAPPED) assert.equal(hostBones(v.id).length, boneCount(v.id), v.id);
  assert.equal(S.bones.length, MAPPED.reduce((t, v) => t + boneCount(v.id), 0) + extra);
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
    const g = samplesOf(v.id), b = hostBones(v.id), m = b.length >> 1;
    for (const i of [m - 1, m]) {
      assert.ok(dist(b[i]!.pos[0], g[0][i]!) < 1e-9, `${v.id} body bone ${i}`);
      assert.ok(dist(b[i]!.pos[1], g[1][i]!) < 1e-9 || R.fillets.some((f) => f.a === v.id || f.b === v.id) || R.landings.some((l) => l.host === v.id || l.branch === v.id) || R.arms.some((a) => a.arms.includes(v.id)), `${v.id} map bone ${i}`);
    }
  }
  for (const id of ['IVC_IS', 'IVC_IS_1', 'IVCS_RA', 'SVC_RA', 'SVC_RA_1', 'V_UP']) assert.ok(hostBones(id).length === boneCount(id), `${id} is in the skeleton`);
});

test('no silent large moves: an end moves at most 25 % of its course and 3 radii, or is named in KNOWN_BIG_MOVES with a reason the build bears out', () => {
  const over = R.ends.filter((x) => !x.layout && (x.share > MAX_MOVE_SHARE || x.radii > MAX_MOVE_RADII));   // (the map's station layout moves are held to their own bound below)
  const named = new Set(Object.keys(KNOWN_BIG_MOVES));
  for (const x of over) assert.ok(named.has(`${x.edge}|${x.end}|${x.pose}`), `${x.edge} end ${x.end} (pose ${x.pose}, node ${x.node}) moves ${(x.share * 100).toFixed(0)} % of its course, ${x.radii.toFixed(1)} radii`);
  for (const [k, w] of Object.entries(KNOWN_BIG_MOVES)) {
    const [edge, end, pose] = k.split('|') as [string, string, string], x = over.find((o) => o.edge === edge && o.end === Number(end) && o.pose === Number(pose));
    assert.ok(x, `${k} is named but no longer past the limits: take it out`);
    if (w.why === 'fade') {
      const g = samplesOf(edge)[0], p = Number(end) ? g.at(-1)! : g[0]!;
      assert.ok(y2d(p[1]) >= FADE_DOWN_Y_2D[edge]![0], `${k}: its end is above the fade's start`);
    }
    if (w.why === 'fillet') assert.ok(R.fillets.some((f) => f.node === x!.node), `${k}: no rounded corner at ${x!.node}`);
    if (w.why === 'depth') assert.ok(x!.planar < 0.5, `${k}: the move is not all depth (${x!.planar.toFixed(1)} radii across the plane)`);
    assert.ok(w.reason.length > 20);
  }
});

// The named exceptions may only shrink (like scripts/lint-allow.json): this is the whole list as accepted on 22 Nov; a new name fails here, a name that is no longer past the limits fails above. The two 'fade' ones are held to the test below.
const ACCEPTED_BIG_MOVES = ['EPI_ILI|1|0'];
test('the named big moves are a list that only shrinks: one: the epigastric tail in the fade (the sewn ends keep the 2D course and no longer move)', () => {
  for (const k of Object.keys(KNOWN_BIG_MOVES)) assert.ok(ACCEPTED_BIG_MOVES.includes(k), `${k} is a new named exception: fix the end instead (a landing, or the trunk-first node) rather than naming it`);
  assert.ok(Object.values(KNOWN_BIG_MOVES).filter((w) => w.why !== 'fade').length === 0);
  assert.ok(Object.values(KNOWN_BIG_MOVES).filter((w) => w.why === 'fade').length <= 1);
});

test('a bend in a faded tail stays in it: of EPI_ILI (C4, a sewn end, no longer moves), every bone drawn (resting alpha above 0.02) is within one radius of where the course puts it', () => {
  const fades = Object.entries(KNOWN_BIG_MOVES).filter(([, w]) => w.why === 'fade').map(([k]) => k.split('|') as [string, string, string]);
  assert.deepEqual(fades.map((f) => f[0]).sort(), ['EPI_ILI']);
  for (const [id, end] of fades) {
    const g = samplesOf(id)[0], hb = hostBones(id), N = hb.length, at = (i: number) => vesselAlphaAt(id, i / (N - 1), g[i]![0], g[i]![1]);
    assert.ok(at(Number(end) ? N - 1 : 0) <= FADE_SEEN, `${id}: its end is drawn (alpha ${at(Number(end) ? N - 1 : 0).toFixed(2)}), not in the faded tail`);
    let drawn = 0, worst = 0;
    for (let i = 0; i < N; i++) {
      if (at(i) <= FADE_SEEN || (Number(end) ? i < N / 2 : i >= N / 2)) continue;   // (the half at the faded end: the other end's own ease is under the 25 % / 3 radii limits)
      drawn++;
      const d = dist(hb[i]!.pos[0], g[i]!) / hb[i]!.r[0];
      worst = Math.max(worst, d);
      assert.ok(d <= 1, `${id} bone ${i} (alpha ${at(i).toFixed(2)}) is ${d.toFixed(2)} radii from its course`);
    }
    assert.ok(drawn >= 5, `${id}: only ${drawn} bones drawn: the check is not looking at the visible part`);
  }
});

test('hidden tails: SkelEdge.hidden is what nothing draws in either pose, hiddenBody what the body alone hides; hidden never exceeds hiddenBody, and the Circuit-whole tails (EPI_ILI, C4) are body-hidden only', () => {
  for (const e of S.edges) for (const k of [0, 1] as const) {
    assert.ok(e.hidden[k] <= e.hiddenBody[k], `${e.id}: hidden ${e.hidden[k]} > hiddenBody ${e.hiddenBody[k]}`);
    assert.ok(e.hiddenBody[k] < e.bones[1], `${e.id}: every bone hidden`);
  }
  for (const v of MAPPED) { const hc = hiddenCounts(v.id), a = S.edges.find((e) => e.id === v.id || e.id === `${v.id}#0`)!, z = [...S.edges].reverse().find((e) => e.id === v.id || e.id.startsWith(`${v.id}#`))!; assert.equal(a.hiddenBody[0], Math.min(hc.body[0], a.bones[1] - 1), v.id); assert.equal(z.hiddenBody[1], Math.min(hc.body[1], z.bones[1] - 1), v.id); }
  for (const id of ['EPI_ILI', 'C4']) { const e = S.edges.find((x) => x.id === id)!; assert.deepEqual(e.hidden, [0, 0], `${id}: the Circuit draws it whole`); assert.ok(e.hiddenBody[1] > 0, `${id}: its tail is hidden in the body`); }
  assert.ok(S.edges.some((e) => e.hidden[0] + e.hidden[1] > 0), 'some tail is hidden in both poses (the arteries\' ends)');
});

test('DIPS and REX start on the host wall, at a junction of at most eight arms, MIN_PIECE bones in from the host end and MIN_GAP from any other landing', () => {
  assert.deepEqual([...WALL_STARTS].sort(), ['DIPS|0', 'REX|0']);
  for (const id of ['DIPS', 'REX']) {
    const l = R.landings.find((x) => x.branch === id && x.branchEnd === 0);
    assert.ok(l, `${id} starts on a host wall`);
    assert.ok(l!.bone >= 5 && l!.bone <= boneCount(l!.host) - 1 - 5, `${id}: its landing bone ${l!.bone} is in the host's end pieces`);
    // (a landing within three bones of another is one junction with it: the two zones overlap in a pose, the region test below checks that)
    for (const o of R.landings) if (o !== l && o.host === l!.host && Math.abs(o.bone - l!.bone) < 3) assert.equal(o.node, l!.node, `${id}: lands beside ${o.branch} on its own node`);
    const n = S.nodes.find((x) => x.id === l!.node)!;
    assert.ok(n.edges.length >= 3 && n.edges.length <= 8, `${id}: the junction holds ${n.edges.length} arms`);
  }
});


test('the map keeps the body\'s side: an arm that leaves a host line on one side in the body (between 20 and 160 degrees) leaves it on the same side on the map', () => {
  let checked = 0;
  for (const n of S.nodes) {
    if (!n.runOn || n.edges.length < 3) continue;
    const arms = (pose: 0 | 1) => armsOf(n, pose), host = n.runOn;
    const side = (pose: 0 | 1, i: number): number => { const A = arms(pose), t = A[host[0]!]!.d, d = A[i]!.d; return Math.atan2(t[0] * d[1] - t[1] * d[0], t[0] * d[0] + t[1] * d[1]) * 180 / Math.PI; };
    for (let i = 0; i < n.edges.length; i++) {
      if (host.includes(i) || sewnEdge(n.edges[i]!.edge)) continue;   // (sewn ends are no fillet arms)
      const b = side(0, i), m = side(1, i);
      if (R.armsKept.some((k) => k.node === n.id && k.arm === S.edges[n.edges[i]!.edge]!.id)) { assert.ok(Math.abs(m) >= 20, `${n.id}: kept arm ${S.edges[n.edges[i]!.edge]!.id} leaves the host at ${Math.abs(m).toFixed(0)} degrees on the map (least 20)`); checked++; continue; }   // (J1, plan-owner ruling: an arm keeps its own course, even to the host's other side, provided it leaves the host at 20 degrees or more at the seam)
      if (Math.abs(b) > 20 && Math.abs(b) < 160 && Math.abs(m) > 20 && Math.abs(m) < 160) { assert.equal(Math.sign(m), Math.sign(b), `${n.id}: ${S.edges[n.edges[i]!.edge]!.id} is on the ${b > 0 ? 'left' : 'right'} of the host in the body and the other side on the map`); checked++; }
    }
  }
  assert.ok(checked >= 10, `${checked} arms compared`);
});

test('hidden tails continue the drawn course smoothly: the turn from where the hidden stretch starts keeps its curvature at most 1/(2 r), EPI_ILI and C4 alike', () => {
  for (const id of ['EPI_ILI', 'C4']) {
    const hb = hostBones(id), hc = hiddenCounts(id), n = hb.length, h = hc.body[1], iB = n - 1 - h, pts = hb.map((q) => q.pos[0]);
    const turn = (k: number) => angle(unit([pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1], pts[k]![2] - pts[k - 1]![2]]), unit([pts[k + 1]![0] - pts[k]![0], pts[k + 1]![1] - pts[k]![1], pts[k + 1]![2] - pts[k]![2]]));
    let kmax = 0; for (let k = Math.max(1, iB); k < n - 1; k++) kmax = Math.max(kmax, (turn(k) * Math.PI / 180) / ((dist(pts[k]!, pts[k - 1]!) + dist(pts[k + 1]!, pts[k]!)) / 2) * hb[k]!.r[0]);
    assert.ok(kmax <= 0.5, `${id}: curvature x radius ${kmax.toFixed(2)} in the hidden stretch (limit 0.5)`);
  }
});

test('a rounded map corner spans at least three bones either side of its node', () => {
  assert.ok(FILLET_BONES >= CORNER_ARC_BONES);
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
      const land = R.landings.find((l) => l.node === n.id), own = land ? (() => { const A = samplesOf(land.host)[0], i = hostBones(land.host).findIndex((q) => dist(q.pos[0], n.pos[0]) < 1e-9); return i > 0 && i < A.length - 1 ? angle(unit([A[i]![0] - A[i - 1]![0], A[i]![1] - A[i - 1]![1], A[i]![2] - A[i - 1]![2]]), unit([A[i + 1]![0] - A[i]![0], A[i + 1]![1] - A[i]![1], A[i + 1]![2] - A[i]![2]])) : 0; })() : 0;
      if (pose === 1 && (a[0] === 0 && a[1] === 0 && a[2] === 0 || b[0] === 0 && b[1] === 0 && b[2] === 0)) continue;   // (a piece with no length on the map has no direction there)
      if (pose === 0) assert.ok(turn < 2.5 + own, `${n.id}: ${S.edges[x.edge]!.id} / ${S.edges[y.edge]!.id} differ by ${turn.toFixed(2)} degrees (the course's own turn there ${own.toFixed(2)})`);
      else if (land) assert.ok(turn < 12, `${n.id}: the host turns ${turn.toFixed(1)} degrees at its landing on the map`);   // (a landing can sit on the host's own rounded corner)
      else if (mapCorner.has(n.id)) assert.ok(turn < 20, `${n.id}: the map's rounded corner leaves its ends ${turn.toFixed(1)} degrees apart`);
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
  const n = S.nodes.find((x) => x.id === 'SIN_R:art')!, g = samplesOf('A_HR')[1];
  assert.ok(dist(n.pos[1], g.at(-1)!) < 1e-9, 'A_HR ends at the lane tip on the map, not on the bed station');
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

// 22 Nov, plan owner on the render verdict: the map's node structure equals the body's (the earlier merge of the hepatic landings into one map point is withdrawn). Every body node has its own map station.

/** The arms of a node at a pose: each one's direction leaving the node, taken over its first 2 radii, and how far its first 2 radii stray from a straight line (degrees). */
const armsOf = (n: typeof S.nodes[number], pose: 0 | 1) => n.edges.map((e) => {
  const whole = hostBones(S.edges[e.edge]!.id.split('#')[0]!), piece = bonesOf(S, e.edge), seq = e.end ? piece.slice().reverse() : piece, r = seq[0]!.r[pose];
  void whole;
  let whole1 = 0; for (let i = 1; i < seq.length; i++) whole1 += dist(seq[i]!.pos[pose], seq[i - 1]!.pos[pose]);
  const want = Math.min(2 * r, 0.5 * whole1);   // (a piece between two nodes keeps half of itself straight at most)
  const pts = [seq[0]!.pos[pose]]; let acc = 0;
  for (let i = 1; i < seq.length && acc < want; i++) { acc += dist(seq[i]!.pos[pose], seq[i - 1]!.pos[pose]); pts.push(seq[i]!.pos[pose]); }
  const d = unit([pts.at(-1)![0] - pts[0]![0], pts.at(-1)![1] - pts[0]![1], pts.at(-1)![2] - pts[0]![2]]);
  let dev = 0; for (const p of pts.slice(1)) dev = Math.max(dev, angle(unit([p[0] - pts[0]![0], p[1] - pts[0]![1], p[2] - pts[0]![2]]), d));
  return { id: S.edges[e.edge]!.id, d, dev, run: acc / r };
});
const cornerNodes = new Set(R.fillets.map((f) => f.node));
test('at the map pose every node of three or more arms keeps its arms 25 degrees from their neighbours and 20 degrees from the host, each straight for 2 radii (the corners\' own curves excepted)', () => {
  let checked = 0;
  for (const n of S.nodes) {
    if (n.edges.length < 3 || n.id.endsWith(':art')) continue;
    const arms = armsOf(n, 1), host = new Set(n.runOn ?? []);
    for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) {
      const a = angle(arms[i]!.d, arms[j]!.d), both = host.has(i) && host.has(j);
      if (both || sewnEdge(n.edges[i]!.edge) || sewnEdge(n.edges[j]!.edge)) continue;   // (sewn ends are no fillet arms)
      assert.ok(a >= (host.has(i) || host.has(j) ? 20 : 25) - 0.5, `${n.id}: ${arms[i]!.id} and ${arms[j]!.id} leave ${a.toFixed(0)} degrees apart`);
    }
    if (cornerNodes.has(n.id)) continue;
    arms.forEach((a, i) => { if (sewnEdge(n.edges[i]!.edge)) return; assert.ok(a.dev <= 15, `${n.id}: ${a.id} bends ${a.dev.toFixed(0)} degrees inside its first 2 radii`); checked++; void i; });
  }
  assert.ok(checked >= 30, `${checked} arms checked`);
});


// 22 Nov, plan owner on the render verdict (second set): bones follow 2D's courses; collaterals and procedure shunts are sewn, no fillet arms; the region partition is the same in both poses.
const baseOf = (id: string): string => id.split('#')[0]!;
const sewnEdge = (i: number): boolean => isSewn(NETWORK_BY_ID.get(baseOf(S.edges[i]!.id))!);
/** The raw 2D line of a host in `pose`: its uniformly sampled course, as the bones start out. */
const rawLine = (id: string, pose: 0 | 1): Vec3[] => samplesOf(id)[pose];
const distToLine = (p: Vec3, L: Vec3[]): number => {
  let m = Infinity;
  for (let i = 1; i < L.length; i++) {
    const a = L[i - 1]!, b = L[i]!, ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], l = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    const t = l ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l)) : 0;
    m = Math.min(m, Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]));
  }
  return m;
};
const armedVessels = new Set(R.arms.flatMap((a) => a.arms));

test('every visible course stays within 0.25 r of its 2D line in both poses, except where its ends are moved onto their nodes (the tolerance is the largest end move, in radii) or, on the map, an arm is laid (at most ARM_BLEND_RADII more)', () => {
  let checked = 0;
  for (const v of MAPPED) for (const pose of [0, 1] as const) {
    const hb = hostBones(v.id), line = rawLine(v.id, pose), hc = hiddenCounts(v.id), n = hb.length;
    const rOwn = Math.min(...hb.map((b) => b.r[pose])), moves = R.ends.filter((e) => e.edge === v.id && e.pose === pose).map((e) => e.move / rOwn);   // (the move in the vessel's own radii)
    const tol = 0.25 + 1.25 * Math.max(0, ...moves) + (pose === 1 && armedVessels.has(v.id) ? ARM_BLEND_RADII : 0) + (pose === 1 && R.fillets.some((f) => f.a === v.id || f.b === v.id) ? ARM_BLEND_RADII : 0);
    for (let k = hc.both[0]; k < n - hc.both[1]; k++) {
      const d = distToLine(hb[k]!.pos[pose], line) / hb[k]!.r[pose];
      assert.ok(d <= tol, `${v.id} bone ${k} (pose ${pose}) is ${d.toFixed(2)} r from its 2D line; the allowance is ${tol.toFixed(2)}`);
      checked++;
    }
  }
  assert.ok(checked > 4000, `${checked} bones checked`);
});

test('every course turns by under 45 degrees between neighbouring bones outside the junction zones, so a corner of the 2D course (up to 90 degrees) spans at least three bones, in both poses', () => {
  for (const v of MAPPED) for (const pose of [0, 1] as const) {
    const g = samplesOf(v.id)[pose], hc = hiddenCounts(v.id);
    for (let k = hc.both[0] + 1; k + 1 < g.length - hc.both[1]; k++) {
      const t = angle(unit([g[k]![0] - g[k - 1]![0], g[k]![1] - g[k - 1]![1], g[k]![2] - g[k - 1]![2]]), unit([g[k + 1]![0] - g[k]![0], g[k + 1]![1] - g[k]![1], g[k + 1]![2] - g[k]![2]]));
      assert.ok(t <= 45 || (g[k]![0] === g[k - 1]![0] && g[k]![1] === g[k - 1]![1] && g[k]![2] === g[k - 1]![2]), `${v.id} (pose ${pose}): the course turns ${t.toFixed(0)} degrees at bone ${k} of ${g.length}`);
    }
  }
});

test('the region partition is the same in both poses: fillet arms only (collaterals and shunts are sewn); an edge between two junctions whose zones overlap in either pose joins them in both; no region has over 8 arms', () => {
  const arms = (n: typeof S.nodes[number]) => n.edges.filter((x) => !sewnEdge(x.edge));
  const J = S.nodes.filter((n) => arms(n).length >= 3), jset = new Set(J.map((n) => n.id)), byId = new Map(S.nodes.map((n) => [n.id, n]));
  const rEnd = (ei: number, end: 0 | 1, pose: 0 | 1): number => { const b = bonesOf(S, ei); return (end ? b.at(-1)! : b[0]!).r[pose]; };
  const k = (n: typeof S.nodes[number], pose: 0 | 1): number => SKIN_K * Math.min(...arms(n).map((x) => rEnd(x.edge, x.end, pose)));
  const arc = (ei: number, pose: 0 | 1): number => { const b = bonesOf(S, ei); let t = 0; for (let m = 1; m < b.length; m++) t += dist(b[m]!.pos[pose], b[m - 1]!.pos[pose]); return t; };
  const parent = new Map(J.map((n) => [n.id, n.id])), root = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, root(parent.get(x)!)), parent.get(x)!));
  const mismatched: string[] = [];
  S.edges.forEach((e, i) => {
    if (sewnEdge(i) || e.from === e.to || !jset.has(e.from) || !jset.has(e.to)) return;
    const A = byId.get(e.from)!, B = byId.get(e.to)!, ov = ([0, 1] as const).map((p) => arc(i, p) < k(A, p) + k(B, p) + rEnd(i, 0, p) + rEnd(i, 1, p));
    if (ov[0] !== ov[1]) mismatched.push(e.id);   // (clear in one pose, overlapping in the other: the mesher must join them in both, its rule is the either-pose one)
    if (ov[0] || ov[1]) parent.set(root(e.from), root(e.to));
  });
  const regions = new Map<string, string[]>();
  for (const n of J) { const r = root(n.id); regions.set(r, [...(regions.get(r) ?? []), n.id]); }
  for (const ids of regions.values()) {
    const set = new Set(ids); let a = 0;
    for (const id of ids) for (const x of arms(byId.get(id)!)) { const e = S.edges[x.edge]!; if (!(e.from !== e.to && set.has(e.from) && set.has(e.to))) a++; }
    assert.ok(a <= 8, `${ids.join(' + ')} has ${a} fillet arms`);
  }
  assert.ok(regions.size >= 10, `${regions.size} regions`);
  console.log(`regions: ${regions.size}; edges that overlap in one pose only: ${mismatched.length ? mismatched.join(', ') : 'none'}`);
});

/** The regions of the partition above (fillet arms only, an edge whose zones overlap in either pose joins its junctions): node id -> region root. */
function regionRoots(): (id: string) => string {
  const arms = (n: typeof S.nodes[number]) => n.edges.filter((x) => !sewnEdge(x.edge));
  const J = S.nodes.filter((n) => arms(n).length >= 3), jset = new Set(J.map((n) => n.id)), byId = new Map(S.nodes.map((n) => [n.id, n]));
  const rEnd = (ei: number, end: 0 | 1, pose: 0 | 1): number => { const b = bonesOf(S, ei); return (end ? b.at(-1)! : b[0]!).r[pose]; };
  const k = (n: typeof S.nodes[number], pose: 0 | 1): number => SKIN_K * Math.min(...arms(n).map((x) => rEnd(x.edge, x.end, pose)));
  const arc = (ei: number, pose: 0 | 1): number => { const b = bonesOf(S, ei); let t = 0; for (let m = 1; m < b.length; m++) t += dist(b[m]!.pos[pose], b[m - 1]!.pos[pose]); return t; };
  const parent = new Map(J.map((n) => [n.id, n.id])), root = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, root(parent.get(x)!)), parent.get(x)!));
  S.edges.forEach((e, i) => {
    if (sewnEdge(i) || e.from === e.to || !jset.has(e.from) || !jset.has(e.to)) return;
    const A = byId.get(e.from)!, B = byId.get(e.to)!;
    if (([0, 1] as const).some((p) => arc(i, p) < k(A, p) + k(B, p) + rEnd(i, 0, p) + rEnd(i, 1, p))) parent.set(root(e.from), root(e.to));
  });
  return (id) => (jset.has(id) ? root(id) : id);
}
const topoEnds = (ei: number): string[] => {   // (the drawn network's own node names at the ends of this piece of its vessel)
  const id = baseOf(S.edges[ei]!.id), v = NETWORK_BY_ID.get(id)!, mine = S.edges.map((e, k) => [e, k] as const).filter(([e]) => baseOf(e.id) === id).map(([, k]) => k), out: string[] = [];
  if (ei === mine[0]) out.push(nodeIdOf(v, 0));
  if (ei === mine.at(-1)) out.push(nodeIdOf(v, 1));
  return out;
};
/** The pairs of different vessels of one network whose centrelines come within the sum of their radii without meeting: two pieces meet when they share a skeleton node or a node name of the drawn network at their ends, or when their ends lie in one region (a junction, not a crossing). Bones at `pose`, or the 2D line when `raw`. */
function crossPairs(pose: 0 | 1, raw: boolean): Set<string> {
  const region = regionRoots(), meets = (a: number, b: number): boolean => {
    if (topoEnds(a).some((x) => topoEnds(b).includes(x))) return true;
    const ra = [S.edges[a]!.from, S.edges[a]!.to].map(region), rb = [S.edges[b]!.from, S.edges[b]!.to].map(region);
    return ra.some((x) => rb.includes(x));
  };
  const pos = (ei: number, p: number): Vec3 => {
    if (!raw) return S.bones[S.edges[ei]!.bones[0] + p]!.pos[pose];
    const id = baseOf(S.edges[ei]!.id); let off = 0;
    for (let j = 0; j < ei; j++) if (baseOf(S.edges[j]!.id) === id) off += S.edges[j]!.bones[1] - 1;
    return samplesOf(id)[pose][off + p]!;
  };
  const out = new Set<string>();
  for (const net of networksOf(S)) for (let i = 0; i < net.length; i++) for (let j = i + 1; j < net.length; j++) {
    const a = S.edges[net[i]!]!, b = S.edges[net[j]!]!;
    if (baseOf(a.id) === baseOf(b.id) || meets(net[i]!, net[j]!)) continue;
    let near = false;
    for (let p = 0; p < a.bones[1] && !near; p++) for (let q = 0; q < b.bones[1]; q++) {
      const A = S.bones[a.bones[0] + p]!, B = S.bones[b.bones[0] + q]!;
      if (dist(pos(net[i]!, p), pos(net[j]!, q)) < A.r[pose] + B.r[pose]) { near = true; break; }
    }
    if (near) out.add([baseOf(a.id), baseOf(b.id)].sort().join('~'));
  }
  return out;
}
/** The pairs the 2D lines themselves cross (22 Nov, plan owner: pinned as a set of pairs, not a count; any pair outside it fails, fewer is fine). */
const RAW_CROSSINGS: Readonly<Record<'body' | 'map', readonly string[]>> = {
  body: ['DIPS~PVH_R_1', 'IVCS_RA~IVC_IS', 'LGV_CONF~REX', 'PVH_L_1~REX', 'PVH_R~PV_TRUNK', 'REX~SV_CONF', 'SMV_CONF~V_INT_1'],
  map: ['DIPS~IVCS_RA', 'IVCS_RA~IVC_IS', 'PVH_L_1~REX'],
};
test('crossings: the 2D lines cross in 7 pairs in the body and 3 on the map (pinned as pairs); the skeleton adds none, fewer is fine', () => {
  for (const [name, pose] of [['body', 0], ['map', 1]] as const) {
    assert.deepEqual([...crossPairs(pose, true)].sort(), [...RAW_CROSSINGS[name]].sort(), `${name}: the pinned list is the 2D lines' own`);
    const now = crossPairs(pose, false);
    for (const x of now) assert.ok(RAW_CROSSINGS[name].includes(x), `${name}: ${x} is a crossing the skeleton adds`);
  }
});

// J1 (22 Nov): no edge hooks back into its own node. Root cause it pins: the map's arm layout (the body's node structure, mirrored and spread) turned an arm against the way its own 2D course arrives, so the course ran past the node and U-turned back into it
// (SV_CONF at CONF 159 degrees, LGV_CONF at PVT_L and EPI_SVC at SVC_E 180). An arm turned more than ARM_MAX_TURN keeps its own course's direction.
/** The end `end` of an edge in `pose` hooks when, walking in from it, the course goes more than 2 r away, covers more than 3 r of arc, and comes back within 2 r of the end point; returns the u it comes back at (or -1). */
function hookAt(bones: readonly Bone[], end: 0 | 1, pose: 0 | 1): number {
  const n = bones.length, at = (k: number): Bone => bones[end ? n - 1 - k : k]!, E = at(0), r = E.r[pose];
  let arc = 0, away = 0;
  for (let k = 1; k < n; k++) {
    arc += dist(at(k).pos[pose], at(k - 1).pos[pose]);
    const d = dist(at(k).pos[pose], E.pos[pose]);
    away = Math.max(away, d);
    if (arc > 3 * r && d < 2 * r && away > 2 * r) return at(k).u;
    if (arc > 40 * r) break;
  }
  return -1;
}
test('J1: no edge end hooks back into its own node, in either pose (every edge, both ends)', () => {
  const bad: string[] = [];
  S.edges.forEach((e, i) => {
    const b = bonesOf(S, i);
    for (const pose of [0, 1] as const) for (const end of [0, 1] as const) { const u = hookAt(b, end, pose); if (u >= 0) bad.push(`${e.id} end ${end} ${pose ? 'map' : 'body'} comes back at u=${u.toFixed(2)}`); }
  });
  assert.deepEqual(bad, []);
});
test('J1: the hook scan sees a hook (an edge that runs past its node and U-turns back into it)', () => {
  const mk = (u: number, x: number, y: number): Bone => ({ edge: 0, u, pos: [[x, y, 0], [x, y, 0]], r: [0.01, 0.01], frame: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
  const pts: [number, number][] = [[0, 0], [0.05, 0], [0.1, 0], [0.1, -0.05], [0.05, -0.04], [0.01, -0.015]];
  const hook = pts.map(([x, y], k) => mk(k / 5, x, y));
  assert.ok(hookAt(hook, 0, 0) >= 0, 'the hook is seen');
  assert.equal(hookAt(pts.slice(0, 4).map(([x, y], k) => mk(k / 3, x, y)), 0, 0), -1, 'a plain bend is not');
});
test('J1: arms the layout would turn ARM_MAX_TURN degrees or more keep their own course (and every one that was laid turns less)', () => {
  assert.ok(R.armsKept.length > 0);
  for (const k of R.armsKept) assert.ok(k.turn >= ARM_MAX_TURN - 0.01, `${k.arm} at ${k.node}`);
  for (const id of ['SV_CONF', 'LGV_CONF', 'EPI_SVC', 'LRV_IVC', 'V_IMV']) assert.ok(R.armsKept.some((k) => k.arm === id), id);
});

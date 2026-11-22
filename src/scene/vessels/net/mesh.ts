// WP2 of the network geometry (docs: vessel-geometry-review.md): the NETWORK MESHER. A `Skeleton` (WP0) goes in, one watertight `NetMesh` per connected network comes out, every vertex bound to up to four bones.
//   - a vessel (edge) is SWEPT: one ring of RADIAL vertices per bone, with rings between the bones where the bones are far apart (position: Catmull-Rom of the bones, radius and frame interpolated), so a bone is a ring and a ring knows its bone;
//   - a node of three or more edges is a JUNCTION: every arm is cut back to a seam ring (one of its own sweep rings) and the fillet between the seam rings is meshed by the junction skin's builder (skin/mesh.ts, sheet.ts: the smooth union of the arms,
//     remeshed, min angle above 12 degrees). The skin's boundary vertices ARE the arms' sweep vertices (same ids, one index buffer): there is no seam to cut, hide, dither or match;
//   - a node of two edges is a RUN-ON: the two sweeps share the ring at the node (the same vertices), the second edge's lattice rolled to meet the first's;
//   - a node of one edge is a free end: a dome cap.
// Every vertex stores (bone, weight) pairs and its offset in each bone's frame divided by the bone's radius, `p = sum w_i (P_i + r_i (o_i.x t_i + o_i.y n_i + o_i.z b_i))`, so the rest shape is rebuilt exactly (net/oracle in tests) and the vertex shader (WP3)
// only has to move the bones. There is NO fallback: a junction that will not mesh throws `NetMeshError` naming the node, and the bake fails.
import { TUBE_RADIAL } from '../tubes.ts';
import { SkinBuildError, buildSkinSteady, minAngleDeg } from '../skin/mesh.ts';
import { ARM_REACH, CAPSULE_SEGS, SKIN_K, armCapsule, closestOnArm, sdArm, sdUnionGrad, skinKOf, type Capsule } from '../skin/sdf.ts';
import { SKIN_RING_W_FROM, SKIN_SHADE_K } from '../skin/exact-normal.ts';
import { SHEET_CUT_R } from '../skin/sheet.ts';
import { throughNeck } from './neck.ts';
import { relax } from './relax.ts';
import { fitAll } from './fit.ts';
import { boneFrame, bonePos, boneRadius, type Pose } from './pose.ts';
import { windowOf, type Window } from './window.ts';
import { REGION_PTS } from './regions.ts';
import { shaderBones, stateScales } from './shader-caps.ts';
import { regionKeys } from './keys.ts';
import { bakeScaleOf } from './ranges.ts';
import { sewnEnds } from './sewn.ts';
import { NETWORK_BY_ID } from '../network.ts';
import { isPermanent } from '../skin/inventory.ts';
import type { SkinArm, SkinCut, SkinJunction } from '../skin/types.ts';
import type { Vec3 } from '../../anatomy/vessels.ts';
import type { Bone, NetMesh, Skeleton } from './types.ts';

export const RADIAL = TUBE_RADIAL;
/** Rings between two bones: one every `RING_STEP` radii along the segment, at most `MAX_SUB` per segment (the old tubes have a ring every ~1/30 unit). */
export const RING_STEP = 1.5;
export const MAX_SUB = 8;
/** A free end's dome: the latitudes (degrees) of its two rings, then the pole. */
export const CAP_LATS: readonly number[] = [28, 60];
/** How many times a junction's seams are pushed one bone further out before the bake gives up on it. */
/** The most arms one junction region may have (the skin builder's limit); short edges inside a merged region are not arms. */
export const MAX_ARMS = 8;
/** The least angle (degrees) any triangle of a junction's fillet may have. */
/** how far out, in radii, an arm's capsule runs while seams are only being planned */
const PLAN_REACH = 24;
const scratch7 = new Float64Array(7);

/** A free vertex with exactly three triangles around it is a cap the skin builder's remesh leaves (a pinhole of three slivers): the three become one triangle on its three neighbours, same winding. Repeats until none is left. */
function dropCaps(tris: number[], fixed: Uint8Array): void {
  for (let again = true; again; ) {
    again = false;
    const at = new Map<number, number[]>();
    for (let t = 0; t < tris.length; t += 3) for (let c = 0; c < 3; c++) { const v = tris[t + c]!; (at.get(v) ?? at.set(v, []).get(v)!).push(t); }
    const dead = new Set<number>();
    for (const [v, ts] of at) {
      if (fixed[v] || ts.length !== 3 || ts.some((t) => dead.has(t))) continue;
      // the ring of neighbours, in the winding of the first triangle's (v, a, b)
      const rot = (t: number): [number, number] => { const i = tris.indexOf(v, t) - t; return [tris[t + (i + 1) % 3]!, tris[t + (i + 2) % 3]!]; };
      const [a, b] = rot(ts[0]!), next = new Map(ts.map((t) => rot(t)));
      const c = next.get(b);
      if (c === undefined || next.get(c) !== a || next.size !== 3) continue;
      dead.add(ts[0]!); dead.add(ts[1]!); dead.add(ts[2]!);
      tris.push(a, b, c);
      again = true;
    }
    if (dead.size) { const keep: number[] = []; for (let t = 0; t < tris.length; t += 3) if (!dead.has(t)) keep.push(tris[t]!, tris[t + 1]!, tris[t + 2]!); tris.length = 0; tris.push(...keep); }
  }
}

/** a node of two edges whose radii differ by more than this share is a step, not a run-on */
const STEP_RATIO = 0.1;
/** the points tried along each segment of another capsule when a seam's cut cylinder is checked */
const CYL_STEPS = 6;
export const MIN_ANGLE = 12;

export class NetMeshError extends Error {
  readonly node: string;
  constructor(node: string, why: string) { super(`net mesh: ${node}: ${why}`); this.name = 'NetMeshError'; this.node = node; }
}

/** What the mesher recorded about one node, for the tests and the renders. */
export interface NodeReport {
  node: string; kind: 'junction' | 'runon' | 'cap';
  /** junction: the seam bone (index inside its edge) of each arm, widest arm first, and the arms' edge indices in that order */
  seams: number[]; arms: number[];
  /** the junction's triangles (a range of the index buffer, in triangles) and its own new vertices (a range of the vertex buffer) */
  triStart: number; triCount: number; vertStart: number; vertCount: number;
  /** the schedule rung the skin closed at and the tries it took */
  tries: number;
  /** every through pair of the region (the two edges that run on through it, across short edges too): whether its arms are united by the mate minimum, whether the no-neck rule made that choice (the other one necked), and the profile's lowest value over the rule's floor */
  /** junction: the union's capsules as meshed (axis points, radii at them, the mate's index or -1), the arms' first, then the short edges' and any run-on capsule: what the shader's implicit-skinning projection rebuilds from the live bones (net/regions.ts) */
  caps?: { pts: number[]; r: number[]; mate: number }[];
  /** a region built twice (plan owner, 22 Nov): 0 the body-layout mesh, 1 the map-layout mesh (absent: body), and the t window `[b, a]` over which the two hand over by the screen dither (net/regions.ts bodyShare); absent: this mesh is drawn alone */
  /** the layout the region's mesh was built at: 0 body, 1 map */
  variant?: 0 | 1;
  /** [b, a] (net/window.ts): the last t the body mesh is whole (it dissolves over [a - 0.1, a]) and the first the map mesh is (it comes in over [b, b + 0.05]). Absent: a body mesh is always drawn */
  switchT?: readonly [number, number];
  /** junction: the bones each of `caps` runs through, and each arm's seam ring (mesh vertex ids): what net/fit.ts needs to fit the region at the other states */
  capBones?: number[][]; /** the bones that carry each capsule in the shader's row (at most REGION_PTS of `capBones`'s, chosen so the tubes stay inside the live union: net/shader-caps.ts) */ regionBones?: number[][]; rings?: number[][];
  through: { arms: [number, number]; mated: boolean; toggled: boolean; margin: number }[];
}
export interface NetMeshResult { mesh: NetMesh; edges: number[]; nodes: NodeReport[]; /** only in a lenient diagnosis run: the regions that would not mesh (left unfilled) */ failures: { node: string; why: string }[]; /** regions whose map-built mesh could not be made (the body mesh is drawn alone), with why */ mapNotes: { node: string; why: string }[]; /** with `maps`: each region's two meshes' windows (net/window.ts), by node name */ windows: Map<string, Window>; report: { vertices: number; triangles: number; sweepTriangles: number } }

type V3 = [number, number, number];
const sub = (a: Vec3, b: Vec3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** One edge as the mesher walks it. */
interface EdgeCtx { idx: number; id: string; first: number; count: number; bones: Bone[]; cum: number[]; /** the arc length at each bone in the MAP pose */ cum1: number[]; alpha: number; seg: number[] /* rings per segment */ }
interface Sample { P: V3; r: number; t: V3; n: V3; b: V3; k: number; f: number; /** d radius / d arc length along the edge here (a taper tilts the surface normal by this much) */ dr: number }

/** The connected networks of a skeleton: each a list of edge indices (every edge sharing a node is in one). */
export function networksOf(skel: Skeleton): number[][] {
  const parent = skel.edges.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
  for (const nd of skel.nodes) for (let i = 1; i < nd.edges.length; i++) parent[find(nd.edges[i]!.edge)] = find(nd.edges[0]!.edge);
  const groups = new Map<number, number[]>();
  skel.edges.forEach((_, i) => { const r = find(i), g = groups.get(r); if (g) g.push(i); else groups.set(r, [i]); });
  return [...groups.values()];
}

/** The skeleton the mesh was built from: every bone's radii times its edge's bake factor (`NetMesh.bakeScale`). The mesh's offsets are in units of THESE radii. */
export function scaledSkeleton(skel: Skeleton, bakeScale: ArrayLike<number>): Skeleton {
  let id = true; for (let i = 0; i < skel.edges.length; i++) if (bakeScale[i] !== 1) id = false;
  return id ? skel : { ...skel, bones: skel.bones.map((b) => { const g = bakeScale[b.edge]!; return g === 1 ? b : { ...b, r: [b.r[0] * g, b.r[1] * g] as [number, number] }; }) };
}

/** Takes the given regions' meshes (their vertices and triangles) out of a built mesh and closes the gaps. Region vertices all follow the tube vertices, so the rings the reports name keep their ids. */
function dropMeshes(res: NetMeshResult, drop: ReadonlySet<NodeReport>): void {
  const m = res.mesh, V = m.position.length / 3, keepV = new Uint8Array(V).fill(1), T = m.index.length / 3, keepT = new Uint8Array(T).fill(1);
  for (const r of drop) { keepV.fill(0, r.vertStart, r.vertStart + r.vertCount); keepT.fill(0, r.triStart, r.triStart + r.triCount); }
  const vmap = new Int32Array(V), vShift = new Int32Array(V + 1), tShift = new Int32Array(T + 1);
  let nv = 0; for (let v = 0; v < V; v++) { vShift[v] = v - nv; if (keepV[v]) vmap[v] = nv++; else vmap[v] = -1; }
  vShift[V] = V - nv;
  let nt = 0; for (let t = 0; t < T; t++) { tShift[t] = t - nt; if (keepT[t]) nt++; }
  tShift[T] = T - nt;
  const take = (a: Float32Array, per: number): Float32Array => { const out = new Float32Array(per * nv); for (let v = 0; v < V; v++) if (vmap[v]! >= 0) out.set(a.subarray(per * v, per * v + per), per * vmap[v]!); return out; };
  const bone = new Uint16Array(4 * nv), index = new Uint32Array(3 * nt);
  for (let v = 0; v < V; v++) if (vmap[v]! >= 0) bone.set(m.bone.subarray(4 * v, 4 * v + 4), 4 * vmap[v]!);
  let q = 0; for (let t = 0; t < T; t++) if (keepT[t]) { for (let c = 0; c < 3; c++) index[q++] = vmap[m.index[3 * t + c]!]!; }
  Object.assign(m, { position: take(m.position, 3), bone, weight: take(m.weight, 4), offset: take(m.offset, 12), offsetMap: take(m.offsetMap, 12), normal: take(m.normal, 12), index });
  for (const r of res.nodes) { if (drop.has(r)) continue; r.vertStart -= vShift[r.vertStart]!; r.triStart -= tShift[r.triStart]!; }
  res.nodes = res.nodes.filter((r) => !drop.has(r));
  for (const k of m.keys ?? []) k.vertStart -= vShift[k.vertStart]!;
  res.report.vertices = nv; res.report.triangles = nt;
}

/** Builds the mesh of one network (`edges`, indices into `skel.edges`; default: the whole skeleton as one). */
export function buildNetMesh(skel: Skeleton, edges?: readonly number[], opts?: { lenient?: boolean; /** also build each junction region's MAP-built mesh (a second mesh per region in the same index buffer: NodeReport.variant 1) on seams that clear at both layouts */ maps?: boolean; /** with `maps`: also a mesh built at t = 0.5 for every map-capable region (the ones the windows need are kept) */ mid?: boolean; /** the real states (per state, every skeleton edge's swell): wide junctions get keys (net/keys.ts) */ states?: readonly (readonly number[])[] }): NetMeshResult {
  // The mesh is baked at each arm's MIDDLE radius (ranges.ts: the geometric mean of its swell range), so the fillets' fixed triangles are within the least ratio of every state: the bones' radii are scaled by their edge's factor for the build.
  // The offsets are divided by those radii, so a tube is unchanged (its unit offsets times the live radius); `bakeScale` tells the shader's junction start to take the factor too (lumenRest x bakeScale).
  const bakeScale = new Float32Array(skel.edges.length).fill(1);
  skel.edges.forEach((e, i) => { bakeScale[i] = bakeScaleOf(e.id); });
  const scaled = scaledSkeleton(skel, bakeScale);
  const res = buildOnce(scaled, edges, opts, bakeScale);
  res.mesh.bakeScale = bakeScale;
  if (opts?.maps) {
    // THE FILLET STEPS ASIDE DURING THE CIRCUIT MOVE (plan owner, 22 Nov): each region's body mesh dissolves out before it folds, its map mesh comes in after it is whole again, and the plain tubes (which run on to the node, so they cover the crotch) show in between.
    // The windows are each mesh's (net/window.ts); a region with no map mesh just dissolves its body mesh; a map mesh that is never whole is dropped.
    const byNode = new Map<string, NodeReport[]>();
    for (const n of res.nodes) if (n.kind === 'junction' && n.caps && n.capBones) (byNode.get(n.node) ?? byNode.set(n.node, []).get(n.node)!).push(n);
    const region = (n: NodeReport) => ({ node: n.node, variant: (n.variant ?? 0) as 0 | 1, vertStart: n.vertStart, vertCount: n.vertCount, arms: n.arms.length, triStart: n.triStart, triCount: n.triCount, capBones: n.capBones!, mates: n.caps!.map((c) => c.mate) });
    const drop = new Set<NodeReport>();
    for (const [node, list] of byNode) {
      const body = list.find((n) => (n.variant ?? 0) === 0), map = list.find((n) => n.variant === 1);
      if (!body) continue;
      const w = windowOf(scaled, res.mesh, region(body), map && region(map));
      res.windows.set(node, w);
      // [b, a] for both meshes (the shader reads a for the body mesh and b for the map mesh); a body mesh whole at every t keeps none (always drawn)
      const sw: [number, number] = [w.b, w.a];
      if (w.a < 1) body.switchT = sw;
      if (map) { if (w.b <= 1) map.switchT = sw; else { drop.add(map); res.mapNotes.push({ node, why: `the map mesh is never whole (body whole to t ${w.a.toFixed(2)}): dropped, plain tubes at the map layout` }); } }
      else res.mapNotes.push({ node, why: `no map mesh: the body fillet dissolves over [${Math.max(0, w.a - 0.1).toFixed(2)}, ${w.a.toFixed(2)}] and the plain tubes show after it` });
    }
    if (drop.size) dropMeshes(res, drop);
  }
  return res;
}

function buildOnce(skel: Skeleton, edges: readonly number[] | undefined, opts: { lenient?: boolean; maps?: boolean; states?: readonly (readonly number[])[] } | undefined, bakeScale: Float32Array): NetMeshResult {
  const inNet = new Set(edges ?? skel.edges.map((_, i) => i));
  const ctx = new Map<number, EdgeCtx>();
  for (const i of inNet) {
    const e = skel.edges[i]!, [first, count] = e.bones;
    if (count < 2) throw new NetMeshError(e.id, 'an edge needs at least two bones');
    const bones = skel.bones.slice(first, first + count), cum = [0], cum1 = [0];
    for (let k = 1; k < count; k++) cum1.push(cum1[k - 1]! + Math.hypot(...sub(bones[k]!.pos[1], bones[k - 1]!.pos[1])));
    for (let k = 1; k < count; k++) cum.push(cum[k - 1]! + Math.hypot(...sub(bones[k]!.pos[0], bones[k - 1]!.pos[0])));
    const seg: number[] = [];
    for (let k = 0; k < count - 1; k++) seg.push(Math.max(1, Math.min(MAX_SUB, Math.ceil((cum[k + 1]! - cum[k]!) / (RING_STEP * 0.5 * (bones[k]!.r[0] + bones[k + 1]!.r[0]))))));
    ctx.set(i, { idx: i, id: e.id, first, count, bones, cum, cum1, alpha: 0, seg });
  }
  const inNodes = skel.nodes.filter((n) => n.edges.length && n.edges.every((x) => inNet.has(x.edge)));
  for (const n of skel.nodes) if (n.edges.some((x) => inNet.has(x.edge)) && !inNodes.includes(n)) throw new NetMeshError(n.id, 'the node joins an edge outside this network');
  // SEWN ENDS (review doc, "Rulings on WP3's sewn-end proposal"): an arm that is not a permanent vessel (a collateral, a shunt, TIPS, DIPS, REX, a feeder) takes no part in a fillet. Its end at a node that holds a permanent vessel is sewn into that host:
  // the tube simply ends there with its own cap, and the COLLAR (2D's sideEndScale and flareScale, from the host's LIVE radius) is the shader's (net/sewn.ts, shaders.ts sewnCollar), so it is not baked here. The node keeps its host edges only, so it is
  // a run-on, a step or a junction of the permanent arms alone. A node with no permanent edge keeps them all (a collateral chain).
  const sewnTable = sewnEnds(skel, (id) => { const v = NETWORK_BY_ID.get(id.split('#')[0]!); return v ? isPermanent(v) : true; });   // (an id the network does not know, a fixture's, is permanent)
  const sewn = new Set<string>();
  const nodes = inNodes.map((n): (typeof inNodes)[number] => {
    const keep = n.edges.filter((x) => !sewnTable[x.edge]![x.end] && !skel.edges[x.edge]!.sewn?.[x.end]);   // (WP0's SkelEdge.sewn: every collateral, shunt and procedure end)
    if (keep.length < 1 || keep.length === n.edges.length) return n;
    for (const x of n.edges) if (!keep.includes(x)) sewn.add(`${x.edge}:${x.end}`);
    const at = new Map(keep.map((x, q) => [x, q] as const)), ro = n.runOn && at.has(n.edges[n.runOn[0]]!) && at.has(n.edges[n.runOn[1]]!) ? ([at.get(n.edges[n.runOn[0]]!)!, at.get(n.edges[n.runOn[1]]!)!] as [number, number]) : keep.length === 2 ? ([0, 1] as [number, number]) : undefined;
    return { ...n, edges: keep, ...(ro ? { runOn: ro } : {}) };
  });
  const sewnEdges = new Set([...sewn].map((k) => Number(k.split(':')[0])));
  const endBone = (c: EdgeCtx, end: 0 | 1): number => (end === 0 ? 0 : c.count - 1);

  // ---- sampling: the ring frame at bone coordinate s (0 .. count-1) of an edge ----
  const sample = (c: EdgeCtx, s: number): Sample => {
    const k = Math.min(c.count - 1, Math.max(0, Math.floor(s + 1e-9))), f = k === c.count - 1 ? 0 : Math.min(1, Math.max(0, s - k)), a = c.bones[k]!, b = c.bones[Math.min(c.count - 1, k + 1)]!;
    const slope = (i: number, j: number): number => (c.bones[j]!.r[0] - c.bones[i]!.r[0]) / ((c.cum[j]! - c.cum[i]!) || 1);
    if (f < 1e-9) return { P: [...a.pos[0]], r: a.r[0], t: [...a.frame[0]], n: [...a.frame[1]], b: [...a.frame[2]], k, f: 0, dr: slope(Math.max(0, k - 1), Math.min(c.count - 1, k + 1)) };
    const p0 = c.bones[Math.max(0, k - 1)]!.pos[0], p1 = a.pos[0], p2 = b.pos[0], p3 = c.bones[Math.min(c.count - 1, k + 2)]!.pos[0];
    // (a missing neighbour at an end is the mirror of the near one, so the curve leaves the end straight)
    const q0: Vec3 = k === 0 ? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1], 2 * p1[2] - p2[2]] : p0, q3: Vec3 = k + 2 > c.count - 1 ? [2 * p2[0] - p1[0], 2 * p2[1] - p1[1], 2 * p2[2] - p1[2]] : p3;
    const P: V3 = [0, 0, 0], f2 = f * f, f3 = f2 * f;
    for (let d = 0; d < 3; d++) P[d] = 0.5 * (2 * p1[d] + (-q0[d] + p2[d]) * f + (2 * q0[d] - 5 * p1[d] + 4 * p2[d] - q3[d]) * f2 + (-q0[d] + 3 * p1[d] - 3 * p2[d] + q3[d]) * f3);
    const t = norm([0, 1, 2].map((d) => (1 - f) * a.frame[0][d]! + f * b.frame[0][d]!) as V3);
    let n: V3 = [0, 1, 2].map((d) => (1 - f) * a.frame[1][d]! + f * b.frame[1][d]!) as V3;
    const nt = dot(n, t); n = norm([n[0] - nt * t[0], n[1] - nt * t[1], n[2] - nt * t[2]]);
    return { P, r: (1 - f) * a.r[0] + f * b.r[0], t, n, b: cross(t, n), k, f, dr: slope(k, k + 1) };
  };
  /** The ring sample at a WHOLE bone (a seam) in any pose: the bone's own position, radius and frame there (net/pose.ts), the taper from its neighbours. */
  const sampleP = (c: EdgeCtx, s: number, pose: Pose): Sample => {
    if (pose === 0) return sample(c, s);
    const k = Math.min(c.count - 1, Math.max(0, Math.round(s))), g = c.first + k, F = boneFrame(skel, g, pose), i = Math.max(0, k - 1), j = Math.min(c.count - 1, k + 1);
    let arc = 0; for (let m = i + 1; m <= j; m++) arc += Math.hypot(...sub(bonePos(skel, c.first + m, pose), bonePos(skel, c.first + m - 1, pose)));
    return { P: [...bonePos(skel, g, pose)], r: boneRadius(skel, g, pose), t: [...F[0]], n: [...F[1]], b: [...F[2]], k, f: 0, dr: (boneRadius(skel, c.first + j, pose) - boneRadius(skel, c.first + i, pose)) / (arc || 1) };
  };
  const theta = (j: number, alpha: number): number => (2 * Math.PI * j) / RADIAL + alpha;
  const ringOf = (S: Sample, alpha: number): { p: Float32Array; nrm: Float32Array } => {
    const p = new Float32Array(3 * RADIAL), nrm = new Float32Array(3 * RADIAL);
    for (let j = 0; j < RADIAL; j++) {
      const a = theta(j, alpha), co = Math.cos(a), si = Math.sin(a);
      const rad: V3 = [0, 1, 2].map((d) => co * S.n[d]! + si * S.b[d]!) as V3;
      for (let d = 0; d < 3; d++) p[3 * j + d] = S.P[d]! + S.r * rad[d]!;
      // the surface normal of a tapering tube leans back along the tube by the taper's slope
      const nx = rad[0] - S.dr * S.t[0], ny = rad[1] - S.dr * S.t[1], nz = rad[2] - S.dr * S.t[2], nl = Math.hypot(nx, ny, nz);
      nrm[3 * j] = nx / nl; nrm[3 * j + 1] = ny / nl; nrm[3 * j + 2] = nz / nl;
    }
    return { p, nrm };
  };

  // ---- run-on welds: the second edge's lattice is rolled and re-indexed to meet the first's ring at the node ----
  interface Weld { canon: { edge: number; end: 0 | 1 }; other: { edge: number; end: 0 | 1 }; perm: number[]; ids: number[] | null }
  const welds = new Map<string, Weld>();
  const visited = new Set<number>();
  const weldAt = (c: EdgeCtx, end: 0 | 1): { node: string; w: Weld } | null => {
    const id = end === 0 ? skel.edges[c.idx]!.from : skel.edges[c.idx]!.to, nd = nodes.find((n) => n.id === id);
    return nd && nd.edges.length === 2 && !jset.has(nd.id) && nd.edges.some((x) => x.edge === c.idx && x.end === end) ? { node: nd.id, w: welds.get(nd.id)! } : null;
  };
  /** (made once the junction regions are final: a run-on node that a region took in has a seam, not a shared ring) */
  const buildWelds = (): void => {
  const twoNodes = nodes.filter((n) => n.edges.length === 2 && !jset.has(n.id));
  for (const root of ctx.keys()) {
    if (visited.has(root)) continue;
    visited.add(root);
    const queue = [root];
    for (let head = 0; head < queue.length; head++) {
      const A = ctx.get(queue[head]!)!;
      for (const nd of twoNodes) for (const end of [0, 1] as const) {
        const here = nd.edges.findIndex((x) => x.edge === A.idx && x.end === end);
        if (here < 0) continue;
        const o = nd.edges[1 - here]!, B = ctx.get(o.edge)!;
        if (welds.has(nd.id)) continue;
        if (B.idx === A.idx) throw new NetMeshError(nd.id, 'an edge that runs on into itself is not supported');
        if (visited.has(B.idx)) { welds.set(nd.id, { canon: { edge: A.idx, end }, other: { edge: B.idx, end: o.end }, perm: alignPerm(A, end, B, o.end, true).perm, ids: null }); continue; }
        const al = alignPerm(A, end, B, o.end, false);
        B.alpha = al.alpha;
        welds.set(nd.id, { canon: { edge: A.idx, end }, other: { edge: B.idx, end: o.end }, perm: al.perm, ids: null });
        visited.add(B.idx); queue.push(B.idx);
      }
    }
  }
  };
  /** The permutation (and the roll of B's lattice) that puts B's ring at its end on A's ring at its end: B's vertex j is A's vertex perm[j]. */
  function alignPerm(A: EdgeCtx, ea: 0 | 1, B: EdgeCtx, eb: 0 | 1, keepAlpha: boolean): { perm: number[]; alpha: number } {
    const SA = sample(A, endBone(A, ea)), SB = sample(B, endBone(B, eb)), q = ringOf(SA, A.alpha).p, p0 = ringOf(SB, keepAlpha ? B.alpha : 0).p;
    let best = Infinity, bs = 0, br = false;
    for (const rev of [false, true]) for (let c = 0; c < RADIAL; c++) {
      let d2 = 0;
      for (let j = 0; j < RADIAL; j++) { const m = rev ? (((c - j) % RADIAL) + RADIAL) % RADIAL : (j + c) % RADIAL; for (let d = 0; d < 3; d++) d2 += (p0[3 * j + d]! - q[3 * m + d]!) ** 2; }
      if (d2 < best) { best = d2; bs = c; br = rev; }
    }
    const perm = Array.from({ length: RADIAL }, (_, j) => (br ? (((bs - j) % RADIAL) + RADIAL) % RADIAL : (j + bs) % RADIAL));
    if (keepAlpha) return { perm, alpha: B.alpha };
    let sx = 0, sy = 0;
    for (let j = 0; j < RADIAL; j++) {
      const m = perm[j]!, d = [q[3 * m]! - SB.P[0], q[3 * m + 1]! - SB.P[1], q[3 * m + 2]! - SB.P[2]] as V3;
      const res = Math.atan2(dot(d, SB.b), dot(d, SB.n)) - theta(j, 0);
      sx += Math.cos(res); sy += Math.sin(res);
    }
    return { perm, alpha: Math.atan2(sy, sx) };
  }

  // ---- vertices ----
  const variantPose: Pose[] = [0, 1];   // (the pose each variant's mesh is built at)
  const pos: number[] = [], vn: number[] = [], vb: number[][] = [], vw: number[][] = [], vp: number[] = [];   // (vp: the pose each vertex was built at, 1 for a map-built mesh's)
  /** A vertex at p[o..o+2] bound to `bones` with `weights`, its rest normal n[no..no+2] (unit). */
  const addVertex = (p: ArrayLike<number>, o: number, bones: number[], weights: number[], n: ArrayLike<number>, no: number, pose: 0 | 1 = 0): number => { vp.push(pose); pos.push(p[o]!, p[o + 1]!, p[o + 2]!); vn.push(n[no]!, n[no + 1]!, n[no + 2]!); vb.push(bones); vw.push(weights); return vb.length - 1; };
  const tris: number[] = [];
  const bridge = (lo: readonly number[], hi: readonly number[]): void => {
    for (let j = 0; j < RADIAL; j++) {
      const a = lo[j]!, b = lo[(j + 1) % RADIAL]!, c = hi[(j + 1) % RADIAL]!, d = hi[j]!;
      if (a !== b && b !== c && a !== c) tris.push(a, b, c);
      if (a !== c && c !== d && a !== d) tris.push(a, c, d);
    }
  };
  const gbone = (c: EdgeCtx, local: number): number => c.first + local;
  const boneOfSample = (c: EdgeCtx, S: Sample): { bones: number[]; weights: number[] } => (S.f < 1e-9 ? { bones: [gbone(c, S.k)], weights: [1] } : { bones: [gbone(c, S.k), gbone(c, S.k + 1)], weights: [1 - S.f, S.f] });

  // ---- junction regions ----
  // A junction is a node of three or more edges. Two junctions joined by an edge SHORTER than their two blend zones plus the edge's own end radii (length < the two zones, k + 1.5 R each, in either pose) are one REGION: the short edge is not swept, its capsule joins the union and the
  // region's fillet binds to its bones. A region of more than MAX_ARMS arms (counted without the short edges) fails the bake and names the cluster. No fallback.
  // A node of TWO edges whose radii differ there is no run-on: it is where one vessel ends in another's end (a thin vein into the start of a fat one: MHV, LGV, LPV, GV), and a shared ring cannot carry the step (it left a flat shoulder). It is a junction of two arms,
  // blended, with no through pair (WP0's run-on rule is equal radii).
  const radiusAtNode = (n: (typeof nodes)[number]): number[] => n.edges.map((x) => { const c = ctx.get(x.edge)!; return c.bones[endBone(c, x.end)]!.r[0]; });
  const isStep = (n: (typeof nodes)[number]): boolean => { if (n.edges.length !== 2) return false; const r = radiusAtNode(n); return Math.abs(r[0]! - r[1]!) > STEP_RATIO * Math.max(r[0]!, r[1]!); };
  // (a through pair whose two halves are baked at different radii is a step along the vessel, not a run: there is no neck to judge, the blend makes the change)
  const throughOf = (n: (typeof nodes)[number]): [number, number] | undefined => {
    if (isStep(n) || !n.runOn) return undefined;
    const r = radiusAtNode(n), a = r[n.runOn[0]]!, b = r[n.runOn[1]]!;
    return Math.abs(a - b) > STEP_RATIO * Math.max(a, b) ? undefined : n.runOn;
  };
  const jnodes = nodes.filter((n) => n.edges.length >= 3 || isStep(n)), jset = new Set(jnodes.map((n) => n.id)), jbase = new Set(jset);
  const parent = new Map(jnodes.map((n) => [n.id, n.id]));
  const root = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const kAt = (nd: (typeof nodes)[number], pose: 0 | 1 = 0): number => SKIN_K * Math.min(...nd.edges.map((x) => { const c = ctx.get(x.edge)!; return c.bones[endBone(c, x.end)]!.r[pose]; }));
  /** an edge's arm's zone at one of its nodes, in one pose: the blend k there plus the arm's radius and half as much again (the seam's clearance, review doc "Rulings on WP0" 1) */
  const zoneAt = (nd: (typeof nodes)[number], c: EdgeCtx, end: 0 | 1, pose: 0 | 1): number => kAt(nd, pose) + 1.5 * c.bones[end === 0 ? 0 : c.count - 1]!.r[pose];
  const shortEdges = new Set<number>();
  /** two junctions an edge apart that the edge cannot hold apart join into one region: the edge joins the union whole (it is not swept) */
  // (the node at the far end of a merged edge joins the region too, whatever it is: a run-on node becomes one more place an arm leaves the region, a free end is a stub the region swallows with its cap)
  const mergeable = (c: EdgeCtx): boolean => { const e = skel.edges[c.idx]!; return !sewnEdges.has(c.idx) && e.from !== e.to && (jset.has(e.from) || jset.has(e.to)); };
  const mergeEdge = (c: EdgeCtx): void => {
    const e = skel.edges[c.idx]!;
    shortEdges.add(c.idx);
    for (const id of [e.from, e.to]) if (!jset.has(id)) { jset.add(id); jnodes.push(nodes.find((n) => n.id === id)!); parent.set(id, id); }
    parent.set(root(e.from), root(e.to));
  };
  /** the arc length of an edge in the map pose (an edge the map pose collapses is as short as it gets there) */
  const mapLength = (c: EdgeCtx): number => { let t = 0; for (let m = 1; m < c.count; m++) t += Math.hypot(...sub(c.bones[m]!.pos[1], c.bones[m - 1]!.pos[1])); return t; };
  for (const c of ctx.values()) {
    const e = skel.edges[c.idx]!, A = nodes.find((n) => n.id === e.from)!, B = nodes.find((n) => n.id === e.to)!;
    if (e.from === e.to || sewnEdges.has(c.idx)) continue;
    // two junctions are one region when their zones overlap in EITHER pose, so the partition is the same in both
    if (jbase.has(e.from) && jbase.has(e.to)) { if (([0, 1] as const).some((q) => (q === 0 ? c.cum[c.count - 1]! : mapLength(c)) < zoneAt(A, c, 0, q) + zoneAt(B, c, 1, q))) mergeEdge(c); }   // (an edge to a node that is no junction merges only when its seam does not fit: the planning pass below)
  }
  let regions = new Map<string, typeof nodes>();
  const groupRegions = (): void => { regions = new Map(); for (const n of jnodes) { const r = root(n.id), g = regions.get(r); if (g) g.push(n); else regions.set(r, [n]); } };
  groupRegions();
  const lo = new Map<number, number>(), hi = new Map<number, number>();   // the seam bone each end of an edge is cut back to (free and run-on ends: none)
  for (const c of ctx.values()) { lo.set(c.idx, 0); hi.set(c.idx, c.count - 1); }
  const seamKey = (e: number, s: number): string => `${e}:${s}`;
  const seamRings = new Map<string, number[]>();
  // THE ARMS' EXTENSIONS (plan owner, 22 Nov): the bones an arm's extension from its seam to the node passes through (local indices, seam first), and a short edge's (ascending, whole). They are the bones that carry the capsules in the shader's row (net/shader-caps.ts),
  // so the extension is a polyline on the very capsule the shader's union holds and cannot stand outside it at any t.
  const extPath = new Map<string, number[]>(), wholePath = new Map<number, number[]>();
  const rowScales = stateScales(skel.edges.length, bakeScale, opts?.states);
  /** An arm (an edge end at the region, with a seam) or an INTERNAL edge (a short edge inside it, whole): its bones out from the start node, arc length and radius along them. */
  interface Arm { edge: number; end: 0 | 1; ctx: EdgeCtx; r: number; arc: number[]; rad: number[]; pts: Vec3[]; bonesOut: number[] /* local bone index at each step out of the node */; node: string }
  const reports: NodeReport[] = [], memo = new Map<string, number>();
  const pendingSkins: (() => void)[] = [];
  const nodeOf = (e: EdgeCtx, end: 0 | 1) => nodes.find((n) => n.id === (end === 0 ? skel.edges[e.idx]!.from : skel.edges[e.idx]!.to))!;
  const plannedSeams = new Map<string, number>(), bodySeams = new Map<string, number>(), mapOkRegions = new Set<string>();
  const otherEndLimit = (c: EdgeCtx, end: 0 | 1): number => {
    // how many bones in from this end a seam may stand: leave one segment between this seam and whatever the other end is cut to
    const other = nodeOf(c, end === 0 ? 1 : 0), cuts = jset.has(other.id);
    const placed = end === 0 ? c.count - 1 - hi.get(c.idx)! : lo.get(c.idx)!;   // (the other end's seam, if already placed, in bones from that end)
    const used = placed > 0 ? placed : plannedSeams.get(`${c.idx}:${end === 0 ? 1 : 0}`) ?? 0;   // (or the one the planning pass found for it)
    if (cuts) return used > 0 ? c.count - 2 - used : Math.floor((c.count - 2) / 2);
    return c.count - 2;
  };
  const armOf = (x: { edge: number; end: 0 | 1 }, node: string): Arm => {
    const c = ctx.get(x.edge)!, order = Array.from({ length: c.count }, (_, m) => (x.end === 0 ? m : c.count - 1 - m)), arc = [0], rad = [c.bones[order[0]!]!.r[0]], pts: Vec3[] = [c.bones[order[0]!]!.pos[0]];
    for (let m = 1; m < c.count; m++) { const a = c.bones[order[m - 1]!]!, b = c.bones[order[m]!]!; arc.push(arc[m - 1]! + Math.hypot(...sub(b.pos[0], a.pos[0]))); rad.push(b.r[0]); pts.push(b.pos[0]); }
    return { edge: x.edge, end: x.end, ctx: c, r: rad[0]!, arc, rad, pts, bonesOut: order, node };
  };
  const radiusAtArm = (a: Arm) => (d: number): number => {
    if (d <= 0) return a.rad[0]!;
    let m = 1; while (m < a.arc.length - 1 && a.arc[m]! < d) m++;
    const t = Math.min(1, Math.max(0, (d - a.arc[m - 1]!) / ((a.arc[m]! - a.arc[m - 1]!) || 1)));
    return a.rad[m - 1]! + (a.rad[m]! - a.rad[m - 1]!) * t;
  };
  const smoothstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const failures: { node: string; why: string }[] = [], mapNotes: { node: string; why: string }[] = [];
  /** what a planning pass learns about a region's seams (see below): the bone each arm's seam stands at, and the arms whose ring clears nothing */
  interface Plan { seam: Map<string, number>; failed: number[]; /** the body-only seams of every arm (what a region falls back to) */ body: Map<string, number>; /** regions whose seams clear at the map layout too (a map-built mesh can stand on the same rings) */ mapOk: Set<string> }
  const meshRegion = (region: typeof jnodes, plan?: Plan): void => {
    const rid = region.map((n) => n.id).join('+'), ids = new Set(region.map((n) => n.id));
    const armsRaw: Arm[] = [], internal: Arm[] = [];
    for (const nd of region) for (const x of nd.edges) {
      if (shortEdges.has(x.edge)) { if (x.end === 0) internal.push(armOf(x, nd.id)); continue; }
      const e = skel.edges[x.edge]!;
      armsRaw.push(armOf(x, nd.id));
    }
    if (armsRaw.length > MAX_ARMS) { if (plan) return; throw new NetMeshError(rid, `the merged region has ${armsRaw.length} arms (the most is ${MAX_ARMS}): ${armsRaw.map((a) => a.ctx.id).join(', ')}`); }
    const mean = (d: 0 | 1 | 2): number => region.reduce((t, n) => t + n.pos[0][d], 0) / region.length, J: Vec3 = region.length === 1 ? region[0]!.pos[0] : [mean(0), mean(1), mean(2)];
    // widest first (the skin's arm order)
    const order = armsRaw.map((_, i) => i).sort((a, b) => armsRaw[b]!.r - armsRaw[a]!.r || a - b);
    const arms = order.map((i) => armsRaw[i]!);
    // a run-on pair at a node (`runOn` indexes `nd.edges`) is mated when both halves are arms: united by a plain minimum, then blended as one
    const mateOf = new Map<number, number>();
    for (const nd of region) if (throughOf(nd)) {
      const ro = throughOf(nd)!, ia = arms.findIndex((a) => a.edge === nd.edges[ro[0]]!.edge && a.end === nd.edges[ro[0]]!.end), ib = arms.findIndex((a) => a.edge === nd.edges[ro[1]]!.edge && a.end === nd.edges[ro[1]]!.end);
      if (ia >= 0 && ib >= 0) { mateOf.set(ia, ib); mateOf.set(ib, ia); }
    }
    const skinArms: SkinArm[] = arms.map((a) => ({ vesselId: a.ctx.id, end: a.end, courseIndex: 0, dataIndex: 0, lensIndex: 0, baseD: 1, widthKind: 0, restR: a.r, jointR: a.r, ...(region.length > 1 ? { at: nodes.find((n) => n.id === a.node)!.pos[0] } : {}) }));
    const k = skinKOf(skinArms);
    const limit = arms.map((a) => plan ? Math.max(1, a.ctx.count - 2) : Math.max(1, otherEndLimit(a.ctx, a.end)));
    // the capsules (axes) first: each arm's bones out from its node, long enough to carry its seam; then the short edges whole. Every one is a capsule of the union, so the fillet fills the region between the arms.
    // Every capsule is a run of BONES (the polyline through their positions, their radii): the shader rebuilds the same capsules from the bone rows, so the union the fillet is meshed on is the one it projects onto live.
    const base: Capsule[] = [], capBones: number[][] = [], capOf: (Arm | null)[] = [];
    const capFromBones = (ids: readonly number[], pose: Pose): Capsule => {
      const pts = new Float64Array(3 * ids.length), r = new Float64Array(ids.length);
      ids.forEach((g, q) => { const P = bonePos(skel, g, pose); pts[3 * q] = P[0]; pts[3 * q + 1] = P[1]; pts[3 * q + 2] = P[2]; r[q] = boneRadius(skel, g, pose); });
      return { n: ids.length, pts, r };
    };
    arms.forEach((a, i) => {
      // long enough to carry the seam and a couple of bones past it, no longer: what runs on beyond the seam is the sweep's, and the sheet cuts only a cylinder of it away
      const hint = plannedSeams.get(`${a.edge}:${a.end}`);
      let last: number;
      if (plan || hint === undefined) {
        const want = Math.min(Math.max(ARM_REACH * a.r, 0.9 * a.arc[Math.min(a.arc.length - 1, limit[i]! + 1)]!), PLAN_REACH * a.r);
        last = 1; while (last < a.arc.length - 1 && a.arc[last]! < want) last++;
      } else {
        // the tail past the seam is the sheet's to cut away, so it must stay inside the cylinder it cuts (SHEET_CUT_R radii of the seam's axis): a tail that bends out of it (C3's first bones turn within three radii) leaves a stray strip, read as extra seam loops. It is taken only as far as it stays in.
        last = Math.min(a.arc.length - 1, hint + 2);
        const C = a.pts[hint]!, B = a.pts[hint - 1]!, nl = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]) || 1, ax = [(C[0] - B[0]) / nl, (C[1] - B[1]) / nl, (C[2] - B[2]) / nl];
        const outside = (m: number): boolean => {
          const P = a.pts[m]!, px = P[0] - C[0], py = P[1] - C[1], pz = P[2] - C[2], h = px * ax[0]! + py * ax[1]! + pz * ax[2]!;
          return Math.hypot(px - h * ax[0]!, py - h * ax[1]!, pz - h * ax[2]!) + a.rad[m]! > (SHEET_CUT_R - 0.05) * a.rad[hint]!;
        };
        while (last > hint && outside(last)) last--;
      }
      const ids = a.bonesOut.slice(0, Math.max(1, last) + 1).map((m) => gbone(a.ctx, m));
      capBones.push(ids); capOf.push(null); base.push(capFromBones(ids, 0));
    });
    const internalCap = new Map<(typeof internal)[number], Capsule>();
    for (const a of internal) { const ids = a.bonesOut.map((m) => gbone(a.ctx, m)), c = capFromBones(ids, 0); internalCap.set(a, c); base.push(c); capBones.push(ids); capOf.push(a); }
    const caps: Capsule[] = base.slice();
    const applyMates = (): void => { base.forEach((c, i) => { caps[i] = mateOf.has(i) ? { ...c, mate: mateOf.get(i)! } : c; }); };
    applyMates();
    // THE THROUGH PAIRS and the no-neck rule (neck.ts): the two edges that run on through a node (`runOn`), followed across short edges to the arms they reach. A pair is judged on the union it will be meshed on: a pair across a merged short edge starts as the plain union, one at a single node as the mate
    // minimum; one that necks takes the other; one that necks both ways fails the bake and names itself.
    const sideOf = (nd: (typeof nodes)[number], at: number): { arm: number; pts: Vec3[]; rad: number[]; via: { edge: number; fwd: boolean; pts: Vec3[]; rad: number[]; bone: number[] }[] } | null => {
      const pts: Vec3[] = [], rad: number[] = [], via: { edge: number; fwd: boolean; pts: Vec3[]; rad: number[]; bone: number[] }[] = [];
      let cur = { nd, x: nd.edges[at]! };
      for (let guard = 0; guard < 8; guard++) {
        const x = cur.x;
        if (!shortEdges.has(x.edge)) {
          const ai = arms.findIndex((a) => a.edge === x.edge && a.end === x.end && a.node === cur.nd.id);
          if (ai < 0) return null;
          const a = arms[ai]!;
          // (the axis is the capsule's own polyline, not the bones': the union is made of the capsules, which cut a bend's corners, and a profile measured about the bones' line would read that offset as a neck)
          const c = base[ai]!;
          let acc = 0;
          for (let i = 0; i < c.n; i++) {
            if (i > 0) acc += Math.hypot(c.pts[3 * i]! - c.pts[3 * i - 3]!, c.pts[3 * i + 1]! - c.pts[3 * i - 2]!, c.pts[3 * i + 2]! - c.pts[3 * i - 1]!);
            if (i > 0 || !pts.length) { pts.push([c.pts[3 * i]!, c.pts[3 * i + 1]!, c.pts[3 * i + 2]!]); rad.push(c.r[i]!); }
            if (acc >= 1.5 * a.r) break;
          }
          return { arm: ai, pts, rad, via };
        }
        const it = internal.find((a) => a.edge === x.edge)!, fwd = x.end === 0;
        via.push({ edge: x.edge, fwd, pts: it.pts, rad: it.rad, bone: it.bonesOut.map((m) => gbone(it.ctx, m)) });
        const ic = internalCap.get(it)!;
        for (let i = pts.length ? 1 : 0; i < ic.n; i++) { const j = fwd ? i : ic.n - 1 - i; pts.push([ic.pts[3 * j]!, ic.pts[3 * j + 1]!, ic.pts[3 * j + 2]!]); rad.push(ic.r[j]!); }
        const e = skel.edges[x.edge]!, far = nodes.find((n) => n.id === (fwd ? e.to : e.from))!, back = far.edges.findIndex((y) => y.edge === x.edge && y.end === (fwd ? 1 : 0));
        const fro = throughOf(far);
        if (!fro || !fro.includes(back)) return null;
        cur = { nd: far, x: far.edges[fro[0] === back ? fro[1] : fro[0]]! };
      }
      return null;
    };
    const throughReport: NodeReport['through'] = [], seenPair = new Set<string>();
    for (const nd of region) if (throughOf(nd) && !plan) {   // (a planning pass only places seams: the neck rule runs in the real one)
      const s0 = sideOf(nd, throughOf(nd)![0]), s1 = sideOf(nd, throughOf(nd)![1]);
      if (!s0 || !s1 || s0.arm === s1.arm) continue;
      const key = [s0.arm, s1.arm].sort().join('-');
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      const axis = [...s0.pts].reverse().concat(s1.pts.slice(1)), rad = [...s0.rad].reverse().concat(s1.rad.slice(1));
      // the pair is judged ALONE: the other arms' fillets only add material (a thin branch flares the trunk it leaves, a branch meeting at a shallow angle thickens it on every side), so what the rule must catch is the pair's own waist or ledge
      const viaEdges0 = new Set([...s0.via, ...s1.via].map((v) => v.edge));
      const alone = (): Capsule[] => {
        const ids = [s0.arm, s1.arm];
        for (let i = arms.length; i < caps.length; i++) if (capOf[i] && viaEdges0.has(capOf[i]!.edge)) ids.push(i);
        return ids.map((i) => { const c = caps[i]!; return c.mate !== undefined && ids.includes(c.mate) ? { ...c, mate: ids.indexOf(c.mate) } : { ...c, mate: undefined }; });
      };
      let res = throughNeck(axis, rad, alone(), k), toggled = false;
      if (!res.ok) {
        if (mateOf.get(s0.arm) === s1.arm) { mateOf.delete(s0.arm); mateOf.delete(s1.arm); } else { mateOf.set(s0.arm, s1.arm); mateOf.set(s1.arm, s0.arm); }
        applyMates();
        let again = throughNeck(axis, rad, alone(), k);
        if (!again.ok && (s0.via.length || s1.via.length)) {
          // across short edges the mate minimum of the two ARMS leaves the short edge blending with them (a bump at each node): the pair is made ONE capsule from far point to far point, through the short edges' bones, both arms' slots holding it, mated to each other; the short edges' own capsules leave the union
          const A = base[s0.arm]!, B = base[s1.arm]!, pts: number[] = [], rr: number[] = [], bn: number[] = [];
          const bnA = capBones[s0.arm]!, bnB = capBones[s1.arm]!;
          for (let i = A.n - 1; i >= 0; i--) { pts.push(A.pts[3 * i]!, A.pts[3 * i + 1]!, A.pts[3 * i + 2]!); rr.push(A.r[i]!); bn.push(bnA[i]!); }
          for (const v of s0.via.slice().reverse()) for (let i = 0; i < v.pts.length; i++) { const j = v.fwd ? v.pts.length - 1 - i : i; if (i === 0 && pts.length) continue; pts.push(...v.pts[j]!); rr.push(v.rad[j]!); bn.push(v.bone[j]!); }
          for (const v of s1.via) for (let i = 0; i < v.pts.length; i++) { const j = v.fwd ? i : v.pts.length - 1 - i; if (i === 0) continue; pts.push(...v.pts[j]!); rr.push(v.rad[j]!); bn.push(v.bone[j]!); }
          for (let i = 1; i < B.n; i++) { pts.push(B.pts[3 * i]!, B.pts[3 * i + 1]!, B.pts[3 * i + 2]!); rr.push(B.r[i]!); bn.push(bnB[i]!); }
          const run: Capsule = { n: rr.length, pts: Float64Array.from(pts), r: Float64Array.from(rr) };
          const viaEdges = new Set([...s0.via, ...s1.via].map((v) => v.edge));
          for (const i of [s0.arm, s1.arm]) { base[i] = run; capBones[i] = bn; }
          for (let i = base.length - 1; i >= arms.length; i--) if (capOf[i] && viaEdges.has(capOf[i]!.edge)) { base.splice(i, 1); capBones.splice(i, 1); capOf.splice(i, 1); }
          caps.length = base.length;
          mateOf.set(s0.arm, s1.arm); mateOf.set(s1.arm, s0.arm);
          applyMates();
          again = throughNeck(axis, rad, alone(), k);
        }
        if (!again.ok) throw new NetMeshError(rid, `the through pair ${arms[s0.arm]!.ctx.id} - ${arms[s1.arm]!.ctx.id} necks with the plain union and with the mate minimum: ${res.why}`);
        res = again; toggled = true;
      }
      throughReport.push({ arms: [arms[s0.arm]!.edge, arms[s1.arm]!.edge], mated: mateOf.get(s0.arm) === s1.arm, toggled, margin: res.margin });
    }
    // The seam of each arm stands at the first bone where (1) its ring clears every other capsule by k plus half the narrower radius (the fixture rule of tests/skin-mesh.test.ts), and (2) nothing of any other capsule lies in the cylinder the sheet cuts away beyond
    // the seam's plane (sheet.ts: SHEET_CUT_R radii of the ring's axis): an arm that grazes another leaves a stray strip of surface there, which the builder reads as an extra seam loop. One rule, no fallback: an arm that finds no such bone fails its region.
    // (the body mesh's seam clears at the body layout; the map-built mesh has its own, found the same way at the map layout)
    const k1 = SKIN_K * Math.min(...arms.map((a) => boneRadius(skel, gbone(a.ctx, endBone(a.ctx, a.end)), 1)));
    const mapCaps = (): Capsule[] => capBones.map((ids, q) => ({ ...capFromBones(ids, 1), ...(caps[q]!.mate !== undefined ? { mate: caps[q]!.mate } : {}) }));
    const clearAt = (i: number, m: number): boolean => clearAtPose(i, m, 0, caps, k);
    const clearAtPose = (i: number, m: number, pose: Pose, capsP: readonly Capsule[], kP: number): boolean => {
      const a = arms[i]!, S = sampleP(a.ctx, a.end === 0 ? m : a.ctx.count - 1 - m, pose), ring = ringOf(S, a.ctx.alpha).p;
      const at = (mm: number): { P: Vec3; r: number } => { const g = gbone(a.ctx, a.bonesOut[mm]!); return { P: bonePos(skel, g, pose), r: boneRadius(skel, g, pose) }; };
      for (let q = 0; q < capsP.length; q++) {
        if (q === i || mateOf.get(i) === q) continue;
        const c = capsP[q]!;
        for (let j = 0; j < RADIAL; j++) if (sdArm(c, ring[3 * j]!, ring[3 * j + 1]!, ring[3 * j + 2]!) < kP + 0.5 * Math.min(S.r, c.r[0]!)) return false;
        // the cut cylinder: the ring's centre, its direction out of the region, its radius
        const C = at(m).P, B = at(m - 1).P, nl = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]) || 1, nx = (C[0] - B[0]) / nl, ny = (C[1] - B[1]) / nl, nz = (C[2] - B[2]) / nl, rm = at(m).r;
        for (let u = 0; u < c.n - 1; u++) for (let sub = 0; sub <= CYL_STEPS; sub++) {
          const f = sub / CYL_STEPS, px = c.pts[3 * u]! + (c.pts[3 * u + 3]! - c.pts[3 * u]!) * f - C[0], py = c.pts[3 * u + 1]! + (c.pts[3 * u + 4]! - c.pts[3 * u + 1]!) * f - C[1], pz = c.pts[3 * u + 2]! + (c.pts[3 * u + 5]! - c.pts[3 * u + 2]!) * f - C[2];
          const rq = c.r[u]! + (c.r[u + 1]! - c.r[u]!) * f, h = px * nx + py * ny + pz * nz, lat = Math.hypot(px - h * nx, py - h * ny, pz - h * nz);
          if (h + rq + kP > 0 && lat - rq - kP < SHEET_CUT_R * rm) return false;
        }
      }
      return true;
    };
    const seamBones = (): number[] | null => {
      const out: number[] = [];
      let missed = false;
      for (let i = 0; i < arms.length; i++) {
        let found = -1;
        for (let m = 1; m <= limit[i]! && found < 0; m++) if (clearAt(i, m)) found = m;
        if (found < 0) { if (!plan) return null; plan.failed.push(arms[i]!.edge); missed = true; continue; }
        out.push(found);
      }
      if (missed) return null;
      // the map-built mesh stands on the same rings, so a ring must clear at the map layout as well: the first bone at or past the body's that clears in both poses. When every arm has one the region is built twice;
      // when one has none (it would not fit its edge) the region keeps the body mesh alone (and says so), and the seams are the body's.
      if (plan && opts?.maps) {
        arms.forEach((a, i) => plan.body.set(`${a.edge}:${a.end}`, out[i]!));
        const mc = mapCaps(), both = out.map((f, i) => { for (let m = f; m <= limit[i]!; m++) if (clearAtPose(i, m, 0, caps, k) && clearAtPose(i, m, 1, mc, k1)) return m; return -1; });
        if (both.every((m) => m > 0)) { plan.mapOk.add(rid); return both; }
      }
      return out;
    };
    if (plan) {
      const seams = seamBones();
      if (seams) arms.forEach((a, i) => plan.seam.set(`${a.edge}:${a.end}`, seams[i]!));
      return;
    }
    {
      const seams = arms.map((a) => plannedSeams.get(`${a.edge}:${a.end}`));
      const none = seams.findIndex((x) => x === undefined);
      if (none >= 0) throw new NetMeshError(rid, `the junction will not mesh: no seam ring of ${arms[none]!.ctx.id} clears the other arms`);
      const over = seams.findIndex((x, i) => x! > limit[i]!);
      if (over >= 0) throw new NetMeshError(rid, `the junction will not mesh: the seams do not fit inside the edges (${arms[over]!.ctx.id} is too short for its two junctions)`);
      const rings: Float32Array[] = [], normals: Float32Array[] = [];
      arms.forEach((a, i) => { const S = sample(a.ctx, a.end === 0 ? seams[i]! : a.ctx.count - 1 - seams[i]!), r = ringOf(S, a.ctx.alpha); rings.push(r.p); normals.push(r.nrm); });
      const junction: SkinJunction = { node: rid, J, arms: skinArms, surface: true, ...(arms.length > 6 ? { maxArms: MAX_ARMS } : {}) };
      const cuts: SkinCut[] = arms.map((a, i) => ({ vesselId: a.ctx.id, end: a.end, ring: seams[i]!, u: seams[i]! / (a.ctx.count - 1) }));
      const cleaned = (skin0: ReturnType<typeof buildSkinSteady>, capsX: readonly Capsule[], kX: number): ReturnType<typeof buildSkinSteady> => {
        // a sliver the remesh left is cleaned here, once, on the same union: edges flipped where that raises the smallest angle, the free vertices evened out along the surface (relax.ts); the seam rings stay
        const V0 = skin0.position.length / 3, P = Float64Array.from(skin0.position), tr = Array.from(skin0.index), fixed = new Uint8Array(V0).fill(1, 0, arms.length * RADIAL).fill(0, arms.length * RADIAL);
        dropCaps(tr, fixed);
        relax({ pos: P, tris: tr, fixed, caps: capsX, k: kX }, { rounds: 12, flips: true });
        // vertices no triangle uses any more (a cap dropped) leave the list; the seam rings come first and are all used
        const remap = new Int32Array(V0).fill(-1);
        for (const v of tr) remap[v] = 0;
        let n = 0;
        for (let v = 0; v < V0; v++) if (remap[v] === 0) remap[v] = n++;
        const position = new Float32Array(3 * n), index = new (skin0.index.constructor as Uint32ArrayConstructor)(tr.length);
        for (let v = 0; v < V0; v++) if (remap[v]! >= 0) for (let d = 0; d < 3; d++) position[3 * remap[v]! + d] = P[3 * v + d]!;
        for (let q = 0; q < tr.length; q++) index[q] = remap[tr[q]!]!;
        return { ...skin0, position, index };
      };
      let skin;
      try { skin = buildSkinSteady(junction, cuts, rings, normals, caps, arms.length > 6 || internal.length ? 48000 : undefined, memo); }
      catch (e) {
        if (e instanceof SkinBuildError) throw new NetMeshError(rid, `the junction will not mesh: ${e.message}`); throw e; }
      skin = cleaned(skin, caps, k);
      // the fillet's triangles are held to a smallest angle (MIN_ANGLE): one with a sliver names its region
      let worstAngle = 180;
      for (let t = 0; t < skin.index.length; t += 3) worstAngle = Math.min(worstAngle, minAngleDeg(skin.position, skin.index[t]!, skin.index[t + 1]!, skin.index[t + 2]!));
      if (worstAngle <= MIN_ANGLE) throw new NetMeshError(rid, `the junction will not mesh: the fillet has a triangle with a ${worstAngle.toFixed(1)} degree angle (the least is ${MIN_ANGLE})`);
      // the arms' sweeps stop at the seams
      arms.forEach((a, i) => { if (a.end === 0) lo.set(a.edge, Math.max(lo.get(a.edge)!, seams[i]!)); else hi.set(a.edge, Math.min(hi.get(a.edge)!, a.ctx.count - 1 - seams[i]!)); });
      const armSeams = seams as number[], armList = arms, usedTries = 1;
      const must = new Set<number>(arms.flatMap((a, i) => [gbone(a.ctx, a.end === 0 ? seams[i]! : a.ctx.count - 1 - seams[i]!), gbone(a.ctx, endBone(a.ctx, a.end))]));
      capOf.forEach((a) => { if (a) { must.add(gbone(a.ctx, 0)); must.add(gbone(a.ctx, a.ctx.count - 1)); } });
      const row = shaderBones(skel, capBones, REGION_PTS, rowScales, capBones.map(() => must));
      row.forEach((f, ci) => { if (!Number.isFinite(f.worst)) mapNotes.push({ node: rid, why: `more bones must stay on capsule ${ci} than the shader's row holds (${REGION_PTS})` }); });
      arms.forEach((a, i) => {
        const chosen = new Set(row[i]!.bones), c = a.ctx, seamL = a.end === 0 ? seams[i]! : c.count - 1 - seams[i]!, list: number[] = [];
        if (a.end === 0) { for (let l = seamL; l >= 0; l--) if (l === seamL || l === 0 || chosen.has(gbone(c, l))) list.push(l); } else { for (let l = seamL; l <= c.count - 1; l++) if (l === seamL || l === c.count - 1 || chosen.has(gbone(c, l))) list.push(l); }
        extPath.set(`${a.edge}:${a.end}`, list);
      });
      // (a short edge's own capsule, or the through chain that took it in: the bones of either that the row keeps)
      for (const a of internal) {
        const chosen = new Set<number>(); capBones.forEach((ids, ci) => { if (ids.some((g) => g >= a.ctx.first && g < a.ctx.first + a.ctx.count)) row[ci]!.bones.forEach((g) => chosen.add(g)); });
        const list: number[] = []; for (let l = 0; l < a.ctx.count; l++) if (l === 0 || l === a.ctx.count - 1 || chosen.has(gbone(a.ctx, l))) list.push(l);
        wholePath.set(a.edge, list);
      }
      const emit = (skin: ReturnType<typeof buildSkinSteady>, capsG: readonly Capsule[], kG: number, pose: 0 | 1): void => {
        const ringIds = armList.map((a, i) => seamRings.get(seamKey(a.edge, a.end === 0 ? armSeams[i]! : a.ctx.count - 1 - armSeams[i]!))!);
        const S = armList.length * RADIAL, V = skin.position.length / 3, map = new Int32Array(V);
        for (let a = 0; a < armList.length; a++) for (let q = 0; q < RADIAL; q++) map[a * RADIAL + q] = ringIds[a]![q]!;
        const vstart = vb.length, tstart = tris.length, cp = new Float64Array(7), sw = new Float64Array(capsG.length), g = new Float64Array(3);
        for (let v = S; v < V; v++) {
          const x = skin.position[3 * v]!, y = skin.position[3 * v + 1]!, z = skin.position[3 * v + 2]!;
          // each capsule's share (the skin builder's softmax of -sd / kG, sharpened w^4), over the arms AND the short edges; the four largest, renormalised; each capsule's nearest bone to the vertex's nearest point on its axis
          let low = Infinity;
          for (let i = 0; i < capsG.length; i++) { sw[i] = sdArm(capsG[i]!, x, y, z); if (sw[i]! < low) low = sw[i]!; }
          let tot = 0;
          for (let i = 0; i < capsG.length; i++) { const e = Math.exp(-(sw[i]! - low) / kG); sw[i] = e * e * e * e; tot += sw[i]!; }
          const w: [number, number][] = [];
          for (let i = 0; i < capsG.length; i++) if (sw[i]! / tot > 1e-6) w.push([i, sw[i]! / tot]);
          w.sort((p, q) => q[1] - p[1]);
          const top = w.slice(0, 4), sum = top.reduce((t, e) => t + e[1], 0), bones: number[] = [], weights: number[] = [];
          for (const [i, wi] of top) {
            closestOnArm(capsG[i]!, x, y, z, cp);
            const gb = capBones[i]![cp[6]! < 0.5 ? cp[5]! : Math.min(capBones[i]!.length - 1, cp[5]! + 1)]!, at = bones.indexOf(gb);
            if (at >= 0) weights[at] = weights[at]! + wi / sum; else { bones.push(gb); weights.push(wi / sum); }
          }
          // the rest normal: the union's gradient at the SHADE blend width (exact-normal.ts, the same softening the old fragment stage took per pixel), easing to the tube's own radial direction where one arm is all there is
          sdUnionGrad(capsG, SKIN_SHADE_K * kG, x, y, z, g);
          const gl = Math.hypot(g[0]!, g[1]!, g[2]!) || 1, wmax = top[0]![1] / sum, topCap = capsG[top[0]![0]]!;
          closestOnArm(topCap, x, y, z, cp);
          const rx = x - cp[0]!, ry = y - cp[1]!, rz = z - cp[2]!, rl = Math.hypot(rx, ry, rz) || 1, t = smoothstep(0.6, SKIN_RING_W_FROM, wmax);
          const nx = g[0]! / gl + t * (rx / rl - g[0]! / gl), ny = g[1]! / gl + t * (ry / rl - g[1]! / gl), nz = g[2]! / gl + t * (rz / rl - g[2]! / gl), nl = Math.hypot(nx, ny, nz) || 1;
          map[v] = addVertex(skin.position, 3 * v, bones, weights, [nx / nl, ny / nl, nz / nl], 0, pose);
        }
        for (let i = 0; i < skin.index.length; i++) tris.push(map[skin.index[i]!]!);
        reports.push({ node: rid, kind: 'junction', seams: armSeams.slice(), arms: armList.map((a) => a.edge), triStart: tstart / 3, triCount: (tris.length - tstart) / 3, vertStart: vstart, vertCount: vb.length - vstart, tries: usedTries, variant: pose, capBones: capBones.map((b) => b.slice()), regionBones: row.map((f) => f.bones.slice()), rings: ringIds.map((r) => Array.from(r)), caps: caps.map((c) => ({ pts: Array.from(c.pts), r: Array.from(c.r), mate: c.mate ?? -1 })), through: throughReport });
      };
      pendingSkins.push(() => emit(skin, caps, k, 0));
      // THE MAP-BUILT MESH (plan owner, 22 Nov): the same region meshed again on the capsules, rings and node as they stand at the MAP layout, from the same seam bones (their rings are the tubes' own, bound to the same bones), so the region has two
      // meshes in one draw, each projected onto the same live union. It is built only where every seam clears at both layouts (`mapOkRegions`); a failure to mesh it leaves the body mesh alone, named in `mapNotes`.
      const nodePosAt = (n: (typeof nodes)[number], pose: Pose): Vec3 => { if (typeof pose === 'number') return n.pos[pose === 0 ? 0 : 1]; const x = n.edges[0]!, c = ctx.get(x.edge)!; return bonePos(skel, gbone(c, endBone(c, x.end)), pose); };
      const meshVariant = (pose: Pose, variant: 1): void => {
        const label = 'map-built';
        try {
          const capsV: Capsule[] = capBones.map((ids, q) => ({ ...capFromBones(ids, pose), ...(caps[q]!.mate !== undefined ? { mate: caps[q]!.mate } : {}) }));
          const skinArmsV: SkinArm[] = skinArms.map((sa, i) => { const a = arms[i]!, rV = boneRadius(skel, gbone(a.ctx, endBone(a.ctx, a.end)), pose); return { ...sa, restR: rV, jointR: rV, ...(region.length > 1 ? { at: nodePosAt(nodes.find((n) => n.id === a.node)!, pose) } : {}) }; });
          const meanV = (d: 0 | 1 | 2): number => region.reduce((t, n) => t + nodePosAt(n, pose)[d], 0) / region.length, JV: Vec3 = region.length === 1 ? nodePosAt(region[0]!, pose) : [meanV(0), meanV(1), meanV(2)];
          const ringsV: Float32Array[] = [], normalsV: Float32Array[] = [];
          arms.forEach((a, i) => { const SV = sampleP(a.ctx, a.end === 0 ? seams[i]! : a.ctx.count - 1 - seams[i]!, pose), rV = ringOf(SV, a.ctx.alpha); ringsV.push(rV.p); normalsV.push(rV.nrm); });
          const kV = skinKOf(skinArmsV), junctionV: SkinJunction = { ...junction, J: JV, arms: skinArmsV };
          let skinV;
          try { skinV = buildSkinSteady(junctionV, cuts, ringsV, normalsV, capsV, arms.length > 6 || internal.length ? 48000 : undefined, new Map()); }
          catch (e) { if (e instanceof SkinBuildError) throw new NetMeshError(rid, `the ${label} mesh will not mesh: ${e.message}`); throw e; }
          skinV = cleaned(skinV, capsV, kV);
          let worstV = 180;
          for (let t = 0; t < skinV.index.length; t += 3) worstV = Math.min(worstV, minAngleDeg(skinV.position, skinV.index[t]!, skinV.index[t + 1]!, skinV.index[t + 2]!));
          if (worstV <= MIN_ANGLE) throw new NetMeshError(rid, `the ${label} mesh has a triangle with a ${worstV.toFixed(1)} degree angle (the least is ${MIN_ANGLE})`);
          variantPose[variant] = pose;
          pendingSkins.push(() => emit(skinV, capsV, kV, variant));
        } catch (e) { if (!(e instanceof NetMeshError)) throw e; mapNotes.push({ node: rid, why: e.message }); }
      };
      if (mapOkRegions.has(rid)) meshVariant(1, 1);
      else if (opts?.maps) mapNotes.push({ node: rid, why: 'no seam ring clears the arms at both layouts inside its edge (or the farther seams would not mesh): the body mesh is drawn alone' });
    }
  };
  // A junction an edge cannot keep apart from the next is merged with it (the edge's two seams, each as far out as its ring needs to clear the other arms, must fit inside it; an arm whose ring clears nothing before its edge ends is the same case): plan the seams of every region, merge the edges that fail, and plan again until none does.
  // An arm that runs on into a plain node or a free end cannot be merged away, and fails in the meshing below, named.
  for (let round = 0; round < jnodes.length; round++) {
    const plan: Plan = { seam: new Map(), failed: [], body: new Map(), mapOk: new Set() };
    for (const region of regions.values()) meshRegion(region, plan);
    let merged = false;
    for (const c of ctx.values()) {
      if (shortEdges.has(c.idx) || !mergeable(c)) continue;
      const s0 = plan.seam.get(`${c.idx}:0`), s1 = plan.seam.get(`${c.idx}:1`);
      if (plan.failed.includes(c.idx) || (s0 !== undefined && s1 !== undefined && s0 + s1 > c.count - 2)) { mergeEdge(c); merged = true; }
    }
    if (!merged) { plan.seam.forEach((v, key) => plannedSeams.set(key, v)); plan.mapOk.forEach((r) => mapOkRegions.add(r)); plan.body.forEach((v, key) => bodySeams.set(key, v)); break; }
    groupRegions();
  }
  buildWelds();
  for (const region of regions.values()) {
    const rid = [...region].map((n) => n.id).join('+');
    try {
      try { meshRegion(region); }
      catch (e) {
        // the farther seams the map-built mesh needs did not mesh: the region keeps its body seams and the body mesh alone
        if (!(e instanceof NetMeshError) || !mapOkRegions.has(rid)) throw e;
        mapOkRegions.delete(rid);
        for (const nd of region) for (const x of nd.edges) { const key = `${x.edge}:${x.end}`; if (bodySeams.has(key)) plannedSeams.set(key, bodySeams.get(key)!); }
        meshRegion(region);
      }
    }
    catch (e) { if (opts?.lenient && e instanceof NetMeshError) failures.push({ node: e.node, why: e.message }); else throw e; }   // (lenient: the diagnosis run lists every failing region; the bake never is)
  }
  function nearestBone(arc: readonly number[], d: number): number {
    let best = 0;
    for (let m = 1; m < arc.length; m++) if (Math.abs(arc[m]! - d) < Math.abs(arc[best]! - d)) best = m;
    return best;
  }

  // ---- sweeps ----
  const sweepStart = tris.length;
  for (const c of ctx.values()) {
    // (a short edge inside a merged region is swept whole, with a dome at each end: the fillet hides it at rest, the plain tubes show it while the fillet steps aside)
    const sa = lo.get(c.idx)!, sb = hi.get(c.idx)!, inner = shortEdges.has(c.idx);
    if (!inner && sb <= sa) throw new NetMeshError(c.id, `the edge is cut away by its junctions (seams at bones ${sa} and ${sb} of ${c.count})`);
    const ends: (0 | 1)[] = [0, 1];
    const ringAt = (s: number): number[] => {
      const S = sample(c, s), r = ringOf(S, c.alpha), { bones, weights } = boneOfSample(c, S);
      // a ring at an end that is welded to another edge's is the shared one
      for (const end of ends) {
        if (Math.abs(s - endBone(c, end)) > 1e-9) continue;
        const wl = weldAt(c, end);
        if (!wl) continue;
        const w = wl.w, mine = w.canon.edge === c.idx && w.canon.end === end;
        const ow = ctx.get(mine ? w.other.edge : w.canon.edge)!, oe = mine ? w.other.end : w.canon.end;
        const perm = mine ? null : w.perm;
        if (!w.ids) {
          // created by whoever sweeps first, in the canonical edge's lattice order; bound half to each bone
          const ids: number[] = [], bothBones = [gbone(c, S.k), gbone(ow, endBone(ow, oe))], half = [0.5, 0.5];
          for (let j = 0; j < RADIAL; j++) { const slot = perm ? perm[j]! : j; ids[slot] = addVertex(r.p, 3 * j, bothBones, half, r.nrm, 3 * j); }
          w.ids = ids;
        }
        return perm ? Array.from({ length: RADIAL }, (_, j) => w.ids![perm[j]!]!) : w.ids!.slice();
      }
      const ids: number[] = [];
      for (let j = 0; j < RADIAL; j++) ids.push(addVertex(r.p, 3 * j, bones, weights, r.nrm, 3 * j));
      return ids;
    };
    /** Sweeps from the ring `from` (standing at path[0]) through the bones of `path` (local indices; towards smaller indices when it descends): one ring at each, bound to that bone alone, and straight between them, which is the capsule's own frustum (the polyline through the
     *  bones, the radius linear). A ring between two bones would carry its along-axis offset scaled by the live radii and leave the capsule when the bones' radii change differently (the Circuit's peel): there are none. */
    const walk = (path: readonly number[], from: number[]): number[] => {
      let q = from;
      for (let i = 0; i + 1 < path.length; i++) { const cur = ringAt(path[i + 1]!); if (path[i + 1]! > path[i]!) bridge(q, cur); else bridge(cur, q); q = cur; }
      return q;
    };
    let prev: number[], first: number[], head: number[];
    if (inner) {
      const path = wholePath.get(c.idx);
      if (!path) continue;   // (the region that holds it did not mesh, a lenient diagnosis run: the edge is left unfilled with it)
      first = ringAt(0); prev = walk(path, first); head = first;
    } else {
      prev = ringAt(sa);
      first = prev;
      if (sa > 0) seamRings.set(seamKey(c.idx, sa), prev);
      for (let k = sa; k < sb; k++) {
        for (let i = 1; i <= c.seg[k]!; i++) {
          const s = i === c.seg[k]! ? k + 1 : k + i / c.seg[k]!, cur = ringAt(s);
          bridge(prev, cur); prev = cur;
          if (i === c.seg[k]! && k + 1 === sb) { if (sb < c.count - 1) seamRings.set(seamKey(c.idx, sb), cur); }
        }
      }
      // THE ARMS RUN ON TO THE NODE (plan owner, 22 Nov): an arm's sweep continues past its seam ring to the node's end bone and ends in a dome there, in this same mesh. At rest the smooth union holds every capsule, so the fillet hides these
      // extensions; while the fillet dissolves during the Circuit move they are the plain tubes that show, and cover the crotch. They follow the polyline through the bones that carry the capsule in the shader's row (net/shader-caps.ts), so they
      // stay inside the live union at every t, and are bound to those bones.
      head = first;
      if (sa > 0) { const path = extPath.get(`${c.idx}:0`); if (!path) throw new NetMeshError(c.id, 'a cut arm end has no extension path'); head = walk(path, first); }
      if (sb < c.count - 1) { const path = extPath.get(`${c.idx}:1`); if (!path) throw new NetMeshError(c.id, 'a cut arm end has no extension path'); prev = walk(path, prev); }
    }
    // free ends, sewn ends (the collar is the shader's), the ends of an arm's extension and of a short edge: a dome
    for (const end of ends) {
      const nd = nodeOf(c, end), cut = inner || (end === 0 ? sa > 0 : sb < c.count - 1);
      if (nd.edges.length !== 1 && !sewn.has(`${c.idx}:${end}`) && !cut) continue;
      const s = endBone(c, end), S = sample(c, s), ring = end === 0 ? head : prev;
      let outer = ring;
      for (const lat of CAP_LATS) {
        const phi = (lat * Math.PI) / 180, rr = S.r * Math.cos(phi), along = (end === 1 ? 1 : -1) * S.r * Math.sin(phi), ids: number[] = [];
        const up = end === 1 ? 1 : -1;
        for (let j = 0; j < RADIAL; j++) {
          const a = theta(j, c.alpha), rad = [0, 1, 2].map((d) => Math.cos(a) * S.n[d]! + Math.sin(a) * S.b[d]!), p = [0, 1, 2].map((d) => S.P[d]! + along * S.t[d]! + rr * rad[d]!), nrm = [0, 1, 2].map((d) => Math.cos(phi) * rad[d]! + up * Math.sin(phi) * S.t[d]!);
          ids.push(addVertex(p, 0, [gbone(c, S.k)], [1], nrm, 0));
        }
        if (end === 1) bridge(outer, ids); else bridge(ids, outer);
        outer = ids;
      }
      const up = end === 1 ? 1 : -1, pole = addVertex([S.P[0] + up * S.r * S.t[0], S.P[1] + up * S.r * S.t[1], S.P[2] + up * S.r * S.t[2]], 0, [gbone(c, S.k)], [1], [up * S.t[0], up * S.t[1], up * S.t[2]], 0);
      const poleRing = new Array<number>(RADIAL).fill(pole);
      if (end === 1) bridge(outer, poleRing); else bridge(poleRing, outer);
    }
  }
  const sweepTriangles = (tris.length - sweepStart) / 3;
  for (const f of pendingSkins) f();
  for (const nd of nodes) if (nd.edges.length <= 2 && !jset.has(nd.id)) reports.push({ node: nd.id, kind: nd.edges.length === 2 ? 'runon' : 'cap', seams: [], arms: nd.edges.map((x) => x.edge), triStart: 0, triCount: 0, vertStart: 0, vertCount: 0, tries: 0, through: [] });

  // ---- the binding: each vertex's offset in each of its bones' frames, divided by the bone's radius ----
  const V = vb.length, position0 = Float32Array.from(pos), bone = new Uint16Array(4 * V), weight = new Float32Array(4 * V), offset0 = new Float32Array(12 * V), normal = new Float32Array(12 * V);
  for (let v = 0; v < V; v++) {
    const bs = vb[v]!, ws = vw[v]!, pose = variantPose[vp[v]!]!;
    let sum = 0;
    for (let i = 0; i < bs.length; i++) sum += ws[i]!;
    for (let i = 0; i < bs.length; i++) {
      // (a map-built mesh's vertex is bound at the MAP layout: the bone's map position, radius and frame; fit.ts then gives it its body offsets)
      const B = skel.bones[bs[i]!]!, F = pose === 0 ? B.frame : boneFrame(skel, bs[i]!, pose), P = pose === 0 ? B.pos[0] : bonePos(skel, bs[i]!, pose), R = pose === 0 ? B.r[0] : boneRadius(skel, bs[i]!, pose), d: V3 = [position0[3 * v]! - P[0], position0[3 * v + 1]! - P[1], position0[3 * v + 2]! - P[2]];
      bone[4 * v + i] = bs[i]!; weight[4 * v + i] = ws[i]! / sum;
      offset0[12 * v + 3 * i] = dot(d, F[0]) / R; offset0[12 * v + 3 * i + 1] = dot(d, F[1]) / R; offset0[12 * v + 3 * i + 2] = dot(d, F[2]) / R;
      // the rest normal in the same frame: the blend rotates it with the bones and renormalises, so no normal is ever derived on screen
      const nw: V3 = [vn[3 * v]!, vn[3 * v + 1]!, vn[3 * v + 2]!];
      normal[12 * v + 3 * i] = dot(nw, F[0]); normal[12 * v + 3 * i + 1] = dot(nw, F[1]); normal[12 * v + 3 * i + 2] = dot(nw, F[2]);
    }
  }
  const index = Uint32Array.from(tris), fit = fitAll(skel, { position: position0, bone, weight, offset: offset0, index }, reports), offset = fit.offset, offsetMap = fit.offsetMap, position = fit.position;
  const mesh: NetMesh = { position, bone, weight, offset, offsetMap, normal, index };
  if (opts?.states?.length) { const armsOf = new Map(reports.map((r) => [r.node, r.arms])); mesh.keys = regionKeys(skel, mesh, fit.done, opts.states, bakeScale, (n) => [...new Set(armsOf.get(n) ?? [])]); }
  return { mesh, edges: [...ctx.keys()], nodes: reports, failures, mapNotes, windows: new Map(), report: { vertices: V, triangles: tris.length / 3, sweepTriangles } };
}

// WP2 of the network geometry (docs: vessel-geometry-review.md): the NETWORK MESHER. A `Skeleton` (WP0) goes in, one watertight `NetMesh` per connected network comes out, every vertex bound to up to four bones.
//   - a vessel (edge) is SWEPT: one ring of RADIAL vertices per bone, with rings between the bones where the bones are far apart (position: Catmull-Rom of the bones, radius and frame interpolated), so a bone is a ring and a ring knows its bone;
//   - a node of three or more edges is a JUNCTION: every arm is cut back to a seam ring (one of its own sweep rings) and the fillet between the seam rings is meshed by the junction skin's builder (skin/mesh.ts, sheet.ts: the smooth union of the arms,
//     remeshed, min angle above 12 degrees). The skin's boundary vertices ARE the arms' sweep vertices (same ids, one index buffer): there is no seam to cut, hide, dither or match;
//   - a node of two edges is a RUN-ON: the two sweeps share the ring at the node (the same vertices), the second edge's lattice rolled to meet the first's;
//   - a node of one edge is a free end: a dome cap.
// Every vertex stores (bone, weight) pairs and its offset in each bone's frame divided by the bone's radius, `p = sum w_i (P_i + r_i (o_i.x t_i + o_i.y n_i + o_i.z b_i))`, so the rest shape is rebuilt exactly (net/oracle in tests) and the vertex shader (WP3)
// only has to move the bones. There is NO fallback: a junction that will not mesh throws `NetMeshError` naming the node, and the bake fails.
import { TUBE_RADIAL } from '../tubes.ts';
import { SkinBuildError, buildSkinSteady } from '../skin/mesh.ts';
import { ARM_REACH, CAPSULE_SEGS, SKIN_K, armCapsule, closestOnArm, sdArm, sdUnionGrad, skinKOf, type Capsule } from '../skin/sdf.ts';
import { SKIN_RING_W_FROM, SKIN_SHADE_K } from '../skin/exact-normal.ts';
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
export const SEAM_TRIES = 12;
/** The most arms one junction region may have (the skin builder's limit); short edges inside a merged region are not arms. */
export const MAX_ARMS = 6;

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
}
export interface NetMeshResult { mesh: NetMesh; edges: number[]; nodes: NodeReport[]; report: { vertices: number; triangles: number; sweepTriangles: number } }

type V3 = [number, number, number];
const sub = (a: Vec3, b: Vec3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** One edge as the mesher walks it. */
interface EdgeCtx { idx: number; id: string; first: number; count: number; bones: Bone[]; cum: number[]; alpha: number; seg: number[] /* rings per segment */ }
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

/** Builds the mesh of one network (`edges`, indices into `skel.edges`; default: the whole skeleton as one). */
export function buildNetMesh(skel: Skeleton, edges?: readonly number[]): NetMeshResult {
  const inNet = new Set(edges ?? skel.edges.map((_, i) => i));
  const ctx = new Map<number, EdgeCtx>();
  for (const i of inNet) {
    const e = skel.edges[i]!, [first, count] = e.bones;
    if (count < 2) throw new NetMeshError(e.id, 'an edge needs at least two bones');
    const bones = skel.bones.slice(first, first + count), cum = [0];
    for (let k = 1; k < count; k++) cum.push(cum[k - 1]! + Math.hypot(...sub(bones[k]!.pos[0], bones[k - 1]!.pos[0])));
    const seg: number[] = [];
    for (let k = 0; k < count - 1; k++) seg.push(Math.max(1, Math.min(MAX_SUB, Math.ceil((cum[k + 1]! - cum[k]!) / (RING_STEP * 0.5 * (bones[k]!.r[0] + bones[k + 1]!.r[0]))))));
    ctx.set(i, { idx: i, id: e.id, first, count, bones, cum, alpha: 0, seg });
  }
  const nodes = skel.nodes.filter((n) => n.edges.length && n.edges.every((x) => inNet.has(x.edge)));
  for (const n of skel.nodes) if (n.edges.some((x) => inNet.has(x.edge)) && !nodes.includes(n)) throw new NetMeshError(n.id, 'the node joins an edge outside this network');
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
    return nd && nd.edges.length === 2 ? { node: nd.id, w: welds.get(nd.id)! } : null;
  };
  const twoNodes = nodes.filter((n) => n.edges.length === 2);
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
  const pos: number[] = [], vn: number[] = [], vb: number[][] = [], vw: number[][] = [];
  /** A vertex at p[o..o+2] bound to `bones` with `weights`, its rest normal n[no..no+2] (unit). */
  const addVertex = (p: ArrayLike<number>, o: number, bones: number[], weights: number[], n: ArrayLike<number>, no: number): number => { pos.push(p[o]!, p[o + 1]!, p[o + 2]!); vn.push(n[no]!, n[no + 1]!, n[no + 2]!); vb.push(bones); vw.push(weights); return vb.length - 1; };
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
  // A junction is a node of three or more edges. Two junctions joined by an edge SHORTER than their two blend zones plus the edge's own end radii (length < kA + kB + RA + RB) are one REGION: the short edge is not swept, its capsule joins the union and the
  // region's fillet binds to its bones. A region of more than MAX_ARMS arms (counted without the short edges) fails the bake and names the cluster. No fallback.
  const jnodes = nodes.filter((n) => n.edges.length >= 3), jset = new Set(jnodes.map((n) => n.id));
  const parent = new Map(jnodes.map((n) => [n.id, n.id]));
  const root = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const kAt = (nd: (typeof nodes)[number]): number => SKIN_K * Math.min(...nd.edges.map((x) => { const c = ctx.get(x.edge)!; return c.bones[endBone(c, x.end)]!.r[0]; }));
  const shortEdges = new Set<number>();
  for (const c of ctx.values()) {
    const e = skel.edges[c.idx]!;
    if (e.from === e.to || !jset.has(e.from) || !jset.has(e.to)) continue;
    const A = nodes.find((n) => n.id === e.from)!, B = nodes.find((n) => n.id === e.to)!;
    if (c.cum[c.count - 1]! < kAt(A) + kAt(B) + c.bones[0]!.r[0] + c.bones[c.count - 1]!.r[0]) { shortEdges.add(c.idx); parent.set(root(e.from), root(e.to)); }
  }
  const regions = new Map<string, typeof nodes>();
  for (const n of jnodes) { const r = root(n.id), g = regions.get(r); if (g) g.push(n); else regions.set(r, [n]); }
  const lo = new Map<number, number>(), hi = new Map<number, number>();   // the seam bone each end of an edge is cut back to (free and run-on ends: none)
  for (const c of ctx.values()) { lo.set(c.idx, 0); hi.set(c.idx, c.count - 1); }
  const seamKey = (e: number, s: number): string => `${e}:${s}`;
  const seamRings = new Map<string, number[]>();
  /** An arm (an edge end at the region, with a seam) or an INTERNAL edge (a short edge inside it, whole): its bones out from the start node, arc length and radius along them. */
  interface Arm { edge: number; end: 0 | 1; ctx: EdgeCtx; r: number; arc: number[]; rad: number[]; pts: Vec3[]; bonesOut: number[] /* local bone index at each step out of the node */; node: string }
  const reports: NodeReport[] = [], memo = new Map<string, number>();
  const pendingSkins: (() => void)[] = [];
  const nodeOf = (e: EdgeCtx, end: 0 | 1) => nodes.find((n) => n.id === (end === 0 ? skel.edges[e.idx]!.from : skel.edges[e.idx]!.to))!;
  const otherEndLimit = (c: EdgeCtx, end: 0 | 1): number => {
    // how many bones in from this end a seam may stand: leave one segment between this seam and whatever the other end is cut to
    const other = nodeOf(c, end === 0 ? 1 : 0), cuts = other.edges.length >= 3;
    const used = end === 0 ? c.count - 1 - hi.get(c.idx)! : lo.get(c.idx)!;   // (the other end's seam, if already placed, in bones from that end)
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

  for (const region of regions.values()) {
    const rid = region.map((n) => n.id).join('+'), ids = new Set(region.map((n) => n.id));
    const armsRaw: Arm[] = [], internal: Arm[] = [];
    for (const nd of region) for (const x of nd.edges) {
      if (shortEdges.has(x.edge)) { if (x.end === 0) internal.push(armOf(x, nd.id)); continue; }
      const e = skel.edges[x.edge]!;
      if (ids.has(e.from) && ids.has(e.to)) throw new NetMeshError(rid, `the edge ${e.id} joins two nodes of one region and is not short enough to merge them (a loop)`);
      armsRaw.push(armOf(x, nd.id));
    }
    if (armsRaw.length > MAX_ARMS) throw new NetMeshError(rid, `the merged region has ${armsRaw.length} arms (the most is ${MAX_ARMS}): ${armsRaw.map((a) => a.ctx.id).join(', ')}`);
    const mean = (d: 0 | 1 | 2): number => region.reduce((t, n) => t + n.pos[0][d], 0) / region.length, J: Vec3 = region.length === 1 ? region[0]!.pos[0] : [mean(0), mean(1), mean(2)];
    // widest first (the skin's arm order)
    const order = armsRaw.map((_, i) => i).sort((a, b) => armsRaw[b]!.r - armsRaw[a]!.r || a - b);
    const arms = order.map((i) => armsRaw[i]!);
    // a run-on pair at a node (`runOn` indexes `nd.edges`) is mated when both halves are arms: united by a plain minimum, then blended as one
    const mateOf = new Map<number, number>();
    for (const nd of region) if (nd.runOn) {
      const ia = arms.findIndex((a) => a.edge === nd.edges[nd.runOn![0]]!.edge && a.end === nd.edges[nd.runOn![0]]!.end), ib = arms.findIndex((a) => a.edge === nd.edges[nd.runOn![1]]!.edge && a.end === nd.edges[nd.runOn![1]]!.end);
      if (ia >= 0 && ib >= 0) { mateOf.set(ia, ib); mateOf.set(ib, ia); }
    }
    const skinArms: SkinArm[] = arms.map((a) => ({ vesselId: a.ctx.id, end: a.end, courseIndex: 0, dataIndex: 0, lensIndex: 0, baseD: 1, widthKind: 0, restR: a.r, jointR: a.r, ...(region.length > 1 ? { at: nodes.find((n) => n.id === a.node)!.pos[0] } : {}) }));
    const k = skinKOf(skinArms);
    const limit = arms.map((a) => Math.max(1, otherEndLimit(a.ctx, a.end)));
    // the capsules (axes) first: each arm's bones out from its node, long enough to carry its seam; then the short edges whole. Every one is a capsule of the union, so the fillet fills the region between the arms.
    const caps: Capsule[] = [], capStep: number[] = [], capArm: Arm[] = [...arms, ...internal];
    arms.forEach((a, i) => {
      const reach = Math.min(a.arc[a.arc.length - 1]!, Math.max(ARM_REACH * a.r, 0.9 * a.arc[Math.min(a.arc.length - 1, limit[i]! + 1)]!));
      const len = Math.max(reach, 3 * a.r), cap = armCapsule({ ...skinArms[i]!, end: 0 }, a.pts, len, radiusAtArm(a));   // (the points already run out of the node, so the capsule must not turn them again)
      capStep.push(len / CAPSULE_SEGS);
      caps.push(mateOf.has(i) ? { ...cap, mate: mateOf.get(i)! } : cap);
    });
    for (const a of internal) { const len = a.arc[a.arc.length - 1]!; caps.push(armCapsule({ ...skinArms[0]!, end: 0 }, a.pts, len, radiusAtArm(a))); capStep.push(len / CAPSULE_SEGS); }
    // the seam of each arm starts at the first bone whose ring clears every other capsule by k + half its radius (the fixture rule of tests/skin-mesh.test.ts), and every arm is pushed one bone further out each failed try
    const seamBones = (try_: number): number[] | null => {
      const out: number[] = [];
      for (let i = 0; i < arms.length; i++) {
        const a = arms[i]!;
        let found = -1;
        for (let m = 1; m <= limit[i]!; m++) {
          const S = sample(a.ctx, a.end === 0 ? m : a.ctx.count - 1 - m), ring = ringOf(S, a.ctx.alpha).p;
          let ok = true;
          for (let j = 0; j < RADIAL && ok; j++) for (let q = 0; q < caps.length; q++) if (q !== i && sdArm(caps[q]!, ring[3 * j]!, ring[3 * j + 1]!, ring[3 * j + 2]!) < k + 0.5 * a.r) { ok = false; break; }
          if (ok) { found = m; break; }
        }
        if (found < 0) return null;
        out.push(found + try_);
      }
      return out;
    };
    let built = false, lastWhy = 'no seam ring clears the other arms', tries = 0;
    for (; tries < SEAM_TRIES && !built; tries++) {
      const seams = seamBones(tries);
      if (!seams) break;
      if (seams.some((s, i) => s > limit[i]!)) { lastWhy = 'the seams do not fit inside the edges (an edge is too short for its two junctions)'; break; }
      const rings: Float32Array[] = [], normals: Float32Array[] = [];
      arms.forEach((a, i) => { const S = sample(a.ctx, a.end === 0 ? seams[i]! : a.ctx.count - 1 - seams[i]!), r = ringOf(S, a.ctx.alpha); rings.push(r.p); normals.push(r.nrm); });
      const junction: SkinJunction = { node: rid, J, arms: skinArms, surface: true };
      const cuts: SkinCut[] = arms.map((a, i) => ({ vesselId: a.ctx.id, end: a.end, ring: seams[i]!, u: seams[i]! / (a.ctx.count - 1) }));
      let skin;
      try { skin = buildSkinSteady(junction, cuts, rings, normals, caps, undefined, memo); }
      catch (e) { if (e instanceof SkinBuildError) { lastWhy = e.message; continue; } throw e; }
      built = true;
      // the arms' sweeps stop at the seams
      arms.forEach((a, i) => { if (a.end === 0) lo.set(a.edge, Math.max(lo.get(a.edge)!, seams[i]!)); else hi.set(a.edge, Math.min(hi.get(a.edge)!, a.ctx.count - 1 - seams[i]!)); });
      const armSeams = seams, armList = arms, usedTries = tries + 1;
      pendingSkins.push(() => {
        const ringIds = armList.map((a, i) => seamRings.get(seamKey(a.edge, a.end === 0 ? armSeams[i]! : a.ctx.count - 1 - armSeams[i]!))!);
        const S = armList.length * RADIAL, V = skin.position.length / 3, map = new Int32Array(V);
        for (let a = 0; a < armList.length; a++) for (let q = 0; q < RADIAL; q++) map[a * RADIAL + q] = ringIds[a]![q]!;
        const vstart = vb.length, tstart = tris.length, cp = new Float64Array(7), sw = new Float64Array(caps.length), g = new Float64Array(3);
        for (let v = S; v < V; v++) {
          const x = skin.position[3 * v]!, y = skin.position[3 * v + 1]!, z = skin.position[3 * v + 2]!;
          // each capsule's share (the skin builder's softmax of -sd / k, sharpened w^4), over the arms AND the short edges; the four largest, renormalised; each capsule's nearest bone to the vertex's nearest point on its axis
          let low = Infinity;
          for (let i = 0; i < caps.length; i++) { sw[i] = sdArm(caps[i]!, x, y, z); if (sw[i]! < low) low = sw[i]!; }
          let tot = 0;
          for (let i = 0; i < caps.length; i++) { const e = Math.exp(-(sw[i]! - low) / k); sw[i] = e * e * e * e; tot += sw[i]!; }
          const w: [number, number][] = [];
          for (let i = 0; i < caps.length; i++) if (sw[i]! / tot > 1e-6) w.push([i, sw[i]! / tot]);
          w.sort((p, q) => q[1] - p[1]);
          const top = w.slice(0, 4), sum = top.reduce((t, e) => t + e[1], 0), bones: number[] = [], weights: number[] = [];
          for (const [i, wi] of top) {
            const a = capArm[i]!;
            closestOnArm(caps[i]!, x, y, z, cp);
            const m = nearestBone(a.arc, (cp[5]! + cp[6]!) * capStep[i]!), gb = gbone(a.ctx, a.bonesOut[m]!), at = bones.indexOf(gb);
            if (at >= 0) weights[at] = weights[at]! + wi / sum; else { bones.push(gb); weights.push(wi / sum); }
          }
          // the rest normal: the union's gradient at the SHADE blend width (exact-normal.ts, the same softening the old fragment stage took per pixel), easing to the tube's own radial direction where one arm is all there is
          sdUnionGrad(caps, SKIN_SHADE_K * k, x, y, z, g);
          const gl = Math.hypot(g[0]!, g[1]!, g[2]!) || 1, wmax = top[0]![1] / sum, topCap = caps[top[0]![0]]!;
          closestOnArm(topCap, x, y, z, cp);
          const rx = x - cp[0]!, ry = y - cp[1]!, rz = z - cp[2]!, rl = Math.hypot(rx, ry, rz) || 1, t = smoothstep(0.6, SKIN_RING_W_FROM, wmax);
          const nx = g[0]! / gl + t * (rx / rl - g[0]! / gl), ny = g[1]! / gl + t * (ry / rl - g[1]! / gl), nz = g[2]! / gl + t * (rz / rl - g[2]! / gl), nl = Math.hypot(nx, ny, nz) || 1;
          map[v] = addVertex(skin.position, 3 * v, bones, weights, [nx / nl, ny / nl, nz / nl], 0);
        }
        for (let i = 0; i < skin.index.length; i++) tris.push(map[skin.index[i]!]!);
        reports.push({ node: rid, kind: 'junction', seams: armSeams.slice(), arms: armList.map((a) => a.edge), triStart: tstart / 3, triCount: (tris.length - tstart) / 3, vertStart: vstart, vertCount: vb.length - vstart, tries: usedTries });
      });
    }
    if (!built) throw new NetMeshError(rid, `the junction will not mesh: ${lastWhy}`);
  }
  function nearestBone(arc: readonly number[], d: number): number {
    let best = 0;
    for (let m = 1; m < arc.length; m++) if (Math.abs(arc[m]! - d) < Math.abs(arc[best]! - d)) best = m;
    return best;
  }

  // ---- sweeps ----
  const sweepStart = tris.length;
  for (const c of ctx.values()) {
    if (shortEdges.has(c.idx)) continue;   // (a short edge inside a merged region is the fillet's, not swept)
    const sa = lo.get(c.idx)!, sb = hi.get(c.idx)!;
    if (sb <= sa) throw new NetMeshError(c.id, `the edge is cut away by its junctions (seams at bones ${sa} and ${sb} of ${c.count})`);
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
    let prev = ringAt(sa);
    const first = prev;
    if (sa > 0) seamRings.set(seamKey(c.idx, sa), prev);
    for (let k = sa; k < sb; k++) {
      for (let i = 1; i <= c.seg[k]!; i++) {
        const s = i === c.seg[k]! ? k + 1 : k + i / c.seg[k]!, cur = ringAt(s);
        bridge(prev, cur); prev = cur;
        if (i === c.seg[k]! && k + 1 === sb) { if (sb < c.count - 1) seamRings.set(seamKey(c.idx, sb), cur); }
      }
    }
    // free ends: a dome
    for (const end of ends) {
      const nd = nodeOf(c, end);
      if (nd.edges.length !== 1) continue;
      const s = endBone(c, end), S = sample(c, s), ring = end === 0 ? first : prev;
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
  for (const nd of nodes) if (nd.edges.length <= 2) reports.push({ node: nd.id, kind: nd.edges.length === 2 ? 'runon' : 'cap', seams: [], arms: nd.edges.map((x) => x.edge), triStart: 0, triCount: 0, vertStart: 0, vertCount: 0, tries: 0 });

  // ---- the binding: each vertex's offset in each of its bones' frames, divided by the bone's radius ----
  const V = vb.length, position = Float32Array.from(pos), bone = new Uint16Array(4 * V), weight = new Float32Array(4 * V), offset = new Float32Array(12 * V), normal = new Float32Array(12 * V);
  for (let v = 0; v < V; v++) {
    const bs = vb[v]!, ws = vw[v]!;
    let sum = 0;
    for (let i = 0; i < bs.length; i++) sum += ws[i]!;
    for (let i = 0; i < bs.length; i++) {
      const B = skel.bones[bs[i]!]!, d: V3 = [position[3 * v]! - B.pos[0][0], position[3 * v + 1]! - B.pos[0][1], position[3 * v + 2]! - B.pos[0][2]];
      bone[4 * v + i] = bs[i]!; weight[4 * v + i] = ws[i]! / sum;
      offset[12 * v + 3 * i] = dot(d, B.frame[0]) / B.r[0]; offset[12 * v + 3 * i + 1] = dot(d, B.frame[1]) / B.r[0]; offset[12 * v + 3 * i + 2] = dot(d, B.frame[2]) / B.r[0];
      // the rest normal in the same frame: the blend rotates it with the bones and renormalises, so no normal is ever derived on screen
      const nw: V3 = [vn[3 * v]!, vn[3 * v + 1]!, vn[3 * v + 2]!];
      normal[12 * v + 3 * i] = dot(nw, B.frame[0]); normal[12 * v + 3 * i + 1] = dot(nw, B.frame[1]); normal[12 * v + 3 * i + 2] = dot(nw, B.frame[2]);
    }
  }
  const mesh: NetMesh = { position, bone, weight, offset, normal, index: Uint32Array.from(tris) };
  return { mesh, edges: [...ctx.keys()], nodes: reports, report: { vertices: V, triangles: tris.length / 3, sweepTriangles } };
}

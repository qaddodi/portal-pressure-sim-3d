// Shared by the network mesher's tests and renders (tests/net-mesh.test.ts, scripts/net-render.mjs): synthetic SKELETONS (until WP0's real one lands the mesher is tried on these), the test-only CPU deformation that is the oracle for
// a bound mesh (never shipped), and the mesh checks (watertight, orientation, angles).
import type { Vec3 } from '../src/scene/anatomy/vessels.ts';
import type { Bone, NetMesh, SkelEdge, SkelNode, Skeleton } from '../src/scene/vessels/net/types.ts';

type V3 = [number, number, number];
const add = (a: Vec3, b: Vec3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** An edge of a fixture: `curve(u)` for u in [0, 1] runs from node `from` to node `to`, `rad(u)` its radius, `roll` turns its frame about the tangent at the start (a run-on whose frames do not agree). */
export interface FixEdge { id: string; from: string; to: string; curve: (u: number) => Vec3; rad: (u: number) => number; bones?: number; roll?: number }
export interface FixNode { id: string; runOn?: [string, string] /* the two edge ids that run on through it */ }

const deg = (a: number): number => (a * Math.PI) / 180;
/** The map pose: a smooth warp of the body pose (a bend and a stretch), so every bone moves and the nodes move with their edges. */
export const mapWarp = (p: Vec3): V3 => { const a = 0.35 * p[1], c = Math.cos(a), s = Math.sin(a); return [1.2 * (p[0] * c - p[2] * s) + 0.5, 0.8 * p[1], p[0] * s + p[2] * c + 0.2]; };

export function makeSkeleton(nodes: FixNode[], edges: FixEdge[], K = 24): Skeleton {
  const bones: Bone[] = [], skelEdges: SkelEdge[] = [], nodePos = new Map<string, V3>(), nodeEdges = new Map<string, { edge: number; end: 0 | 1 }[]>(), ids = nodes.map((n) => n.id);
  for (const n of ids) nodeEdges.set(n, []);
  edges.forEach((fe, ei) => {
    const k = fe.bones ?? K, first = bones.length, pts: V3[] = [];
    for (let i = 0; i < k; i++) pts.push([...fe.curve(i / (k - 1))] as V3);
    const t0 = nodePos.get(fe.from), t1 = nodePos.get(fe.to);
    if (!t0) nodePos.set(fe.from, pts[0]!);
    if (!t1) nodePos.set(fe.to, pts[k - 1]!);
    // the tangent by central differences, the frame by parallel transport from an arbitrary normal rolled by `roll`
    const tang = pts.map((_, i) => norm(sub(pts[Math.min(k - 1, i + 1)]!, pts[Math.max(0, i - 1)]!)));
    let n: V3 = Math.abs(tang[0]![2]) < 0.9 ? norm(cross(tang[0]!, [0, 0, 1])) : norm(cross(tang[0]!, [1, 0, 0]));
    n = norm(cross(cross(tang[0]!, n), tang[0]!));
    const turn = (v: V3, t: V3, a: number): V3 => add(add(mul(v, Math.cos(a)), mul(cross(t, v), Math.sin(a))), mul(t, dot(t, v) * (1 - Math.cos(a))));
    n = turn(n, tang[0]!, fe.roll ?? 0);
    for (let i = 0; i < k; i++) {
      if (i > 0) { const axis = cross(tang[i - 1]!, tang[i]!), s = Math.hypot(...axis); if (s > 1e-12) n = turn(n, norm(axis), Math.atan2(s, dot(tang[i - 1]!, tang[i]!))); }
      const t = tang[i]!, nn = norm(sub(n, mul(t, dot(n, t))));
      bones.push({ edge: ei, u: i / (k - 1), pos: [pts[i]!, mapWarp(pts[i]!)], r: [fe.rad(i / (k - 1)), 0.85 * fe.rad(i / (k - 1))], frame: [t, nn, cross(t, nn)] });
    }
    skelEdges.push({ id: fe.id, from: fe.from, to: fe.to, bones: [first, k], tone: 'portal', tier: 'mid', hidden: [0, 0], hiddenBody: [0, 0], sewn: [false, false] });
    nodeEdges.get(fe.from)!.push({ edge: ei, end: 0 }); nodeEdges.get(fe.to)!.push({ edge: ei, end: 1 });
  });
  const skelNodes: SkelNode[] = nodes.map((nd) => {
    const p = nodePos.get(nd.id)!, es = nodeEdges.get(nd.id)!;
    const out: SkelNode = { id: nd.id, pos: [p, mapWarp(p)], edges: es };
    if (nd.runOn) out.runOn = [es.findIndex((x) => skelEdges[x.edge]!.id === nd.runOn![0]), es.findIndex((x) => skelEdges[x.edge]!.id === nd.runOn![1])];
    return out;
  });
  // every edge's end bones sit exactly on their node (the contract: continuity by construction)
  skelEdges.forEach((e, ei) => { const f = bones[e.bones[0]]!, l = bones[e.bones[0] + e.bones[1] - 1]!; const nf = nodePos.get(e.from)!, nl = nodePos.get(e.to)!; f.pos[0] = [...nf]; f.pos[1] = mapWarp(nf); l.pos[0] = [...nl]; l.pos[1] = mapWarp(nl); void ei; });
  return { nodes: skelNodes, edges: skelEdges, bones };
}

/** A straight-ish arm out of `o` along `dir` with a gentle bend (`bend` in units of its length, along `side`), radius from `r0` to `r1`. */
const arm = (o: Vec3, dir: Vec3, len: number, side: Vec3, bend = 0.12) => (u: number): V3 => add(add(o, mul(dir, len * u)), mul(side, bend * len * Math.sin(Math.PI * u) * u));
const lin = (a: number, b: number) => (u: number): number => a + (b - a) * u;
const O: V3 = [0, 0, 0];
const dirXY = (a: number): V3 => [Math.cos(deg(a)), Math.sin(deg(a)), 0];

export interface Fixture { name: string; skel: Skeleton; /** the junction nodes' ids */ junctions: string[] }
export function fixtures(): Fixture[] {
  const out: Fixture[] = [];
  // Y: three equal arms at 120 degrees
  out.push({ name: 'Y', junctions: ['N'], skel: makeSkeleton([{ id: 'N' }, { id: 'a' }, { id: 'b' }, { id: 'c' }], [0, 1, 2].map((i): FixEdge => ({ id: `Y${i}`, from: 'N', to: 'abc'[i]!, curve: arm(O, dirXY(120 * i + 10), 3, [0, 0, 1]), rad: lin(0.1, 0.09) }))) });
  // T: a straight trunk running through, a thin branch (ratio 0.4) at 70 degrees
  out.push({ name: 'T', junctions: ['N'], skel: makeSkeleton([{ id: 'N', runOn: ['TR0', 'TR1'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }], [
    { id: 'TR0', from: 'a', to: 'N', curve: (u) => [-3 + 3 * u, 0.1 * Math.sin(Math.PI * u) * 0, 0], rad: lin(0.1, 0.1) },
    { id: 'TR1', from: 'N', to: 'b', curve: (u) => [3 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: 'BR', from: 'N', to: 'c', curve: arm(O, dirXY(70), 3, [0, 0, 1]), rad: lin(0.04, 0.03) },
  ]) });
  // FOUR: a trunk with a branch each side at the same node
  out.push({ name: 'FOUR', junctions: ['N'], skel: makeSkeleton([{ id: 'N', runOn: ['T0', 'T1'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [
    { id: 'T0', from: 'a', to: 'N', curve: (u) => [-3 + 3 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: 'T1', from: 'N', to: 'b', curve: (u) => [3 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: 'S0', from: 'N', to: 'c', curve: arm(O, dirXY(75), 3, [0, 0, 1]), rad: lin(0.05, 0.04) },
    { id: 'S1', from: 'N', to: 'd', curve: arm(O, dirXY(-100), 3, [0, 0, 1]), rad: lin(0.05, 0.04) },
  ]) });
  // CHAIN: three edges that run on into one another with a bend, a taper, a rolled frame and one flowing the other way, free ends capped
  const trunk = (u: number): V3 => [3 * u, 0.6 * Math.sin(2.2 * u), 0.25 * Math.sin(1.3 * u + 0.5)];
  const part = (u0: number, u1: number, rev = false) => (u: number): V3 => trunk(rev ? u1 + (u0 - u1) * u : u0 + (u1 - u0) * u);
  out.push({ name: 'CHAIN', junctions: [], skel: makeSkeleton([{ id: 'a' }, { id: 'm' }, { id: 'n' }, { id: 'z' }], [
    { id: 'K0', from: 'a', to: 'm', curve: part(0, 0.35), rad: lin(0.08, 0.1) },
    { id: 'K1', from: 'm', to: 'n', curve: part(0.35, 0.7), rad: lin(0.1, 0.1), roll: deg(50) },
    { id: 'K2', from: 'z', to: 'n', curve: part(0.7, 1, true), rad: lin(0.05, 0.1) },
  ]) });
  // H: two junctions joined by a short fat edge, each with two thinner arms
  out.push({ name: 'H', junctions: ['L', 'R'], skel: makeSkeleton([{ id: 'L' }, { id: 'R' }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [
    { id: 'M', from: 'L', to: 'R', curve: (u) => [-1 + 2 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: 'La', from: 'L', to: 'a', curve: arm([-1, 0, 0], dirXY(140), 2, [0, 0, 1]), rad: lin(0.07, 0.06) },
    { id: 'Lb', from: 'L', to: 'b', curve: arm([-1, 0, 0], dirXY(-140), 2, [0, 0, 1]), rad: lin(0.07, 0.06) },
    { id: 'Rc', from: 'R', to: 'c', curve: arm([1, 0, 0], dirXY(40), 2, [0, 0, 1]), rad: lin(0.07, 0.06) },
    { id: 'Rd', from: 'R', to: 'd', curve: arm([1, 0, 0], dirXY(-40), 2, [0, 0, 1]), rad: lin(0.07, 0.06) },
  ]) });
  // STUB: a short fat stub on a trunk (PVH_R-like) and a thin side branch the other side
  out.push({ name: 'STUB', junctions: ['N'], skel: makeSkeleton([{ id: 'N', runOn: ['T0', 'T1'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [
    { id: 'T0', from: 'a', to: 'N', curve: (u) => [-3 + 3 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: 'T1', from: 'N', to: 'b', curve: (u) => [3 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: 'S0', from: 'N', to: 'c', curve: arm(O, dirXY(80), 0.5, [0, 0, 1], 0), rad: lin(0.08, 0.07), bones: 8 },
    { id: 'S1', from: 'N', to: 'd', curve: arm(O, dirXY(-80), 3, [0, 0, 1]), rad: lin(0.035, 0.03) },
  ]) });
  // HS: the H with a SHORT middle edge (0.25 long, under kA + kB + RA + RB): the two junctions are one region of four arms and the short edge is inside it
  out.push({ name: 'HS', junctions: ['L+R'], skel: makeSkeleton([{ id: 'L' }, { id: 'R' }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [
    { id: 'M', from: 'L', to: 'R', curve: (u) => [-0.125 + 0.25 * u, 0, 0], rad: lin(0.1, 0.1), bones: 6 },
    { id: 'La', from: 'L', to: 'a', curve: arm([-0.125, 0, 0], dirXY(140), 2, [0, 0, 1]), rad: lin(0.07, 0.06) },
    { id: 'Lb', from: 'L', to: 'b', curve: arm([-0.125, 0, 0], dirXY(-140), 2, [0, 0, 1]), rad: lin(0.07, 0.06) },
    { id: 'Rc', from: 'R', to: 'c', curve: arm([0.125, 0, 0], dirXY(40), 2, [0, 0, 1]), rad: lin(0.07, 0.06) },
    { id: 'Rd', from: 'R', to: 'd', curve: arm([0.125, 0, 0], dirXY(-40), 2, [0, 0, 1]), rad: lin(0.07, 0.06) },
  ]) });
  // HT: a trunk running through TWO junctions joined by a short edge (a branch up at one, down at the other): the through pair crosses the merged region
  out.push({ name: 'HT', junctions: ['L+R'], skel: makeSkeleton([{ id: 'L', runOn: ['T0', 'M'] }, { id: 'R', runOn: ['M', 'T1'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [
    { id: 'T0', from: 'a', to: 'L', curve: (u) => [-3.125 + 3 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: 'M', from: 'L', to: 'R', curve: (u) => [-0.125 + 0.25 * u, 0, 0], rad: lin(0.1, 0.1), bones: 6 },
    { id: 'T1', from: 'R', to: 'b', curve: (u) => [0.125 + 3 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: 'Bc', from: 'L', to: 'c', curve: arm([-0.125, 0, 0], dirXY(100), 3, [0, 0, 1]), rad: lin(0.05, 0.04) },
    { id: 'Bd', from: 'R', to: 'd', curve: arm([0.125, 0, 0], dirXY(-100), 3, [0, 0, 1]), rad: lin(0.05, 0.04) },
  ]) });
  // TT: a trunk that narrows through its node (0.12 above, 0.08 below, one radius at the node as the run-on rule has it) with a side branch: the through pair has two radii
  out.push({ name: 'TT', junctions: ['N'], skel: makeSkeleton([{ id: 'N', runOn: ['T0', 'T1'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }], [
    { id: 'T0', from: 'a', to: 'N', curve: (u) => [-3 + 3 * u, 0, 0], rad: lin(0.12, 0.1) },
    { id: 'T1', from: 'N', to: 'b', curve: (u) => [3 * u, 0, 0], rad: lin(0.1, 0.08) },
    { id: 'BR', from: 'N', to: 'c', curve: arm(O, dirXY(70), 3, [0, 0, 1]), rad: lin(0.04, 0.03) },
  ]) });
  return out;
}

// ---- the oracle: a CPU linear-blend deformation of a bound mesh, test-only ----
/** The bones' frames at pose 1 (the map): the body frame turned by the smallest rotation that takes its tangent to the map tangent (the map's own centreline, central differences along the edge). */
export function poseFrames(skel: Skeleton, pose: 0 | 1): [V3, V3, V3][] {
  return skel.bones.map((b, i) => {
    if (pose === 0) return [b.frame[0], b.frame[1], b.frame[2]] as [V3, V3, V3];
    const e = skel.edges[b.edge]!, [first, count] = e.bones, k = i - first, a = skel.bones[first + Math.max(0, k - 1)]!, c = skel.bones[first + Math.min(count - 1, k + 1)]!;
    const t1 = norm(sub(c.pos[1], a.pos[1])), t0 = b.frame[0], ax = cross(t0, t1), s = Math.hypot(...ax), ang = Math.atan2(s, dot(t0, t1));
    const rot = (v: Vec3): V3 => { if (s < 1e-12) return [...v] as V3; const u = norm(ax); return add(add(mul(v, Math.cos(ang)), mul(cross(u, v), Math.sin(ang))), mul(u, dot(u, v) * (1 - Math.cos(ang)))); };
    return [t1, rot(b.frame[1]), rot(b.frame[2])] as [V3, V3, V3];
  });
}
/** The mesh's vertices at `pose`: `p = sum w_i (P_i + r_i (o_i.x t_i + o_i.y n_i + o_i.z b_i))`, with each bone's position, radius and frame at that pose (`radiusScale` stands in for the live-radius function). */
export function deform(mesh: NetMesh, skel: Skeleton, pose: 0 | 1, radiusScale: (bone: number) => number = () => 1): Float32Array {
  const frames = poseFrames(skel, pose), V = mesh.position.length / 3, out = new Float32Array(3 * V);
  for (let v = 0; v < V; v++) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < 4; i++) {
      const w = mesh.weight[4 * v + i]!;
      if (!w) continue;
      const bi = mesh.bone[4 * v + i]!, B = skel.bones[bi]!, F = frames[bi]!, r = B.r[pose] * radiusScale(bi), o0 = mesh.offset[12 * v + 3 * i]!, o1 = mesh.offset[12 * v + 3 * i + 1]!, o2 = mesh.offset[12 * v + 3 * i + 2]!;
      x += w * (B.pos[pose][0] + r * (o0 * F[0][0] + o1 * F[1][0] + o2 * F[2][0]));
      y += w * (B.pos[pose][1] + r * (o0 * F[0][1] + o1 * F[1][1] + o2 * F[2][1]));
      z += w * (B.pos[pose][2] + r * (o0 * F[0][2] + o1 * F[1][2] + o2 * F[2][2]));
    }
    out[3 * v] = x; out[3 * v + 1] = y; out[3 * v + 2] = z;
  }
  return out;
}

/** The vertices' unit normals at `pose`: each bound bone's rest normal turned by that bone's frame, blended, renormalised (what the vertex shader does). */
export function deformNormals(mesh: NetMesh, skel: Skeleton, pose: 0 | 1): Float32Array {
  const frames = poseFrames(skel, pose), V = mesh.position.length / 3, out = new Float32Array(3 * V);
  for (let v = 0; v < V; v++) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < 4; i++) {
      const w = mesh.weight[4 * v + i]!;
      if (!w) continue;
      const F = frames[mesh.bone[4 * v + i]!]!, a = mesh.normal[12 * v + 3 * i]!, b = mesh.normal[12 * v + 3 * i + 1]!, c = mesh.normal[12 * v + 3 * i + 2]!;
      x += w * (a * F[0][0] + b * F[1][0] + c * F[2][0]); y += w * (a * F[0][1] + b * F[1][1] + c * F[2][1]); z += w * (a * F[0][2] + b * F[1][2] + c * F[2][2]);
    }
    const l = Math.hypot(x, y, z) || 1;
    out[3 * v] = x / l; out[3 * v + 1] = y / l; out[3 * v + 2] = z / l;
  }
  return out;
}
/** The area-weighted normal of every vertex of a mesh, by finite differences of its own surface: what the shade's normal would be if it were derived from the geometry. */
export function geometricNormals(position: ArrayLike<number>, index: ArrayLike<number>): Float32Array {
  const V = position.length / 3, out = new Float32Array(3 * V);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i]! * 3, b = index[i + 1]! * 3, c = index[i + 2]! * 3;
    const ux = position[b]! - position[a]!, uy = position[b + 1]! - position[a + 1]!, uz = position[b + 2]! - position[a + 2]!, vx = position[c]! - position[a]!, vy = position[c + 1]! - position[a + 1]!, vz = position[c + 2]! - position[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { out[o] += nx; out[o + 1] += ny; out[o + 2] += nz; }
  }
  for (let v = 0; v < V; v++) { const l = Math.hypot(out[3 * v]!, out[3 * v + 1]!, out[3 * v + 2]!) || 1; out[3 * v] /= l; out[3 * v + 1] /= l; out[3 * v + 2] /= l; }
  return out;
}

// ---- mesh checks ----
export const edgeKey = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);
/** Edge use counts (undirected) and the directed edges seen twice (an inconsistent winding). */
export function topology(index: Uint32Array): { use: Map<string, number>; badDirected: number; degenerate: number } {
  const use = new Map<string, number>(), directed = new Set<string>();
  let badDirected = 0, degenerate = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i]!, b = index[i + 1]!, c = index[i + 2]!;
    if (a === b || b === c || a === c) { degenerate++; continue; }
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const k = edgeKey(p, q); use.set(k, (use.get(k) ?? 0) + 1); const d = `${p}>${q}`; if (directed.has(d)) badDirected++; directed.add(d); }
  }
  return { use, badDirected, degenerate };
}
/**
 * What a built network is made of since the arms run on to the node (plan owner, 22 Nov): the TUBES (every triangle outside a junction report) are closed, consistently wound surfaces by themselves, and each junction's FILLET is a patch whose only open edges are its arms'
 * seam rings, which are the tubes' own rings (so a ring edge is on three triangles: the tube outside, the tube inside, the fillet). Returns what is wrong, in words (empty when sound).
 */
export function shellProblems(res: { mesh: { index: Uint32Array }; nodes: readonly { node: string; kind: string; variant?: number; triStart: number; triCount: number; rings?: number[][] }[] }): string[] {
  const out: string[] = [], inRegion = new Uint8Array(res.mesh.index.length / 3), ring = new Set<string>();
  for (const n of res.nodes) {
    if (n.kind !== 'junction') continue;
    inRegion.fill(1, n.triStart, n.triStart + n.triCount);
    for (const rg of n.rings ?? []) for (let j = 0; j < rg.length; j++) ring.add(edgeKey(rg[j]!, rg[(j + 1) % rg.length]!));
  }
  const tubes: number[] = [];
  for (let t = 0; t < inRegion.length; t++) {
    const tri = Array.from(res.mesh.index.subarray(3 * t, 3 * t + 3));
    if (!inRegion[t]) tubes.push(...tri);
  }
  const tp = topology(Uint32Array.from(tubes));
  for (const [e, c] of tp.use) if (c !== 2) out.push(`tube edge ${e} is on ${c} triangles`);
  if (tp.badDirected) out.push(`${tp.badDirected} tube edges wind against each other`);
  if (tp.degenerate) out.push(`${tp.degenerate} degenerate tube triangles`);
  for (const n of res.nodes) {
    if (n.kind !== 'junction') continue;
    const tp2 = topology(res.mesh.index.subarray(3 * n.triStart, 3 * (n.triStart + n.triCount)));
    if (tp2.badDirected) out.push(`${n.node}: ${tp2.badDirected} fillet edges wind against each other`);
    for (const [e, c] of tp2.use) { if (c > 2) out.push(`${n.node}: fillet edge ${e} on ${c} triangles`); if (c === 1 && !ring.has(e)) out.push(`${n.node}: fillet edge ${e} is open and not a seam ring's`); }
  }
  return out;
}
/** The signed volume of a closed mesh (positive when the triangles wind outward). */
export function volume(position: ArrayLike<number>, index: ArrayLike<number>): number {
  let v = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i]! * 3, b = index[i + 1]! * 3, c = index[i + 2]! * 3;
    const ax = position[a]!, ay = position[a + 1]!, az = position[a + 2]!, bx = position[b]!, by = position[b + 1]!, bz = position[b + 2]!, cx = position[c]!, cy = position[c + 1]!, cz = position[c + 2]!;
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

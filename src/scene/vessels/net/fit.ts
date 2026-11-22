// The junction regions' map-pose shape (review doc, "Plan change", 22 Nov; the per-arm "absent" fits were withdrawn the same day). The mesh is built ONCE at the body pose; a region's same vertices and triangles are then FITTED onto the signed-distance
// union of its arms at other states, and the vertex stage blends the fits:
//   - the MAP fit (`NetMesh.offsetMap`): shrink-wrapped onto the union of the arms' capsules at the map pose (their map positions and radii), the free vertices pulled onto the surface and evened out along it
//     (relax.ts, no flips, no splits, no collapses), the seam rings staying where the tubes put them;
// A fit is stored as offsets in the vertices' own bones' frames at the fitted pose (divided by the bone's radius there), exactly the layout of `offset`.
import { closestOnArm, sdUnionGrad, SKIN_K, type Capsule } from '../skin/sdf.ts';
import { relax } from './relax.ts';
import { boneFrame, bonePos, boneRadius } from './pose.ts';
import type { Skeleton } from './types.ts';

/** What a fit needs to know of one junction region. Vertex ids are the mesh's own. */
export interface FitRegion {
  /** every vertex of the region's triangles (the seam rings' tube vertices and the fillet's own) */
  verts: number[];
  /** the region's triangles, mesh vertex ids */
  tris: number[];
  /** the fillet's own vertices: [first, count] */
  free: [number, number];
  /** how many of `caps` are the arms (they come first); the rest are short edges and run capsules */
  arms: number;
  /** the capsules the fillet was built on: the bones they run through, and the index of the one they are united with by a plain minimum (-1: none) */
  caps: { bones: number[]; mate: number }[];
  /** each arm's seam ring, mesh vertex ids */
  rings: number[][];
}
export interface FitMesh { position: Float32Array; bone: Uint16Array; weight: Float32Array; offset: Float32Array }

/** The blend width at a pose: SKIN_K times the narrowest arm's radius at the node (the arms are `skip`ped when one is absent). */
export function fitK(skel: Skeleton, rg: FitRegion, pose: number, skip = -1): number {
  let r = Infinity;
  for (let i = 0; i < rg.arms; i++) if (i !== skip) r = Math.min(r, boneRadius(skel, rg.caps[i]!.bones[0]!, pose));
  return SKIN_K * r;
}
/** The region's capsules at a pose, one arm left out when `skip` >= 0 (the mates follow). */
export function fitCaps(skel: Skeleton, rg: FitRegion, pose: number, skip = -1): Capsule[] {
  const keep = rg.caps.map((_, i) => i).filter((i) => i !== skip), at = new Map(keep.map((i, q) => [i, q]));
  return keep.map((i) => {
    const c = rg.caps[i]!, n = c.bones.length, pts = new Float64Array(3 * n), r = new Float64Array(n);
    c.bones.forEach((b, q) => { const p = bonePos(skel, b, pose); pts[3 * q] = p[0]; pts[3 * q + 1] = p[1]; pts[3 * q + 2] = p[2]; r[q] = boneRadius(skel, b, pose); });
    const mate = c.mate >= 0 ? at.get(c.mate) : undefined;
    return mate === undefined ? { n, pts, r } : { n, pts, r, mate };
  });
}

/** The mesh's own binding evaluated at a pose: each vertex's offsets turned by its bones' frames at that pose, scaled by their radii there. */
function boundAt(skel: Skeleton, m: FitMesh, v: number, pose: number, off: ArrayLike<number>, frames: Map<number, ReturnType<typeof boneFrame>>): [number, number, number] {
  const p: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const w = m.weight[4 * v + i]!;
    if (!(w > 0)) continue;
    const b = m.bone[4 * v + i]!, P = bonePos(skel, b, pose), r = boneRadius(skel, b, pose);
    let F = frames.get(b);
    if (!F) { F = boneFrame(skel, b, pose); frames.set(b, F); }
    const o = [off[12 * v + 3 * i]!, off[12 * v + 3 * i + 1]!, off[12 * v + 3 * i + 2]!];
    for (let d = 0; d < 3; d++) p[d] += w * (P[d]! + r * (F[0][d]! * o[0]! + F[1][d]! * o[1]! + F[2][d]! * o[2]!));
  }
  return p;
}

/** The offsets (12 per region vertex, in `rg.verts` order) of positions `at` (3 per region vertex) at a pose. */
export function offsetsAt(skel: Skeleton, m: FitMesh, rg: FitRegion, pose: number, at: Float64Array): Float32Array {
  const out = new Float32Array(12 * rg.verts.length), frames = new Map<number, ReturnType<typeof boneFrame>>();
  rg.verts.forEach((v, q) => {
    for (let i = 0; i < 4; i++) {
      if (!(m.weight[4 * v + i]! > 0)) continue;
      const b = m.bone[4 * v + i]!, P = bonePos(skel, b, pose), r = boneRadius(skel, b, pose);
      let F = frames.get(b);
      if (!F) { F = boneFrame(skel, b, pose); frames.set(b, F); }
      const d = [at[3 * q]! - P[0], at[3 * q + 1]! - P[1], at[3 * q + 2]! - P[2]];
      for (let c = 0; c < 3; c++) out[12 * q + 3 * i + c] = (d[0]! * F[c]![0] + d[1]! * F[c]![1] + d[2]! * F[c]![2]) / r;
    }
  });
  return out;
}

/** The region's vertex positions (3 per `rg.verts`) at a pose by the mesh's own binding. */
export function boundPositions(skel: Skeleton, m: FitMesh, rg: FitRegion, pose: number, off: ArrayLike<number> = m.offset): Float64Array {
  const frames = new Map<number, ReturnType<typeof boneFrame>>(), out = new Float64Array(3 * rg.verts.length);
  rg.verts.forEach((v, q) => { const p = boundAt(skel, m, v, pose, off, frames); out[3 * q] = p[0]; out[3 * q + 1] = p[1]; out[3 * q + 2] = p[2]; });
  return out;
}

/** Newton steps onto the union's surface, `p -= f grad / |grad|^2`. */
function project(caps: readonly Capsule[], k: number, p: Float64Array, o: number, steps: number): void {
  const g = new Float64Array(3);
  for (let s = 0; s < steps; s++) {
    const sd = sdUnionGrad(caps, k, p[o]!, p[o + 1]!, p[o + 2]!, g), gg = g[0]! ** 2 + g[1]! ** 2 + g[2]! ** 2;
    if (gg < 1e-14) return;
    p[o] -= (sd * g[0]!) / gg; p[o + 1] -= (sd * g[1]!) / gg; p[o + 2] -= (sd * g[2]!) / gg;
  }
}

/**
 * The region's fit at `pose` (3 numbers per `rg.verts`). `from` is where it starts (the previous fit: the body shape, or the full map fit for an absent one); `absent` >= 0 leaves that arm out.
 * The fillet's free vertices move; the seam rings stay (an absent arm's own ring moves too: it is all on the host).
 */
export function fitRegion(skel: Skeleton, m: FitMesh, rg: FitRegion, pose: number, from: Float64Array, absent = -1, opt: { rounds?: number } = {}): Float64Array {
  const V = rg.verts.length, local = new Map(rg.verts.map((v, q) => [v, q])), pos = Float64Array.from(from);
  const full = fitCaps(skel, rg, pose), caps = absent < 0 ? full : fitCaps(skel, rg, pose, absent), k = fitK(skel, rg, pose, absent);
  const fixed = new Uint8Array(V);
  rg.verts.forEach((v, q) => { fixed[q] = v >= rg.free[0] && v < rg.free[0] + rg.free[1] ? 0 : 1; });
  if (absent >= 0) {
    for (const v of rg.rings[absent]!) fixed[local.get(v)!] = 0;
    // the vertices that belong to the absent arm fall onto its axis; a vertex between it and the host moves in proportion; then everything is projected onto the host
    const own = new Set(rg.caps[absent]!.bones), cp = new Float64Array(7), ringSet = new Set(rg.rings[absent]);
    rg.verts.forEach((v, q) => {
      let a = ringSet.has(v) ? 1 : 0;
      if (!a) for (let i = 0; i < 4; i++) if (m.weight[4 * v + i]! > 0 && own.has(m.bone[4 * v + i]!)) a += m.weight[4 * v + i]!;
      if (a > 0) { closestOnArm(full[absent]!, pos[3 * q]!, pos[3 * q + 1]!, pos[3 * q + 2]!, cp); for (let d = 0; d < 3; d++) pos[3 * q + d] += a * (cp[d]! - pos[3 * q + d]!); }
    });
  }
  const free = new Uint8Array(V).map((_, q) => 1 - fixed[q]!);
  if (absent >= 0) for (let q = 0; q < V; q++) if (free[q]) project(caps, k, pos, 3 * q, 8);
  const tris = rg.tris.map((v) => local.get(v)!);
  relax({ pos, tris, fixed, caps, k }, { rounds: opt.rounds ?? (absent >= 0 ? 8 : 30), pull: 0.5, soft: absent >= 0 ? 0 : 20 });
  return pos;

}

/** What `fitAll` reads of a junction's report (net/mesh.ts NodeReport). */
export interface FitReport { node: string; kind: string; arms: number[]; triStart: number; triCount: number; vertStart: number; vertCount: number; caps?: { mate: number }[]; capBones?: number[][]; rings?: number[][] }

/** The map fit of every junction region (`offsetMap`: the body `offset` for a tube vertex). */
export function fitAll(skel: Skeleton, m: FitMesh & { index: Uint32Array }, reports: readonly FitReport[]): Float32Array {
  const offsetMap = Float32Array.from(m.offset);
  for (const r of reports) {
    if (r.kind !== 'junction' || !r.caps || !r.capBones || !r.rings) continue;
    const used = new Set<number>(), tris = Array.from(m.index.subarray(3 * r.triStart, 3 * (r.triStart + r.triCount)));
    for (const v of tris) used.add(v);
    const rg: FitRegion = { verts: [...used].sort((a, b) => a - b), tris, free: [r.vertStart, r.vertCount], arms: r.arms.length, caps: r.capBones.map((bones, i) => ({ bones, mate: r.caps![i]!.mate })), rings: r.rings };
    // the map fit: from the body binding at the map pose
    const map = fitRegion(skel, m, rg, 1, boundPositions(skel, m, rg, 1), -1), mapOff = offsetsAt(skel, m, rg, 1, map);
    rg.verts.forEach((v, q) => { if (v >= r.vertStart && v < r.vertStart + r.vertCount) for (let j = 0; j < 12; j++) offsetMap[12 * v + j] = mapOff[12 * q + j]!; });
  }
  return offsetMap;
}

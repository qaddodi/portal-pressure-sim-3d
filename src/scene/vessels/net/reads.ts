// The texel reads of the network figure's junction vertices, counted (plan owner, "Rulings on WP3 (864e7821)" 4): junction vertices x reads <= 1.5 M per DRAWN frame over all copies. The vertex stage's reads follow from its text and from each vertex's
// own bones, so this walks the real mesh: per vertex, per bound bone, `netBone`'s texels (its own three; at circT > 0 the neighbours' key and positions on the same edge), the edge row's texels when the row changes from the last one loaded (the stage keeps
// `netRowLoaded`), (the junction peel's two extra reads per anchored bone went with the peel, 71141fa7), and the projection's: the region row's head, the mates, and every capsule's REGION_PTS points. A vertex of the mesh a region's window does not draw
// costs the early out's two (variant and window). The sewn pass and the capsule pass are counted once per frame. Models of the text, not measurements on a device: the bound is confirmed with one `?perf` paste.
import { BONE_TEXELS } from './bones.ts';
import { EDGE_LAYOUT } from './edge-state.ts';
import { NET_VS_COLUMNS } from './shaders.ts';
import { REGION_PTS, regionShare, type Region } from './regions.ts';
import type { NetMesh, Skeleton } from './types.ts';

/** The texels the vertex stage's `loadEdgeVS` fetches for one edge row (the distinct texels of NET_VS_COLUMNS; a vec4[2] takes two). */
export const EDGE_ROW_TEXELS: number = (() => { const t = new Set<number>(); for (const n of NET_VS_COLUMNS) { const s = EDGE_LAYOUT.get(n)!; t.add(s.texel); if (s.size === 8) t.add(s.texel + 1); } return t.size; })();
/** A vertex of a mesh that is not drawn: the region row's variant and window, and nothing else (the early out). */
export const COLLAPSED_READS = 2;

export interface ReadsEnv {
  skel: Skeleton;
}

/** One bone's reads in `netBone` (a bone index, whether the Circuit has begun, the edge row the stage holds now). Returns the reads and the row held after. */
export function boneReads(env: ReadsEnv, bi: number, circ: boolean, held: number): { reads: number; row: number } {
  const bones = env.skel.bones, b = bones[bi]!, row = b.edge;
  let reads = BONE_TEXELS;
  if (row !== held) reads += EDGE_ROW_TEXELS;
  if (circ) {
    const p = bones[bi - 1], n = bones[bi + 1];
    if (bi > 0 && p) { reads += 1; if (p.edge === row) reads += 2; }
    if (n) { reads += 1; if (n.edge === row && n.u > b.u) reads += 2; }
  }
  return { reads, row };
}

/** A drawn junction vertex's reads: the early out's two, the projection's (head, mates, capsule points), and each bound bone. */
export function vertexReads(env: ReadsEnv, mesh: NetMesh, v: number, nc: number, circ: boolean): number {
  let reads = COLLAPSED_READS + 1 + Math.ceil(nc / 4) + nc * REGION_PTS, held = -1;
  for (let k = 0; k < 4; k++) {
    if (!(mesh.weight[4 * v + k]! > 0)) continue;
    const r = boneReads(env, mesh.bone[4 * v + k]!, circ, held); reads += r.reads; held = r.row;
  }
  return reads;
}

/** The capsule pass's reads of one region: a bone per (capsule, point), its edge row (held across the points of one edge), the region row's texel of the bone indices, and its peel. */
export function capsuleReads(env: ReadsEnv, r: Region, circ: boolean): number {
  let reads = 0;
  for (const c of r.caps) { let held = -1; for (const bi of c.bones) { const x = boneReads(env, bi, circ, held); reads += 1 + x.reads; held = x.row; } }
  return reads;
}

export interface FrameReads { total: number; vertices: number; drawn: number; passes: number; byDraw: { name: string; reads: number }[] }
export interface ReadsDraw { name: string; regions: readonly Region[]; organsIndex: Uint32Array | null; mesh: NetMesh }

/** The reads of one drawn frame at the change's `t`: every draw (an object's organs-pass copy, its vessel-pass copy) over every junction vertex it processes, plus the sewn pass and the capsule passes once. */
export function frameReadsAt(env: ReadsEnv, draws: readonly ReadsDraw[], t: number): FrameReads {
  const circ = t > 0, E = env.skel.edges.length;
  let total = 0, vertices = 0, drawn = 0, passes = 0;
  // the sewn pass: a host bone per end of every sewn edge (the rest return at the head)
  passes += 2 * E * (1 + BONE_TEXELS + EDGE_ROW_TEXELS);
  const byDraw: { name: string; reads: number }[] = [];
  for (const d of draws) {
    const inOrgans = d.organsIndex ? new Set<number>(d.organsIndex) : null;
    let reads = 0;
    for (const r of d.regions) {
      passes += capsuleReads(env, r, circ);
      const share = regionShare(r, t);   // the share of its pixels this mesh draws; at 0 it is processed only as far as the early out
      for (let v = r.vertStart; v < r.vertStart + r.vertCount; v++) {
        for (const copies of [1, inOrgans?.has(v) ? 1 : 0]) {
          if (!copies) continue;
          vertices++;
          if (share > 0) { reads += vertexReads(env, d.mesh, v, r.caps.length, circ); drawn++; } else reads += COLLAPSED_READS;
        }
      }
    }
    total += reads; byDraw.push({ name: d.name, reads });
  }
  return { total: total + passes, vertices, drawn, passes, byDraw };
}

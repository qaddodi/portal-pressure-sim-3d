// What a key must be: on the union of its state to 0.01 R and no folded or inward triangle, at a pose. Shared with the real-figure check.
import { boundPositions, fitCaps, fitK, type FitRegion } from '../src/scene/vessels/net/fit.ts';
import { SKIN_K, sdUnion, sdUnionGrad } from '../src/scene/vessels/skin/sdf.ts';
import type { NetMeshResult } from '../src/scene/vessels/net/mesh.ts';
import type { RegionKeys } from '../src/scene/vessels/net/keys.ts';
import type { Skeleton } from '../src/scene/vessels/net/types.ts';

export function keyQuality(skel: Skeleton, r: NetMeshResult, rk: RegionKeys, keyIx: number, pose: 0 | 1, states: readonly (readonly number[])[]): { res: number; flips: number; tris: number } {
  const m = r.mesh, key = rk.keys[keyIx]!, rep = r.nodes.find((n) => n.node === rk.node)!, used = new Set<number>();
  for (let t = rep.triStart; t < rep.triStart + rep.triCount; t++) for (let q = 0; q < 3; q++) used.add(m.index[3 * t + q]!);
  const rg: FitRegion = { verts: [...used].sort((a, b) => a - b), tris: Array.from(m.index.subarray(3 * rep.triStart, 3 * (rep.triStart + rep.triCount))), free: [rep.vertStart, rep.vertCount], arms: rep.arms.length, caps: rep.capBones!.map((bones, i) => ({ bones, mate: rep.caps![i]!.mate })), rings: rep.rings! };
  const bs = m.bakeScale!, fs = Float64Array.from(states[key.state]!, (x, e) => x / bs[e]!), off = Float32Array.from(pose ? m.offsetMap : m.offset), src = pose ? key.offsetMap : key.offset;
  for (const v of rg.verts) if (v >= rk.vertStart && v < rk.vertStart + rk.vertCount) for (let j = 0; j < 12; j++) off[12 * v + j] = src[12 * (v - rk.vertStart) + j]!;
  const P = boundPositions(skel, m, rg, pose, off, fs), caps = fitCaps(skel, rg, pose, -1, fs), k = fitK(skel, rg, pose, -1, fs), loc = new Map(rg.verts.map((v, q) => [v, q])), g = [0, 0, 0];
  let res = 0, flips = 0;
  rg.verts.forEach((v, q) => { if (v >= rk.vertStart && v < rk.vertStart + rk.vertCount) res = Math.max(res, Math.abs(sdUnion(caps, k, P[3 * q]!, P[3 * q + 1]!, P[3 * q + 2]!)) / (k / SKIN_K)); });
  for (let t = 0; t < rg.tris.length; t += 3) {
    const [a, b, c] = [loc.get(rg.tris[t]!)!, loc.get(rg.tris[t + 1]!)!, loc.get(rg.tris[t + 2]!)!], e1 = [0, 1, 2].map((q) => P[3 * b + q]! - P[3 * a + q]!), e2 = [0, 1, 2].map((q) => P[3 * c + q]! - P[3 * a + q]!);
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!], cx = [0, 1, 2].map((q) => (P[3 * a + q]! + P[3 * b + q]! + P[3 * c + q]!) / 3);
    sdUnionGrad(caps, k, cx[0]!, cx[1]!, cx[2]!, g);
    if (n[0]! * g[0]! + n[1]! * g[1]! + n[2]! * g[2]! < 0) flips++;
  }
  return { res, flips, tris: rg.tris.length / 3 };
}

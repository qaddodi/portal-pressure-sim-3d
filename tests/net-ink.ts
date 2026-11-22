// THE EXTENSIONS' INK, ONE ORACLE (plan owner, 22 Nov; WP2 and WP3 share it): how far a tube vertex between an arm's seam ring and its node stands outside the smooth union the vertex stage holds for the region. The vertex is placed by the oracle's own `deformLive`
// (the shader's CPU twin: the live bones' centres, frames and lumen, the offsets of the mesh, no ink and no ring sag) and the union is built from the region's ROW (net/regions.ts `regionsOf`: at most REGION_PTS bones a capsule, their live centres and lumen, the mates, k = SKIN_K x the
// narrowest arm's live lumen at the node), the very capsules the shader reads. A positive distance is a hull that doubles the fillet's outline; it is in units of the narrowest arm's live lumen.
import { liveBones, deformLive, mapBaseOf, restEdge, type LiveState } from './net-oracle.ts';
import { MAP_K } from '../src/scene/circuit/map.ts';
import { regionsOf } from '../src/scene/vessels/net/regions.ts';
import { sdUnion, SKIN_K, type Capsule } from '../src/scene/vessels/skin/sdf.ts';
import type { NetMesh, Skeleton } from '../src/scene/vessels/net/types.ts';
import type { NodeReport } from '../src/scene/vessels/net/mesh.ts';

export interface InkWorst { node: string; worst: number; edge: string; vertex: number; bone: number }
/** `lives`: the states to judge in (circT, swell and width per edge), each against every region. Returns, per body-built region, its worst vertex over all states. */
export function extensionsOutside(mesh: NetMesh, skel: Skeleton, reports: readonly NodeReport[], lives: readonly LiveState[]): InkWorst[] {
  const junctions = reports.filter((n) => n.kind === 'junction' && n.caps), rows = regionsOf(skel, junctions), inRegion = new Uint8Array(mesh.index.length / 3), tube = new Uint8Array(mesh.position.length / 3);
  for (const n of junctions) inRegion.fill(1, n.triStart, n.triStart + n.triCount);
  for (let t = 0; t < inRegion.length; t++) if (!inRegion[t]) for (let s = 0; s < 3; s++) tube[mesh.index[3 * t + s]!] = 1;
  // the vertices of each region's extensions: a tube vertex on a bone of one of its arms, from the node out to the seam bone (not the seam's own ring, which the fillet shares)
  const ext = junctions.map((n) => {
    const cluster = n.node.split('+'), list: { v: number; edge: number }[] = [];
    n.arms.forEach((edge, i) => {
      const e = skel.edges[edge]!, [first, count] = e.bones, end = cluster.includes(e.from) ? 0 : 1, seam = end === 0 ? first + n.seams[i]! : first + count - 1 - n.seams[i]!;
      for (let v = 0; v < tube.length; v++) { if (!tube[v]) continue; const b = mesh.bone[4 * v]!; if (b < first || b >= first + count || b === seam || (end === 0 ? b > seam : b < seam)) continue; list.push({ v, edge }); }
    });
    return list;
  });
  const worst: InkWorst[] = junctions.map((n) => ({ node: n.node, worst: -Infinity, edge: '', vertex: -1, bone: -1 }));
  for (const live of lives) {
    const B = liveBones(skel, live), d = deformLive(mesh, skel, live);
    junctions.forEach((n, ri) => {
      if ((n.variant ?? 0) !== 0 || !n.capBones) return;
      const caps: Capsule[] = rows[ri]!.caps.map((c) => { const pts = new Float64Array(3 * c.bones.length), r = new Float64Array(c.bones.length); c.bones.forEach((g, q) => { pts.set(B[g]!.cen, 3 * q); r[q] = B[g]!.lumen; }); return c.mate >= 0 ? { n: c.bones.length, pts, r, mate: c.mate } : { n: c.bones.length, pts, r }; });
      const narrow = Math.min(...n.capBones.slice(0, n.arms.length).map((ids) => B[ids[0]!]!.lumen)), k = SKIN_K * narrow;
      for (const { v, edge } of ext[ri]!) {
        const x = sdUnion(caps, k, d.position[3 * v]!, d.position[3 * v + 1]!, d.position[3 * v + 2]!) / narrow;
        if (x > worst[ri]!.worst) worst[ri] = { node: n.node, worst: x, edge: skel.edges[edge]!.id, vertex: v, bone: mesh.bone[4 * v]! };
      }
    });
  }
  return worst.filter((w, i) => (junctions[i]!.variant ?? 0) === 0);
}

/** The live states to judge in: each swell vector (per edge; none: rest) at each t of the Circuit, widths on the map as the oracle's own named states (`liveStates`). */
export function liveGrid(skel: Skeleton, swells: readonly (readonly number[])[] | undefined, ts: readonly number[]): LiveState[] {
  const out: LiveState[] = [];
  for (const sw of swells?.length ? swells : [null]) for (const t of ts) out.push({ circT: t, perPx: 1, edges: skel.edges.map((ed, i) => { const r = skel.bones[ed.bones[0]]!.r[0], x = restEdge(r); x.mapBase = mapBaseOf(skel, i); x.wc = (2 * x.mapBase * 0.85) / MAP_K; if (sw) x.swell = sw[i] ?? 1; return x; }) });
  return out;
}

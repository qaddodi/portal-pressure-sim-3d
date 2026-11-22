// THE JUNCTION PEEL (plan owner, 22 Nov, after WP2's 50664a4d): the Circuit's flow peel gives every bone its own share by its map position, so the bones of one junction peel at different times and the fillet unfolds mid-move.
// The root cause is that the share is per bone. Here a junction region takes ONE share, its node's: every bone inside it (the seam rings and everything inside them, the short edges of a merged region too) takes the node's peel share, and
// outside it each arm eases from the node's share to its own flow-peel share over 3 arm radii with a smoothstep, so the flow peel along the vessels stays as in 2D. This is the table: per edge, per end, the bone whose map position gives the
// node's share (the region's anchor) and the u of the region's boundary on that edge. The shader (net/shaders.ts `peelShareAt`, one rule for every bone, the capsule pass's too) and the oracle read it.
import type { NodeReport } from './mesh.ts';
import type { Skeleton } from './types.ts';

/** How far from its end an arm eases from the node's share to its own: arm radii (rest), with a smoothstep. */
export const PEEL_EASE_RADII = 3;
/** Per edge: [anchor bone at end 0 (-1: none), the u of the region boundary from end 0, anchor bone at end 1, the u of the region boundary from end 1]. A whole edge inside a region is boundary u = 2 at end 0. */
export type PeelEnds = readonly [number, number, number, number];
export const NO_PEEL: PeelEnds = [-1, 2, -1, 2];

export function peelTable(skel: Skeleton, reports: readonly Pick<NodeReport, 'node' | 'kind' | 'seams' | 'arms'>[]): PeelEnds[] {
  const out: number[][] = skel.edges.map(() => [...NO_PEEL]);
  const endBone = (edge: number, end: 0 | 1): number => skel.edges[edge]!.bones[0] + (end === 0 ? 0 : skel.edges[edge]!.bones[1] - 1);
  for (const rp of reports) {
    if (rp.kind !== 'junction') continue;
    const cluster = new Set(rp.node.split('+'));
    const anchorNode = skel.nodes.find((n) => n.id === rp.node.split('+')[0]);
    if (!anchorNode || !anchorNode.edges.length) continue;
    const anchor = endBone(anchorNode.edges[0]!.edge, anchorNode.edges[0]!.end);
    // the arms: the seam ring's u, the largest over the region's meshes (a map-built mesh seams elsewhere than a body-built one)
    rp.arms.forEach((edge, i) => {
      const ed = skel.edges[edge]!, end: 0 | 1 = cluster.has(ed.from) ? 0 : 1, [first, count] = ed.bones;
      const seamBone = end === 0 ? first + rp.seams[i]! : first + count - 1 - rp.seams[i]!, u = skel.bones[seamBone]!.u, o = out[edge]!, k = end === 0 ? 0 : 2;
      o[k] = anchor;
      o[k + 1] = o[k + 1] === 2 ? u : end === 0 ? Math.max(o[k + 1]!, u) : Math.min(o[k + 1]!, u);
    });
    // the short edges inside a merged region: wholly inside
    skel.edges.forEach((ed, ei) => { if (cluster.has(ed.from) && cluster.has(ed.to) && !rp.arms.includes(ei)) { out[ei]![0] = anchor; out[ei]![1] = 2; } });
  }
  return out.map((o): PeelEnds => [o[0]!, o[1]!, o[2]!, o[3]!]);
}

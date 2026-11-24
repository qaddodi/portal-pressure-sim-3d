// What the editor draws and picks for vessels: the built skeleton (after overrides), one entry per junction node and one per vessel course. Scene units.
import { MAPPED } from '../scene/vessels/network.ts';
import type { Vec3 } from '../scene/anatomy/vessels.ts';

export interface SkeletonArm { id: string; end: 0 | 1 }
export interface SkeletonNode { id: string; pos: Vec3; arms: SkeletonArm[] }
export interface SkeletonVessel { id: string; from: string; to: string; course: Vec3[] }
export interface EditableSkeleton { nodes: SkeletonNode[]; vessels: SkeletonVessel[] }

export function editableSkeleton(): EditableSkeleton {
  const vessels: SkeletonVessel[] = [], at = new Map<string, { arms: SkeletonArm[]; sum: [number, number, number] }>();
  for (const v of MAPPED) {
    if (v.pts.length < 2) continue;
    vessels.push({ id: v.id, from: v.from, to: v.to, course: v.pts.map((p): Vec3 => [p[0], p[1], p[2]]) });
    for (const [n, end] of [[v.from, 0], [v.to, 1]] as const) {
      const p = end ? v.pts[v.pts.length - 1]! : v.pts[0]!, a = at.get(n) ?? { arms: [], sum: [0, 0, 0] };
      a.arms.push({ id: v.id, end }); a.sum[0] += p[0]; a.sum[1] += p[1]; a.sum[2] += p[2]; at.set(n, a);
    }
  }
  const nodes = [...at].map(([id, a]): SkeletonNode => ({ id, pos: [a.sum[0] / a.arms.length, a.sum[1] / a.arms.length, a.sum[2] / a.arms.length], arms: a.arms }));
  return { nodes, vessels };
}

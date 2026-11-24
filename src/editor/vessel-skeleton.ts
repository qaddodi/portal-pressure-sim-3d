// What the editor draws and picks for vessels: the built skeleton (after overrides), one entry per junction node and one per vessel course. Scene units.
import { MAPPED } from '../scene/vessels/network.ts';
import { EDGE_PATH_2D } from '../scene/vessels/paths.copied.ts';
import { x3 } from '../scene/frame2d.ts';
import { NODE_REACH_MOVE } from '../editor/vessel-apply.ts';
import type { Vec3 } from '../scene/anatomy/vessels.ts';

export interface SkeletonArm { id: string; end: 0 | 1 }
/** `safeMove`: the move (scene units) up to which every arm eases smoothly (the arm's reach is 3 times the move: vessel-apply NODE_REACH_MOVE), a third of the shortest arm; the UI shows a warning colour beyond it. `maxMove`: the whole shortest arm, past which a bend cannot be hidden. */
export interface SkeletonNode { id: string; pos: Vec3; arms: SkeletonArm[]; safeMove: number; maxMove: number }
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
  // (an arm's length is its 2D plan's, which is what the easing runs over: the built course may carry a start on beyond it)
  const unit = Math.abs(x3(1) - x3(0)), plan = EDGE_PATH_2D as Record<string, readonly (readonly [number, number])[] | undefined>;
  const len = new Map(vessels.map((v) => { const p = plan[v.id]; return [v.id, (p ? p.reduce((t, q, i) => (i ? t + Math.hypot(q[0] - p[i - 1]![0], q[1] - p[i - 1]![1]) : 0), 0) : 0) * unit || v.course.reduce((t, q, i) => (i ? t + Math.hypot(q[0] - v.course[i - 1]![0], q[1] - v.course[i - 1]![1], q[2] - v.course[i - 1]![2]) : 0), 0)] as const; }));
  const nodes = [...at].map(([id, a]): SkeletonNode => {
    const shortest = Math.min(...a.arms.map((m) => len.get(m.id) ?? Infinity));
    return { id, pos: [a.sum[0] / a.arms.length, a.sum[1] / a.arms.length, a.sum[2] / a.arms.length], arms: a.arms, safeMove: shortest / NODE_REACH_MOVE, maxMove: shortest };
  });
  return { nodes, vessels };
}

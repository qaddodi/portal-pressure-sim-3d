// What the editor edits, read through a small adapter of its own (so it never waits on the apply seams): the vessel nodes and their arms from the network's course ends, the organs by id.
import { NETWORK } from '../../../scene/vessels/network.ts';
import { ORGAN_IDS } from '../../../scene/organs/meshes.ts';
import type { V3 } from '../../../editor/types.ts';

export interface SkNode { id: string; at: V3; arms: string[] }
export interface SkVessel { id: string; course: V3[]; from: string; to: string }
export interface Skeleton { nodes: SkNode[]; vessels: SkVessel[] }

/** Node and vessel positions are the reference (unedited) ones in the body's frame (scene units), as the built network has them. */
export function skeleton(): Skeleton {
  const nodes = new Map<string, SkNode>(), vessels: SkVessel[] = [];
  for (const v of NETWORK) {
    if (v.feeder || v.pts.length < 2) continue;
    vessels.push({ id: v.id, course: v.pts.map((p) => [p[0], p[1], p[2]] as const), from: v.from, to: v.to });
    for (const [n, p] of [[v.from, v.pts[0]!], [v.to, v.pts[v.pts.length - 1]!]] as const) {
      const k = nodes.get(n);
      if (k) k.arms.push(v.id); else nodes.set(n, { id: n, at: [p[0], p[1], p[2]], arms: [v.id] });
    }
  }
  return { nodes: [...nodes.values()], vessels };
}
export const organIds = (): readonly string[] => ORGAN_IDS;

/** The point at `u` (0..1 by length) along a course. */
export function pointAt(course: readonly V3[], u: number): V3 {
  const seg: number[] = [0];
  for (let i = 1; i < course.length; i++) seg.push(seg[i - 1]! + Math.hypot(course[i]![0] - course[i - 1]![0], course[i]![1] - course[i - 1]![1], course[i]![2] - course[i - 1]![2]));
  const total = seg[seg.length - 1]! || 1, d = Math.min(1, Math.max(0, u)) * total;
  let i = 1; while (i < seg.length - 1 && seg[i]! < d) i++;
  const a = course[i - 1]!, b = course[i]!, span = seg[i]! - seg[i - 1]! || 1, t = (d - seg[i - 1]!) / span;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

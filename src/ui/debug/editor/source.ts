// What the editor edits: the built vessel skeleton (WS-A, src/editor/vessel-skeleton.ts: junctions with their arms, vessel courses) and the editable organs (WS-B, meshes.ts: id and centroid).
import { editableSkeleton, type EditableSkeleton } from '../../../editor/vessel-skeleton.ts';
import { editableOrgans } from '../../../scene/organs/meshes.ts';
import type { V3 } from '../../../editor/types.ts';

export type Skeleton = EditableSkeleton;
export const skeleton = (): Skeleton => editableSkeleton();
/** The organs' reference centres (meshes.ts fills them as the organs are built; ready once organsReady has resolved). */
export const organList = (): { id: string; centroid: V3 }[] => editableOrgans();
export const organIds = (): readonly string[] => organList().map((o) => o.id);
export const centroidOf = (id: string): V3 => organList().find((o) => o.id === id)?.centroid ?? [0, 0, 0];

/** The share (0..1) of a course's length at a fractional vertex index (the inverse of pointAt). */
export function uAtIndex(course: readonly V3[], f: number): number {
  const seg: number[] = [0];
  for (let i = 1; i < course.length; i++) seg.push(seg[i - 1]! + Math.hypot(course[i]![0] - course[i - 1]![0], course[i]![1] - course[i - 1]![1], course[i]![2] - course[i - 1]![2]));
  const i = Math.min(course.length - 2, Math.max(0, Math.floor(f))), t = Math.min(1, Math.max(0, f - i)), total = seg[seg.length - 1]! || 1;
  return (seg[i]! + (seg[i + 1]! - seg[i]!) * t) / total;
}
/** The point at `u` (0..1 by length) along a course. */
export function pointAt(course: readonly V3[], u: number): V3 {
  const seg: number[] = [0];
  for (let i = 1; i < course.length; i++) seg.push(seg[i - 1]! + Math.hypot(course[i]![0] - course[i - 1]![0], course[i]![1] - course[i - 1]![1], course[i]![2] - course[i - 1]![2]));
  const total = seg[seg.length - 1]! || 1, d = Math.min(1, Math.max(0, u)) * total;
  let i = 1; while (i < seg.length - 1 && seg[i]! < d) i++;
  const a = course[i - 1]!, b = course[i]!, span = seg[i]! - seg[i - 1]! || 1, t = (d - seg[i - 1]!) / span;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

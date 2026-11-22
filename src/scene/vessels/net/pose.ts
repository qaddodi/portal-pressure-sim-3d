// The poses of the skeleton the mesh is bound to: pose 0 is the body, pose 1 the map, and anything between is the morph. A bone's position and radius are linear between its two poses; its frame is the body frame turned toward the
// map's by the share t of the smallest rotation that takes the body tangent to the map tangent (the map's own centreline, central differences along the edge). The vertex stage does the same, so this is the one definition the mesher,
// the tests' oracle and the shader's twin agree on.
import type { Vec3 } from '../../anatomy/vessels.ts';
import type { Skeleton } from './types.ts';

export type Frame = [Vec3, Vec3, Vec3];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

interface Turn { axis: Vec3 | null; ang: number }
const turns = new WeakMap<Skeleton, Turn[]>();
/** each bone's turn from its body frame to its map frame */
function turnsOf(skel: Skeleton): Turn[] {
  let t = turns.get(skel);
  if (t) return t;
  t = skel.bones.map((b, i) => {
    const e = skel.edges[b.edge]!, [first, count] = e.bones, k = i - first, a = skel.bones[first + Math.max(0, k - 1)]!, c = skel.bones[first + Math.min(count - 1, k + 1)]!;
    const t1 = norm(sub(c.pos[1], a.pos[1])), ax = cross(b.frame[0], t1), s = Math.hypot(ax[0], ax[1], ax[2]);
    return { axis: s < 1e-12 ? null : norm(ax), ang: Math.atan2(s, dot(b.frame[0], t1)) };
  });
  turns.set(skel, t);
  return t;
}

/** A per-bone state (the bones at the Circuit's t by their peel, net/window.ts `bonesAtT`): a pose argument may be one, in place of the uniform 0..1. */
export interface PoseAt { bones: readonly { cen: Vec3; F: Frame; r: number }[] }
export type Pose = number | PoseAt;

/** The frame of bone `i` at pose `t` (0 body, 1 map, or a per-bone state). */
export function boneFrame(skel: Skeleton, i: number, t: Pose): Frame {
  if (typeof t === 'object') return t.bones[i]!.F;
  const b = skel.bones[i]!, T = turnsOf(skel)[i]!;
  if (t === 0 || !T.axis) return [b.frame[0], b.frame[1], b.frame[2]];
  const u = T.axis, c = Math.cos(T.ang * t), s = Math.sin(T.ang * t);
  const rot = (v: Vec3): Vec3 => { const x = cross(u, v), d = dot(u, v) * (1 - c); return [v[0] * c + x[0] * s + u[0] * d, v[1] * c + x[1] * s + u[1] * d, v[2] * c + x[2] * s + u[2] * d]; };
  return [rot(b.frame[0]), rot(b.frame[1]), rot(b.frame[2])];
}
/** Every bone's frame at pose `t`. */
export const poseFrames = (skel: Skeleton, t: number): Frame[] => skel.bones.map((_, i) => boneFrame(skel, i, t));
export const bonePos = (skel: Skeleton, i: number, t: Pose): Vec3 => { if (typeof t === 'object') return t.bones[i]!.cen; const a = skel.bones[i]!.pos[0], b = skel.bones[i]!.pos[1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
export const boneRadius = (skel: Skeleton, i: number, t: Pose): number => typeof t === 'object' ? t.bones[i]!.r : skel.bones[i]!.r[0] + (skel.bones[i]!.r[1] - skel.bones[i]!.r[0]) * t;

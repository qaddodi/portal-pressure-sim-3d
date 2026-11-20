// Where two vessels' tubes run through each other (the inspector's "Overlaps", src/ui/debug/inspect; Mohammad 20 Nov: "show all the possible collaterals and shunts at once without too much overlap, and if there is we should be able to fix").
// Pure: the network, which vessels are drawn and each one's shape state come in as arguments, so a Node test runs it on the real network. Two vessels OVERLAP where a point of one centreline lies closer to a point of the other than
// `OVERLAP_K` times the sum of their radii (the tubes' walls are inside each other by more than a fifth of their thickness). Not counted, because the figure joins or lands them there on purpose:
//   - a point within `END_ZONE` radii of its own vessel's end (the junction skins, the mates and the fork method live there);
//   - two pieces of one host vein, a vessel and its feeders, a vessel and itself.
// Depth is how far the centrelines are inside the limit: 0 just touching, 1 on top of each other.
import { NETWORK, type NetVessel } from './network.ts';
import { REST, coursesOf, type ShapeState } from './shape.ts';
import type { Vec3 } from './skin/types.ts';

export const OVERLAP_K = 0.8;
export const END_ZONE = 2.5;

export interface Overlap {
  a: string; b: string;
  /** the deepest point, the midpoint of the two centreline points */
  at: Vec3;
  /** the centrelines' distance there, and the limit (OVERLAP_K x the radii) */
  gap: number; limit: number;
  /** 0 to 1: how far inside the limit the worst point is */
  depth: number;
  /** how much of the pair's length overlaps, in scene units (the sum over A's samples) */
  length: number;
}

interface Sampled { v: NetVessel; pts: Vec3[]; skip: boolean[]; lo: Vec3; hi: Vec3; step: number }

/** The vessel's main course as points about one radius apart, with those near its two ends marked. */
function sample(v: NetVessel, state: ShapeState): Sampled | null {
  const course = coursesOf(v, state)[0]?.pts as readonly Vec3[] | undefined;
  if (!course || course.length < 2) return null;
  let total = 0;
  for (let i = 0; i < course.length - 1; i++) total += Math.hypot(course[i + 1]![0] - course[i]![0], course[i + 1]![1] - course[i]![1], course[i + 1]![2] - course[i]![2]);
  const step = Math.max(v.radius, total / 300, 1e-6), pts: Vec3[] = [], lens: number[] = [];
  let run = 0;
  for (let i = 0; i < course.length - 1; i++) {
    const a = course[i]!, b = course[i + 1]!, l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(l / step));
    for (let k = 0; k < n; k++) { const t = k / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); lens.push(run + l * t); }
    run += l;
  }
  const last = course[course.length - 1]!; pts.push([last[0], last[1], last[2]]); lens.push(run);
  const zone = END_ZONE * v.radius;
  const skip = lens.map((d) => d < zone || run - d < zone);
  const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, p[k]!); hi[k] = Math.max(hi[k]!, p[k]!); }
  return { v, pts, skip, lo, hi, step };
}

export interface OverlapInput {
  network?: readonly NetVessel[];
  drawn?: (id: string) => boolean;
  stateOf?: (id: string) => ShapeState | undefined;
}

/** Every pair of drawn vessels whose tubes run through each other, worst first. */
export function findOverlaps(inp: OverlapInput = {}): Overlap[] {
  const network = inp.network ?? NETWORK, drawn = inp.drawn ?? (() => true);
  const all: Sampled[] = [];
  for (const v of network) {
    if (v.feeder || v.id.includes('~F') || !drawn(v.id)) continue;
    const s = sample(v, inp.stateOf?.(v.id) ?? REST);
    if (s) all.push(s);
  }
  const out: Overlap[] = [];
  for (let i = 0; i < all.length; i++) {
    const A = all[i]!;
    for (let j = i + 1; j < all.length; j++) {
      const B = all[j]!;
      if (A.v.host === B.v.host) continue;
      const reach = (A.v.radius + B.v.radius) * OVERLAP_K;
      let far = false;
      for (let k = 0; k < 3; k++) if (A.lo[k]! - reach > B.hi[k]! || B.lo[k]! - reach > A.hi[k]!) far = true;
      if (far) continue;
      const limit = reach;
      let best = Infinity, at: Vec3 = [0, 0, 0], length = 0;
      for (let p = 0; p < A.pts.length; p++) {
        if (A.skip[p]) continue;
        const a = A.pts[p]!;
        let d = Infinity, q = -1;
        for (let r = 0; r < B.pts.length; r++) {
          if (B.skip[r]) continue;
          const b = B.pts[r]!, dd = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          if (dd < d) { d = dd; q = r; }
        }
        if (q < 0 || d >= limit) continue;
        length += A.step;
        if (d < best) { best = d; const b = B.pts[q]!; at = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }
      }
      if (best < limit) out.push({ a: A.v.id, b: B.v.id, at, gap: best, limit, depth: 1 - best / limit, length });
    }
  }
  return out.sort((x, y) => y.depth * y.length - x.depth * x.length);
}

// Where two vessels' tubes run through each other (the inspector's "Overlaps", src/ui/debug/inspect; Mohammad 20 Nov: "show all the possible collaterals and shunts at once without too much overlap, and if there is we should be able to fix").
// Pure: the network, which vessels are drawn and each one's shape state come in as arguments, so a Node test runs it on the real network. Two vessels OVERLAP where a point of one centreline lies closer to a point of the other than
// `OVERLAP_K` times the sum of their radii (the tubes' walls are inside each other by more than a fifth of their thickness). The same analysis (`overlapRuns`) is what vessels/clearance.ts uses to move them apart, so this is also its check.
// NOT counted, because the figure meets them on purpose:
//   - a JUNCTION: a stretch that starts at an end of one of the two tubes (a branch leaving its trunk, a bed starting inside its vein, a shunt landing on a wall) and is no longer than `JUNCTION_RUN` limits (a branch leaving at seven degrees
//     is still inside the limit 8 limits out): the junction skins, the mates and the fork method live there;
//   - two pieces of one host vein, a vessel and its feeders, a vessel and itself;
//   - a braid of strands (C1a, C2, C4, C7, C8: `plan.strands`): its own course is not drawn (the strands are, and they are the channels of its trunk's frame by design).
// Depth is how far the centrelines are inside the limit: 0 just touching, 1 on top of each other.
import { NETWORK, type NetVessel } from './network.ts';
import { REST, coursesOf, type ShapeState } from './shape.ts';
import type { Vec3 } from './skin/types.ts';

export const OVERLAP_K = 0.8;
export const JUNCTION_RUN = 8;

export interface Overlap {
  a: string; b: string;
  /** the deepest point, the midpoint of the two centreline points */
  at: Vec3;
  /** the centrelines' distance there, and the limit (OVERLAP_K x the radii) */
  gap: number; limit: number;
  /** 0 to 1: how far inside the limit the worst point is */
  depth: number;
  /** how much of the pair's length overlaps, in scene units (A's stretches that are no junction) */
  length: number;
}

/** A vessel's main course as points (the course's own, subdivided where a segment is longer than a radius), with the arclength of each. */
export interface Sampled { v: NetVessel; pts: Vec3[]; s: number[]; total: number; lo: [number, number, number]; hi: [number, number, number] }

export const isBraid = (v: NetVessel): boolean => v.plan?.kind === 'coil' && !!v.plan.strands;

export function sampleCourse(v: NetVessel, course: readonly Vec3[]): Sampled | null {
  if (course.length < 2) return null;
  const step = Math.max(v.radius, 1e-6), pts: Vec3[] = [], s: number[] = [];
  let run = 0;
  for (let i = 0; i < course.length - 1; i++) {
    const a = course[i]!, b = course[i + 1]!, l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(l / step));
    for (let k = 0; k < n; k++) { const t = k / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); s.push(run + l * t); }
    run += l;
  }
  const last = course[course.length - 1]!; pts.push([last[0], last[1], last[2]]); s.push(run);
  const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, p[k]!); hi[k] = Math.max(hi[k]!, p[k]!); }
  return { v, pts, s, total: run, lo, hi };
}

/** A stretch of A's samples that lie within the limit of B's, and whether it is a junction. */
export interface Run {
  i0: number; i1: number;
  /** its length along A */
  length: number;
  /** the closest approach in it: the distance, A's sample, B's sample */
  d: number; at: number; mate: number;
  /** the range of B's samples it lies against */
  j0: number; j1: number;
  junction: boolean;
}

export const apartBoxes = (A: Sampled, B: Sampled, reach: number): boolean => { for (let k = 0; k < 3; k++) if (A.lo[k]! - reach > B.hi[k]! || B.lo[k]! - reach > A.hi[k]!) return true; return false; };

/** The stretches of A that run inside `limit` of B, each marked a junction when it starts at an end of A (or lies against an end of B) and is no longer than JUNCTION_RUN limits. */
export function overlapRuns(A: Sampled, B: Sampled, limit: number): Run[] {
  const out: Run[] = [];
  let cur: { i0: number; i1: number; d: number; at: number; mate: number; j0: number; j1: number } | null = null;
  const flush = () => {
    if (!cur) return;
    const length = A.s[cur.i1]! - A.s[cur.i0]! + (A.s[Math.min(A.pts.length - 1, cur.i1 + 1)]! - A.s[cur.i1]!) / 2 + (A.s[cur.i0]! - A.s[Math.max(0, cur.i0 - 1)]!) / 2;
    const ownEnd = cur.i0 === 0 || cur.i1 === A.pts.length - 1, mateEnd = cur.j0 === 0 || cur.j1 === B.pts.length - 1;
    const mateLen = B.s[cur.j1]! - B.s[cur.j0]!;
    out.push({ ...cur, length, junction: (ownEnd && length <= JUNCTION_RUN * limit) || (mateEnd && mateLen <= JUNCTION_RUN * limit && length <= JUNCTION_RUN * limit * 2) });
    cur = null;
  };
  // (a sample of A farther than `limit` from B's box in any one axis is farther than `limit` from every sample of B: it is never near, so it skips the search over B's samples. Only the few samples
  //  where the two tubes come together are searched: this was the biggest piece of the figure's start-up, the clearance pass over every pair of vessels, about 0.4 s)
  const bx0 = B.lo[0]! - limit, by0 = B.lo[1]! - limit, bz0 = B.lo[2]! - limit, bx1 = B.hi[0]! + limit, by1 = B.hi[1]! + limit, bz1 = B.hi[2]! + limit;
  for (let p = 0; p < A.pts.length; p++) {
    const a = A.pts[p]!;
    if (a[0] < bx0 || a[0] > bx1 || a[1] < by0 || a[1] > by1 || a[2] < bz0 || a[2] > bz1) { flush(); continue; }
    let d = Infinity, q = -1;
    for (let r = 0; r < B.pts.length; r++) { const b = B.pts[r]!, dd = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (dd < d) { d = dd; q = r; } }
    if (q < 0 || d >= limit) { flush(); continue; }
    if (!cur) cur = { i0: p, i1: p, d, at: p, mate: q, j0: q, j1: q };
    else { cur.i1 = p; cur.j0 = Math.min(cur.j0, q); cur.j1 = Math.max(cur.j1, q); if (d < cur.d) { cur.d = d; cur.at = p; cur.mate = q; } }
  }
  flush();
  return out;
}

export interface OverlapInput {
  network?: readonly NetVessel[];
  drawn?: (id: string) => boolean;
  stateOf?: (id: string) => ShapeState | undefined;
  /** the course to test of a vessel (default: coursesOf at its state, the main course); a test or the clearance pass supplies another */
  courseOf?: (v: NetVessel) => readonly Vec3[] | undefined;
}

/** Every pair of drawn vessels whose tubes run through each other beyond a junction, worst first. */
export function findOverlaps(inp: OverlapInput = {}): Overlap[] {
  const network = inp.network ?? NETWORK, drawn = inp.drawn ?? (() => true);
  const course = inp.courseOf ?? ((v: NetVessel) => coursesOf(v, inp.stateOf?.(v.id) ?? REST)[0]?.pts as readonly Vec3[] | undefined);
  const all: Sampled[] = [];
  for (const v of network) {
    if (v.feeder || v.id.includes('~F') || isBraid(v) || !drawn(v.id)) continue;
    const c = course(v), s = c ? sampleCourse(v, c) : null;
    if (s) all.push(s);
  }
  const out: Overlap[] = [];
  for (let i = 0; i < all.length; i++) {
    const A = all[i]!;
    for (let j = i + 1; j < all.length; j++) {
      const B = all[j]!;
      if (A.v.host === B.v.host) continue;
      const limit = (A.v.radius + B.v.radius) * OVERLAP_K;
      if (apartBoxes(A, B, limit)) continue;
      const real = overlapRuns(A, B, limit).filter((r) => !r.junction);
      if (!real.length) continue;
      const w = real.reduce((m, r) => (r.d < m.d ? r : m));
      const a = A.pts[w.at]!, b = B.pts[w.mate]!;
      out.push({ a: A.v.id, b: B.v.id, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], gap: w.d, limit, depth: 1 - w.d / limit, length: real.reduce((t, r) => t + r.length, 0) });
    }
  }
  return out.sort((x, y) => y.depth * y.length - x.depth * x.length);
}

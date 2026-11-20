// A braid's root as an arm of a junction skin (Mohammad, 20 Nov: "weld the collaterals ... as one mesh"; the braids C1a, C2, C4, C7 and the cavernoma C8 were the ones the skin left to the fork method).
// A braid (`plan.strands`) has no tube of its own while its strands are drawn: its course 0 is built at radius 0 (shape.ts `bundle`), and its three (C8: six) strands leave and rejoin the trunk (coil.ts STRAND_FROM). Where
// they LEAVE the node together, over the first stretch they are one tube drawn three times: the same axis (the braid's offset is 0 until STRAND_FROM, and the serpentine is tapered to nothing at the end), the same width at the end
// (each strand widens to the trunk's at its ends, shape.ts), narrowing together. That bundle is ONE growing arm of the node's skin: the arm tube the skin reads its seam ring from is the STRAND with the widest root (`armCourses`,
// not drawn: it only gives the skin its rings), the skin's seam ring lies on it, and every strand is cut at that ring (`strandCutU`), so the skin starts where the strands do and no strand end, cap or overlap shows past the skin.
// A strand that is longer than the arm's tube is cut a little earlier along its own share, never later: its start is then inside the skin, never short of it.
// The ends where the strands part at once (the braid's far ends, which rejoin the trunk at an angle; the cavernoma's channels, which fan out of the node as six separate tubes) are not one bundle and keep the fork method: `braidRootEnds`
// lists the ends that are, from the courses themselves (never a list of ids), and tests/skin-strands.test.ts pins them by name.
import { CatmullRomCurve3, Vector3 } from 'three';
import { REST, coursesOf, tubularOf, type ShapeState } from '../shape.ts';
import { radiusAtU, type Course } from '../tubes.ts';
import { slicesFor } from '../../circuit/geometry.ts';
import type { NetVessel } from '../network.ts';
import type { Vec3 } from './types.ts';

/** A vessel drawn as a braid of strands (C1a, C2, C4, C7, C8). Its strands are courses 1.. of `coursesOf`. */
export const isBraid = (v: NetVessel): boolean => v.plan?.kind === 'coil' && !!v.plan.strands;
/** How far (in the vessel's radii) from its end the strands must stay one bundle, and how far apart (in radii) they may lie over that stretch: the strands leave the node as one tube. */
export const BUNDLE_REACH_R = 4;
export const BUNDLE_TOL_R = 0.15;

const lenOf = (pts: readonly Vec3[]): number => new CatmullRomCurve3(pts.map((p) => new Vector3(p[0], p[1], p[2]))).getLength();
/** The point at distance `d` along a polyline from its start (`end` 0) or from its end (`end` 1), by chord. */
function pointAtDist(pts: readonly Vec3[], d: number, end: 0 | 1): Vec3 {
  const p = end ? [...pts].reverse() : pts;
  let a = 0;
  for (let i = 1; i < p.length; i++) {
    const l = Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1], p[i]![2] - p[i - 1]![2]);
    if (a + l >= d || i === p.length - 1) { const t = l > 0 ? Math.min(1, Math.max(0, (d - a) / l)) : 0; return [p[i - 1]![0] + (p[i]![0] - p[i - 1]![0]) * t, p[i - 1]![1] + (p[i]![1] - p[i - 1]![1]) * t, p[i - 1]![2] + (p[i]![2] - p[i - 1]![2]) * t]; }
    a += l;
  }
  return p[0]!;
}

/** The ends of a braid where its strands leave the node as one bundle (see the head of this file), read on the courses at rest. [] for a vessel that is no braid or whose strands are not drawn. */
export function braidRootEnds(v: NetVessel, state: ShapeState = REST): (0 | 1)[] {
  if (!isBraid(v)) return [];
  const cs = coursesOf(v, state);
  if (cs.length < 2 || cs[0]!.radius > 0) return [];
  const R = v.radius, out: (0 | 1)[] = [];
  for (const end of [0, 1] as const) {
    let ok = true;
    for (let s = 1; s <= BUNDLE_REACH_R && ok; s++) {
      const at = cs.slice(1).map((c) => pointAtDist(c.pts, s * R, end));
      for (const p of at) for (const q of at) if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > BUNDLE_TOL_R * R) ok = false;
    }
    // (a strand that does not run to this end of the vessel, or has no width there, is no bundle: its own radius at the end must be a real tube's)
    const wide = cs.slice(1).every((c) => radiusAtU(c, end ? 1 : 0, lenOf(c.pts)) > 0.2 * R);
    if (ok && wide) out.push(end);
  }
  return out;
}

/** The strand that stands for the bundle at one end: the widest over the first `BUNDLE_REACH_R` radii (the others are at most a few per cent narrower there). Its index among the courses (1..). */
function widestStrand(v: NetVessel, cs: readonly Course[], end: 0 | 1): number {
  let best = 1, bw = -1;
  for (let i = 1; i < cs.length; i++) {
    const L = lenOf(cs[i]!.pts);
    let w = 0;
    for (let s = 1; s <= BUNDLE_REACH_R; s++) { const u = Math.min(1, (s * v.radius) / L); w += radiusAtU(cs[i]!, end ? 1 - u : u, L); }
    if (w > bw + 1e-12) { bw = w; best = i; }
  }
  return best;
}

/** The courses the skin reads a vessel's arm tube from: `coursesOf`, except a braid whose strands are drawn gets its widest strand as course 0 (its own course is radius 0, no tube). The vessel itself is drawn with its own courses; this is only what the seam rings are read from.
 *  `index` is which course (of the vessel's own list) the arm tube is, for `tubularOf`. */
export function armCourses(v: NetVessel, state: ShapeState, ends: readonly (0 | 1)[] = braidRootEnds(v, state)): { courses: Course[]; index: number } {
  const cs = coursesOf(v, state);
  if (!ends.length || cs[0]!.radius > 0) return { courses: cs, index: 0 };
  const index = widestStrand(v, cs, ends[0]!);
  return { courses: [cs[index]!], index };
}

/** The arm tube of a vessel, its tubular count: what `buildTubes` is given for the skin's arm of `v`. */
export function armTube(v: NetVessel, state: ShapeState): { courses: Course[]; tubular: number[] } {
  const { courses, index } = armCourses(v, state);
  return { courses, tubular: courses.length === 1 && index > 0 ? [tubularOf(v, slicesFor(v.id))[index]!] : tubularOf(v, slicesFor(v.id)) };
}

/** The `skinCut` u of a braid's strands for the seam at share `u` of the arm tube (the widest strand): every strand is cut at the SAME distance from the node, or earlier, so none starts short of the skin. A strand's u is its own share of its own length, and the strands differ
 *  a little in length (the serpentine), so the one u that is never past the seam on any is the seam's distance over the LONGEST strand (end 0), or its mirror (end 1). Anything but a braid keeps `u`. */
export function strandCutU(v: NetVessel, state: ShapeState, end: 0 | 1, u: number): number {
  if (!isBraid(v)) return u;
  const cs = coursesOf(v, state);
  if (cs.length < 2 || cs[0]!.radius > 0) return u;   // (the strands are not drawn: the vessel's own tube is, and it is the arm)
  const index = widestStrand(v, cs, end), Ls = cs.slice(1).map((c) => lenOf(c.pts)), Li = Ls[index - 1]!;
  const d = (end ? 1 - u : u) * Li, Lmax = Math.max(...Ls), share = Math.min(1, d / Lmax);
  return end ? 1 - share : share;
}

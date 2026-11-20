// Junction skins, WP1 (spec 4.4): where each arm's tube is cut and hands over to the skin. The seam is one of the tube's own rings, never a new one: the skin starts on those same vertices, so there is no crack.
// Pure geometry on the tubes `buildTubes` made; no scene objects. The hull rule (4.4 rule 3) is WP2's, called back through `hullOk`.
import type { BufferGeometry } from 'three';
import { TUBE_RADIAL } from '../tubes.ts';
import { SkinBuildError, type SkinCut, type SkinJunction, type Vec3 } from './types.ts';

/** The tube vertices of one arm: its merged geometry (`buildTubes`, the vessel's own course first, so ring k's vertex j is position index `k * (RADIAL + 1) + j`) and the course's `tubular` segment count. */
export interface ArmTube { geometry: BufferGeometry; tubular: number }
/** WP2's check (mesh.ts `hullCovers`, spec 4.4 rule 3): with these cuts, is every seam ring vertex a vertex of the convex hull of all the rings? */
export type HullOk = (cuts: SkinCut[]) => boolean;

/** The blend width factor of the smooth union, as a share of the narrowest arm's radius (spec 4.3 `SKIN_K`). WP2 owns the export in skin/sdf.ts; the value is the spec's. */
export const CUT_SKIN_K = 0.8;
/** A seam lies at least this many radii of its own arm from J (rule 2). */
export const SEAM_MIN_R = 1.5;
/** The length of an arm's capsule: out from J this many of its radii (spec 4.3). */
export const CAPSULE_R = 6;
/** Rule 1's clearance: a seam vertex must be farther than `CLEAR_K` blend widths plus `CLEAR_R` radii of its own arm from every other arm's capsule (spec 4.4: 2k + 2R). */
export const CLEAR_K = 2;
export const CLEAR_R = 2;
/** The tries the hull rule gets before the junction is given up (rule 3). */
export const MAX_TRIES = 40;
const RADIAL = TUBE_RADIAL;

interface Ring { k: number; centre: Vec3; r: number; verts: Float32Array }
interface Capsule { pts: Vec3[]; rad: number[] }

/** Ring k of a tube: its 14 vertices (the 15th repeats the first), their mean and mean distance from it. */
function ringAt(t: ArmTube, k: number): Ring {
  const pos = t.geometry.getAttribute('position'), verts = new Float32Array(RADIAL * 3);
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < RADIAL; j++) {
    const i = k * (RADIAL + 1) + j, x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    verts[j * 3] = x; verts[j * 3 + 1] = y; verts[j * 3 + 2] = z; cx += x; cy += y; cz += z;
  }
  cx /= RADIAL; cy /= RADIAL; cz /= RADIAL;
  let r = 0;
  for (let j = 0; j < RADIAL; j++) r += Math.hypot(verts[j * 3]! - cx, verts[j * 3 + 1]! - cy, verts[j * 3 + 2]! - cz);
  return { k, centre: [cx, cy, cz], r: r / RADIAL, verts };
}
const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The arm's capsule (spec 4.3): its axis from J outward, the tube's own ring centres, out to `CAPSULE_R` of its radii, with the radius the tube really has at each (tapers included). */
function capsuleOf(j: SkinJunction, rings: readonly Ring[], restR: number): Capsule {
  const pts: Vec3[] = [j.J], rad: number[] = [rings[0]!.r];
  let len = 0;
  for (const g of rings) {
    len += dist3(pts[pts.length - 1]!, g.centre);
    pts.push(g.centre); rad.push(g.r);
    if (len >= CAPSULE_R * restR) break;
  }
  return { pts, rad };
}
/** The signed distance from `p` to a capsule: the distance to its axis, less the radius there (spec 4.3 sdArm). */
function sdCapsule(p: ArrayLike<number>, o: number, c: Capsule): number {
  let best = Infinity;
  for (let i = 1; i < c.pts.length; i++) {
    const a = c.pts[i - 1]!, b = c.pts[i]!, abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const apx = p[o]! - a[0], apy = p[o + 1]! - a[1], apz = p[o + 2]! - a[2], l2 = abx * abx + aby * aby + abz * abz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / l2)) : 0;
    const d = Math.hypot(apx - t * abx, apy - t * aby, apz - t * abz) - (c.rad[i - 1]! + t * (c.rad[i]! - c.rad[i - 1]!));
    if (d < best) best = d;
  }
  return best;
}

/**
 * The seam ring of every arm (spec 4.4), in the junction's arm order. Each arm's rings are walked outward from J (k = tubular down for end 1, 0 up for end 0) to the first ring where
 *   1. every vertex is farther than 2k + 2 R (`clear`, the spec's CLEAR_K and CLEAR_R) from every other arm's capsule (the blend has no effect there, so the skin's ring and the tube's ring are one surface);
 *   2. the ring's centre is at least 1.5 R from J.
 * Then `hullOk` judges the set (rule 3). If it refuses, the arm whose seam is nearest to J in its own radii moves out to its next such ring, and the set is judged again, up to 40 tries.
 * Throws a `SkinBuildError` for the node when an arm runs out of rings or the tries; the scene keeps today's method for that node.
 */
export function chooseCuts(j: SkinJunction, tubes: ReadonlyMap<string, ArmTube>, hullOk: HullOk, clear: { k: number; r: number } = { k: CLEAR_K, r: CLEAR_R }): SkinCut[] {
  const n = j.arms.length, k = CUT_SKIN_K * Math.min(...j.arms.map((a) => a.restR));
  const rings: Ring[][] = j.arms.map((a) => {
    const t = tubes.get(a.vesselId);
    if (!t) throw new SkinBuildError(j.node, `no tube for ${a.vesselId}`);
    const out: Ring[] = [];
    for (let s = 0; s <= t.tubular; s++) out.push(ringAt(t, a.end ? t.tubular - s : s));
    return out;
  });
  const caps = j.arms.map((a, i) => capsuleOf(j, rings[i]!, a.restR));
  /** whether ring `s` (counted from J) of arm `i` meets rules 1 and 2 */
  const eligible = (i: number, s: number): boolean => {
    const a = j.arms[i]!, g = rings[i]![s]!;
    if (dist3(g.centre, j.J) < SEAM_MIN_R * a.restR) return false;
    const need = clear.k * k + clear.r * a.restR;
    for (let o = 0; o < n; o++) {
      if (o === i) continue;
      for (let v = 0; v < RADIAL; v++) if (sdCapsule(g.verts, v * 3, caps[o]!) <= need) return false;
    }
    return true;
  };
  const next = (i: number, from: number): number => {
    for (let s = from; s < rings[i]!.length; s++) if (eligible(i, s)) return s;
    throw new SkinBuildError(j.node, `${j.arms[i]!.vesselId} has no ring that clears the blend`);
  };
  const at = j.arms.map((_, i) => next(i, 0));
  const cutsOf = (): SkinCut[] => j.arms.map((a, i) => { const ring = rings[i]![at[i]!]!.k, tubular = tubes.get(a.vesselId)!.tubular; return { vesselId: a.vesselId, end: a.end, ring, u: ring / tubular }; });
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const cuts = cutsOf();
    if (hullOk(cuts)) return cuts;
    // the seam nearest to the centre, in its own radii, moves out one eligible ring
    let m = 0, best = Infinity;
    for (let i = 0; i < n; i++) { const d = dist3(rings[i]![at[i]!]!.centre, j.J) / j.arms[i]!.restR; if (d < best) { best = d; m = i; } }
    at[m] = next(m, at[m]! + 1);
  }
  throw new SkinBuildError(j.node, `the hull rule still fails after ${MAX_TRIES} tries`);
}

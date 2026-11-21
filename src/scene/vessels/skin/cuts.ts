// Junction skins, WP1 (spec 4.4): where each arm's tube is cut and hands over to the skin. The seam is one of the tube's own rings, never a new one: the skin starts on those same vertices, so there is no crack.
// Pure geometry on the tubes `buildTubes` made; no scene objects. The hull rule (4.4 rule 3) is WP2's, called back through `hullOk`.
import type { BufferGeometry } from 'three';
import { TUBE_RADIAL } from '../tubes.ts';
import { SKIN_GROWERS, armR, SkinBuildError, type SkinArm, type SkinCut, type SkinJunction, type Vec3 } from './types.ts';

/** The tube vertices of one arm: its merged geometry (`buildTubes`, the vessel's own course first, so ring k's vertex j is position index `k * (RADIAL + 1) + j`) and the course's `tubular` segment count. */
/** `input`: what the tube was built FROM (the courses' points, radii and tapers; the map's points), the digest of a baked file hashes it instead of the vertices: the vertices come out of sin, cos and a Frenet frame, and another engine's last bits could move one across the digest's rounding, so a phone would never find the file made for it. */
export interface ArmTube { geometry: BufferGeometry; tubular: number; input?: unknown }
/** WP2's check (mesh.ts `hullCovers`, spec 4.4 rule 3): with these cuts, is every seam ring vertex a vertex of the convex hull of all the rings? */
export type HullOk = ((cuts: SkinCut[]) => boolean) & {
  /** after a refusal: the arm whose seam is the one to move out (the check knows which seam stands too near which arm); the seam nearest J when absent or -1 */
  blame?: () => number;
};

/** The blend width factor of the smooth union, as a share of the narrowest arm's radius (spec 4.3 `SKIN_K`). WP2 owns the export in skin/sdf.ts; the value is the spec's. */
export const CUT_SKIN_K = 0.8;
/** A seam lies at least this many radii of its own arm from J (rule 2). */
export const SEAM_MIN_R = 1.5;
/** The length of an arm's capsule: out from J this many of its radii (spec 4.3). */
export const CAPSULE_R = 6;
/** Rule 1's clearance (spec 4.4, amended 20 Nov): a seam vertex must be at least `CLEAR_K` blend widths plus `CLEAR_R` radii of its own arm from every other arm's capsule (k + 0.5 R). The polynomial smooth-min is exactly the plain min once two
 *  distances differ by k, and a ring vertex lies on its own arm (sd 0), so k is the exact no-blend bound; the half radius covers the ink's inflation. (The first draft's 2k + 2R left the portal bifurcation uncuttable.) */
export const CLEAR_K = 1;
export const CLEAR_R = 0.5;
/** Rule 1b: a seam may not lie farther than this share of its arm's own length from J (else the skin would eat the tube: SkinBuildError). */
export const SEAM_MAX_SHARE = 0.85;
/** The share an arm's seam may reach when no ring of it clears within `SEAM_MAX_SHARE` (a short through vein with a branch beside it and a collateral landing on it: the left portal vein's end, 17 rings, REX's mouth at ring 10 and the branch's clearance to ring 12): the tube's last rings stay. Only a retry, so no skin that has a ring within 85 % moves. */
export const SEAM_FALLBACK_SHARE = 0.97;
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

/** Where an arm's rings are walked from and which way (spec 10.1): from the tube's own end (the ring `tubular` for end 1, 0 for end 0), or for a SIDE-WALL arm from the ring nearest its point `u`, outward either way. `count` rings lie on the arm's side of it. */
export function armWalk(a: Pick<SkinArm, 'end' | 'side'>, tubular: number): { from: number; step: 1 | -1; count: number } {
  const from = a.side ? Math.max(0, Math.min(tubular, Math.round(a.side.u * tubular))) : a.end ? tubular : 0;
  return { from, step: a.end ? -1 : 1, count: a.end ? from + 1 : tubular - from + 1 };
}

/** The two side arms of one vessel (a junction in the middle of a vein, spec 10.1): they run on into each other through J as ONE straight tube, so neither is "another arm" to the other's seam (the union of their capsules is the vein itself, no blend lies between them). */
export const isThroughPair = (a: Pick<SkinArm, 'vesselId' | 'side'>, b: Pick<SkinArm, 'vesselId' | 'side'>): boolean => !!a.side && !!b.side && a.vesselId === b.vesselId && a.side.dir !== b.side.dir;

/** The arm's capsule (spec 4.3): its axis from J outward, the tube's own ring centres, out to `CAPSULE_R` of its radii, with the radius the tube really has at each (tapers included). */
function capsuleOf(from: Vec3, rings: readonly Ring[], restR: number): Capsule {
  const pts: Vec3[] = [from], rad: number[] = [rings[0]!.r];
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
 *   1. every vertex is at least k + 0.5 R (`clear`, the spec's CLEAR_K and CLEAR_R) from every other arm's capsule (the blend has no effect there, so the skin's ring and the tube's ring are one surface);
 *   1b. the ring's arc length from J is at most 85 % of the arm's own length;
 *   2. the ring's centre is at least 1.5 R from J.
 * Then `hullOk` judges the set (rule 3). If it refuses, the arm whose seam is nearest to J in its own radii moves out to its next such ring, and the set is judged again, up to 40 tries.
 * Throws a `SkinBuildError` for the node when an arm runs out of rings or the tries; the scene keeps today's method for that node.
 */
export function chooseCuts(j: SkinJunction, tubes: ReadonlyMap<string, ArmTube>, hullOk: HullOk, clear: { k: number; r: number } = { k: CLEAR_K, r: CLEAR_R }): SkinCut[] {
  const n = j.arms.length, k = CUT_SKIN_K * Math.min(...j.arms.map(armR));
  const rings: Ring[][] = j.arms.map((a) => {
    const t = tubes.get(a.vesselId);
    if (!t) throw new SkinBuildError(j.node, `no tube for ${a.vesselId}`);
    const out: Ring[] = [], w = armWalk(a, t.tubular);
    for (let s = 0; s < w.count; s++) out.push(ringAt(t, w.from + w.step * s));
    return out;
  });
  const caps = j.arms.map((a, i) => capsuleOf(a.at ?? j.J, rings[i]!, a.restR));
  // the arc length from J to each ring's centre (the arm's own length is the last): rule 1b
  const arc = rings.map((rs, i) => { let d = 0, prev: Vec3 = j.arms[i]!.at ?? j.J; return rs.map((g) => { d += dist3(prev, g.centre); prev = g.centre; return d; }); });
  /** why ring `s` (counted from J) of arm `i` is not eligible under rules 1, 1b and 2 (null: eligible), and for rule 1 which arm's capsule it is too near */
  const why = (i: number, s: number, share: number = SEAM_MAX_SHARE): string | null => {
    const a = j.arms[i]!, g = rings[i]![s]!;
    if (arc[i]![s]! > share * arc[i]![arc[i]!.length - 1]!) return 'too far (1b)';
    if (dist3(g.centre, a.at ?? j.J) < SEAM_MIN_R * a.restR) return 'too near J (2)';
    const need = clear.k * k + clear.r * a.restR;
    for (let o = 0; o < n; o++) {
      if (o === i || isThroughPair(a, j.arms[o]!)) continue;
      for (let v = 0; v < RADIAL; v++) if (sdCapsule(g.verts, v * 3, caps[o]!) < need) return `${j.arms[o]!.vesselId}${j.arms[o]!.side ? ' (side)' : ''}`;
    }
    return null;
  };
  const next = (i: number, from: number): number => {
    for (const share of [SEAM_MAX_SHARE, SEAM_FALLBACK_SHARE]) for (let s = from; s < rings[i]!.length; s++) if (why(i, s, share) === null) return s;
    const tally = new Map<string, number>();
    for (let s = from; s < rings[i]!.length; s++) { const w = why(i, s)!; tally.set(w, (tally.get(w) ?? 0) + 1); }
    throw new SkinBuildError(j.node, `${j.arms[i]!.vesselId} has no ring that clears the blend within 85 % of its length (rings refused: ${[...tally].map(([w, c]) => `${w} ${c}`).join(', ')})`);
  };
  const at = j.arms.map((_, i) => next(i, 0));
  const cutsOf = (): SkinCut[] => j.arms.map((a, i) => { const ring = rings[i]![at[i]!]!.k, tubular = tubes.get(a.vesselId)!.tubular; return { vesselId: a.vesselId, end: a.end, ring, u: ring / tubular, ...(a.side ? { side: a.side.dir } : {}) }; });
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const cuts = cutsOf();
    if (hullOk(cuts)) return cuts;
    // the seam nearest to the centre, in its own radii, moves out one eligible ring
    let m = 0, best = Infinity;
    for (let i = 0; i < n; i++) { const d = dist3(rings[i]![at[i]!]!.centre, j.arms[i]!.at ?? j.J) / j.arms[i]!.restR; if (d < best) { best = d; m = i; } }
    const blamed = hullOk.blame?.() ?? -1;
    if (blamed >= 0 && blamed < n) m = blamed;
    at[m] = next(m, at[m]! + 1);
  }
  throw new SkinBuildError(j.node, `the hull rule still fails after ${MAX_TRIES} tries`);
}

// ---- two skins on one vessel (spec 4.4 rule 1c) ----
/** The least tube rings that must stay between the two cuts of a vessel that is an arm at both of its nodes (PV_TRUNK_1: CONF at its start, PVT_L at its end). */
export const MIN_RINGS_BETWEEN = 2;
/** Rule 1c in length too: two skins on one vessel also merge when the piece of the vessel left between their seams is shorter than this many of its radii (the SVC's stub between the azygos and the epigastric junctions was 0.9 R: two seam rings and a
 *  sliver of tube between them, a ring of ink and a calibre step across the trunk; Mohammad, 20 Nov: "very very wobbly junction"). Rings alone do not say it: a long, finely ringed vessel has many rings in a short length. */
export const MIN_STUB_R = 1.5;
/** The length of the piece of an arm's tube between ring `lo` and ring `hi` (the sum of the distances between the ring centres), in its own radii `r`. */
export function stubLengthR(tube: ArmTube, lo: number, hi: number, r: number): number {
  const pos = tube.geometry.getAttribute('position'), W = RADIAL + 1;
  const centre = (k: number): Vec3 => { let x = 0, y = 0, z = 0; for (let j = 0; j < RADIAL; j++) { const i = k * W + j; x += pos.getX(i); y += pos.getY(i); z += pos.getZ(i); } return [x / RADIAL, y / RADIAL, z / RADIAL]; };
  let len = 0, prev = centre(lo);
  for (let k = lo + 1; k <= hi; k++) { const c = centre(k); len += Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]); prev = c; }
  return len / r;
}
/** The most permanent arms a merged skin has (spec 4.4.1c: 3 or 4, 5 for the cava), and the most of all: its growing arms ride along (spec 10.2), the six arms of the foundation. */
export const MERGED_MAX_PERMANENT = 5;   // (5 since the side-wall IVCS: its five arms and the run-on RHV_T beside it are one skin, spec 10.1)
export const MERGED_MAX_ARMS = 6;
/** The ids of a merged skin's two nodes joined, e.g. `CONF+PVT_L`. */
export const mergedNode = (a: string, b: string): string => `${a}+${b}`;

/** One junction ready to build: its (possibly merged) junction, one cut per arm, and the vessels its skin replaces whole (their tube is not drawn at all: `skinCut` (2, -1)). */
export interface SkinPlan { junction: SkinJunction; cuts: SkinCut[]; hidden: string[]; /** the two nodes this skin is made of, when merged */ merged?: readonly [string, string] }
export interface SkinPlans { plans: SkinPlan[]; failures: SkinBuildError[] }

/**
 * The cuts of every junction given, with rule 1c applied: a vessel that is an arm at two of the junctions (it starts at one node and ends at the other) must keep at least `MIN_RINGS_BETWEEN` rings between its two cuts.
 * If the cuts cross or crowd, the two junctions merge into one skin (node `A+B`): the union of their arms less the shared vessel (at most 4 arms, else both fall back), J the midpoint of the two Js, and the shared vessel
 * hidden whole. A junction that cannot be cut, or whose merge fails, is a failure (a named SkinBuildError) and is left out of the plans; the scene keeps today's method there. Never throws.
 * `hullFor(junction)` gives WP2's hull check for that junction's rings.
 */
const isWall = (j: SkinJunction): boolean => j.node.startsWith('wall:');
export function planSkins(js: readonly SkinJunction[], tubes: ReadonlyMap<string, ArmTube>, hullFor: (j: SkinJunction) => HullOk, minBetween: number = MIN_RINGS_BETWEEN): SkinPlans {
  const failures: SkinBuildError[] = [];
  const attempt = (j: SkinJunction): SkinPlan | null => {
    try { return { junction: j, cuts: chooseCuts(j, tubes, hullFor(j)), hidden: [] }; }
    catch (e) { if (e instanceof SkinBuildError) { failures.push(e); return null; } throw e; }
  };
  const plans = js.map(attempt);
  const out: SkinPlan[] = [];
  const done = new Set<number>();
  for (let a = 0; a < js.length; a++) {
    if (done.has(a)) continue;
    const pa = plans[a];
    if (!pa) continue;
    let merged = false;
    for (let b = a + 1; b < js.length && !merged; b++) {
      const pb = plans[b];
      if (!pb || done.has(b)) continue;
      for (const ca of pa.cuts) {
        const cb = pb.cuts.find((c) => c.vesselId === ca.vesselId && c.end !== ca.end);
        if (!cb) continue;
        const lo = ca.end === 0 ? ca : cb, hi = ca.end === 0 ? cb : ca;   // (the cut at the vessel's start, the cut at its end)
        const tb = tubes.get(ca.vesselId), rr = pa.junction.arms.find((m) => m.vesselId === ca.vesselId)?.restR ?? 1;
        if (hi.ring - lo.ring - 1 >= minBetween && !(tb && stubLengthR(tb, lo.ring, hi.ring, rr) < MIN_STUB_R)) continue;
        // two skins would crowd or cross on this vessel: one skin for both nodes
        merged = true; done.add(a); done.add(b);
        const A = js[a]!, B = js[b]!;
        // a landing on a host's wall (a virtual `wall:` node, wall.ts) that crowds another skin is not merged into it (its side arm is no run-on between two nodes): the other skin stays as it was, the landing keeps the tube's own flared end (named)
        if (isWall(A) || isWall(B)) {
          const [w, other, otherPlan, wallPlan] = isWall(A) ? [A, B, pb, pa] : [B, A, pa, pb];
          // ...unless the two seams can be ONE ring: the other skin's cut is a ring the wall's own seam may stand on (the wall's seam only moves AWAY from its centre, never nearer), so the skins abut on that ring (identical seam, no tube between them) and the host is
          // skin all the way along (S_PC and C9 on the cava's first stretch, IVCI's seam and the wall node's own both at ring 3)
          const [wc, oc] = wallPlan === pa ? [ca, cb] : [cb, ca];
          if (wc.side !== undefined && (wc.end === 1 ? oc.ring <= wc.ring : oc.ring >= wc.ring)) {
            const moved: SkinCut = { ...wc, ring: oc.ring, u: oc.u };
            out.push(otherPlan, { ...wallPlan, cuts: wallPlan.cuts.map((c) => (c === wc ? moved : c)) });
            break;
          }
          // ...or the landing is INSIDE the other skin's reach (REX on the left portal vein lands where LPV_A's skin, held 8 radii out the host by the branch beside it and the umbilical vein, is): its growing arm is an arm of that skin, starting at its own landing (`at`)
          const grown = w.arms.filter((m) => m.grow);
          if (grown.length && other.arms.filter((m) => m.grow).length + grown.length <= SKIN_GROWERS && other.arms.length + grown.length <= MERGED_MAX_ARMS) {
            const mj: SkinJunction = { ...other, arms: [...other.arms, ...grown.map((g): SkinArm => ({ ...g, at: w.J }))] };
            try {
              const cuts = chooseCuts(mj, tubes, hullFor(mj));
              // ...but the arms that stay are the PLAIN TRUNK whenever the grower is not whole (Healthy has no REX): their seams must stay where the skin without it put them. A grower's capsule that pushes them out makes the plain skin a bigger, straighter one over
              // the faded stretch of the vein (the left portal vein washed out and doubled, 21 Nov): then the landing keeps the tube's own flared end, named
              const moved = otherPlan.cuts.findIndex((c, i) => cuts[i]!.ring !== c.ring);
              if (moved >= 0) { failures.push(new SkinBuildError(w.node, `${w.node} would move the seam of ${otherPlan.cuts[moved]!.vesselId} on the skin of ${other.node} (ring ${otherPlan.cuts[moved]!.ring} to ${cuts[moved]!.ring})`)); out.push(otherPlan); break; }
              out.push({ ...otherPlan, junction: mj, cuts, merged: [other.node, w.node] }); break;
            } catch (e) { if (!(e instanceof SkinBuildError)) throw e; failures.push(new SkinBuildError(w.node, e.message)); out.push(otherPlan); break; }
          }
          failures.push(new SkinBuildError(w.node, `${w.node} crowds the skin of ${other.node} on ${ca.vesselId}`));
          out.push(otherPlan);
          break;
        }
        // the growing arms of both nodes ride along, but a skin morphs at most SKIN_GROWERS of them: the widest stay, the rest keep today's fork method (spec 10.2)
        const rest = [...A.arms, ...B.arms].filter((m) => m.vesselId !== ca.vesselId);
        const arms = [...rest.filter((m) => !m.grow).sort((x, y) => y.restR - x.restR), ...rest.filter((m) => m.grow).sort((x, y) => y.restR - x.restR).slice(0, SKIN_GROWERS)];
        const node = mergedNode(A.node, B.node);
        const permanent = arms.filter((m) => !m.grow).length;
        if (permanent > MERGED_MAX_PERMANENT || permanent < 3 || arms.length > MERGED_MAX_ARMS) { failures.push(new SkinBuildError(node, `${permanent} permanent arms and ${arms.length - permanent} growing ones after the merge (3 to ${MERGED_MAX_PERMANENT} permanent, at most ${MERGED_MAX_ARMS} in all)`)); break; }
        const J: Vec3 = [(A.J[0] + B.J[0]) / 2, (A.J[1] + B.J[1]) / 2, (A.J[2] + B.J[2]) / 2];
        const mj: SkinJunction = { node, J, arms };
        try { out.push({ junction: mj, cuts: chooseCuts(mj, tubes, hullFor(mj)), hidden: [ca.vesselId], merged: [A.node, B.node] }); }
        catch (e) { if (e instanceof SkinBuildError) failures.push(e); else throw e; }
        break;
      }
    }
    if (!merged) { out.push(pa); done.add(a); }
  }
  return { plans: out, failures };
}

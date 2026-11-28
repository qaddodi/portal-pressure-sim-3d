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
/**
 * The shares of rule 1's clearance a seam may be held to when no ring clears the whole of it, tried in this order after the full
 * clearance has failed within both shares of the arm (a retry only: a skin that has a clearing ring never moves). A seam on a ring that
 * clears the blend by less than the full margin leaves a trace of the blend's tail at the seam, a step well under a pixel at 0.8 and
 * thin at 0.6; a skin lost to the old join is a bulb or a gap. It keeps a course that moves by a third of a radius from costing a
 * junction its skin (PVH's DIPS moved that far left PVH_R with no ring clear of the trunk, the left branch, the shunt and its own
 * start in 17 rings: tests/skin-course-shift.test.ts).
 */
export const CLEAR_SLACK = [0.8, 0.6] as const;
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
  const why = (i: number, s: number, share: number = SEAM_MAX_SHARE, slack = 1): string | null => {
    const a = j.arms[i]!, g = rings[i]![s]!;
    if (arc[i]![s]! > share * arc[i]![arc[i]!.length - 1]!) return 'too far (1b)';
    if (dist3(g.centre, a.at ?? j.J) < SEAM_MIN_R * a.restR) return 'too near J (2)';
    const need = (clear.k * k + clear.r * a.restR) * slack;
    for (let o = 0; o < n; o++) {
      if (o === i || isThroughPair(a, j.arms[o]!)) continue;
      for (let v = 0; v < RADIAL; v++) if (sdCapsule(g.verts, v * 3, caps[o]!) < need) return `${j.arms[o]!.vesselId}${j.arms[o]!.side ? ' (side)' : ''}`;
    }
    return null;
  };
  const next = (i: number, from: number): number => {
    for (const slack of [1, ...CLEAR_SLACK]) for (const share of [SEAM_MAX_SHARE, SEAM_FALLBACK_SHARE]) for (let s = from; s < rings[i]!.length; s++) if (why(i, s, share, slack) === null) return s;
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
/** The fewest permanent arms a skin has when growing arms land on it (a run-on pair and its collateral or shunt: inventory.ts findSkinJunctions): with them closed the skin is the run-on. */
export const MIN_RUN_ON_ARMS = 2;
/** The ids of a merged skin's two nodes joined, e.g. `CONF+PVT_L`. */
export const mergedNode = (a: string, b: string): string => `${a}+${b}`;

/** One junction ready to build: its (possibly merged) junction, one cut per arm, and the vessels its skin replaces whole (their tube is not drawn at all: `skinCut` (2, -1)). */
export interface SkinPlan { junction: SkinJunction; cuts: SkinCut[]; hidden: string[]; /** the nodes this skin is made of, when merged */ merged?: readonly string[] }
export interface SkinPlans {
  plans: SkinPlan[]; failures: SkinBuildError[];
  /** the growing arms a merged skin could not carry (more than SKIN_GROWERS of its two nodes' together: the widest stay), by the node each was an arm of: they keep the tube's own flared end, named (never silently left out) */
  dropped: { node: string; id: string; why: string }[];
}

/**
 * The cuts of every junction given, with rule 1c applied: a vessel that is an arm at two of the junctions (it starts at one node and ends at the other) must keep at least `MIN_RINGS_BETWEEN` rings between its two cuts.
 * If the cuts cross or crowd, the two junctions merge into one skin (node `A+B`): the union of their arms less the shared vessel (at most 4 arms, else both fall back), J the midpoint of the two Js, and the shared vessel
 * hidden whole. A junction that cannot be cut, or whose merge fails, is a failure (a named SkinBuildError) and is left out of the plans; the scene keeps today's method there. Never throws.
 * `hullFor(junction)` gives WP2's hull check for that junction's rings.
 */
const isWall = (j: SkinJunction): boolean => j.node.startsWith('wall:');
/** The first vessel two plans' cuts would crowd or cross on (rule 1c: one cut at the vessel's start, the other at its end, fewer than `minBetween` rings or `MIN_STUB_R` radii of tube between them), or null. */
function crowdOn(pa: SkinPlan, pb: SkinPlan, tubes: ReadonlyMap<string, ArmTube>, minBetween: number): { ca: SkinCut; cb: SkinCut } | null {
  for (const ca of pa.cuts) {
    const cb = pb.cuts.find((c) => c.vesselId === ca.vesselId && c.end !== ca.end);
    if (!cb) continue;
    const lo = ca.end === 0 ? ca : cb, hi = ca.end === 0 ? cb : ca;   // (the cut at the vessel's start, the cut at its end)
    const tb = tubes.get(ca.vesselId), rr = pa.junction.arms.find((m) => m.vesselId === ca.vesselId)?.restR ?? 1;
    if (hi.ring - lo.ring - 1 >= minBetween && !(tb && stubLengthR(tb, lo.ring, hi.ring, rr) < MIN_STUB_R)) continue;
    return { ca, cb };
  }
  return null;
}
/** A wall's side cut `wc` may stand on the other skin's cut `oc` (the wall's seam only moves AWAY from its centre, never nearer): the two skins then abut on that ring. */
const canAbut = (wc: SkinCut, oc: SkinCut): boolean => wc.side !== undefined && (wc.end === 1 ? oc.ring <= wc.ring : oc.ring >= wc.ring);

/** The plans of `js` and, while a merged skin and another still crowd on a vessel (a third node on the same stretch: the cava's IVCI between IVC_M and IVC_P,
 *  6.5 radii either side), the plans again with the merged skins as the junctions: one skin for the whole stretch.
 *  A second pass that fails anywhere is dropped, the first stands. */
export function planSkins(js: readonly SkinJunction[], tubes: ReadonlyMap<string, ArmTube>, hullFor: (j: SkinJunction) => HullOk, minBetween: number = MIN_RINGS_BETWEEN): SkinPlans {
  const joined = joinUncuttable(js, tubes, hullFor);
  let res = planPass(joined.js, tubes, hullFor, minBetween, joined.carry);
  for (let pass = 0; pass < 3; pass++) {
    const ps = res.plans;
    if (!ps.some((p, i) => ps.some((q, k) => k > i && crowdOn(p, q, tubes, minBetween)))) break;
    const again = planPass(ps.map((p) => p.junction), tubes, hullFor, minBetween, new Map(ps.map((p) => [p.junction.node, p.hidden])));
    if (again.failures.length || again.plans.length >= ps.length) break;
    res = { plans: again.plans, failures: res.failures, dropped: [...res.dropped, ...again.dropped] };
  }
  return res;
}
/**
 * A junction no seam can be found for ON ITS OWN, because a vessel it shares with a neighbour is too short to hold its ring (IVC_C and IVC_P on the cava,
 * 0.056 apart: 2 radii of tube between them), is one skin with that neighbour from the start: the two are joined
 * on the shared vessel (hidden whole), and the joined junction is judged the same way, until every junction can be cut or has no neighbour to join. `carry` is the vessels each joined junction hides.
 */
function joinUncuttable(
  js: readonly SkinJunction[], tubes: ReadonlyMap<string, ArmTube>, hullFor: (j: SkinJunction) => HullOk,
): { js: SkinJunction[]; carry: Map<string, string[]> } {
  let cur = [...js];
  const carry = new Map<string, string[]>();
  for (let guard = 0; guard < 8; guard++) {
    let joined = false;
    for (const j of cur) {
      let blamed: string | null = null;
      try { chooseCuts(j, tubes, hullFor(j)); } catch (e) {
        if (!(e instanceof SkinBuildError)) throw e;
        const m = /^(\S+) has no ring/.exec(e.message.replace(/^.*?: junction \S+: /, ''));
        blamed = m ? m[1]! : null;
      }
      if (!blamed) continue;
      const mine = j.arms.find((a) => a.vesselId === blamed && !a.grow);
      const other = cur.find((q) => q !== j && q.arms.some((b) => b.vesselId === blamed && !b.grow && mine && b.end !== mine.end));
      if (!other) continue;
      const rest = [...j.arms, ...other.arms].filter((m) => m.vesselId !== blamed), growing = rest.filter((m) => m.grow).sort((x, y) => y.restR - x.restR);
      const na = j.node.split('+').length, nb = other.node.split('+').length, mix = (i: 0 | 1 | 2): number => (j.J[i] * na + other.J[i] * nb) / (na + nb);
      const fromOwn = (m: SkinArm): SkinArm => ({ ...m, at: m.at ?? (j.arms.includes(m) ? j : other).J });
      const arms = [...rest.filter((m) => !m.grow).sort((x, y) => y.restR - x.restR), ...growing.slice(0, SKIN_GROWERS).map(fromOwn)];
      const node = mergedNode(j.node, other.node);
      if (arms.length > MERGED_MAX_ARMS) continue;
      carry.set(node, [blamed, ...(carry.get(j.node) ?? []), ...(carry.get(other.node) ?? [])]);
      cur = cur.filter((q) => q !== j && q !== other);
      cur.push({ node, J: [mix(0), mix(1), mix(2)], arms, ...(j.surface || other.surface ? { surface: true } : {}) });
      joined = true;
      break;
    }
    if (!joined) break;
  }
  return { js: cur, carry };
}
/** One pass of planSkins; `carry` holds the vessels each junction (a merged skin from an earlier pass) already hides whole. */
function planPass(
  js: readonly SkinJunction[], tubes: ReadonlyMap<string, ArmTube>, hullFor: (j: SkinJunction) => HullOk, minBetween: number, carry: ReadonlyMap<string, readonly string[]>,
): SkinPlans {
  const failures: SkinBuildError[] = [], dropped: SkinPlans['dropped'] = [];
  const attempt = (j: SkinJunction): SkinPlan | null => {
    try { return { junction: j, cuts: chooseCuts(j, tubes, hullFor(j)), hidden: [...(carry.get(j.node) ?? [])] }; }
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
      const crowd = crowdOn(pa, pb, tubes, minBetween);
      if (crowd) {
        const { ca, cb } = crowd;
        // two skins would crowd or cross on this vessel: one skin for both nodes
        merged = true; done.add(a); done.add(b);
        const A = js[a]!, B = js[b]!;
        // a landing on a host's wall (a virtual `wall:` node, wall.ts) that crowds another skin is not merged into it (its side arm is no run-on between two nodes): the other skin stays as it was, the landing keeps the tube's own flared end (named)
        if (isWall(A) || isWall(B)) {
          const [w, other, otherPlan, wallPlan] = isWall(A) ? [A, B, pb, pa] : [B, A, pa, pb];
          // ...unless the two seams can be ONE ring: the other skin's cut is a ring the wall's own seam may stand on (the wall's seam only moves AWAY from its centre, never nearer), so the skins abut on that ring (identical seam, no tube between them) and the host is
          // skin all the way along (S_PC and C9 on the cava's first stretch, IVCI's seam and the wall node's own both at ring 3)
          const [wc, oc] = wallPlan === pa ? [ca, cb] : [cb, ca];
          if (canAbut(wc, oc)) {
            // ...and so for every OTHER skin the wall's cuts crowd: it is marked done with this one and never compared again, so a second skin it crowds (its host's other node, the other side of the landing) is checked here.
            // Each one it can abut too it abuts (skin all the way along); one it cannot keeps its skin, and the landing keeps the tube's own flared end, named
            const first: SkinCut = { ...wc, ring: oc.ring, u: oc.u };
            let cuts = wallPlan.cuts.map((c) => (c === wc ? first : c)), bad: string | null = null;
            for (let c = 0; c < js.length && !bad; c++) {
              const pc = plans[c];
              if (c === a || c === b || !pc) continue;
              const hit = crowdOn({ ...wallPlan, cuts }, pc, tubes, minBetween);   // (a wall has two side cuts: one abuts `other`, so at most the other one is left to crowd)
              if (!hit) continue;
              if (hit.ca !== first && canAbut(hit.ca, hit.cb)) cuts = cuts.map((x) => (x === hit.ca ? { ...x, ring: hit.cb.ring, u: hit.cb.u } : x));
              else bad = `${w.node} abuts the skin of ${other.node} but crowds the skin of ${js[c]!.node} on ${hit.ca.vesselId}`;
            }
            if (bad) { failures.push(new SkinBuildError(w.node, bad)); out.push(otherPlan); break; }
            out.push(otherPlan, { ...wallPlan, cuts });
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
              out.push({ ...otherPlan, junction: mj, cuts, merged: [...other.node.split('+'), w.node] }); break;
            } catch (e) { if (!(e instanceof SkinBuildError)) throw e; failures.push(new SkinBuildError(w.node, e.message)); out.push(otherPlan); break; }
          }
          failures.push(new SkinBuildError(w.node, `${w.node} crowds the skin of ${other.node} on ${ca.vesselId}`));
          out.push(otherPlan);
          break;
        }
        // the growing arms of both nodes ride along, but a skin takes at most SKIN_GROWERS of them: the widest stay, the rest keep the tube's own flared end (spec 10.2), each named in `dropped`
        const rest = [...A.arms, ...B.arms].filter((m) => m.vesselId !== ca.vesselId), growing = rest.filter((m) => m.grow).sort((x, y) => y.restR - x.restR);
        // (a growing arm starts at the node it landed on, not at the merged centre between the nodes: its capsule begins there, as a wall landing's does)
        const fromOwn = (m: SkinArm): SkinArm => ({ ...m, at: m.at ?? (A.arms.includes(m) ? A : B).J });
        const arms = [...rest.filter((m) => !m.grow).sort((x, y) => y.restR - x.restR), ...growing.slice(0, SKIN_GROWERS).map(fromOwn)];
        const node = mergedNode(A.node, B.node);
        for (const g of growing.slice(SKIN_GROWERS)) dropped.push({ node: (A.arms.includes(g) ? A : B).node, id: g.vesselId, why: `${node}: more than ${SKIN_GROWERS} growing arms after the merge (the widest stay)` });
        const permanent = arms.filter((m) => !m.grow).length;
        // (a cluster of junctions down ONE vein (the left portal vein's umbilical and Meso-Rex landings, a piece apart) merges to the vein's two outer pieces,
        //  a run-on pair, with the growers that land on it: as findSkinJunctions says of a single node, two permanent arms are a skin when a growing arm lands on them,
        //  and with the growers closed it is the run-on, the vein's trunk)
        if (permanent > MERGED_MAX_PERMANENT || permanent < (arms.length > permanent ? MIN_RUN_ON_ARMS : 3) || arms.length > MERGED_MAX_ARMS) {
          failures.push(new SkinBuildError(node, `${permanent} permanent arms and ${arms.length - permanent} growing ones after the merge (3 to ${MERGED_MAX_PERMANENT} permanent, or 2 with a growing arm on them; at most ${MERGED_MAX_ARMS} in all)`));
          break;
        }
        // (J is the mean of the nodes' centres, a skin already merged counting once for each node it is made of)
        const na = A.node.split('+').length, nb = B.node.split('+').length;
        const J: Vec3 = [(A.J[0] * na + B.J[0] * nb) / (na + nb), (A.J[1] * na + B.J[1] * nb) / (na + nb), (A.J[2] * na + B.J[2] * nb) / (na + nb)];
        // (a node retried meshed from the surface (skin-set.ts produce) keeps that in the merge: the hull of the rings is what failed for it)
        const mj: SkinJunction = { node, J, arms, ...(A.surface || B.surface ? { surface: true } : {}) };
        const hid = [ca.vesselId, ...(carry.get(A.node) ?? []), ...(carry.get(B.node) ?? [])];
        try { out.push({ junction: mj, cuts: chooseCuts(mj, tubes, hullFor(mj)), hidden: hid, merged: [...A.node.split('+'), ...B.node.split('+')] }); }
        catch (e) { if (e instanceof SkinBuildError) failures.push(e); else throw e; }
      }
    }
    if (!merged) { out.push(pa); done.add(a); }
  }
  return { plans: out, failures, dropped };
}

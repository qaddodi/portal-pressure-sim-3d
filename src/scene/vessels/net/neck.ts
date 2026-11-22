// The no-neck rule for a THROUGH PAIR (two arms that run on through a junction: the trunk above and below a side vein, or across a short edge that merged two junctions): along the pair's axis the union's surface must keep its radius at least
// `NECK_FLOOR` of the narrower arm's (plan owner's ruling 4, 22 Nov; the step in the slope is no longer judged here: the fidelity of the projected mesh to the live union is, net/refine.ts). It reads the SAME shape the mesh is made on (the smooth union of the capsules, skin/sdf.ts), so it judges the junction before
// it is meshed: the radius at a station is where the union's field changes sign along the ray out of the axis, over 28 azimuths; the profile is the NARROWEST of them (the branches' fillets only add material, so the narrowest side is the trunk's own; the field has no facets, so nothing needs averaging out).
import { sdUnion, type Capsule } from '../skin/sdf.ts';
import type { Vec3 } from '../../anatomy/vessels.ts';

/** The least the profile may reach, as a share of the narrower arm's radius (2 % under it). */
export const NECK_FLOOR = 0.98;
/** A through pair may bulge at most this over its wider end (plan owner, 22 Nov: the plain union's hump of 17 % on the portal vein is not accepted; the pair takes the mate minimum): past it a union is not accepted, and a pair with no union inside it fails the bake (a union whose slope jumps is not preferred: the other is tried, and the pair is accepted on the better of the two when its waist holds). */
export const BULGE_MAX = 1.15;
export const NECK_STATIONS = 32;
/** The largest change of the profile's slope between neighbouring stations (a taper's ease is far below it; a 5 % step is 0.16). Judged with the hump, on the baked union, as a preference between the unions: it adds to the hump (1 + the change). */
export const NECK_SLOPE_STEP = 0.08;
const AZIMUTHS = 28, WINDOW = 3;

export interface NeckResult { ok: boolean; why: string; /** the lowest profile value over the floor's value (1 at the floor, under 1 fails) */ margin: number; /** the tallest the profile stands over its ceiling's radius (1 = at it) */ hump: number; profile: number[] }

/** The profile along `axis` (a polyline from one arm's far point to the other's, `rad` the arms' radii at its points). */
/** `judge`: 'floor' (the waist, at the live states: a bulge or a step there is the vessel's own) or 'ceil' (the hump where the two capsules meet, on the baked union the mesh is made on), both by default. */
export function throughNeck(axis: readonly Vec3[], rad: readonly number[], caps: readonly Capsule[], k: number, judge: 'floor' | 'ceil' | 'both' = 'both'): NeckResult {
  const cum = [0];
  for (let i = 1; i < axis.length; i++) cum.push(cum[i - 1]! + Math.hypot(axis[i]![0] - axis[i - 1]![0], axis[i]![1] - axis[i - 1]![1], axis[i]![2] - axis[i - 1]![2]));
  const total = cum[cum.length - 1]!, ends = Math.min(rad[0]!, rad[rad.length - 1]!), maxR = Math.max(...rad) * 3, profile: number[] = [], floors: number[] = [], ceils: number[] = [];
  let seg = 0;
  for (let s = 0; s < NECK_STATIONS; s++) {
    const d = (total * s) / (NECK_STATIONS - 1);
    while (seg < axis.length - 2 && cum[seg + 1]! < d) seg++;
    const a = axis[seg]!, b = axis[seg + 1]!, sl = cum[seg + 1]! - cum[seg]!, u = sl > 0 ? Math.min(1, Math.max(0, (d - cum[seg]!) / sl)) : 0;
    const P: Vec3 = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1, t: Vec3 = [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl, (b[2] - a[2]) / tl];
    const ref: Vec3 = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let n: Vec3 = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]];
    const nl = Math.hypot(...n); n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const bb: Vec3 = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]], rs: number[] = [];
    for (let q = 0; q < AZIMUTHS; q++) {
      const th = (2 * Math.PI * (q + 0.5)) / AZIMUTHS, dir: Vec3 = [Math.cos(th) * n[0] + Math.sin(th) * bb[0], Math.cos(th) * n[1] + Math.sin(th) * bb[1], Math.cos(th) * n[2] + Math.sin(th) * bb[2]];
      const f = (r: number): number => sdUnion(caps, k, P[0] + dir[0] * r, P[1] + dir[1] * r, P[2] + dir[2] * r);
      if (f(0) >= 0) { rs.push(0); continue; }   // (the axis itself is outside the union: a gap)
      let lo = 0, hi = maxR;
      while (f(hi) < 0 && hi < 100 * maxR) hi *= 2;
      for (let it = 0; it < 24; it++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
      rs.push((lo + hi) / 2);
    }
    rs.sort((x, y) => x - y);
    profile.push(rs[0]!);
    // the floor at this station: the narrower arm's end radius, or the pair's own radius here when that is less (an arm that tapers narrower toward the node is a taper of the vessel, not a neck of the fillet)
    ceils.push(Math.max(rad[0]!, rad[rad.length - 1]!, rad[seg]!, rad[seg + 1]!));
    floors.push(NECK_FLOOR * Math.min(ends, rad[seg]! + (rad[seg + 1]! - rad[seg]!) * u));
  }
  let margin = Infinity, at = 0;
  profile.forEach((v, i) => { const m = v / floors[i]!; if (m < margin) { margin = m; at = i; } });
  if (judge !== 'ceil' && margin < 1) return { ok: false, why: `the radius falls to ${profile[at]!.toFixed(4)}, under ${NECK_FLOOR} of the narrower arm's ${(floors[at]! / NECK_FLOOR).toFixed(4)} (a neck)`, margin, hump: 1, profile };
  const dx = total / (NECK_STATIONS - 1), slope = profile.slice(WINDOW).map((v, i) => (v - profile[i]!) / (WINDOW * dx));
  let jump = 0, jumpAt = 0;
  for (let i = 1; i < slope.length; i++) { const j = Math.abs(slope[i]! - slope[i - 1]!); if (j > jump) { jump = j; jumpAt = i; } }
  const hump = Math.max(...profile.map((v, i) => v / ceils[i]!), 0), up = judge === 'floor' ? -1 : (hump > BULGE_MAX ? profile.findIndex((v, i) => v / ceils[i]! > BULGE_MAX) : -1);
  if (up >= 0) return { ok: false, why: `the radius rises to ${profile[up]!.toFixed(4)}, over ${BULGE_MAX} of the pair's ${ceils[up]!.toFixed(4)} (a bulge)`, margin, hump, profile };
  if (judge !== 'floor' && jump >= NECK_SLOPE_STEP) return { ok: false, why: `the slope of the radius jumps by ${jump.toFixed(3)} at station ${jumpAt + 1} (a bulge or a step)`, margin, hump, profile };
  return { ok: true, why: '', margin, hump, profile };
}

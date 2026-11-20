// Where a side branch leaves its vein, seen from the vein (20 Nov: eyes crops of 4089d1a, "one outline rule at every junction"). The branch lies BEHIND the vein while the two overlap (liver-branches.ts tuckedDepth), so
// the vein's wall covers the branch's start; but the vein's own outline then runs on across the branch's mouth, a line closing the opening. The vein therefore holds its outline back on the side the branch leaves,
// from where the branch's lumen first reaches that wall to where it has cleared it (the crotch, where the two outlines meet). The outline of the whole is the outline of the union of the two tubes.
import { NETWORK, NETWORK_BY_ID } from './network.ts';
import { REST, coursesOf, type ShapeState } from './shape.ts';
import { radiusAtU } from './tubes.ts';
import { BURY } from './smooth-joins.ts';

export interface Mouth {
  /** the vein's side branch */
  readonly child: string;
  /** the stretch of the vein (0 to 1 along it, by length) the branch's lumen covers its wall over */
  readonly u0: number;
  readonly u1: number;
  /** which side of the vein the branch leaves: +1 left of the vein's heading (in the scene's x right, y up), -1 right */
  readonly side: 1 | -1;
  /** the stretch of the vein over which the outline eases back in at each end, as a share of its length */
  readonly margin: number;
}

/** The side branches (feeders that join into a vein and leave it as one more tube) of each vein: host id to its branch ids. */
export const SIDE_BRANCHES: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const v of NETWORK) {
    const p = v.plan;
    if (p?.kind !== 'feeder' || !v.feeder || p.list.length !== 1 || p.list[0]!.join == null) continue;
    const l = m.get(v.feeder.host) ?? []; l.push(v.id); m.set(v.feeder.host, l);
  }
  return m;
})();

const cum = (pts: readonly (readonly number[])[]): number[] => { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!, pts[i]![2]! - pts[i - 1]![2]!)); return s; };

/** The mouth of side branch `childId` on its vein, from the two tubes as they are drawn at `state`; null for an id that is not a side branch. */
export function mouthOf(childId: string, state: ShapeState = REST): Mouth | null {
  const cd = NETWORK_BY_ID.get(childId), host = cd?.feeder?.host ? NETWORK_BY_ID.get(cd.feeder.host) : undefined;
  if (!cd || !host || !SIDE_BRANCHES.get(host.id)?.includes(childId)) return null;
  const hc = coursesOf(host, state).reduce((a, b) => (b.radius > a.radius ? b : a)), cc = coursesOf(cd, state)[0]!;
  const hs = cum(hc.pts), cs = cum(cc.pts), hL = hs[hs.length - 1]!, cL = cs[cs.length - 1]!;
  if (hL <= 0 || cL <= 0) return null;
  let u0 = Infinity, u1 = -Infinity, side = 0, far = 0;
  for (let i = 0; i < cc.pts.length; i++) {
    const p = cc.pts[i]!;
    let bj = 0, bd = Infinity;
    for (let j = 0; j < hc.pts.length; j++) { const d = (hc.pts[j]![0] - p[0]) ** 2 + (hc.pts[j]![1] - p[1]) ** 2; if (d < bd) { bd = d; bj = j; } }
    const a = hc.pts[Math.max(0, bj - 1)]!, b = hc.pts[Math.min(hc.pts.length - 1, bj + 1)]!, tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    const lat = (tx * (p[1] - hc.pts[bj]![1]) - ty * (p[0] - hc.pts[bj]![0])) / tl;   // (signed: positive left of the vein's heading)
    const rh = radiusAtU(hc, hs[bj]! / hL, hL), rc = radiusAtU(cc, cs[i]! / cL, cL), al = Math.abs(lat);
    if (al > Math.abs(far)) { far = lat; }
    if (al + rc > rh && al - rc < rh) { const u = hs[bj]! / hL; if (u < u0) u0 = u; if (u > u1) u1 = u; }
  }
  side = far >= 0 ? 1 : -1;
  if (!(u1 > u0)) return null;
  // (the ease at each end is short, a quarter of a radius each side, so the two outlines trade places over a few units, not a stretch where both lines show)
  const margin = Math.min(0.5 * (u1 - u0), (0.25 * radiusAtU(hc, 0.5 * (u0 + u1), hL)) / hL);
  // the branch's own outline is held back inside the vein it leaves for the first stretch of it (scene.ts BURY, fading in from half that), so the vein keeps its outline over that stretch at the end where the branch joins:
  // the union's outline is then never missing, and there is no notch where the vein's line stops and the branch's has not begun
  const joinEnd = cd.plan?.kind === 'feeder' ? cd.plan.list[0]!.join : undefined;
  if (joinEnd != null) {
    const pj = cc.pts[joinEnd === 0 ? 0 : cc.pts.length - 1]!;
    let bj = 0, bd = Infinity;
    for (let j = 0; j < hc.pts.length; j++) { const d = (hc.pts[j]![0] - pj[0]) ** 2 + (hc.pts[j]![1] - pj[1]) ** 2; if (d < bd) { bd = d; bj = j; } }
    const uj = hs[bj]! / hL, shift = (0.95 * BURY * cc.radius) / hL + margin;
    if (Math.abs(uj - u0) <= Math.abs(uj - u1)) u0 += Math.min(shift, 0.4 * (u1 - u0)); else u1 -= Math.min(shift, 0.4 * (u1 - u0));
  }
  return { child: childId, u0, u1, side: side as 1 | -1, margin };
}

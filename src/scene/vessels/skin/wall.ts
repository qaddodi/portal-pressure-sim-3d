// Junction skins, growing arms that LAND ON A WALL (Mohammad, 20 Nov: "everything"; spec 10.1 and 10.2). A collateral or shunt whose end is not at a node but inside another vessel's wall (S_PC and C9 on the cava, DIPS on the cava, the gastro-
// epiploic C3, S_MC where it meets the iliac, REX on the left portal vein...) is welded the way the side-wall rule of spec 10.1 says: a VIRTUAL NODE at the point of the host's axis nearest the end. Its arms are the host twice (as side-wall
// arms, the part below that point and the part above it: the tube gets a HOLE the skin draws instead) and the growing vessel(s); the skin's second shape (mesh.ts) is the host running straight through, so with the vessel closed the host is a
// plain host. Pure: the network's own courses, never a list of ids.
import { NETWORK, type NetVessel } from '../network.ts';
import { REST, coursesOf, type ShapeState } from '../shape.ts';
import { indexOf } from '../../../engine/vessel-data.ts';
import { MAX_ARMS, SIDE_EDGE, SIDE_TOL_R, isGrower, isPermanent, nearestOnPolyline, pointAtShare } from './inventory.ts';
import { SKIN_GROWERS, type SkinArm, type SkinJunction, type Vec3 } from './types.ts';

/** Two growing vessels that land on one host within this many of the host's radii of each other (along its axis) share one virtual node and one skin; farther apart, each has its own. */
export const WALL_GROUP_R = 8;
/** How many growing vessels one virtual node takes. */
export const WALL_GROWERS = 1;

const armOf = (v: NetVessel, end: 0 | 1, extra: Partial<SkinArm>): SkinArm => ({
  vesselId: v.id, end, courseIndex: 0, dataIndex: indexOf(v.lensId), lensIndex: indexOf(v.lensId), baseD: v.baseD, widthKind: v.widthKind, restR: v.radius, ...extra,
});

/** A growing vessel's end that lands on a host's wall: which end, the host, where on it (share of its length) and how far inside (in the host's radii). */
export interface WallLanding { v: NetVessel; end: 0 | 1; host: NetVessel; u: number; d: number }

/** The landings of the growing vessels' ends not in `welded` (`vessel:end` keys of the ends that are already arms of a node's skin): each on the permanent vessel whose axis it is nearest, if inside that vessel's wall and not at its end. */
export function wallLandings(welded: ReadonlySet<string>, network: readonly NetVessel[] = NETWORK, state: ShapeState = REST): WallLanding[] {
  const out: WallLanding[] = [];
  const hosts = network.filter(isPermanent).map((h) => ({ h, pts: coursesOf(h, state)[0]!.pts as readonly Vec3[] }));
  for (const v of network) {
    if (!isGrower(v)) continue;
    const pts = coursesOf(v, state)[0]!.pts;
    for (const end of [0, 1] as const) {
      if (welded.has(`${v.id}:${end}`)) continue;
      const p = pts[end ? pts.length - 1 : 0]!;
      let best: WallLanding | null = null;
      for (const { h, pts: hp } of hosts) {
        const r = nearestOnPolyline(hp, p);
        if (r.d > SIDE_TOL_R * h.radius || r.u <= SIDE_EDGE || r.u >= 1 - SIDE_EDGE) continue;
        if (!best || r.d / h.radius < best.d) best = { v, end, host: h, u: r.u, d: r.d / h.radius };
      }
      if (best) out.push(best);
    }
  }
  return out;
}

/** The virtual nodes of those landings: the landings on one host that lie within `WALL_GROUP_R` radii of each other (and, at most `WALL_GROWERS` of them) share one. Its arms: the host's two sides first (J on its axis), then the growing vessels. */
export function wallJunctions(landings: readonly WallLanding[], state: ShapeState = REST): { junctions: SkinJunction[]; skipped: WallLanding[] } {
  const byHost = new Map<string, WallLanding[]>();
  for (const l of landings) byHost.set(l.host.id, [...(byHost.get(l.host.id) ?? []), l]);
  const out: SkinJunction[] = [], skipped: WallLanding[] = [];
  for (const [id, ls] of byHost) {
    const host = ls[0]!.host, pts = coursesOf(host, state)[0]!.pts as readonly Vec3[];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]);
    const reach = (WALL_GROUP_R * host.radius) / (len || 1);   // (as a share of the host's length)
    const sorted = [...ls].sort((a, b) => a.u - b.u);
    const groups: WallLanding[][] = [];
    for (const l of sorted) {
      const g = groups[groups.length - 1];
      // (a landing within reach of a full group is skipped, it keeps the fork method: two growers on one spot cannot each be closed on a trunk that holds the other open, tests/skin-closed-footprint.test.ts)
      if (g && l.u - g[0]!.u <= reach) { if (g.length < WALL_GROWERS && !g.some((x) => x.v.id === l.v.id)) g.push(l); else skipped.push(l); } else groups.push([l]);
    }
    for (const g of groups) {
      const u = g.reduce((s, l) => s + l.u, 0) / g.length;
      const grow = [...g].sort((a, b) => b.v.radius - a.v.radius);
      const arms: SkinArm[] = [armOf(host, 1, { side: { u, dir: -1 } }), armOf(host, 0, { side: { u, dir: 1 } }), ...grow.map((l) => armOf(l.v, l.end, { grow: true }))];
      out.push({ node: `wall:${id}:${grow.map((l) => `${l.v.id}${l.end}`).join(',')}`, J: pointAtShare(pts, u), arms });
    }
  }
  return { junctions: out, skipped };
}

/** A growing end that lands within this many radii (of the junction's widest arm) of an existing junction's centre is an arm of THAT junction, whatever node the network names for it (S_MC lands 1.5 radii from IVCI's centre, on the iliac vein's end). */
export const ATTACH_NEAR_R = 2.6;

/** The landings that are near an existing junction's centre become arms of it (at most `SKIN_GROWERS` growing arms and `MAX_ARMS` in all per junction, the nearest first); the junctions come back with them, and the landings left over are the walls. */
export function attachNear(js: readonly SkinJunction[], landings: readonly WallLanding[], state: ShapeState = REST): { junctions: SkinJunction[]; left: WallLanding[] } {
  const out = js.map((j) => ({ ...j, arms: [...j.arms] }));
  const left: WallLanding[] = [];
  const ranked = landings.map((l) => {
    const pts = coursesOf(l.v, state)[0]!.pts, p = pts[l.end ? pts.length - 1 : 0]!;
    let best = -1, bd = Infinity;
    out.forEach((j, i) => { const d = Math.hypot(p[0] - j.J[0], p[1] - j.J[1], p[2] - j.J[2]) / j.arms[0]!.restR; if (d < bd) { bd = d; best = i; } });
    return { l, best, bd };
  }).sort((a, b) => a.bd - b.bd);
  for (const { l, best, bd } of ranked) {
    const j = out[best];
    if (!j || bd > ATTACH_NEAR_R || j.arms.length >= MAX_ARMS || j.arms.filter((a) => a.grow).length >= SKIN_GROWERS || j.arms.some((a) => a.vesselId === l.v.id)) { left.push(l); continue; }
    j.arms.push(armOf(l.v, l.end, { grow: true }));
  }
  return { junctions: out, left };
}

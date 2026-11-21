// Where a growing end LANDS ON A WALL (Mohammad, 20 Nov; FINAL-WELD-PLAN.md): a collateral or shunt whose end is not at a node but inside another vessel's wall (S_PC and C9 on the cava, DIPS on it, the azygos pair, the epiploic C3, REX on the left portal vein...).
// It is no arm of a skin: the end is the tube's own sunk and flared profile (shunt-ends.ts, 2D's SINK / FLARED). This is the FINDER of its host, pure, from the network's own courses, never a list of ids. (The virtual wall nodes that welded these, `wallJunctions` and
// `attachNear`, are gone: a skin morphed between a closed and an open shape folded at every crowded landing, and nothing is morphed now.)
import { NETWORK, type NetVessel } from '../network.ts';
import { REST, coursesOf, type ShapeState } from '../shape.ts';
import { SIDE_EDGE, SIDE_TOL_R, isGrower, isPermanent, nearestOnPolyline } from './inventory.ts';
import type { Vec3 } from './types.ts';

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

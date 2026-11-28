// Where a surgical shunt is sewn onto a vein (2D stage-geo.js SIDE_HOSTS / SIDE_INSIDE, stage-tubes.js SINK / FLARED, fork-joins.js sideEndScale / flareScale): the shunt narrows at that end to the
// host's own caliber, its round end sinks inside the host's wall (narrowing further, so it never shows past the far wall as a bump) and its heel flares toward the wall like a real
// end-to-side anastomosis, not a pipe pushed against the vein. Pure: the tables, and what they make of a course.
import { NETWORK, NETWORK_BY_ID } from './network.ts';
import { REST, coursesOf } from './shape.ts';
import { smoothJoinsOn } from './join-mode.ts';
import { isPermanent, nearestOnPolyline } from './skin/inventory.ts';
import type { Vec3 } from './skin/types.ts';
import { piecesOf } from '../anatomy/whole-pieces.ts';

/** One end of a shunt: the host's radius (scene units), whether the end lies inside the host's lumen (so it narrows there), whether it is a sink (2D SINK: narrowed but not further reduced) and flares. */
export interface ShuntEnd { hostR: number; inside: boolean; sink: boolean; flare: boolean; /** the host's axis direction where the end lands (a unit vector), for a generated end: the strands of a braid fan along it (strand-fan.ts) */ dir?: Vec3; /** a generated end (not the Warren's or the portocaval's own row): its flare may not take the tube wider than its host (tubes.ts) */ capped?: true }
interface Row { hosts: readonly [readonly string[], readonly string[]]; inside: readonly [boolean, boolean]; sink?: boolean; flare: boolean }
/** The Warren shunt leaves the splenic vein's side (its start runs on from the divided splenic vein, so it is not inside) and ends inside the left renal vein; the portocaval shunt sinks into the cava. */
const ROWS: Readonly<Record<string, Row>> = {
  S_DSR: { hosts: [[...piecesOf('V_SPL'), 'SV_MID'], piecesOf('V_KID_L')], inside: [false, true], flare: true },
  S_PC: { hosts: [[], [...piecesOf('IVC_IS'), ...piecesOf('ILI_IVC')]], inside: [false, true], sink: true, flare: true },
};
/** The veins a shunt's end is sewn into where the table names them (the Warren shunt's renal end: the left renal vein, not the collateral that shares its node), else none. */
export const sewnHostIds = (id: string, end: 0 | 1): readonly string[] => ROWS[id]?.hosts[end] ?? [];
/** The share of its own width a shunt narrows to at a host end (stage-tubes.js: the host's width, clamped to 0.4 of its own at the least; 1 at the most). */
export const SHUNT_END_MIN = 0.4;

/** An end lies on a host's wall, and so is sewn onto it, when it is within this many of the host's radii of the host's axis (the same finder as skin/wall.ts `wallLandings`: 1.5, any place along the host, its ends included). */
export const SEWN_TOL_R = 1.5;
/** A host as the Circuit (or any caller that has no network vessel) gives it: its axis and its radius, in the units of the path asked about. */
export interface HostAxis { pts: readonly Vec3[]; radius: number }

/** An end that continues a host from the host's own end is a RUN-ON, not an end-to-side join (Mohammad, 22 Nov: "coronary vein into varices still did not get fixed"): the varix strands leave the coronary vein's end, which runs no further, yet were sunk and narrowed to 0.43 of its width as if it carried on past them. A run-on needs both: (a) the end lies at the host's end, within `RUN_ON_AXIAL` host radii of it along the axis (absolute, not a share of the host's length), and (b) it leaves outward: the vessel's direction from its end inward, dotted with the host's outward tangent at that end, is `RUN_ON_DOT` or more. A collateral that lands across the axis, or at a joint between two trunk pieces (it runs on from one piece but meets the other's wall), is a side join and stays sewn: the end is a run-on only when it runs on from EVERY host within reach (`sewnEndAt`). */
export const RUN_ON_AXIAL = 1, RUN_ON_DOT = 0.7;
/** How the end `p` (leaving along the unit `away`, from the end inward along its own vessel) meets `host`: its axial distance to the host's nearest end in host radii, which end, and the dot of `away` with that end's outward tangent; null with no direction or no tangent. */
export function runOnOf(host: HostAxis, p: Vec3, away: Vec3 | undefined): { axial: number; end: 0 | 1; dot: number; runOn: boolean } | null {
  if (!away || host.pts.length < 2 || !(host.radius > 0)) return null;
  const n = nearestOnPolyline(host.pts, p);
  let total = 0;
  for (let i = 1; i < host.pts.length; i++) total += Math.hypot(host.pts[i]![0] - host.pts[i - 1]![0], host.pts[i]![1] - host.pts[i - 1]![1], host.pts[i]![2] - host.pts[i - 1]![2]);
  const end: 0 | 1 = n.u < 0.5 ? 0 : 1, axial = (end ? 1 - n.u : n.u) * total / host.radius;
  // (the host's outward tangent at that end: its first segment reversed at the start, its last segment at the end)
  const a = end ? host.pts[host.pts.length - 2]! : host.pts[1]!, b = end ? host.pts[host.pts.length - 1]! : host.pts[0]!, t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], tl = Math.hypot(t[0]!, t[1]!, t[2]!);
  if (!(tl > 0)) return null;
  const dot = (t[0]! * away[0] + t[1]! * away[1] + t[2]! * away[2]) / tl;
  return { axial, end, dot, runOn: axial <= RUN_ON_AXIAL && dot >= RUN_ON_DOT };
}
/** How an end that lands on a wall is drawn (the Warren shunt's way, 2D SIDE_INSIDE: narrowed to the host's width, closing to a point inside the wall so no round cap shows past it, flared at the heel but never wider than the host): the host is the widest one within reach. Null where the end is on no host, or runs on from the host's end (`runOnOf`, given `away`). */
export function sewnEndAt(p: Vec3, hosts: readonly HostAxis[], away?: Vec3): ShuntEnd | null {
  let r = 0, dir: Vec3 | undefined, reach = 0, runOns = 0;
  for (const h of hosts) {
    if (h.pts.length < 2) continue;
    const n = nearestOnPolyline(h.pts, p);
    if (n.d <= SEWN_TOL_R * h.radius) {
      reach++;
      if (runOnOf(h, p, away)?.runOn) runOns++;
      if (h.radius >= r) { r = h.radius; dir = tangentNear(h.pts, n.at); }
    }
  }
  // (a run-on from every host within reach: nothing the end lands across. At a joint between two pieces of a trunk, or beside another vessel, the end also meets a wall, so it stays sewn as before)
  if (reach > 0 && runOns === reach) return null;
  return r > 0 ? { hostR: r, inside: true, sink: false, flare: true, capped: true, ...(dir ? { dir } : {}) } : null;
}
/** The unit direction of a polyline at the point `at` on it (the segment it lies on). */
function tangentNear(pts: readonly Vec3[], at: Vec3): Vec3 | undefined {
  let best = Infinity, dir: Vec3 | undefined;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!, ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    if (!(l2 > 0)) continue;
    const t = Math.max(0, Math.min(1, ((at[0] - a[0]) * ab[0] + (at[1] - a[1]) * ab[1] + (at[2] - a[2]) * ab[2]) / l2));
    const d = Math.hypot(a[0] + ab[0] * t - at[0], a[1] + ab[1] * t - at[1], a[2] + ab[2] * t - at[2]);
    if (d < best) { best = d; const l = Math.sqrt(l2); dir = [ab[0] / l, ab[1] / l, ab[2] / l]; }
  }
  return dir;
}
/** The unit direction an end leaves along: from the path's end point inward along its first segment of any length (null for a path of no length). */
export function awayFrom(pts: readonly Vec3[], end: 0 | 1): Vec3 | undefined {
  const at = end ? pts.length - 1 : 0, step = end ? -1 : 1, p = pts[at]!;
  for (let i = at + step; i >= 0 && i < pts.length; i += step) {
    const q = pts[i]!, d: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], l = Math.hypot(d[0], d[1], d[2]);
    if (l > 1e-12) return [d[0] / l, d[1] / l, d[2] / l];
  }
  return undefined;
}
/** The two sewn ends of a path made at run time (a custom shunt of the Circuit, a strand): each end that lands on one of `hosts`, else null. Pure numbers, a few polyline distances. */
export function endProfileFor(pts: readonly Vec3[], hosts: readonly HostAxis[]): readonly [ShuntEnd | null, ShuntEnd | null] | null {
  if (pts.length < 2) return null;
  const a = sewnEndAt(pts[0]!, hosts, awayFrom(pts, 0)), b = sewnEndAt(pts[pts.length - 1]!, hosts, awayFrom(pts, 1));
  return a || b ? [a, b] : null;
}

/** The generated rows: every end of a vessel that is not a permanent tube (a collateral, a shunt, TIPS, DIPS) that lands on a permanent vessel's wall (the network's own courses at rest, the host found by `sewnEndAt`). Built once per join mode, from the courses (which do
 *  not depend on this table: it only adds taper and flare), so asking for a course while it is built gets the table as it stands. */
const generated = new Map<boolean, Map<string, readonly [ShuntEnd | null, ShuntEnd | null]>>();
let building = false;
function generatedRows(): Map<string, readonly [ShuntEnd | null, ShuntEnd | null]> {
  const mode = smoothJoinsOn(), hit = generated.get(mode);
  if (hit) return hit;
  const out = new Map<string, readonly [ShuntEnd | null, ShuntEnd | null]>();
  if (building) return out;
  building = true;
  try {
    const hosts = NETWORK.filter(isPermanent).map((h): HostAxis => ({ pts: coursesOf(h, REST)[0]!.pts as readonly Vec3[], radius: h.radius }));
    for (const v of NETWORK) {
      if (isPermanent(v) || v.feeder || v.id.includes('~F') || ROWS[v.id]) continue;
      const pts = coursesOf(v, REST)[0]?.pts as readonly Vec3[] | undefined;
      const e = pts ? endProfileFor(pts, hosts) : null;
      if (e) out.set(v.id, e);
    }
    generated.set(mode, out);
  } finally { building = false; }
  return out;
}

/** The two ends of a vessel drawn sewn onto a host (the Warren and portocaval shunts' own rows, then every other collateral, shunt or stent end that lands on a wall), or null for a vessel that has none. */
export function shuntEnds(id: string): readonly [ShuntEnd | null, ShuntEnd | null] | null {
  const row = ROWS[id], own = NETWORK_BY_ID.get(id);
  if (!row) return own ? generatedRows().get(id) ?? null : null;
  if (!own) return null;
  const end = (i: 0 | 1): ShuntEnd | null => {
    let r = 0;
    for (const h of row.hosts[i]) r = Math.max(r, NETWORK_BY_ID.get(h)?.radius ?? 0);
    if (!(r > 0)) return null;
    // (only the end inside a host is narrowed further and flared: SIDE_INSIDE, or SINK's own)
    return { hostR: r, inside: row.inside[i], sink: !!row.sink && i === 1, flare: row.flare && i === 1 && (row.inside[i] || !!row.sink) };
  };
  const a = end(0), b = end(1);
  return a || b ? [a, b] : null;
}
/** One end of a vessel as it is sewn (`shuntEnds`), or null: the profile every tube and seam reads, the Circuit asks `endProfileFor` for a path of its own. */
export const endProfile = (id: string, end: 0 | 1): ShuntEnd | null => shuntEnds(id)?.[end] ?? null;
/** The shunt's width share at an end: the host's caliber against its own, never under SHUNT_END_MIN (stage-tubes.js tubeHostW). */
export const endShare = (e: ShuntEnd | null, radius: number): number => (e && radius > 0 ? Math.min(1, Math.max(SHUNT_END_MIN, e.hostR / radius)) : 1);

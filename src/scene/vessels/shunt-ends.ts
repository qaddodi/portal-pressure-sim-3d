// Where a surgical shunt is sewn onto a vein (2D stage-geo.js SIDE_HOSTS / SIDE_INSIDE, stage-tubes.js SINK / FLARED, fork-joins.js sideEndScale / flareScale): the shunt narrows at that end to the
// host's own caliber, its round end sinks inside the host's wall (narrowing further, so it never shows past the far wall as a bump) and its heel flares toward the wall like a real
// end-to-side anastomosis, not a pipe pushed against the vein. Pure: the tables, and what they make of a course.
import { NETWORK, NETWORK_BY_ID } from './network.ts';
import { REST, coursesOf } from './shape.ts';
import { smoothJoinsOn } from './join-mode.ts';
import { isPermanent, nearestOnPolyline } from './skin/inventory.ts';
import type { Vec3 } from './skin/types.ts';

/** One end of a shunt: the host's radius (scene units), whether the end lies inside the host's lumen (so it narrows there), whether it is a sink (2D SINK: narrowed but not further reduced) and flares. */
export interface ShuntEnd { hostR: number; inside: boolean; sink: boolean; flare: boolean; /** a generated end (not the Warren's or the portocaval's own row): its flare may not take the tube wider than its host (tubes.ts) */ capped?: true }
interface Row { hosts: readonly [readonly string[], readonly string[]]; inside: readonly [boolean, boolean]; sink?: boolean; flare: boolean }
/** The Warren shunt leaves the splenic vein's side (its start runs on from the divided splenic vein, so it is not inside) and ends inside the left renal vein; the portocaval shunt sinks into the cava. */
const ROWS: Readonly<Record<string, Row>> = {
  S_DSR: { hosts: [['V_SPL', 'SV_MID'], ['V_KID_L', 'V_KID_L_1']], inside: [false, true], flare: true },
  S_PC: { hosts: [[], ['IVC_IS', 'IVC_IS_1', 'ILI_IVC', 'ILI_IVC_1']], inside: [false, true], sink: true, flare: true },
};
/** The share of its own width a shunt narrows to at a host end (stage-tubes.js: the host's width, clamped to 0.4 of its own at the least; 1 at the most). */
export const SHUNT_END_MIN = 0.4;

/** An end lies on a host's wall, and so is sewn onto it, when it is within this many of the host's radii of the host's axis (the same finder as skin/wall.ts `wallLandings`: 1.5, any place along the host, its ends included). */
export const SEWN_TOL_R = 1.5;
/** A host as the Circuit (or any caller that has no network vessel) gives it: its axis and its radius, in the units of the path asked about. */
export interface HostAxis { pts: readonly Vec3[]; radius: number }

/** How an end that lands on a wall is drawn (the Warren shunt's way, 2D SIDE_INSIDE: narrowed to the host's width, closing to a point inside the wall so no round cap shows past it, flared at the heel but never wider than the host): the host is the widest one within reach. Null where the end is on no host. */
export function sewnEndAt(p: Vec3, hosts: readonly HostAxis[]): ShuntEnd | null {
  let r = 0;
  for (const h of hosts) { if (h.pts.length < 2) continue; const n = nearestOnPolyline(h.pts, p); if (n.d <= SEWN_TOL_R * h.radius) r = Math.max(r, h.radius); }
  return r > 0 ? { hostR: r, inside: true, sink: false, flare: true, capped: true } : null;
}
/** The two sewn ends of a path made at run time (a custom shunt of the Circuit, a strand): each end that lands on one of `hosts`, else null. Pure numbers, a few polyline distances. */
export function endProfileFor(pts: readonly Vec3[], hosts: readonly HostAxis[]): readonly [ShuntEnd | null, ShuntEnd | null] | null {
  if (pts.length < 2) return null;
  const a = sewnEndAt(pts[0]!, hosts), b = sewnEndAt(pts[pts.length - 1]!, hosts);
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

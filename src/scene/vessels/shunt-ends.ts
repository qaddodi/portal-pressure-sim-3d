// Where a surgical shunt is sewn onto a vein (2D stage-geo.js SIDE_HOSTS / SIDE_INSIDE, stage-tubes.js SINK / FLARED, fork-joins.js sideEndScale / flareScale): the shunt narrows at that end to the
// host's own caliber, its round end sinks inside the host's wall (narrowing further, so it never shows past the far wall as a bump) and its heel flares toward the wall like a real
// end-to-side anastomosis, not a pipe pushed against the vein. Pure: the tables, and what they make of a course.
import { NETWORK_BY_ID } from './network.ts';

/** One end of a shunt: the host's radius (scene units), whether the end lies inside the host's lumen (so it narrows there), whether it is a sink (2D SINK: narrowed but not further reduced) and flares. */
export interface ShuntEnd { hostR: number; inside: boolean; sink: boolean; flare: boolean }
interface Row { hosts: readonly [readonly string[], readonly string[]]; inside: readonly [boolean, boolean]; sink?: boolean; flare: boolean }
/** The Warren shunt leaves the splenic vein's side (its start runs on from the divided splenic vein, so it is not inside) and ends inside the left renal vein; the portocaval shunt sinks into the cava. */
const ROWS: Readonly<Record<string, Row>> = {
  S_DSR: { hosts: [['V_SPL', 'SV_MID'], ['V_KID_L', 'V_KID_L_1']], inside: [false, true], flare: true },
  S_PC: { hosts: [[], ['IVC_IS', 'IVC_IS_1', 'ILI_IVC', 'ILI_IVC_1']], inside: [false, true], sink: true, flare: true },
};
/** The share of its own width a shunt narrows to at a host end (stage-tubes.js: the host's width, clamped to 0.4 of its own at the least; 1 at the most). */
export const SHUNT_END_MIN = 0.4;

/** The two ends of a surgical shunt, or null for a vessel that has none (every other vessel). */
export function shuntEnds(id: string): readonly [ShuntEnd | null, ShuntEnd | null] | null {
  const row = ROWS[id], own = NETWORK_BY_ID.get(id);
  if (!row || !own) return null;
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
/** The shunt's width share at an end: the host's caliber against its own, never under SHUNT_END_MIN (stage-tubes.js tubeHostW). */
export const endShare = (e: ShuntEnd | null, radius: number): number => (e && radius > 0 ? Math.min(1, Math.max(SHUNT_END_MIN, e.hostR / radius)) : 1);

// A vessel's width on the Circuit's map, in map units: the 2D app's own rule (stage-tubes.js widthAt at t = 1), which the vessel shader (vessels/shaders.ts circSwell) draws and the
// captions keep clear of. A vein clamp(vesselPx(D) * 0.95, 6, 15) times the zoom boost, an artery a flat 3 (an arterioportal shunt 0.6 of it), a liver bed 8 times the boost.
// The map's lines are drawn with these widths, NOT with the body's: the body is 1 scene unit to 300 figure units and the map 1 to 1 / MAP_K, so a body radius carried onto the map
// is about half as wide against its lane as 2D draws it (the Circuit on an iPhone drew hairlines).
import { vesselPx } from '../vessels/network.ts';

export const CIRC_VEIN_MIN = 6;
export const CIRC_VEIN_MAX = 15;
export const CIRC_ARTERY = 3;
export const CIRC_BED = 8;
export const CIRC_BRANCH_MIN = 1.2;

export type WidthKind = 0 | 1 | 2;
/** The width (map units) of a vessel in the Circuit: kind 0 a vein of diameter `d` mm, 1 an artery (`fine` 0.6 for an arterioportal shunt), 2 a liver bed. `boost` is circBoostOf(the map's px per unit). */
export function circuitWidthMap(kind: WidthKind, d: number, boost: number, fine = 1): number {
  if (kind === 1) return CIRC_ARTERY * fine;
  if (kind === 2) return CIRC_BED * boost;
  return Math.min(CIRC_VEIN_MAX, Math.max(CIRC_VEIN_MIN, vesselPx(d) * 0.95)) * boost;
}
/** A liver branch's width: its host's Circuit width times the branch's share, never under 1.2 (2D: `cb.w = max(1.2, w * k)`). */
export const circuitBranchWidth = (host: WidthKind, hostD: number, boost: number, fine: number, k: number): number => Math.max(CIRC_BRANCH_MIN, circuitWidthMap(host, hostD, boost, fine) * k);

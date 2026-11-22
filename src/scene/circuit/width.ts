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
/** The least a line is drawn on the screen, CSS px, whatever the zoom (the Circuit is meant to read on a phone: no hairline anywhere). */
export const MIN_PX: Readonly<Record<'vein' | 'artery' | 'bed' | 'branch', number>> = { vein: 5, artery: 3, bed: 4.5, branch: 2.5 };

export type WidthKind = 0 | 1 | 2;
/** The width (map units) of a vessel in the Circuit: kind 0 a vein of diameter `d` mm, 1 an artery (`fine` 0.6 for an arterioportal shunt), 2 a liver bed. `boost` is circBoostOf(the map's px per unit). */
export function circuitWidthMap(kind: WidthKind, d: number, boost: number, fine = 1, perPx = 0): number {
  if (kind === 1) return Math.max(CIRC_ARTERY * fine, MIN_PX.artery * perPx);
  if (kind === 2) return Math.max(CIRC_BED * boost, MIN_PX.bed * perPx);
  return Math.max(Math.min(CIRC_VEIN_MAX, Math.max(CIRC_VEIN_MIN, vesselPx(d) * 0.95)) * boost, MIN_PX.vein * perPx);
}
/** A liver branch's width: its host's Circuit width times the branch's share, never under 1.2 (2D: `cb.w = max(1.2, w * k)`). */
export const circuitBranchWidth = (host: WidthKind, hostD: number, boost: number, fine: number, k: number, perPx = 0): number => Math.max(CIRC_BRANCH_MIN, MIN_PX.branch * perPx, circuitWidthMap(host, hostD, boost, fine) * k);

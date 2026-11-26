// The numbers the collagen's growth shares between the arrival times (collagen-tau.ts), the plate shader and the tests. Plan 49b (Mohammad, 23 Nov 2026: "this looks 3D", "the fibrosis should look like ropes, not like a big blob", "it has to maintain the cel shadedness"):
// the septa and the tracts are painted as CORDS (collagen-cords.ts), flat fill, one flat shade band, a thin deeper edge line, so the analytic edge, fade and rope relief that Plans 47 to 49 computed for a filled band are gone; what is left is where a band's arrival time reaches and how a tract's disc grows.
// Pure numbers, no three: the arrival times (node) and the shader read the same ones.
import { glslNum as F } from '../cel-glsl.ts';
import { GROW_H, TAU_LO, TAU_MAX, TAU_SPAN } from './growth.ts';

/** The plate's side in pixels and its half side in lobule radii (plate.ts PLATE_PX and PLATE_BOX: tests/collagen-cords.test.ts holds them equal; not imported here so the arrival times stay free of three). */
export const EDGE_PLATE_PX = 2048, EDGE_BOX = 1.22;

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** The tract's radius in lobule radii (geometry.ts rt) and in plate px. */
export const TRACT_RT = 0.1;
export const TRACT_RT_PX = (TRACT_RT * EDGE_PLATE_PX) / (2 * EDGE_BOX);

/** The tract's front radius in plate px at growth p: the inverse of the arrival times' old rule (the tract of radius rt (0.8 + 0.9 g) is whole at g), so the disc grows as it always did, from 0.8 rt at the first arrival to the cuff's edge at full growth. The cords inside it show as it passes. */
export const tractFrontPx = (p: number): number => TRACT_RT_PX * (0.8 + 0.9 * ((p - TAU_LO) * TAU_MAX) / TAU_SPAN);
/** The earliest arrival's ease: 0 before the first tract collagen, 1 once it is whole (growth.ts: TAU_LO +- GROW_H), so the disc never pops in at its first radius. */
export function tractRamp(p: number): number {
  const t = clamp((p - (TAU_LO - GROW_H)) / (2 * GROW_H), 0, 1);
  return t * t * (3 - 2 * t);
}
/** The tract's growth front is SOFT (Mohammad, 23 Nov 2026: "a hard-edged pale disc ... clipped straight"): the painted tract (collagen-paint.ts paintTract) has no rim, its bundles and the cuff's reach about 1.2 x the old radius, so the front sits TRACT_FRONT_K times
 *  further out and fades over TRACT_SOFT of itself either side of that radius, never cutting a bundle. */
export const TRACT_FRONT_K = 1.45, TRACT_SOFT = 0.18;
/** How far from a tract's centre its painted bundles and collar reach, plate px (measured on the painted tract layer, alpha above 0.03: tests/collagen-relief.test.ts keeps it); the front is whole by here at growth 1. */
export const TRACT_REACH_PX = 192;
export const PX_PER_R = EDGE_PLATE_PX / (2 * EDGE_BOX);
/** The front's radius and its half width (plate px) at growth p. */
export const tractRadiusPx = (p: number): number => TRACT_FRONT_K * tractFrontPx(p);
export const tractSoftPx = (p: number): number => TRACT_SOFT * tractRadiusPx(p);
/** The tract's signed edge distance (plate px, + inside) of a pixel r plate px from the tract's centre. */
export const tractEdge = (p: number, r: number): number => tractRadiusPx(p) - r;

/** GLSL twin of the numbers the plate shader reads. */
export const COLL_EDGE_GLSL = /* glsl */ `
const float TRACT_RT_PX = ${F(TRACT_RT_PX)};
const float TRACT_FRONT_K = ${F(TRACT_FRONT_K)};
const float TRACT_SOFT = ${F(TRACT_SOFT)};
const float TRACT_TAU_LO = ${F(TAU_LO)};
const float TRACT_TAU_K = ${F(TAU_MAX / TAU_SPAN)};
const float TRACT_RAMP_H = ${F(GROW_H)};
`;

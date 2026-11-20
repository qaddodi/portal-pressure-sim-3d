// How wide each lobule vessel is, as the 2D app draws it: lobule-zoom-field.js radiusAt (healthy, in lobule radii: R = 1), so the 3D lobule's sinusoids are no wider than 2D's (the visual review of 19 Nov:
// they were 1.5 to 1.9 times wider, and the cords of cells between them slivers). The numbers are 2D's own; tests/scene-lobule-widths.test.ts holds every one to the pinned 2D file's text.
// 2D works in pixels (rs0 = clamp(0.0085 R, 1.7, 3) px, a floor and a ceiling that depend on the screen); here the figure is in lobule radii, the 0.0085 share an iPad or a Mac shows.
import { SIN_NARROW, RS0, AN_K } from './geometry.ts';
import { flareAt, sinK, twigRadius } from './from2d/lobule-mouths.generated.js';

export { RS0, SIN_NARROW, AN_K };
/** A sinusoid as drawn, before the widening toward the central vein (2D: rsN). */
export const RS_N = RS0 * SIN_NARROW;
/** The end-on vessels' radii (2D radiusAt, healthy). */
export const DISC_R = { pv: 0.042, cv: 0.07, ha: 0.0115, bd: 0.0145, lv: 0.016 } as const;
/** The inlet venule leaves the portal venule at 0.015 and tapers to 0.009 (2D: lerp(R * 0.015, R * 0.009, i / (N - 1))). */
export const IN_R: readonly [number, number] = [0.015, 0.009];
/** The terminal lymphatic (2D: R * 0.0075 at a normal rate). */
export const LT_R = 0.0075;
/** The twig's thread (2D: R * 0.0026), where it leaves the arteriole (0.62 of the arteriole's) and where it opens into its sinusoid (0.55 of the sinusoid's). */
export const TW_R = { base: 0.0026, leave: 0.62, join: 0.55 } as const;

/** A sinusoid's radius at distance `rho` from the centre (lobule radii): 1 at the portal end to 1.3 by the vein, one curve of position (sinK), and a generation-2 sinusoid opens like a trumpet into the vein (flareAt). */
export function sinRadius(kind: 's0' | 's1' | 's2' | 'an', rho: number): number {
  if (kind === 'an') return RS_N * AN_K;
  const r = RS_N * sinK(rho);
  return kind === 's2' ? r * flareAt(rho - DISC_R.cv, RS_N * 1.3) : r;
}
/** An inlet venule's radius at its sample i of n, and how far (lobule radii) that sample is from where it leaves the portal venule's centre (it flares out of the venule). */
export function inletRadius(i: number, n: number, fromPv: number): number {
  const r = IN_R[0] + (IN_R[1] - IN_R[0]) * (i / (n - 1));
  return r * flareAt(fromPv - DISC_R.pv, r);
}
/** The arteriole's twig at u 0..1 along it, on a sinusoid whose own radius there is `rs`. */
export function twigR(u: number, rs: number): number {
  const leave = TW_R.leave * DISC_R.ha;
  return twigRadius(Math.max(TW_R.base, 0), leave, TW_R.join * rs, u);
}

const smooth01 = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The rim's share left at distance `rho` from the centre: whole from rho 0.42 out, none at 0.13 (about 90 % of the way from the portal edge to the central vein), eased between. Mohammad, 20 Nov 2026: "taper to nothing
 *  closer to 90% of the way to the central vein" (2D's own rim only thins to about a quarter there: this is the one place the 3D sleeve is narrower than 2D's, chosen by him). */
export function disseTaper(rho: number): number { return smooth01(0.13, 0.42, rho); }

/** How far the space of Disse's sleeve stands out beyond its sinusoid's wall at distance `rho` from the centre, in lobule radii, for the fluid `j` filtered there (a multiple of the healthy mean; model.ts disseProfile).
 *  2D lobule-zoom-field.js radiusAt, case 'ly': `rs * sinK(rho) + g.rs0 * (0.12 + 0.42 * sqrt(j)) * (0.55 + 0.45 * smooth(0.07, 0.24, rho))`, the part after the sinusoid's own radius, times `disseTaper`.
 *  A healthy liver's: a little over half of rs0 at the portal end, nothing by the central vein. */
export function disseRim(rho: number, j: number): number {
  return RS0 * (0.12 + 0.42 * Math.sqrt(Math.max(0, j))) * (0.55 + 0.45 * smooth01(0.07, 0.24, rho)) * disseTaper(rho);
}
/** The sleeve's own half width at rho: the sinusoid's radius there (`scale` is the state's widening of it, view.sinScaleAt; 1 healthy; no trumpet flare, which 2D's `ly` does not take) and the rim beyond it. */
export function sleeveRadius(rho: number, j: number, scale = 1): number {
  return RS_N * sinK(rho) * scale + disseRim(rho, j);
}
/** The sleeve of a healthy liver (j = 1) at rho (a rim of up to 0.0046 R beyond the sinusoid; tests/scene-lobule-fit-2d.test.ts). */
export function disseRadius(rho: number): number { return sleeveRadius(rho, 1); }

/** How much of congestion's widening a sinusoid takes at rho (0 to 0.95): most round the central vein (zone 3), none at the portal side, smoothly in between. It was one number per
 *  sinusoid generation (2D's CONG_Z3: 0, 0.4, 0.95), so in a congested liver (Budd-Chiari) each generation stood at its own width and stepped where it met the next, Mohammad 20 Nov 2026:
 *  "the blood vessels in Budd-Chiari don't smoothly connect", "seamless and smooth calibers". The same shares at each generation's middle (0.75, 0.47, 0.19). */
export function congShare(rho: number): number {
  const t = Math.min(1, Math.max(0, (0.8 - rho) / (0.8 - 0.12)));
  return 0.95 * t * t * (3 - 2 * t);
}

// A vessel's drawn width against the width its tube was built at, on the CPU: the same rule as the vessel shader (shaders.ts main: the 2D figure's widthAt,
// a vein 1.3 * max(2.6, 2 d^0.72), an artery half of that and at least 1.8, a liver bed fixed; the ratio of the live diameter's width to the built one, 0.2 to 8).
// Anything that lies IN a vessel (a clot) takes its size from the vessel as drawn now, so it fills the lumen it is in whatever the engine has done to the vein.
export const SWELL_MIN = 0.2;
export const SWELL_MAX = 8;
const vein = (d: number): number => 1.3 * Math.max(2.6, 2.0 * Math.pow(Math.max(d, 0.1), 0.72));

/** The swell (live width over built width) of a vessel of `widthKind` (network.ts) built at `baseD` mm when the engine's diameter is `d` mm. 1 for a fixed width or an unknown diameter. */
export function widthSwell(widthKind: 0 | 1 | 2, baseD: number, d: number | undefined): number {
  if (widthKind > 1 || d == null || !Number.isFinite(d)) return 1;
  let w1 = vein(d), w0 = vein(baseD);
  if (widthKind > 0) { w1 = Math.max(1.8, w1 * 0.5); w0 = Math.max(1.8, w0 * 0.5); }
  return Math.min(SWELL_MAX, Math.max(SWELL_MIN, w1 / w0));
}

// How the fibrosis grows (Plan 25b, Mohammad 22 Nov: "I want the fibrosis to grow organically in steps ... growing and falling back"): the collagen is painted once at full strength with an arrival time per pixel (collagen-tau.ts),
// and each channel's growth p (septa, portal tracts, the central vein's cuff and ring) reveals the pixels whose arrival time it has passed. A change of fibrosis repaints nothing: p eases, the GPU shows more or less.
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** The front's half width, in growth units. Wide enough that, at GROW_RATE and 60 fps, no pixel's alpha changes by more than 0.08 in a frame: 1.5 / (2 H) x 0.35 / 60 = 0.067. */
export const GROW_H = 0.065;
/** The growth's fixed rate, per second: a whole F0 to F4 change takes about 3 s, so the eye can follow it. */
export const GROW_RATE = 0.35;
/** An arrival time t (0 to TAU_MAX in the painter's units) is stored as TAU_LO + TAU_SPAN x t / TAU_MAX in a byte (x 254; 255 is "never"). TAU_LO >= GROW_H keeps every pixel hidden at growth 0, and
 *  TAU_LO + TAU_SPAN <= 1 - GROW_H keeps every pixel whole at growth 1. */
export const TAU_LO = 0.07, TAU_SPAN = 0.86, TAU_MAX = 1.05;
export const NEVER = 255;
export const tauToByte = (t: number): number => Math.round((TAU_LO + TAU_SPAN * clamp(t / TAU_MAX, 0, 1)) * 254);
/** The stored value (0..1 growth units) of a byte; null: never. */
export const byteToTau = (b: number): number | null => (b >= NEVER ? null : b / 254);
/** A pixel's reveal at growth p (the shader's `front`). */
export function front(byte: number, p: number): number {
  const t = byteToTau(byte);
  if (t === null) return 0;
  const x = clamp((p - (t - GROW_H)) / (2 * GROW_H), 0, 1);
  return x * x * (3 - 2 * x);
}

/** The septa multiply their reveal by this (Plan 31: 0.75 + 0.25 su, so early septa are already legible; it was 0.55 + 0.45 su). */
export const septaStrength = (pS: number): number => 0.75 + 0.25 * pS;
/** Plan 31: in cirrhosis the bridging septa lead, so the portal tracts and the vein's cuff and ring yield as the septa grow (tract area to about 43 %, the vein to a thin collar). The share of each channel drawn at septa growth 1. */
export const TRACT_YIELD = 0.65, CV_YIELD = 0.7;

/** The three channels' growth goals, from the lobule's fibrosis values: the septa by cirrhosis, the portal tracts and the vein by 2D's scarGrowth (with the painter's own onsets, 0.03 and 0.05). */
export function growGoal(s: { septU: number; fibPre: number; fibPost: number }): [number, number, number] {
  const g = (x: number) => clamp(x, 0, 1) ** 1.1;
  const pS = clamp(s.septU, 0, 1);   // (the yield rides the same eased growth: with septU 0, schistosomiasis, NCPH, SOS and Budd-Chiari, nothing changes)
  return [pS, s.fibPre > 0.03 ? g(s.fibPre) * (1 - TRACT_YIELD * pS) : 0, s.fibPost > 0.05 ? g(s.fibPost) * (1 - CV_YIELD * pS) : 0];
}

/** One step of a channel's growth towards its goal, dt seconds: at most GROW_RATE a second, slowing into the goal. */
export function easeGrow(p: number, goal: number, dt: number): number {
  const d = goal - p;
  if (d === 0) return p;
  const sp = Math.min(GROW_RATE, 3 * Math.abs(d) + 0.01), st = Math.min(Math.abs(d), sp * Math.max(0, dt));
  return p + Math.sign(d) * st;
}

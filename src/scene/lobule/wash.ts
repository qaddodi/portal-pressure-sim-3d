// The wedged column's wash (HVPG and PPG deck, slide 5): a port of the 2D app's sinusoid-wash.js and lobule-wash.js timing and span rules.
// The balloon holds a still column of blood from the hepatic vein back through the central vein into the sinusoids, so once the view has
// landed the wedge's amber fills the central vein and spreads outward along every sinusoid, in a front that runs from the centre to the
// portal tracts. In the lobule the front is a radius (rho, in lobule radii); in the sinusoid it is the share of the one sinusoid's length,
// from its central end. Pure: the views read the clock, these turn time into how far the wash has come.

/** Ms after the view lands before the wash begins (the eye finds the vessel first), and how long it takes to run its length. */
export const WASH_DELAY_MS = 700, WASH_MS = 3400;

/** How far the wash has come, 0..1 (eased), `elapsed` ms after the view landed; reduced motion: the finished wash at once. */
export function washProgress(elapsed: number, reduced = false): number {
  if (reduced) return 1;
  const k = Math.min(1, Math.max(0, (elapsed - WASH_DELAY_MS) / WASH_MS));
  return k * k * (3 - 2 * k);
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How much of the amber replaces the vessel's own colour (lobule-wash.js AMOUNT), and how fast it comes in at the start of the wash. */
export const WASH_AMOUNT = 0.85;
export const washAmount = (k: number): number => WASH_AMOUNT * smooth(0, 0.05, k);

/** The front's radius in lobule radii at progress k (the central vein is filled first: the front starts just outside it). rcv0: the central vein's radius in lobule radii. */
export function washFront(k: number, rcv0 = 0.07): number {
  const r0 = rcv0 * 0.8;
  return r0 + (1.1 - r0) * k;
}

/** The part of a course the front has covered, from the end of it nearer the centre: [from, to] as shares (0..1) of its length, or null when the front has not reached it. */
export function washSpan(pts: readonly (readonly [number, number])[], rho: readonly number[], front: number): [number, number] | null {
  const n = pts.length;
  if (n < 2 || rho.length !== n) return null;
  const cum = new Float64Array(n);
  let s = 0;
  for (let i = 1; i < n; i++) { s += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); cum[i] = s; }
  if (s > 0) for (let i = 1; i < n; i++) cum[i] = cum[i]! / s;
  const fromStart = rho[0]! <= rho[n - 1]!, step = fromStart ? 1 : -1, last = fromStart ? n - 1 : 0;
  let i = fromStart ? 0 : n - 1, share: number | undefined;
  if (rho[i]! > front) return null;
  while (i !== last) {
    const j = i + step;
    if (rho[j]! > front) { share = cum[i]! + (cum[j]! - cum[i]!) * ((front - rho[i]!) / (rho[j]! - rho[i]! || 1)); break; }
    i = j;
  }
  if (share === undefined) share = cum[last]!;
  return fromStart ? [0, share] : [share, 1];
}

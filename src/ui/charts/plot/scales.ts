// Axis scales for the over-time charts (2D: flow-time.js). Each line is fitted tight to its own range with round steps; two lines on their own axes share one count of
// steps so the gridlines are one set, and one axis is widened (never both) when the two lines would end or start at nearly the same height. Pure.
export interface Scale { min: number; max: number; ticks: number[] }
export interface ScaleOpt { pad?: number; scale?: readonly [number, number, number] }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const NICE = [1, 2, 2.5, 5, 10];
export const niceStep = (raw: number) => { const p = Math.pow(10, Math.floor(Math.log10(raw))); return NICE.find((s) => s * p >= raw - 1e-9)! * p; };
const ticksOf = (lo: number, hi: number, step: number) => Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => +(lo + k * step).toPrecision(6));
export const PAD = 0.08, MIN_SPAN = 0.15;
/** A line's range as it is fitted: its own span with `pad` kept clear above and below, never under zero; a line that barely moves keeps at least MIN_SPAN of its value. */
export function rangeOf(v: readonly number[], pad = PAD): [number, number] {
  const lo0 = Math.min(...v), hi0 = Math.max(...v), span = hi0 - lo0;
  if (span < 1e-6 * (Math.abs(hi0) + 1)) { const h = Math.max(Math.abs(hi0) * 0.05, 0.5); return [Math.max(0, lo0 - h), hi0 + h]; }
  const floor = MIN_SPAN * Math.max(Math.abs(lo0), Math.abs(hi0)), mid = (lo0 + hi0) / 2, wide = Math.max(span, floor);
  return [Math.max(0, mid - wide / 2 - wide * pad), mid + wide / 2 + wide * pad];
}
export function fitSteps(a: number, b: number, n: number): { lo: number; step: number } {
  let step = niceStep(Math.max(1e-6, (b - a) / n));
  for (let i = 0; i < 12; i++, step = niceStep(step * 1.0001)) {
    const lo = Math.floor(a / step + 1e-9) * step;
    if (lo + n * step >= b - 1e-9 * step) return { lo, step };
  }
  return { lo: 0, step: niceStep(b / n) };
}
export const scaleOf = ({ lo, step }: { lo: number; step: number }, n: number): Scale => { const ticks = ticksOf(lo, lo + n * step, step); return { min: ticks[0]!, max: ticks.at(-1)!, ticks }; };
/** A line with a scale of its own, [min, max, step]. */
export const fixedScale = ([lo, hi, step]: readonly [number, number, number]): Scale => scaleOf({ lo, step }, Math.round((hi - lo) / step));

export const END_APART = 0.28, START_APART = 0.18, STRETCH_MAX = 3.4, STRETCH_STARTS = 2.2;
const WIDEN = [0.3, 0.6, 1, 1.5, 2];
const fracOf = (sc: Scale, v: number) => (v - sc.min) / (sc.max - sc.min);
interface Plan { sc: Scale; ext: number; span: number }
function plans(a: number, b: number, n: number): Plan[] {
  const w = b - a, mk = (lo: number, hi: number, ext: number): Plan => { const sc = scaleOf(fitSteps(lo, hi, n), n); return { sc, ext, span: sc.max - sc.min }; };
  return [mk(a, b, 0), ...WIDEN.flatMap((e) => [mk(a, b + e * w, e), mk(Math.max(0, a - e * w), b, e)])];
}
/** 0: the ends and the starts stand apart; 1: only the starts are close; 2: the ends are close (and the starts apart); 3: both close. */
export function apartTier(L: Scale, U: Scale, vl: readonly number[], vu: readonly number[]): number {
  const e = Math.abs(fracOf(L, vl.at(-1)!) - fracOf(U, vu.at(-1)!)), s = Math.abs(fracOf(L, vl[0]!) - fracOf(U, vu[0]!));
  return (e >= END_APART ? 0 : 2) + (s >= START_APART ? 0 : 1);
}
/** The two axes of a chart, left (the lower line, vl) and right (the upper, vu): each fitted tight to its own line and cut in the same number of steps. */
export function pairScales(vl: readonly number[], vu: readonly number[], optL: ScaleOpt = {}, optU: ScaleOpt = {}, same = false): [Scale, Scale] {
  if (same && !optL.scale && !optU.scale) {
    const [a, b] = rangeOf([...vl, ...vu], Math.min(optL.pad ?? PAD, optU.pad ?? PAD));
    let best: { n: number; F: { lo: number; step: number }; waste: number } | null = null;
    for (const n of [4, 3, 5, 2]) { const F = fitSteps(a, b, n), waste = (n * F.step) / (b - a); if (!best || waste < best.waste - 1e-9) best = { n, F, waste }; }
    const one = scaleOf(best!.F, best!.n);
    return [one, one];
  }
  if (optL.scale && optU.scale) return [fixedScale(optL.scale), fixedScale(optU.scale)];
  if (optL.scale) { const L = fixedScale(optL.scale), n = L.ticks.length - 1, [a, b] = rangeOf(vu, optU.pad); return [L, scaleOf(fitSteps(a, b, n), n)]; }
  if (optU.scale) { const U = fixedScale(optU.scale), n = U.ticks.length - 1, [a, b] = rangeOf(vl, optL.pad); return [scaleOf(fitSteps(a, b, n), n), U]; }
  const [la, lb] = rangeOf(vl, optL.pad), [ua, ub] = rangeOf(vu, optU.pad);
  const tier0 = apartTier(scaleOf(fitSteps(la, lb, 4), 4), scaleOf(fitSteps(ua, ub, 4), 4), vl, vu), cap = tier0 >= 2 ? STRETCH_MAX : STRETCH_STARTS;
  let best: { tier: number; cost: number; L: Scale; U: Scale } | null = null;
  for (const n of [4, 3, 5, 2]) {
    for (const L of plans(la, lb, n)) {
      for (const U of plans(ua, ub, n)) {
        if (L.ext && U.ext) continue;
        const cost = Math.max(L.span / (lb - la), U.span / (ub - ua));
        if ((L.ext || U.ext) && cost > cap) continue;
        const tier = apartTier(L.sc, U.sc, vl, vu);
        if (!best || tier < best.tier || (tier === best.tier && cost < best.cost - 1e-9)) best = { tier, cost, L: L.sc, U: U.sc };
      }
    }
  }
  return [best!.L, best!.U];
}
/** y of a value on a band [top, bottom] with scale sc (clamped to the band). */
export const yOf = (band: readonly [number, number], sc: Scale) => (v: number) => band[1] - (band[1] - band[0]) * clamp((v - sc.min) / (sc.max - sc.min), 0, 1);
export const decOf = (sc: Scale) => (sc.ticks.some((v) => Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) ? 2 : sc.ticks.some((v) => v % 1) ? 1 : 0);

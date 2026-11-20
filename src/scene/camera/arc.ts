// The camera's long-move path, ported from the 2D app (src/ui/cam-arc.js CamPath, after van Wijk and Nuij 2003, "smooth and efficient zooming and panning"):
// a short move (the two framings overlap) is the plain glide; a long one, from one close-up to another far across the figure, pulls back to a view that holds both
// and comes in to the target, so the figure never streams past at full zoom. It never pulls back past the whole figure's fit. Pure numbers; rig.ts reads it.
import type { Shot } from './shots.ts';

export const ARC_RHO = Math.SQRT2;
/** How much longer a long move may take than the glide asked for (it travels further). */
export const ARC_STRETCH = 1.3;

const vwB = (w0: number, w1: number, wi: number, sign: number, r4: number, r2: number, d: number) => (w1 * w1 - w0 * w0 + sign * r4 * d * d) / (2 * wi * r2 * d);
const vwR = (bi: number) => Math.log(-bi + Math.sqrt(bi * bi + 1));
class VanWijk {
  S = 0; peak = 0; w0 = 0; rho = 0; r2 = 0; r0 = 0; c0 = 0; s0 = 0;
  fill(w0: number, w1: number, d: number, rho: number): this {
    const r2 = rho * rho, r4 = r2 * r2;
    const r0 = vwR(vwB(w0, w1, w0, 1, r4, r2, d)), r1 = vwR(vwB(w0, w1, w1, -1, r4, r2, d));
    const c0 = Math.cosh(r0);
    this.w0 = w0; this.rho = rho; this.r2 = r2; this.r0 = r0; this.c0 = c0; this.s0 = Math.sinh(r0);
    this.S = (r1 - r0) / rho;
    this.peak = r0 <= 0 && r1 >= 0 ? w0 * c0 : Math.max(w0, w1);
    return this;
  }
  uAt(s: number): number { return (this.w0 / this.r2) * (this.c0 * Math.tanh(this.rho * s + this.r0) - this.s0); }
  wAt(s: number): number { return (this.w0 * this.c0) / Math.cosh(this.rho * s + this.r0); }
}
const TRY = new VanWijk();
const geo = (a: number, b: number, k: number) => (a > 0 && b > 0 ? a * Math.pow(b / a, k) : a + (b - a) * k);

/** Whether the parts of the world two shots frame overlap at all (their centres closer than half the sum of their extents, on both axes). */
export function shotsOverlap(a: Shot, b: Shot): boolean {
  return Math.abs(a.target[0] - b.target[0]) < a.half[0] + b.half[0] && Math.abs(a.target[1] - b.target[1]) < a.half[1] + b.half[1];
}

export class LongPath {
  arc = false; stretch = 1; peak = 0;
  private a!: Shot; private b!: Shot;
  private vw = new VanWijk(); private d = 0;
  /** `wMax`: the widest the path may pull back to (world width: the whole figure's fit, or the wider end's if that is wider). */
  fill(a: Shot, b: Shot, wMax: number): this {
    this.a = a; this.b = b; this.arc = false; this.stretch = 1;
    if (shotsOverlap(a, b)) return this;
    const w0 = a.half[0] * 2, w1 = b.half[0] * 2, d = Math.hypot(b.target[0] - a.target[0], b.target[1] - a.target[1]);
    if (!(d > 1e-9)) return this;
    const cap = Math.max(wMax, w0, w1), p = this.vw.fill(w0, w1, d, ARC_RHO);
    if (p.peak > cap * 1.0001) {
      let lo = 0.05, hi = ARC_RHO;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (TRY.fill(w0, w1, d, m).peak > cap) hi = m; else lo = m; }
      p.fill(w0, w1, d, lo);
    }
    if (!Number.isFinite(p.S) || p.S <= 0) return this;
    this.arc = true; this.stretch = Math.min(ARC_STRETCH, Math.max(1, 0.85 + p.S * 0.15)); this.peak = p.peak; this.d = d;
    return this;
  }
  /** The framing at eased progress u (0..1): centre along the line, width from the path, the rest of the shot blended with u. Written into `out`. */
  at(u: number, out: Shot): Shot {
    const a = this.a, b = this.b;
    const p = this.vw, s = u * p.S, f = Math.min(1, Math.max(0, p.uAt(s) / this.d)), w = p.wAt(s);
    const wBase = geo(a.half[0] * 2, b.half[0] * 2, f), rBase = geo(a.r, b.r, f), asp = geo(a.half[1] / a.half[0], b.half[1] / b.half[0], f);
    out.target[0] = a.target[0] + (b.target[0] - a.target[0]) * f;
    out.target[1] = a.target[1] + (b.target[1] - a.target[1]) * f;
    out.target[2] = a.target[2] + (b.target[2] - a.target[2]) * f;
    out.half[0] = w / 2; out.half[1] = (w / 2) * asp;
    out.r = rBase * (w / wBase);
    return out;
  }
}

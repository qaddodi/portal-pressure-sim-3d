// The Protein callout's particle (Mohammad, 26 Nov: "move the protein legend to be a callout with a circle next to it"). The callout's name stands still in its plate; its leader
// ends in a small circle in the
// albumin's colour ON one of the protein particles the blood carries, so it follows that particle along the lumen. A particle crosses the screen in a few seconds, so the callout
// hands on: before the particle
// leaves the leader's reach it lets go (the leader and its circle ease out), and once they are gone it takes the next particle that will stay in reach the longest (they ease back in). Nothing jumps.
// Pure: the traffic's own sprite array in, a place (µm) and a share shown out; no DOM, no GPU (tests/protein-callout.test.ts).

/** The lanes' speed against the blood's, as the traffic runs them (traffic.copied.js sprites(): `1.5 * (1 - y * y) + 0.08`, y the share of the lumen's half width from the axis). */
export const laneSpeed = (share: number): number => 1.5 * (1 - share * share) + 0.08;
/** The blood's speed at the axis' unit lane, µm per second at the healthy flow (traffic.copied.js stepMovers: `vB = S.v * 24`). */
export const BLOOD_UM_S = 24;

/** What the picker needs of the scene. Lengths in µm along the sinusoid (x) and across it (y, down as the shader has it). */
export interface PickCtx {
  halfW(x: number): number;
  /** Where the callout's name stands along the lumen and the place its leader reaches by default (across), and how far either way a particle may be from it. */
  ax: number; ay: number; reach: number;
  /** The blood's direction (+1 toward the central vein) and its speed against healthy (0 paused). */
  flowDir: number; speed: number;
}
const STRIDE = 5;
/** A particle that is a protein in the stream: drawn whole (alpha), a bead (kind 0) and inside the lumen, clear of the lining. */
function inStream(pts: ArrayLike<number>, i: number, count: number, ctx: PickCtx): boolean {
  if (!(i >= 0 && i < count)) return false;
  const o = i * STRIDE, x = pts[o]!, y = pts[o + 1]!, a = pts[o + 3]!, k = pts[o + 4]!;
  return k === 0 && a >= 0.98 && Math.abs(y) < ctx.halfW(x) - 0.9;
}
/** Seconds before a particle at (x, y) leaves the reach (capped at CAP: a still blood keeps it for ever). */
export const CAP = 30;
export function dwell(x: number, y: number, ctx: PickCtx): number {
  const hw = ctx.halfW(x), share = Math.min(0.96, Math.abs(y) / Math.max(0.5, hw - 0.5));
  const v = laneSpeed(share) * BLOOD_UM_S * Math.abs(ctx.speed);
  const left = ctx.flowDir >= 0 ? ctx.ax + ctx.reach - x : x - (ctx.ax - ctx.reach);
  return v < 1e-3 ? CAP : Math.min(CAP, Math.max(0, left) / v);
}
/** The least dwell (s) a followed particle keeps before the callout lets go of it (the leader eases out, never in a blink). */
export const LET_GO_S = 0.6;
/** The index of the protein that will stay in reach the longest (a near one over a far one when it is close), or -1 when none is out. */
export function pickProtein(pts: ArrayLike<number>, count: number, ctx: PickCtx): number {
  let best = -1, bs = -Infinity;
  for (let i = 0; i < count; i++) {
    if (!inStream(pts, i, count, ctx)) continue;
    const o = i * STRIDE, x = pts[o]!, y = pts[o + 1]!;
    if (Math.abs(x - ctx.ax) > ctx.reach) continue;
    const d = dwell(x, y, ctx);
    if (d <= LET_GO_S + 0.4) continue;   // (one that would be let go at once is not taken)
    const sc = Math.min(d, 12) - 0.04 * Math.hypot(x - ctx.ax, y - ctx.ay);
    if (sc > bs) { bs = sc; best = i; }
  }
  return best;
}

/** The ease of the leader and its circle in and out (ms). */
export const FOLLOW_FADE_MS = 200;

/** Follows one protein: the place it is at (kept while the leader fades out), how much of the leader shows (0 to 1), and which particle it is on (-1 none). */
export class ProteinFollow {
  idx = -1; x = 0; y = 0; shown = 0;
  /**
   * One step of `dtMs`. Lets go of the particle when it is gone (the list closed up, it left the stream or the wrap of the traffic's stretch carried it away),
   * when it is about to leave the reach, or when the reach itself moved off it; takes a new one only once the old leader has faded out.
   */
  step(pts: ArrayLike<number>, count: number, ctx: PickCtx, dtMs: number): void {
    if (this.idx >= 0) {
      const o = this.idx * STRIDE, ok = inStream(pts, this.idx, count, ctx);
      const nx = ok ? pts[o]! : this.x, ny = ok ? pts[o + 1]! : this.y;
      // the same particle moves by the blood's speed at most (its lane at the axis, 1.58 of it, and the heart's beat a little over that) in the step, and wobbles a little across
      const step = Math.abs(ctx.speed) * BLOOD_UM_S * 2.2 * (dtMs / 1000) + 0.6;
      const same = ok && Math.abs(nx - this.x) <= step && Math.abs(ny - this.y) <= 0.9 + step * 0.25;
      if (same && Math.abs(nx - ctx.ax) <= ctx.reach && dwell(nx, ny, ctx) > LET_GO_S) { this.x = nx; this.y = ny; } else this.idx = -1;
    }
    if (this.idx < 0 && this.shown <= 0) {
      const i = pickProtein(pts, count, ctx);
      if (i >= 0) { this.idx = i; this.x = pts[i * STRIDE]!; this.y = pts[i * STRIDE + 1]!; }
    }
    const to = this.idx >= 0 ? 1 : 0, d = dtMs / FOLLOW_FADE_MS;
    this.shown = Math.abs(to - this.shown) <= d ? to : this.shown + Math.sign(to - this.shown) * d;
  }
}

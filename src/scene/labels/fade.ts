// Labels fade, never slide (look-and-feel section 7; the 2D rule of 16 Nov). A label that is wanted somewhere else, or with other words, does not blink out and in: the old picture stays where
// it stood and fades out while the new one fades in where it stands now, over FADE.moveMs, the weights easeMove(u) and 1 - easeMove(u) (2D label-gl.js moveFade; Mohammad, 20 Nov audit 4.5:
// "a moved label blinks out and in": 120 ms out then 180 ms in, one after the other, with nothing shown between).
// A move that leaves the old and the new box overlapping, with the same words, is taken at once (2D: a number whose width changes by a pixel must not be drawn twice).
// A label that must go (no longer wanted) or a picture that was cut (`hold`) fades out at once and nothing new starts until the hold is over. Linear fades, on the one clock.
// Pure: no DOM; the layer reads `frame` and writes transform and opacity.
import { FADE } from './alpha.ts';
import type { Placement } from './solver.ts';

export interface Want {
  p: Placement;
  dim: boolean;
  /** What the label says besides its place (the form's words, its unit, change badge, alert, reversal mark): a new key is new words, crossed over as a move is. */
  key?: string;
  /** What the label said (words, unit, badge, alert, mark) when this place was solved: kept so the picture it leaves can be drawn as it was. */
  snap?: unknown;
}

/** The picture a label is leaving. */
export interface Ghost { p: Placement; key: string; snap: unknown }

export interface Shown {
  /** The placement being drawn (the new one while a crossing runs). */
  p: Placement;
  key: string;
  snap: unknown;
  /** 0..1 */
  alpha: number;
  /** 0 bright .. 1 dim */
  dim: number;
  /** The picture the label is leaving while it crosses over to `p` (null when it is not crossing). */
  from: Ghost | null;
  /** The new picture's share while crossing (easeMove of the time), 1 when not crossing. The old one's share is 1 - mix. */
  mix: number;
  /** Crossing progress 0..1, linear in time. */
  u: number;
}

/** The 2D camera's quintic smoothstep 6t^5 - 15t^4 + 10t^3 (ui/ease.js easeMove): the weights a crossing runs on. */
export const easeMove = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));

/** Whether two placements are one spot (the same form and leader, the box within FADE.movePx of where it stood against its dot). */
export const samePlace = (a: Placement, b: Placement): boolean =>
  a.form === b.form && Math.abs(a.dx - b.dx) <= FADE.movePx && Math.abs(a.dy - b.dy) <= FADE.movePx && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5 && a.leader === b.leader && Math.abs(a.au - b.au) < 0.01
  && (a.tail?.below === b.tail?.below) && Math.abs((a.tail?.ax ?? 0) - (b.tail?.ax ?? 0)) < 1;

/** Whether the old and the new box are clear of each other (one is at least a box away from the other, along x or y): only then is a move worth crossing over (2D `apart`). */
const apart = (a: Placement, b: Placement): boolean => Math.abs(a.dx - b.dx) >= b.w || Math.abs(a.dy - b.dy) >= b.h;

export class LabelFader {
  private readonly st = new Map<string, Shown>();
  /** Everything currently drawn (alpha > 0), by id. Read after `step`. */
  get frame(): ReadonlyMap<string, Shown> { return this.st; }

  /** Advance by dt ms. Returns true while anything is still fading or crossing (the clock must keep frames coming). */
  step(dt: number, wants: ReadonlyMap<string, Want>, hold: boolean): boolean {
    let busy = false;
    const out = dt / FADE.outMs, inn = dt / FADE.inMs, dimStep = dt / FADE.dimMs, cross = dt / FADE.moveMs;
    for (const [id, w] of wants) {
      if (!this.st.has(id) && !hold) this.st.set(id, { p: w.p, key: w.key ?? '', snap: w.snap, alpha: 0, dim: w.dim ? 1 : 0, from: null, mix: 1, u: 1 });
    }
    for (const [id, s] of this.st) {
      const w = wants.get(id);
      const target = hold || !w ? 0 : 1;
      // a new place or new words: cross over from the old picture to the new (an invisible label simply takes it)
      if (w && !hold) {
        const key = w.key ?? '';
        const moved = !samePlace(s.p, w.p), reworded = key !== s.key;
        if (moved || reworded) {
          const invisible = s.alpha <= 0.001;
          const small = !reworded && s.p.form === w.p.form && s.p.leader === w.p.leader && !apart(s.p, w.p);
          if (invisible || small || s.p.form < 0) { s.p = w.p; s.key = key; s.snap = w.snap; s.from = null; s.mix = 1; s.u = 1; }
          else {
            // (begun from the picture that stands: one still crossing lets go of the old one it was leaving, which was only a part shown)
            s.from = s.from && s.mix < 0.5 ? s.from : { p: s.p, key: s.key, snap: s.snap };
            s.p = w.p; s.key = key; s.snap = w.snap; s.u = 0; s.mix = 0;
          }
        } else { s.snap = w.snap; }
      }
      if (hold) { s.from = null; s.mix = 1; s.u = 1; }
      if (s.from) { s.u = Math.min(1, s.u + cross); s.mix = easeMove(s.u); if (s.u >= 1) { s.from = null; s.mix = 1; } else busy = true; }
      // dimming eases on its own, never jumps
      const dimTarget = w?.dim ? 1 : 0;
      if (s.dim !== dimTarget) { s.dim = s.dim < dimTarget ? Math.min(dimTarget, s.dim + dimStep) : Math.max(dimTarget, s.dim - dimStep); if (s.dim !== dimTarget) busy = true; }
      if (s.alpha < target) { s.alpha = Math.min(target, s.alpha + inn); if (s.alpha !== target) busy = true; }
      else if (s.alpha > target) { s.alpha = Math.max(target, s.alpha - out); if (s.alpha !== target) busy = true; }
      if (s.alpha <= 0) {
        // gone from sight: forget the label (one still wanted starts again at its place when the hold is over)
        if (!w) this.st.delete(id);
        else if (!hold && s.alpha < 1) busy = true;
      }
    }
    return busy;
  }

  /** Whether anything is drawn. */
  get visible(): boolean { for (const s of this.st.values()) if (s.alpha > 0) return true; return false; }
}

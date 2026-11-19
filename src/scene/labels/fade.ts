// Labels fade between spots, never slide (look-and-feel section 7; the 2D rule of 16 Nov). A label shown at one spot that the solver
// now wants at another fades out where it stands, then fades in at the new spot. A label whose vessel is moving (the camera is in flight,
// the picture is being dragged) fades out at once and comes back FADE.settleMs after the picture is still. Linear fades, on the one clock.
// Pure: no DOM; the layer reads `frame` and writes transform and opacity.
import { FADE } from './alpha.ts';
import type { Placement } from './solver.ts';

export interface Want { p: Placement; dim: boolean }

export interface Shown {
  /** The placement being drawn (a label is drawn at this spot until it has faded out and the new spot is taken). */
  p: Placement;
  /** 0..1 */
  alpha: number;
  /** 0 bright .. 1 dim */
  dim: number;
}

const same = (a: Placement, b: Placement) => a.form === b.form && Math.abs(a.dx - b.dx) < 1 && Math.abs(a.dy - b.dy) < 1 && a.leader === b.leader && Math.abs(a.au - b.au) < 0.01 && (a.tail?.below === b.tail?.below) && Math.abs((a.tail?.ax ?? 0) - (b.tail?.ax ?? 0)) < 1;

export class LabelFader {
  private readonly st = new Map<string, Shown>();
  /** Everything currently drawn (alpha > 0), by id. Read after `step`. */
  get frame(): ReadonlyMap<string, Shown> { return this.st; }

  /** Advance by dt ms. Returns true while anything is still fading (the clock must keep frames coming). */
  step(dt: number, wants: ReadonlyMap<string, Want>, hold: boolean): boolean {
    let busy = false;
    const out = dt / FADE.outMs, inn = dt / FADE.inMs, dimStep = dt / FADE.dimMs;
    for (const [id, w] of wants) {
      if (!this.st.has(id) && !hold) this.st.set(id, { p: w.p, alpha: 0, dim: w.dim ? 1 : 0 });
    }
    for (const [id, s] of this.st) {
      const w = wants.get(id);
      let target = 1;
      if (hold || !w) target = 0;
      else if (!same(s.p, w.p)) target = 0;
      // dimming eases on its own, never jumps
      const dimTarget = w?.dim ? 1 : 0;
      if (s.dim !== dimTarget) { s.dim = s.dim < dimTarget ? Math.min(dimTarget, s.dim + dimStep) : Math.max(dimTarget, s.dim - dimStep); if (s.dim !== dimTarget) busy = true; }
      if (s.alpha < target) { s.alpha = Math.min(target, s.alpha + inn); if (s.alpha !== target) busy = true; }
      else if (s.alpha > target) { s.alpha = Math.max(target, s.alpha - out); if (s.alpha !== target) busy = true; }
      if (s.alpha <= 0) {
        // gone from sight: take the new spot (it will fade in from here), or forget the label
        if (!w) this.st.delete(id);
        else if (!hold && !same(s.p, w.p)) { s.p = w.p; busy = true; }
        else if (!hold && s.alpha < 1) busy = true;
      }
    }
    return busy;
  }

  /** Whether anything is drawn. */
  get visible(): boolean { for (const s of this.st.values()) if (s.alpha > 0) return true; return false; }
}

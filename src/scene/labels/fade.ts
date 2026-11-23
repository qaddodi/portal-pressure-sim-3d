// Labels fade, never slide (look-and-feel section 7; the 2D rule of 16 Nov). A label that is wanted somewhere else, or with other words, does not blink out and in: the old picture stays where
// it stood and fades out while the new one fades in where it stands now, over FADE.moveMs, the weights easeMove(u) and 1 - easeMove(u) (2D label-gl.js moveFade; Mohammad, 20 Nov audit 4.5:
// "a moved label blinks out and in": 120 ms out then 180 ms in, one after the other, with nothing shown between).
// A move that leaves the old and the new box overlapping, with the same words and the same spot on its vessel, is taken at once only while it stays within FADE.smallPx of where the picture last stood
// (2D: a number whose width changes by a pixel must not be drawn twice). Further than that, or by many small steps adding up to it, it crosses over: a stream of re-solves (a card gliding, a vessel growing)
// must never walk a label across the screen at full opacity, nor jump it along its vessel (audit, 21 Nov: "SMALL BOWEL" slid 38 px, "Portal vein" 28 px).
// A label that must go (no longer wanted) or a picture that was cut (`hold`) fades out at once and nothing new starts until the hold is over. Linear fades, on the one clock.
// Pure: no DOM; the layer reads `frame` and writes transform and opacity.
import { FADE } from './alpha.ts';
import type { Placement } from './solver.ts';

export interface Want {
  p: Placement;
  dim: boolean;
  /** What the label says besides its place (the form's words, its unit, change badge, alert, reversal mark): a new key is new words, crossed over as a move is. */
  key?: string;
  /** What the label wears besides its words (the colour the slide gives it, the velocity lens's tint, the Doppler gate's weight): a new look is crossed over as new words are. Refreshed every frame from the live label; the old picture keeps its own in `snap`. */
  look?: string;
  /** What the label said (words, unit, badge, alert, mark) when this place was solved: kept so the picture it leaves can be drawn as it was. */
  snap?: unknown;
}

/** The key a label's picture is known by: its words and its look. */
const keyOf = (w: { key?: string; look?: string }): string => (w.look ? `${w.key ?? ''}|${w.look}` : w.key ?? '');

/** The look a label wears, as the fader keys it: DISCRETE by construction. The slide's tone (a token) and the Doppler gate (on or off) are states; the velocity tint is a colour that follows a reading
 *  smoothly, so only whether there is one is a state (a point that gains or loses its tint crosses over); its colour glides in place with the number and never starts a crossing. */
export const lookKey = (tone: string | null, tinted: boolean, gate: boolean): string => `${tone ?? ''}|${tinted ? 't' : ''}|${gate ? 1 : 0}`;

/** The picture a label is leaving. */
export interface Ghost { p: Placement; key: string; snap: unknown }

export interface Shown {
  /** The placement being drawn (the new one while a crossing runs). */
  p: Placement;
  /** Where the picture last stood still or began to cross: small moves are measured from here, so they cannot add up to a slide. */
  ref: Placement;
  key: string;
  snap: unknown;
  /** 0..1 */
  alpha: number;
  /** 0 bright .. 1 dim */
  dim: number;
  /** The picture the label is leaving while it crosses over to `p` (null when it is not crossing). */
  from: Ghost | null;
  /** The new picture's share while crossing (`inWeight` of the time), 1 when not crossing. */
  mix: number;
  /** The old picture's share while crossing (`outWeight`), 0 when not crossing. */
  oldMix: number;
  /** Crossing progress 0..1, linear in time. */
  u: number;
}

/** The 2D camera's quintic smoothstep 6t^5 - 15t^4 + 10t^3 (ui/ease.js easeMove): the weights a crossing runs on. */
export const easeMove = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));

/** The share of the crossing the old picture has gone by (Mohammad, 22 Nov: "Hepatic artery" twice, both half pale): the new one comes in as the old one is nearly out, never two equal copies. Mirror images:
 *  outWeight(u) = inWeight(1 - u), so a crossing turned round at u carries on from where each picture is, with no jump. At the middle each is 0.27 and together 0.55: nothing blinks, and no frame has two copies above 0.3. */
export const CROSS_SPAN = 0.8;
export const inWeight = (u: number): number => easeMove((u - (1 - CROSS_SPAN)) / CROSS_SPAN);
export const outWeight = (u: number): number => inWeight(1 - u);

/** Whether two placements are one spot (the same form and leader, the box within FADE.movePx of where it stood against its dot). */
export const samePlace = (a: Placement, b: Placement): boolean =>
  a.form === b.form && Math.abs(a.dx - b.dx) <= FADE.movePx && Math.abs(a.dy - b.dy) <= FADE.movePx && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5 && a.leader === b.leader && Math.abs(a.au - b.au) < 0.01;

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
      if (!this.st.has(id) && !hold) this.st.set(id, { p: w.p, ref: w.p, key: keyOf(w), snap: w.snap, alpha: 0, dim: w.dim ? 1 : 0, from: null, mix: 1, oldMix: 0, u: 1 });
    }
    for (const [id, s] of this.st) {
      const w = wants.get(id);
      const target = hold || !w ? 0 : 1;
      // a new place or new words: cross over from the old picture to the new (an invisible label simply takes it)
      if (w && !hold) {
        const key = keyOf(w);
        const moved = !samePlace(s.p, w.p), reworded = key !== s.key;
        if (moved || reworded) {
          const invisible = s.alpha <= 0.001;
          const small = !reworded && s.p.form === w.p.form && s.p.leader === w.p.leader && !apart(s.p, w.p) && Math.abs(s.p.au - w.p.au) < 0.01
            && Math.abs(s.ref.dx - w.p.dx) <= FADE.smallPx && Math.abs(s.ref.dy - w.p.dy) <= FADE.smallPx;
          if (small) { s.p = w.p; s.key = key; s.snap = w.snap; s.from = null; s.mix = 1; s.oldMix = 0; s.u = 1; }
          else if (invisible || s.p.form < 0) { s.p = w.p; s.ref = w.p; s.key = key; s.snap = w.snap; s.from = null; s.mix = 1; s.oldMix = 0; s.u = 1; }
          else if (s.from && key === s.from.key && samePlace(s.from.p, w.p)) {
            // wanted back where the picture it is leaving stands: the crossing turns round from where it is (the two pictures swap parts, u becomes 1 - u: neither jumps), never begins again
            const back = s.from;
            s.from = { p: s.p, key: s.key, snap: s.snap };
            s.p = back.p; s.ref = back.p; s.key = back.key; s.snap = w.snap; s.u = 1 - s.u; s.mix = inWeight(s.u); s.oldMix = outWeight(s.u);
          } else {
            // (begun from the picture that stands; a crossing still running keeps one ghost only, the stronger of its two pictures)
            s.from = s.from && s.oldMix > s.mix ? s.from : { p: s.p, key: s.key, snap: s.snap };
            s.p = w.p; s.ref = w.p; s.key = key; s.snap = w.snap; s.u = 0; s.mix = 0; s.oldMix = 1;
          }
        } else { s.snap = w.snap; }
      }
      if (hold) { s.from = null; s.mix = 1; s.oldMix = 0; s.u = 1; }
      if (s.from) { s.u = Math.min(1, s.u + cross); s.mix = inWeight(s.u); s.oldMix = outWeight(s.u); if (s.u >= 1) { s.from = null; s.mix = 1; s.oldMix = 0; } else busy = true; }
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

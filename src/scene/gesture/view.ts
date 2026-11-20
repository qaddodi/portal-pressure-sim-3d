import type { View } from './ease.ts';

// The hand's view of the figure: a zoom k about the middle of the free room and a pan (x, y) in canvas pixels, on top of the shot. Pure maths, ported from the
// 2D app's stage gestures (src/ui/stage-gestures.js there): the zoom limits and their stretch, the rubber band past the figure, the nearest resting place.
//
// Screen position of a figure point whose place in the shot's own framing is p0:   p = c + pan + k (p0 - c),   c = the middle of the free room.
// (The camera does exactly this: `camera.zoom = k` scales about the projection centre, and the pan moves the projection centre.)

export interface Pt { x: number; y: number }
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Zoom limits (the 2D app's K_MIN and K_MAX). */
export const K_MIN = 0.6, K_MAX = 6;
/** At or below this zoom the view is "at the fit": its resting place is the shot's own framing. */
export const FIT_K = 1.001;
/** The rubber band eases toward this share of the stage (2D: 40 %). */
export const BAND = 0.4;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** The zoom a pinch shows: past the limits it stretches a little (exponent .3) and springs back when the hand lets go. */
export const softK = (k: number, kMin = K_MIN): number => (k > K_MAX ? K_MAX * Math.pow(k / K_MAX, 0.3) : k < kMin ? kMin * Math.pow(k / kMin, 0.3) : k);

/** The zoom inside the limits, where the spring-back puts it. */
export const limitK = (k: number, kMin = K_MIN): number => clamp(k, kMin, K_MAX);

/** The view after zooming by `factor` about the canvas point `at`, with `c` the middle of the free room: the figure under `at` stays under it. */
export function zoomAbout(v: View, factor: number, at: Pt, c: Pt, out: View = { k: 1, x: 0, y: 0 }): View {
  out.x = at.x - c.x - factor * (at.x - c.x - v.x);
  out.y = at.y - c.y - factor * (at.y - c.y - v.y);
  out.k = v.k * factor;
  return out;
}

/** The pan that keeps the figure point under `m` (a pinch's midpoint) under it at zoom `k`: `anchor` is that point's place in the shot's framing, taken at the pinch's start. */
export function panFor(m: Pt, anchor: Pt, k: number, c: Pt, out: Pt = { x: 0, y: 0 }): Pt {
  out.x = m.x - c.x - k * (anchor.x - c.x);
  out.y = m.y - c.y - k * (anchor.y - c.y);
  return out;
}

/** The place in the shot's own framing of the figure point that is at canvas point `m` now. */
export function anchorAt(m: Pt, v: View, c: Pt, out: Pt = { x: 0, y: 0 }): Pt {
  out.x = c.x + (m.x - c.x - v.x) / v.k;
  out.y = c.y + (m.y - c.y - v.y) / v.k;
  return out;
}

/** The figure's rectangle on screen under view `v`, from its rectangle in the shot's own framing `r0`. */
export function rectUnder(r0: Rect, v: View, c: Pt, out: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 }): Rect {
  out.x0 = c.x + v.x + v.k * (r0.x0 - c.x); out.x1 = c.x + v.x + v.k * (r0.x1 - c.x);
  out.y0 = c.y + v.y + v.k * (r0.y0 - c.y); out.y1 = c.y + v.y + v.k * (r0.y1 - c.y);
  return out;
}

const bandOff = (o: number, L: number, inv: boolean): number => (inv ? Math.atanh(clamp(o / L, -0.999, 0.999)) * L : L * Math.tanh(o / L));

/** The nearest resting place of a view: at the fit zoom the shot's own framing, otherwise the figure may be panned until the middle of the room meets its edge, no further. */
export function hardPan(v: View, r0: Rect, c: Pt, out: View = { k: 1, x: 0, y: 0 }): View {
  if (v.k <= FIT_K) { out.k = v.k; out.x = 0; out.y = 0; return out; }
  const r = rectUnder(r0, v, c);
  out.k = v.k;
  out.x = v.x + (c.x < r.x0 ? c.x - r.x0 : c.x > r.x1 ? c.x - r.x1 : 0);
  out.y = v.y + (c.y < r.y0 ? c.y - r.y0 : c.y > r.y1 ? c.y - r.y1 : 0);
  return out;
}

/** A raw pan put on the rubber band: past the resting place it meets rising resistance (tanh toward 40 % of the stage). */
export function bandPan(v: View, r0: Rect, c: Pt, stage: { w: number; h: number }, inv: boolean, out: View = { k: 1, x: 0, y: 0 }): View {
  const h = hardPan(v, r0, c);
  const Lx = BAND * stage.w, Ly = BAND * stage.h, vx = v.x, vy = v.y, k = v.k;
  out.k = k; out.x = h.x + bandOff(vx - h.x, Lx, inv); out.y = h.y + bandOff(vy - h.y, Ly, inv);
  return out;
}
export const softPan = (v: View, r0: Rect, c: Pt, stage: { w: number; h: number }, out?: View): View => bandPan(v, r0, c, stage, false, out);
export const unsoftPan = (v: View, r0: Rect, c: Pt, stage: { w: number; h: number }, out?: View): View => bandPan(v, r0, c, stage, true, out);

export const IDENTITY: Readonly<View> = { k: 1, x: 0, y: 0 };
export const sameView = (a: View, b: View): boolean => Math.abs(a.k - b.k) < 1e-3 && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;

/** Where the spring-back sends a view the hand let go of: inside the zoom limits, back to the fit framing at or below the fit zoom, and never lost (the middle of the room outside the figure is pulled to its edge). */
export function restingView(v: View, r0: Rect, c: Pt, kMin = K_MIN): View {
  const k = limitK(v.k, kMin);
  if (k <= FIT_K) return { k, x: 0, y: 0 };
  // zooming back inside the limits keeps the figure under the middle of the room, as the 2D spring-back does
  const kept = k === v.k ? v : zoomAbout(v, k / v.k, c, c);
  return hardPan(kept, r0, c);
}

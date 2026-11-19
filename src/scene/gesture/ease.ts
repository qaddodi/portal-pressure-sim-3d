// The 2D app's camera glide maths (src/ui/ease.js there), ported unchanged in behaviour so a hand-placed view eases and springs back the same way.
// A view is { k, x, y }: zoom and pan. Here x and y are CSS pixels of the canvas; the 2D app's are its own view-box units (camMs takes the screen width `w` in
// the same units, so the ratios are the same).

export interface View { k: number; x: number; y: number }
export interface Vel { t: number; dlogk: number; x: number; y: number }

/** The camera's own curve: smootherstep. */
export const easeMove = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));

export const CAM_MS_MIN = 480, CAM_MS_MAX = 900;
const LN2_2 = 2 * Math.LN2; // a doubling of the zoom counts as half a screen, as camMs counts it

/** A glide's time from view `a` to `b`: its reach on screen is the pan in screen widths and the zoom (a doubling counts as half a screen), together. */
export function camMs(a: View, b: View, w: number, max = CAM_MS_MAX): number {
  const pan = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1e-6, w);
  const zoom = Math.abs(Math.log(Math.max(1e-6, b.k) / Math.max(1e-6, a.k))) / LN2_2;
  const d = Math.hypot(pan, zoom);
  return Math.round(Math.min(max, CAM_MS_MIN * Math.max(1, d / 0.5)));
}

/** A glide begun while another still moves starts from where the view is and at the speed it has (nothing snaps, nothing stops dead). */
export const CARRY_MAX = 0.8;

/** The hand's speed along the glide from `from` to `to`, in that glide's own progress per ms; 0 when still or going away. */
export function carryRate(v: Vel | null, from: View, to: View, w: number): number {
  if (!v || !(w > 0) || !(from.k > 0) || !(to.k > 0)) return 0;
  const r = to.k / from.k, lr = Math.log(r), s = Math.abs(lr) < 1e-9 ? 1 : lr / (r - 1);
  const T0 = lr / LN2_2, T1 = ((to.x - from.x) * s) / w, T2 = ((to.y - from.y) * s) / w;
  const tt = T0 * T0 + T1 * T1 + T2 * T2;
  if (tt < 1e-12) return 0;
  const dot = (v.dlogk / LN2_2) * T0 + (v.x / w) * T1 + (v.y / w) * T2;
  return Number.isFinite(dot) ? Math.max(0, dot / tt) : 0;
}

/** The slope a settle starts with so it carries the finger's speed on (between 0 and `max`). */
export function settleSlope(v: number, dist: number, ms: number, max = 3): number {
  if (!dist || !Number.isFinite(v)) return 0;
  const toward = ((dist > 0 ? v : -v) * ms) / Math.abs(dist);
  return Math.min(max, Math.max(0, toward));
}

/** The slope (per glide) at which a view moving at `v` starts its glide `from` to `to` over `ms`. */
export function springSlope(v: Vel | null, from: View, to: View, w: number, ms: number): number {
  if (!v || !(ms > 0)) return 0;
  if (Math.abs(Math.log(to.k / from.k)) < 1e-6) {
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
    return dist > 1e-9 ? settleSlope((v.x * dx + v.y * dy) / dist, dist, ms, CARRY_MAX) : 0;
  }
  return carryRate(v, from, to, w) * ms;
}

/** The glide's progress at its clock `raw`, its eased value `eased`, with the old speed as `c`. */
export const carried = (eased: number, raw: number, c: number): number => (c > 0 ? Math.min(1, eased + Math.min(c, CARRY_MAX) * raw * (1 - raw) * (1 - raw)) : eased);

/** Samples the hand's speed with every step it gives the view; take() hands it to the spring-back that follows (null if older than `maxAge`). */
export function createGlideTracker() {
  const vel: Vel = { t: 0, dlogk: 0, x: 0, y: 0 }, last = { t: 0, k: 1, x: 0, y: 0 };
  let haveVel = false, haveLast = false;
  return {
    begin() { haveLast = false; haveVel = false; },
    sample(cam: View, now: number) {
      if (haveLast && now > last.t && now - last.t < 100) {
        const dt = now - last.t;
        vel.t = now; vel.dlogk = Math.log(cam.k / last.k) / dt; vel.x = (cam.x - last.x) / dt; vel.y = (cam.y - last.y) / dt; haveVel = true;
      }
      last.t = now; last.k = cam.k; last.x = cam.x; last.y = cam.y; haveLast = true;
    },
    take(now: number, maxAge = 80): Vel | null { return haveVel && now - vel.t < maxAge ? vel : null; },
  };
}

/** Lerp of two views as the 2D app does it: zoom in the log, pan tied to the zoom so the glide runs along one path. */
export function lerpView(a: View, b: View, p: number, out: View = { k: 1, x: 0, y: 0 }): View {
  const k = a.k * Math.pow(b.k / a.k, p);
  const r = b.k / a.k, lr = Math.log(r);
  // fraction of the pan done at progress p when the zoom is geometric: ties pan to zoom (equal to p when the zoom does not change)
  const f = Math.abs(lr) < 1e-9 ? p : (k / a.k - 1) / (r - 1);
  out.k = k; out.x = a.x + (b.x - a.x) * f; out.y = a.y + (b.y - a.y) * f;
  return out;
}

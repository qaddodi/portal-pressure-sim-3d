// The Baveno VIII stiffness × platelet zones, drawn once for every chart that shows them (ported from the 2D app's baveno-zones.js and the zones
// graph of tool-criteria.js). One geometry (Baveno VIII 1.15, 1.16, 1.19): CSPH is ruled out at LSM ≤15 kPa with platelets ≥150 ×10³/µL, ruled in
// at ≥25 kPa, the rest is indeterminate; a patient who cannot take an NSBB can skip the screening EGD at LSM <20 kPa with platelets ≥150 (the hatch).
import type { ChartCtx } from '../Chart.tsx';
import { linear } from '../axes.ts';
import { look } from '../looks.ts';
import type { Frame, Shape } from '../scene.ts';

/** The cut-offs, in kPa and ×10³/µL. */
export const BAVENO = { out: 15, in: 25, egd: 20, plt: 150 } as const;
/** The axis writing both charts share: the ranges (so 15 kPa stands at the same place on both), the numbers along the foot, the one up the left, the two names. */
export const BAVENO_AXES = { x: [5, 35] as [number, number], y: [50, 250] as [number, number], xTicks: [15, 20, 25], yTick: [BAVENO.plt, '150K'] as [number, string], xName: 'LSM, kPa', yName: 'PLT' };

export type Rate = 'ok' | 'mid' | 'hi';
export interface ZoneRect { rate: Rate; x: [number, number]; y: [number, number]; name?: string; at?: [number, number] }

/** The zones as plain rectangles that never overlap, each out to the ends of the ranges. */
export function bavenoRects(x: [number, number], y: [number, number]): ZoneRect[] {
  const [x0, x1] = x, [y0, y1] = y, { out, in: rin, plt } = BAVENO;
  return [
    { rate: 'ok', x: [x0, out], y: [plt, y1] },
    { rate: 'mid', x: [out, rin], y: [y0, y1] },
    { rate: 'mid', x: [x0, out], y: [y0, plt] },
    { rate: 'hi', x: [rin, x1], y: [y0, y1] },
  ];
}
/** The area where the EGD can be skipped (LSM under 20 kPa, platelets 150 or more), to the ends of the ranges. */
export const bavenoHatch = (x: [number, number], y: [number, number]) => ({ x: [x[0], BAVENO.egd] as [number, number], y: [BAVENO.plt, y[1]] as [number, number] });

/** The plot's height for a width, the same on every chart of these zones: a taller one under 420 px (a phone), a flatter one above. */
export const plotHeight = (W: number) => Math.round(W * (W < 420 ? 0.46 : 0.34));
/** The corner radius of a plot w × h px: 10 px, less on a plot too small for it. */
export const plotR = (w: number, h: number) => Math.max(0, Math.min(10, w / 4, h / 4));

export interface ZonesFig {
  x: [number, number]; y: [number, number]; zones: ZoneRect[]; hatch: { x: [number, number]; y: [number, number] } | null;
  xTicks: number[]; yTick: [number, string]; xName: string; yName: string;
}
export const ZONES: Record<string, ZonesFig> = {
  'first-visit': {
    x: BAVENO_AXES.x, y: BAVENO_AXES.y,
    zones: bavenoRects(BAVENO_AXES.x, BAVENO_AXES.y).map((z, i) => ({ ...z, ...([{ name: 'No CSPH', at: [10, 190] }, { name: 'Indeterminate', at: [20, 112] }, {}, { name: 'CSPH', at: [30, 150] }] as Partial<ZoneRect>[])[i] })),
    hatch: bavenoHatch(BAVENO_AXES.x, BAVENO_AXES.y),
    xTicks: BAVENO_AXES.xTicks, yTick: BAVENO_AXES.yTick, xName: BAVENO_AXES.xName, yName: BAVENO_AXES.yName,
  },
};

/** Diagonal stripes ("/", `w` thick, `gap` apart across) over a rectangle, as segments clipped to it: [x1, y1, x2, y2]. */
export function hatchSegments(x: number, y: number, w: number, h: number, gap = 7): number[][] {
  // lines x + y = c (a "/" runs from bottom left to top right): the perpendicular spacing is gap, so c steps by gap·√2
  const step = gap * Math.SQRT2, out: number[][] = [];
  const cMin = x + y, cMax = x + w + y + h;
  for (let c = Math.ceil(cMin / step) * step; c <= cMax; c += step) {
    // clip x + y = c to the box: x from max(x, c - (y + h)) to min(x + w, c - y)
    const xa = Math.max(x, c - (y + h)), xb = Math.min(x + w, c - y);
    if (xb - xa > 0.01) out.push([xa, c - xa, xb, c - xb]);
  }
  return out;
}

/** The 2D hatch's pattern is a 7 px tile turned 45° holding one 2 px stripe: so the stripes are the bands c ≤ x + y ≤ c + 2·√2 with c a multiple of 7·√2. Each stripe is
 *  returned as the filled polygon (a sliver) it covers inside the rectangle, [x0, y0, x1, y1, …], never as a stroked line (no cap, no clipped end). */
export function hatchSlivers(x: number, y: number, w: number, h: number, period = 7, thick = 2): number[][] {
  const step = period * Math.SQRT2, band = thick * Math.SQRT2, out: number[][] = [];
  // clip the polygon to the half plane (x + y) * sign >= edge * sign
  const cut = (poly: number[][], edge: number, sign: 1 | -1): number[][] => {
    const res: number[][] = [], d = (p: number[]) => (p[0]! + p[1]! - edge) * sign;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!, da = d(a), db = d(b);
      if (da >= 0) res.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); res.push([a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t]); }
    }
    return res;
  };
  const box = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  for (let c = Math.floor((x + y - band) / step) * step; c <= x + w + y + h; c += step) {
    const poly = cut(cut(box, c, 1), c + band, -1);
    if (poly.length >= 3) out.push(poly.flat());
  }
  return out;
}

/** The zones graph of a card of width ctx.w as a frame (the card never changes size with the case: the height follows the width only). */
export function zonesFrame(fig: ZonesFig, c: ChartCtx, label: string, patient: { lsm?: number | null; plt?: number | null } | null = null): Frame {
  const W = c.w, ph = plotHeight(W);
  const fs = Math.max(12, Math.min(14, c.type.sm)), sm = 12;
  const X = linear(fig.x[0], fig.x[1], 0, W), Y = linear(fig.y[0], fig.y[1], ph, 0);
  const lk = (key: string, state: Record<string, unknown> = {}) => look(c, { host: 'crit' }, key, state);
  const shapes: Shape[] = [{ k: 'clip', x: 0, y: 0, w: W, h: ph, r: plotR(W, ph) }];
  for (const z of fig.zones) shapes.push({ k: 'rect', x: X(z.x[0]), y: Y(z.y[1]), w: X(z.x[1]) - X(z.x[0]), h: Y(z.y[0]) - Y(z.y[1]), fill: lk('crit.zone', { rate: z.rate }).fill });
  if (fig.hatch) {
    const h = fig.hatch, hatch = lk('crit.hatch').fill!;
    for (const pts of hatchSlivers(X(h.x[0]), Y(h.y[1]), X(h.x[1]) - X(h.x[0]), Y(h.y[0]) - Y(h.y[1]))) shapes.push({ k: 'path', pts, closed: true, fill: hatch });
  }
  shapes.push({ k: 'unclip' });
  const word = (x: number, y: number, s: string, quiet: boolean, anchor: 'start' | 'middle' | 'end', size: number): Shape => {
    const l = lk('crit.word', { q: quiet });
    return { k: 'text', x, y, s, size, weight: l.weight, color: l.fill!, anchor, halo: l.halo };
  };
  for (const z of fig.zones) if (z.name && z.at) shapes.push(word(X(z.at[0]), Y(z.at[1]) + fs * 0.36, z.name, false, 'middle', fs));
  const by = ph - 8;
  for (const k of fig.xTicks) shapes.push(word(X(k), by, String(k), false, 'middle', sm));
  shapes.push(word(W - 8, by, fig.xName, true, 'end', sm));
  shapes.push(word(8, Y(fig.yTick[0]) + 4, fig.yTick[1], false, 'start', sm));
  shapes.push(word(8, 8 + sm, fig.yName, true, 'start', sm));
  // the patient: a dot where his LSM and platelets stand (Stiffness 7, capture 52ef8e63: the slide classifies patients and classified none); held inside the plot by its radius
  const dot = patientDot(fig, patient, W, ph);
  if (dot) { const l = lk('crit.word', { q: false }); shapes.push({ k: 'circle', cx: dot.x, cy: dot.y, r: 5.5, fill: l.fill, pen: { color: l.halo?.color ?? l.fill!, w: 2 } }); }
  return { w: W, h: ph, shapes, label };
}

/** Where a patient's LSM (kPa) and platelets (x10^3/uL) stand in a plot W x ph px; null without both. A reading past the axes stands on the edge, never outside the plot. */
export function patientDot(fig: ZonesFig, patient: { lsm?: number | null; plt?: number | null } | null, W: number, ph: number): { x: number; y: number } | null {
  const lsm = patient?.lsm, plt = patient?.plt;
  if (typeof lsm !== 'number' || typeof plt !== 'number' || !Number.isFinite(lsm) || !Number.isFinite(plt)) return null;
  const r = 5.5 + 2, X = linear(fig.x[0], fig.x[1], 0, W), Y = linear(fig.y[0], fig.y[1], ph, 0);
  return { x: Math.min(W - r, Math.max(r, X(lsm))), y: Math.min(ph - r, Math.max(r, Y(plt))) };
}

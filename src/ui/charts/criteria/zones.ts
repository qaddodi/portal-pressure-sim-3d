// The Baveno VIII stiffness × platelet zones, drawn once for every chart that shows them (ported from the 2D app's baveno-zones.js and the zones
// graph of tool-criteria.js). One geometry (Baveno VIII 1.15, 1.16, 1.19): CSPH is ruled out at LSM ≤15 kPa with platelets ≥150 ×10³/µL, ruled in
// at ≥25 kPa, the rest is indeterminate; a patient who cannot take an NSBB can skip the screening EGD at LSM <20 kPa with platelets ≥150 (the hatch).
import type { ChartCtx } from '../Chart.tsx';
import { linear } from '../axes.ts';
import { withAlpha, mix } from '../colour.ts';
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

/** The zones graph of a card of width ctx.w as a frame (the card never changes size with the case: the height follows the width only). */
export function zonesFrame(fig: ZonesFig, c: ChartCtx, label: string): Frame {
  const { pal } = c, W = c.w, ph = plotHeight(W);
  const fs = Math.max(12, Math.min(14, c.type.sm)), sm = 12;
  const X = linear(fig.x[0], fig.x[1], 0, W), Y = linear(fig.y[0], fig.y[1], ph, 0);
  const text = pal.tok('text'), halo = { color: pal.tok('surface'), w: 3 };
  const tint = (r: Rate) => (r === 'ok' ? mix('srgb', pal.tok('ok'), 34, [0, 0, 0, 0]) : r === 'mid' ? mix('srgb', pal.tok('caution'), 28, [0, 0, 0, 0]) : mix('srgb', pal.tok('danger'), 32, [0, 0, 0, 0]));
  const shapes: Shape[] = [{ k: 'clip', x: 0, y: 0, w: W, h: ph, r: plotR(W, ph) }];
  for (const z of fig.zones) shapes.push({ k: 'rect', x: X(z.x[0]), y: Y(z.y[1]), w: X(z.x[1]) - X(z.x[0]), h: Y(z.y[0]) - Y(z.y[1]), fill: tint(z.rate) });
  if (fig.hatch) {
    const h = fig.hatch;
    for (const [x1, y1, x2, y2] of hatchSegments(X(h.x[0]), Y(h.y[1]), X(h.x[1]) - X(h.x[0]), Y(h.y[0]) - Y(h.y[1]))) shapes.push({ k: 'line', x1: x1!, y1: y1!, x2: x2!, y2: y2!, pen: { color: withAlpha(text, 0.3), w: 2 } });
  }
  shapes.push({ k: 'unclip' });
  const word = (x: number, y: number, s: string, quiet: boolean, anchor: 'start' | 'middle' | 'end', size: number): Shape => ({
    k: 'text', x, y, s, size, weight: quiet ? 500 : 600, color: quiet ? pal.tok('text-2') : text, anchor, halo,
  });
  for (const z of fig.zones) if (z.name && z.at) shapes.push(word(X(z.at[0]), Y(z.at[1]) + fs * 0.36, z.name, false, 'middle', fs));
  const by = ph - 8;
  for (const k of fig.xTicks) shapes.push(word(X(k), by, String(k), false, 'middle', sm));
  shapes.push(word(W - 8, by, fig.xName, true, 'end', sm));
  shapes.push(word(8, Y(fig.yTick[0]) + 4, fig.yTick[1], false, 'start', sm));
  shapes.push(word(8, 8 + sm, fig.yName, true, 'start', sm));
  return { w: W, h: ph, shapes, label };
}

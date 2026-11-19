// The forest plot and the arm bars as frames (looks: chart-looks/forest.js).
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { mix, type Rgba } from '../colour.ts';
import type { Frame, Shape } from '../scene.ts';
import { TYPE, armsLayout, forestLayout, forestWords, sizeOf, type ForestOpts } from './model.ts';
import type { Trial } from '../trial/model.ts';

const CLEAR: Rgba = [0, 0, 0, 0];

export function forestFrame(trials: readonly (Trial | null)[], c: ChartCtx, opts: ForestOpts = {}): { frame: Frame; hits: { id: string; y: number; h: number }[] } {
  const { pal } = c, W = Math.max(200, c.w), f = c.type.sm;
  const L = forestLayout(trials, W, f, measure, opts);
  const ink = pal.tok('text'), quiet = pal.tok('text-3'), muted = mix('srgb', ink, 42, CLEAR);
  const ci = (dim: boolean) => ({ color: dim ? muted : ink, w: 2, cap: 'round' as const });
  const lineOf: Record<string, { color: Rgba; w: number; cap?: 'round' }> = {
    'forest.ci': ci(false), 'forest.ci.dim': ci(true), 'forest.ref': { color: mix('srgb', ink, 38, CLEAR), w: 1 },
    'forest.axis': { color: mix('srgb', pal.tok('border-strong'), 80, CLEAR), w: 1 }, 'forest.rule': { color: pal.tok('hairline'), w: 1 },
  };
  const wordInk: Record<string, Rgba> = {
    'forest.grp': quiet, 'forest.nm': ink, 'forest.nm.dim': quiet, 'forest.of': quiet, 'forest.val': pal.tok('text-2'), 'forest.val.dim': quiet, 'forest.tick': quiet, 'forest.ends': quiet,
    'forest.why': pal.tok('text-2'), 'forest.dt': ink, 'forest.dx': pal.tok('text-2'), 'forest.k': quiet,
  };
  const shapes: Shape[] = [];
  for (const r of L.rects.filter((r) => r.look === 'forest.sel')) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: mix('srgb', ink, 7, CLEAR) });
  for (const l of L.lines) shapes.push({ k: 'line', x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, pen: lineOf[l.look]! });
  for (const r of L.rects.filter((r) => r.look !== 'forest.sel')) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: r.look === 'forest.mk' ? ink : muted });
  for (const s of L.texts) shapes.push({ k: 'text', x: s.x, y: s.y, s: s.t, size: sizeOf(s.look, f), weight: TYPE[s.look]![0], color: wordInk[s.look]!, anchor: s.anchor });
  return { frame: { w: W, h: L.H, shapes, label: forestWords(trials) }, hits: L.hits };
}

/** A trial's arms as bars (the Trials tab's open trial). */
export function armsFrame(t: Trial | null, c: ChartCtx): Frame {
  const { pal } = c, W = Math.max(160, c.w), f = c.type.sm;
  const L = armsLayout(t, W, f, measure);
  const ink = pal.tok('text'), halo = { color: pal.tok('surface'), w: 3 };
  const shapes: Shape[] = [];
  for (const r of L.rects) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: r.look === 'forest.track' ? mix('srgb', ink, 9, CLEAR) : mix('srgb', pal.tok(r.tone!), 72, CLEAR) });
  for (const s of L.texts) shapes.push({ k: 'text', x: s.x, y: s.y, s: s.t, size: sizeOf(s.look, f), weight: TYPE[s.look]![0], color: s.look === 'forest.armn' ? pal.tok('text-2') : ink, anchor: s.anchor, ...(s.look === 'forest.pct' ? { halo } : {}) });
  return { w: W, h: L.H, shapes, label: t ? `${t.short ?? t.name}: ${t.arms.map((a) => `${a.label} ${a.rate}%`).join(', ')}` : '' };
}

// The forest plot and the arm bars as frames (looks: chart-looks/forest.js).
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { look } from '../looks.ts';
import type { Frame, Shape } from '../scene.ts';
import { armsLayout, forestLayout, forestWords, type ForestOpts } from './model.ts';
import type { Trial } from '../trial/model.ts';

export function forestFrame(trials: readonly (Trial | null)[], c: ChartCtx, opts: ForestOpts = {}): { frame: Frame; hits: { id: string; y: number; h: number }[] } {
  const W = Math.max(200, c.w), f = c.type.sm;
  const L = forestLayout(trials, W, f, measure, opts);
  const lk = (key: string) => look(c, { host: 'forest' }, key);
  const shapes: Shape[] = [];
  for (const r of L.rects.filter((r) => r.look === 'forest.sel')) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: lk(r.look).fill });
  for (const l of L.lines) { const k = lk(l.look); shapes.push({ k: 'line', x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, pen: { color: k.stroke!, w: k.width ?? 1, cap: k.cap } }); }
  for (const r of L.rects.filter((r) => r.look !== 'forest.sel')) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: lk(r.look).fill });
  for (const s of L.texts) { const k = lk(s.look); shapes.push({ k: 'text', x: s.x, y: s.y, s: s.t, size: k.size!, weight: k.weight, color: k.fill!, anchor: s.anchor }); }
  return { frame: { w: W, h: L.H, shapes, label: forestWords(trials) }, hits: L.hits };
}

/** A trial's arms as bars (the Trials tab's open trial). */
export function armsFrame(t: Trial | null, c: ChartCtx): Frame {
  const W = Math.max(160, c.w), f = c.type.sm;
  const L = armsLayout(t, W, f, measure);
  const lk = (key: string, params: Record<string, string> = {}) => look(c, { host: 'forest' }, key, {}, params);
  const shapes: Shape[] = [];
  for (const r of L.rects) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: lk(r.look, r.tone ? { tone: r.tone } : {}).fill });
  for (const s of L.texts) { const k = lk(s.look); shapes.push({ k: 'text', x: s.x, y: s.y, s: s.t, size: k.size!, weight: k.weight, color: k.fill!, anchor: s.anchor, ...(k.halo ? { halo: k.halo } : {}) }); }
  return { w: W, h: L.H, shapes, label: t ? `${t.short ?? t.name}: ${t.arms.map((a) => `${a.label} ${a.rate}%`).join(', ')}` : '' };
}

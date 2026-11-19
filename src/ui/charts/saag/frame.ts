// The SAAG plane as a frame (looks: chart-looks/saag.js).
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { look } from '../looks.ts';
import type { Frame, Shape } from '../scene.ts';
import { saagLayout, saagWords, type Pt } from './model.ts';

export function saagFrame(pts: readonly Pt[], c: ChartCtx, o: { read?: string | null; source?: boolean; plotH?: number; room?: number } = {}): Frame {
  const W = Math.max(200, c.w), f = c.type.sm;
  let L = saagLayout(W, f, measure, pts, o);
  // the plot gives its height up when the card's room asks for less, never the words
  if (o.room && o.room > 0 && L.H > o.room) L = saagLayout(W, f, measure, pts, { ...o, plotH: Math.max(100, L.plot.ph - (L.H - o.room)) });
  const lk = (key: string) => look(c, { host: 'saag' }, key);
  const shapes: Shape[] = [];
  for (const r of L.rects) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: lk(r.look).fill });
  for (const l of L.lines) { const k = lk(l.look); shapes.push({ k: 'path', pts: l.pts, pen: { color: k.stroke!, w: k.width ?? 1, dash: k.dash } }); }
  for (const d of L.dots) { const k = lk(d.look); shapes.push(k.stroke ? { k: 'circle', cx: d.cx, cy: d.cy, r: d.r, pen: { color: k.stroke, w: k.width ?? 1 } } : { k: 'circle', cx: d.cx, cy: d.cy, r: d.r, fill: k.fill }); }
  for (const s of L.texts) { const k = lk(s.look); shapes.push({ k: 'text', x: s.x, y: s.y, s: s.t, size: k.size!, weight: k.weight, color: k.fill!, anchor: s.anchor, ...(k.halo ? { halo: k.halo } : {}) }); }
  return { w: W, h: L.H, shapes, label: saagWords(pts) };
}

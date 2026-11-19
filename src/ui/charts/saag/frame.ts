// The SAAG plane as a frame (looks: chart-looks/saag.js).
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { mix } from '../colour.ts';
import type { Frame, Shape } from '../scene.ts';
import { TYPE, saagLayout, saagWords, sizeOf, type Pt } from './model.ts';

export function saagFrame(pts: readonly Pt[], c: ChartCtx, o: { read?: string | null; source?: boolean; plotH?: number; room?: number } = {}): Frame {
  const { pal } = c, W = Math.max(200, c.w), f = c.type.sm;
  let L = saagLayout(W, f, measure, pts, o);
  // the plot gives its height up when the card's room asks for less, never the words
  if (o.room && o.room > 0 && L.H > o.room) L = saagLayout(W, f, measure, pts, { ...o, plotH: Math.max(100, L.plot.ph - (L.H - o.room)) });
  const clear: [number, number, number, number] = [0, 0, 0, 0];
  const text = pal.tok('text');
  const fill: Record<string, ReturnType<typeof pal.tok>> = { 'saag.zone': mix('srgb', text, 8, clear), 'saag.zone.hi': mix('srgb', text, 5, clear), 'saag.pt': pal.tok('accent'), 'saag.pt.cur': text };
  const ink: Record<string, ReturnType<typeof pal.tok>> = { 'saag.ql': pal.tok('text-3'), 'saag.ax': pal.tok('text-3'), 'saag.axl': pal.tok('text-2'), 'saag.pl': text, 'saag.pls': pal.tok('text-3'), 'saag.read': pal.tok('text-2'), 'saag.src': pal.tok('text-3') };
  const halo = { color: pal.tok('surface'), w: 3 };
  const shapes: Shape[] = [];
  for (const r of L.rects) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: fill[r.look]! });
  for (const l of L.lines) shapes.push({ k: 'path', pts: l.pts, pen: l.look === 'saag.cut' ? { color: pal.tok('text-3'), w: 1.2, dash: [4, 3] } : { color: mix('srgb', pal.tok('border-strong'), 80, clear), w: 1 } });
  for (const d of L.dots) shapes.push(d.look === 'saag.ptx' ? { k: 'circle', cx: d.cx, cy: d.cy, r: d.r, pen: { color: pal.tok('text-3'), w: 1.5 } } : { k: 'circle', cx: d.cx, cy: d.cy, r: d.r, fill: fill[d.look]! });
  for (const s of L.texts) shapes.push({ k: 'text', x: s.x, y: s.y, s: s.t, size: sizeOf(s.look, f), weight: TYPE[s.look]![0], color: ink[s.look]!, anchor: s.anchor, ...(s.look === 'saag.pl' || s.look === 'saag.pls' ? { halo } : {}) });
  return { w: W, h: L.H, shapes, label: saagWords(pts) };
}

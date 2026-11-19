// The stiffness bar as a frame (looks: chart-looks/stiff.js).
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { mix } from '../colour.ts';
import type { Frame, Shape } from '../scene.ts';
import { TYPE, sizeOf, stiffLayout, stiffWords, type StiffIn } from './model.ts';

const CLEAR = [0, 0, 0, 0] as const;

export function stiffFrame(a: StiffIn, c: ChartCtx): Frame {
  const { pal } = c, W = Math.max(160, c.w), f = c.type.sm;
  const L = stiffLayout(W, f, measure, a);
  const tint = (name: string, pct: number) => mix('srgb', pal.tok(name), pct, [...CLEAR]);
  const ink = (name: string) => mix('srgb', pal.tok(name), 72, pal.tok('text'));
  const fillOf: Record<string, ReturnType<typeof tint>> = { 'stiff.z0': tint('ok', 24), 'stiff.z1': tint('caution', 20), 'stiff.z2': tint('caution', 36), 'stiff.z3': tint('danger', 34), 'stiff.zn': tint('text-3', 18), 'stiff.mk': pal.tok('text') };
  const word: Record<string, ReturnType<typeof tint>> = { 'stiff.tk': pal.tok('text-3'), 'stiff.zl': pal.tok('text-2'), 'stiff.plt': pal.tok('text-2'), 'stiff.note': pal.tok('text-3'), 'stiff.v.ok': ink('ok'), 'stiff.v.mid': ink('caution'), 'stiff.v.hi': ink('danger') };
  const shapes: Shape[] = [];
  // the mark's two pieces always stand in the list (clear with no reading), so a new reading glides along the bar
  for (const r of L.rects.filter((r) => r.look !== 'stiff.mk')) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: fillOf[r.look]! });
  const stem = L.rects.find((r) => r.look === 'stiff.mk');
  shapes.push(L.mark ? { k: 'path', pts: L.mark, closed: true, fill: fillOf['stiff.mk']! } : { k: 'path', pts: [0, 0, 0, 0, 0, 0], closed: true, fill: [...CLEAR] });
  shapes.push(stem ? { k: 'rect', x: stem.x, y: stem.y, w: stem.w, h: stem.h, r: stem.r, fill: fillOf['stiff.mk']! } : { k: 'rect', x: 0, y: 0, w: 0, h: 0, fill: [...CLEAR] });
  for (const s of L.texts) {
    const base = s.look.startsWith('stiff.v.') ? 'stiff.v' : s.look;
    shapes.push({ k: 'text', x: s.x, y: s.y, s: s.t, size: sizeOf(base, f), weight: TYPE[base]![0], color: word[s.look]!, anchor: s.anchor });
  }
  return { w: W, h: L.H, shapes, label: stiffWords(a.lsm ?? null, a.plt ?? null, a.organ, a.ctx) };
}

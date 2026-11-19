// The stiffness bar as a frame (looks: chart-looks/stiff.js).
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { look } from '../looks.ts';
import type { Frame, Shape } from '../scene.ts';
import { stiffLayout, stiffWords, type StiffIn } from './model.ts';

const CLEAR = [0, 0, 0, 0] as const;

export function stiffFrame(a: StiffIn, c: ChartCtx): Frame {
  const W = Math.max(160, c.w), f = c.type.sm;
  const L = stiffLayout(W, f, measure, a);
  const lk = (key: string) => look(c, { host: 'stiff' }, key);
  const mark = lk('stiff.mk').fill!;
  const shapes: Shape[] = [];
  // the mark's two pieces always stand in the list (clear with no reading), so a new reading glides along the bar
  for (const r of L.rects.filter((r) => r.look !== 'stiff.mk')) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: lk(r.look).fill });
  const stem = L.rects.find((r) => r.look === 'stiff.mk');
  shapes.push(L.mark ? { k: 'path', pts: L.mark, closed: true, fill: mark } : { k: 'path', pts: [0, 0, 0, 0, 0, 0], closed: true, fill: [...CLEAR] });
  shapes.push(stem ? { k: 'rect', x: stem.x, y: stem.y, w: stem.w, h: stem.h, r: stem.r, fill: mark } : { k: 'rect', x: 0, y: 0, w: 0, h: 0, fill: [...CLEAR] });
  for (const s of L.texts) {
    const l = lk(s.look);
    shapes.push({ k: 'text', x: s.x, y: s.y, s: s.t, size: l.size!, weight: l.weight, color: l.fill!, anchor: s.anchor });
  }
  return { w: W, h: L.H, shapes, label: stiffWords(a.lsm ?? null, a.plt ?? null, a.organ, a.ctx) };
}

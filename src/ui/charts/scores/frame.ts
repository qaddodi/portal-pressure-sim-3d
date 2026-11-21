// The liver-function card as a frame (looks: the stiffness bar's, chart-looks/stiff.js: the same tints and words, so the two bars read as one family).
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { look } from '../looks.ts';
import type { Frame, Shape } from '../scene.ts';
import { scoresLayout, scoresWords, type Scores } from './model.ts';

const CLEAR = [0, 0, 0, 0] as const;

export function scoresFrame(s: Scores, c: ChartCtx, o: { note?: boolean } = {}): Frame {
  const W = Math.max(160, c.w), f = c.type.sm;
  const L = scoresLayout(W, f, measure, s, o.note !== false);
  const lk = (key: string) => look(c, { host: 'stiff' }, key);
  const shapes: Shape[] = [];
  for (const r of L.rects.filter((r) => r.look !== 'stiff.mk')) shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: lk(r.look).fill });
  const mark = lk('stiff.mk').fill!, stem = L.rects.find((r) => r.look === 'stiff.mk');
  // (the mark's two pieces always stand in the list, clear with no total, so a new total glides along the bar)
  shapes.push({ k: 'path', pts: L.mark ?? [0, 0, 0, 0, 0, 0], closed: true, fill: s.total == null ? [...CLEAR] : mark });
  shapes.push(stem ? { k: 'rect', x: stem.x, y: stem.y, w: stem.w, h: stem.h, r: stem.r, fill: mark } : { k: 'rect', x: 0, y: 0, w: 0, h: 0, fill: [...CLEAR] });
  for (const t of L.texts) {
    const l = lk(t.look);
    shapes.push({ k: 'text', x: t.x, y: t.y, s: t.t, size: l.size!, weight: l.weight, color: l.fill!, anchor: t.anchor });
  }
  return { w: W, h: L.H, shapes, label: scoresWords(s) };
}

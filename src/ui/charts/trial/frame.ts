// The trial card as a frame: the layout's rectangles, strokes and words, wearing the looks of the 2D chart table (chart-looks/trial.js).
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { look } from '../looks.ts';
import type { Frame, Shape } from '../scene.ts';
import { trialLayout, trialWords, TONE, type Fit, type Trial, type TrialOpts } from './model.ts';

export function trialFrame(t: Trial, fit: Fit | null, c: ChartCtx, opts: TrialOpts = {}): Frame {
  const f = c.type.sm, W = Math.max(160, c.w);
  const L = trialLayout(t, W, f, measure, fit, opts);
  const H = { host: 'trial' };
  const lk = (key: string, params: Record<string, string> = {}) => look(c, H, key, {}, params);
  const shapes: Shape[] = [];
  for (const r of L.rects) {
    const l = lk(r.look, r.tone ? { tone: r.tone } : {});
    shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: l.fill, pen: l.stroke ? { color: l.stroke, w: l.width ?? 1 } : undefined });
  }
  for (const p of L.paths) {
    const l = lk(p.look);
    shapes.push({ k: 'path', pts: p.pts, pen: { color: l.stroke!, w: l.width ?? 1, cap: l.cap, join: l.join } });
  }
  for (const s of L.texts) {
    const l = lk(s.look);
    shapes.push({ k: 'text', x: s.x, y: s.y, s: s.t, size: l.size!, weight: l.weight, color: l.fill!, anchor: s.anchor, ls: l.ls });
  }
  return { w: W, h: L.H, shapes, label: trialWords(t, fit) };
}

export { TONE };

// The trial card as a frame: the layout's rectangles, strokes and words, wearing the looks of the 2D chart table (chart-looks/trial.js).
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { withAlpha } from '../colour.ts';
import type { Frame, Shape } from '../scene.ts';
import { TYPE, trialLayout, trialWords, TONE, type Fit, type Trial, type TrialOpts } from './model.ts';

export function trialFrame(t: Trial, fit: Fit | null, c: ChartCtx, opts: TrialOpts = {}): Frame {
  const { pal } = c, f = c.type.sm, W = Math.max(160, c.w);
  const L = trialLayout(t, W, f, measure, fit, opts);
  const text = pal.tok('text'), t2 = pal.tok('text-2'), t3 = pal.tok('text-3');
  const toneOf = (tone?: string) => pal.tok(tone ?? 'text-3');
  const shapes: Shape[] = [];
  for (const r of L.rects) {
    if (r.look === 'trial.track') shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: withAlpha(text, 0.1) });
    else if (r.look === 'trialfit.ring') shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, pen: { color: t3, w: 1.5 } });
    else shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: withAlpha(toneOf(r.tone), 0.72) });   // trial.bar, trial.key
  }
  for (const p of L.paths) shapes.push({ k: 'path', pts: p.pts, pen: { color: t3, w: 2, cap: 'round', join: 'round' } });
  const fill: Record<string, typeof text> = { 'trial.name': text, 'trial.src': t3, 'trial.v': t2, 'trial.lab': text, 'trial.pct': text, 'trial.n': t3, 'trial.eff': text, 'trial.note': t2, 'trial.warn': pal.tok(pal.has('caution-ink') ? 'caution-ink' : 'caution'), 'trialfit.t': text };
  for (const s of L.texts) {
    const [weight, em] = TYPE[s.look]!;
    shapes.push({ k: 'text', x: s.x, y: s.y, s: s.t, size: em * f, weight, color: fill[s.look]!, anchor: s.anchor, ls: s.look === 'trial.pct' ? -0.03 : undefined });
  }
  return { w: W, h: L.H, shapes, label: trialWords(t, fit) };
}

export { TONE };

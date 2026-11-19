// The timeline's clock as a frame (look small.day: the text-2 ink in every look; the size and weight are the clock's own, handed in as 2D reads them from the page).
import type { ChartCtx } from '../Chart.tsx';
import { look } from '../looks.ts';
import type { Frame } from '../scene.ts';
import { clockLabel, clockWords, type ClockSpec } from './model.ts';

/** The clock at c.w px wide, one line high. A word's width never changes as a count runs (tabular figures), so the line holds still while the days climb. */
export function clockFrame(spec: ClockSpec, c: ChartCtx): Frame {
  const size = Math.max(12, spec.size ?? c.type.sm), weight = spec.weight ?? 600, w = Math.max(40, Math.round(c.w)), h = Math.round(size * 1.5);
  const l = look(c, { host: 'dock' }, 'small.day');
  const align = spec.align ?? 'start';
  const x = align === 'end' ? w : align === 'middle' ? w / 2 : 0;
  return { w, h, shapes: [{ k: 'text', x, y: h / 2, s: clockWords(spec), size, weight, color: l.fill!, anchor: align, baseline: 'middle' }], label: clockLabel(spec) };
}

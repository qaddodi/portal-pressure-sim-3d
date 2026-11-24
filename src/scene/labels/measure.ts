// Text widths for the label solver, measured on one hidden canvas. Pure of React so node judges it.
import type { Measure } from './type.ts';

const FONT = (size: number, weight: number) => `${weight} ${size}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;

/** Text width in px at a font, measured on one hidden canvas (build time only: never in a frame). The widths are kept by text, size and weight, so the cache is dropped (`reset`) whenever a font finishes
 *  loading: a width taken while Inter, its weight or its symbols face was still arriving is the fallback font's, and kept it for good ("+8.3 mmHg" ran off the screen's edge, Next bleed 9, capture 2c00c0ce).
 *  `ctx` is the canvas's 2D context (a stand-in in node). */
export function makeMeasure(ctx: { font: string; measureText(t: string): { width: number } } | null = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null): Measure & { reset(): void } {
  const cache = new Map<string, number>();
  const m = ((text: string, size: number, weight: number, track = 0) => {
    const k = `${size}|${weight}|${track}|${text}`;
    let w = cache.get(k);
    if (w === undefined) {
      if (ctx) { ctx.font = FONT(size, weight); w = ctx.measureText(text).width + track * text.length; } else w = text.length * size * 0.56;
      cache.set(k, w);
    }
    return w;
  }) as Measure & { reset(): void };
  m.reset = () => cache.clear();
  return m;
}


import { useEffect, useRef } from 'react';
import { clock } from '../../../clock/frame.ts';
import { Chart, type ChartCtx } from '../Chart.tsx';
import type { ChartPainter } from '../painter.ts';
import { clockFrame } from './frame.ts';
import { clockLabel, JUMP_MS, type ClockSpec } from './model.ts';
import '../charts.css';

/** The timeline's clock, drawn on the GPU: the clock's words ("0:14", "Day 142"), and while a jump of the disease clock runs, its day count climbing (2D: 900 ms, ease-out).
 *  t, day: the model's clock (src/ui/timeline fmtClock). jump: a jump just started, from `from` (the day) carrying `days`; a new object starts a new count. size, weight, align:
 *  the clock's own type, as the page's clock has it (default: the chart type, 600, left). */
export function TimelineClockCard({ t, day, jump = null, size, weight, align }: { t: number; day: number; jump?: { from: number; days: number } | null; size?: number; weight?: number; align?: ClockSpec['align'] }) {
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null), u = useRef<number | null>(null);
  const spec = (): ClockSpec => ({ t, day, size, weight, align, jump: jump && u.current != null ? { ...jump, u: u.current } : null });
  useEffect(() => {
    if (!jump) { u.current = null; return; }
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { u.current = null; return; }   // (the clock takes its last day at once)
    const t0 = performance.now(), hold = clock.hold('chart:timeline');
    u.current = 0;
    const off = clock.on('tween', () => {
      const k = Math.min(1, (performance.now() - t0) / JUMP_MS);
      u.current = k < 1 ? k : null;
      if (ctx.current) painter.current?.show(clockFrame(spec(), ctx.current), false);
      if (k >= 1) { off(); hold.release(); }
    });
    return () => { off(); hold.release(); u.current = null; };
  }, [jump]);  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pz-timeline-clock">
      <Chart tag="chart:timeline" painter={painter} deps={[t, day, size, weight, align]} label={clockLabel(spec())} build={(c) => { ctx.current = c; return clockFrame(spec(), c); }} />
    </div>
  );
}

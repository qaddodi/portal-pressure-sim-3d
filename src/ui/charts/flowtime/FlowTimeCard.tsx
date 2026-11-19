import { useEffect, useMemo, useRef } from 'react';
import { clock } from '../../../clock/frame.ts';
import { Chart, type ChartCtx } from '../Chart.tsx';
import type { ChartPainter } from '../painter.ts';
import { headStep, HEAD_DT0 } from '../plot/follow.ts';
import { MEAL_LINES, flowTimeSeries, type FlowView, type Trail } from './model.ts';
import { flowTimeFrame, flowTimeLabel, minuteOf } from './frame.ts';
import '../charts.css';

/** Two readings over a time-lapse (or around a meal). k (0 to 1) is how far along the time-lapse it is: the heads glide after it, never jump. A new trail dissolves in over the old chart. */
export function FlowTimeCard({ trail, k = 1, lines = MEAL_LINES, clock: ck = 'meal', given = null, view = null, rx = [], height }: { trail: Trail | null | undefined; k?: number; lines?: readonly string[]; clock?: 'meal' | 'days'; given?: Record<string, number> | null; view?: FlowView | null; rx?: readonly string[]; height?: number }) {
  const key = JSON.stringify([ck, lines, given, view, trail?.[0], trail?.at(-1), trail?.length]);
  const ser = useMemo(() => flowTimeSeries(trail, ck, lines, given, view), [key]);  // eslint-disable-line react-hooks/exhaustive-deps
  const painter = useRef<ChartPainter | null>(null);
  const ctx = useRef<ChartCtx | null>(null);
  const shown = useRef(0), seen = useRef<unknown>(null);
  const spec = { ser: ser!, clock: ck, keys: lines, rx, height };
  if (ser && seen.current !== ser) { seen.current = ser; shown.current = minuteOf(ser, k); }
  const goal = ser ? minuteOf(ser, k) : 0;

  useEffect(() => {
    if (!ser) return;
    const span = ser.ax.end - ser.ax.from, reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = () => { if (ctx.current) painter.current?.show(flowTimeFrame(spec, shown.current, ctx.current).frame, false); };
    if (reduce || Math.abs(goal - shown.current) < 0.001 * span) { shown.current = goal; draw(); return; }
    const hold = clock.hold('chart:flowtime');
    let first = true;
    const off = clock.on('tween', (fi) => {
      shown.current = headStep(shown.current, goal, first ? HEAD_DT0 : fi.dt / 1000); first = false;
      if (Math.abs(goal - shown.current) < 0.001 * span) shown.current = goal;
      draw();
      if (shown.current === goal) { off(); hold.release(); }
    });
    return () => { off(); hold.release(); };
  }, [goal, ser]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!ser) return null;
  return (
    <div className="pz-flowtime">
      <Chart tag="chart:flowtime" painter={painter} deps={[ser, rx.join(), height]} label={flowTimeLabel(ser, lines, ck)} build={(c) => { ctx.current = c; return flowTimeFrame(spec, shown.current, c).frame; }} />
    </div>
  );
}

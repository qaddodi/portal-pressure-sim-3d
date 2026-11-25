import { useEffect, useRef } from 'react';
import { clock } from '../../../clock/frame.ts';
import { Chart, type ChartCtx } from '../Chart.tsx';
import type { ChartPainter } from '../painter.ts';
import { createFollow, lumenAria, pctI, type LumenParams } from './model.ts';
import { lumenFrame, lumenViewOf } from './frame.ts';
import '../charts.css';

/** A vessel in cross-section on a slide's data card (tool { kind: 'lumen', vessel }). It follows the model's params: a stream of small steps (a time-lapse, a slider)
 *  in a straight line, a jump (a compare button, a new slide) as a glide. The picture is moved by the clock, never through React state. */
export function LumenCard({ params, vessel = 'PV_TRUNK', stented = null, site = null, name = null, ghost = null }: { params: LumenParams | null; vessel?: string; stented?: readonly string[] | null; site?: string | null; ghost?: number | null; name?: string | null }) {
  const view = lumenViewOf(params, vessel, stented, { site, name });
  const fol = useRef(createFollow());
  const painter = useRef<ChartPainter | null>(null);
  const ctx = useRef<ChartCtx | null>(null);
  const shown = useRef(false);
  const live = useRef(view);
  live.current = view;
  const frameNow = () => lumenFrame({ vessel, stenosis: fol.current.a, thrombus: fol.current.b, stent: live.current.stent, name: live.current.name, site: live.current.site, ghost }, ctx.current!);

  useEffect(() => {
    const f = fol.current, t = view.target;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!shown.current || reduce) { f.snap(t.stenosis, t.thrombus); if (ctx.current) painter.current?.show(frameNow(), false); shown.current = true; return; }
    if (!f.goal(t.stenosis, t.thrombus, clock.now())) { if (ctx.current) painter.current?.show(frameNow(), true); return; }
    const hold = clock.hold('chart:lumen');
    const off = clock.on('tween', (fi) => {
      const moving = f.at(fi.time);
      if (ctx.current) painter.current?.show(frameNow(), false);
      if (!moving) { off(); hold.release(); }
    });
    return () => { off(); hold.release(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.target.stenosis, view.target.thrombus, vessel]);

  const st = pctI(view.target.stenosis), th = pctI(view.target.thrombus);
  return (
    <div className="pz-lumen">
      <Chart tag="chart:lumen" painter={painter} deps={[vessel, view.stent, view.name, view.site, ghost]} label={lumenAria(vessel, pctI(1 - (1 - view.target.stenosis) * (1 - view.target.thrombus)), th, st, view.stent)}
        build={(c) => { ctx.current = c; if (!shown.current) { fol.current.snap(view.target.stenosis, view.target.thrombus); shown.current = true; } return frameNow(); }} />
    </div>
  );
}

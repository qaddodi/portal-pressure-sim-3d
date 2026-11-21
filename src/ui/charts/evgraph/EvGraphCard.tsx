import { useContext, useEffect, useRef } from 'react';
import { clock } from '../../../clock/frame.ts';
import { Chart, type ChartCtx } from '../Chart.tsx';
import type { ChartPainter } from '../painter.ts';
import { headStep, HEAD_DT0 } from '../plot/follow.ts';
import { evGraphFrame, type EvInput } from './frame.ts';
import { evLabel, type EvRun, type EvSpec } from './model.ts';
import { ToolRoom } from '../../talk/tool-room.ts';
import '../charts.css';

/**
 * A procedure's graph for a slide (2D: tool { kind: 'evgraph' }, event-graph.js): two of the slide's readings around the moment the procedure changes the patient.
 * spec: eventGraphOf(slide). before: where the two lines start, the model's units ([lower, upper]). end: where they are expected to end (the slide's settled state), or omit.
 * run: the points the live model gives after the change (an EvRun the presenter pushes into: run.start() at the change, run.push(t, v0, v1) per reading, run.reset() going back);
 * the heads glide after its newest point, never jump. No run, or one not started: the graph before the change.
 */
export function EvGraphCard({ spec, before, end = null, run = null, height }: { spec: EvSpec; before: readonly [number, number]; end?: readonly [number, number] | null; run?: EvRun | null; height?: number }) {
  const painter = useRef<ChartPainter | null>(null);
  const ctx = useRef<ChartCtx | null>(null);
  const shown = useRef(0);
  const room = useContext(ToolRoom);
  const input: EvInput = { spec, before, end, run, height, room };
  const inRef = useRef(input);
  inRef.current = input;
  const draw = () => { if (ctx.current) painter.current?.show(evGraphFrame(inRef.current, shown.current, ctx.current), false); };

  useEffect(() => {
    if (!run) { shown.current = 0; draw(); return; }
    let hold: { release(): void } | null = null, off: (() => void) | null = null;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stop = () => { off?.(); off = null; hold?.release(); hold = null; };
    const chase = () => {
      const goal = run.goal;
      if (!run.on) shown.current = 0;
      if (reduce || !run.on || Math.abs(goal - shown.current) < 0.002) { shown.current = goal; stop(); draw(); return; }
      if (off) return;
      hold = clock.hold('chart:evgraph');
      let first = true;
      off = clock.on('tween', (fi) => {
        shown.current = headStep(shown.current, run.goal, first ? HEAD_DT0 : fi.dt / 1000); first = false;
        if (Math.abs(run.goal - shown.current) < 0.002) shown.current = run.goal;
        draw();
        if (shown.current === run.goal) stop();
      });
    };
    shown.current = run.on ? run.goal : 0;
    draw();
    const un = run.subscribe(chase);
    return () => { un(); stop(); };
  }, [run, spec, before[0], before[1], end?.[0], end?.[1], height]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pz-flowtime pz-evgraph">
      <Chart tag="chart:evgraph" painter={painter} deps={[spec, before[0], before[1], end?.[0], end?.[1], height, room, run]} label={evLabel(spec, before, before, false, 0)}
        build={(c) => { ctx.current = c; return evGraphFrame(inRef.current, shown.current, c); }} />
    </div>
  );
}

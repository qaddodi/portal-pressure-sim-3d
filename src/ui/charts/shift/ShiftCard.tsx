import { useEffect, useMemo, useRef } from 'react';
import { clock } from '../../../clock/frame.ts';
import { Chart, type ChartCtx } from '../Chart.tsx';
import type { ChartPainter } from '../painter.ts';
import { headStep, HEAD_DT0 } from '../plot/follow.ts';
import { shiftFrame, type ShiftSpec } from './frame.ts';
import { lapseStage, rowVals, type Readings, type Stage, type Trail } from './model.ts';
import '../charts.css';

export interface ShiftCardProps {
  /** the deck's states in order (shiftStages) and each one's readings (stageVals, null while its slide's state is not worked out) */
  stages: readonly Stage[];
  vals: readonly (Readings | null)[];
  /** each stage's time-lapse trail, null for none */
  trails?: readonly (Trail | null | undefined)[];
  /** the slide the talk is at (its index in the deck) */
  at: number;
  /** the slide's `key`: the lines it teaches (the others are faint) */
  lit?: readonly string[];
  /** the slide has a what-if slider: a ring on the last state follows the live readings */
  whatIf?: boolean;
  /** the slide's readings as the model eases or a slider moves them */
  live?: Readings | null;
  /** the slide is a time-lapse not yet played */
  waitDays?: boolean;
  /** a time-lapse playing: its trail and k (0 to 1), how far its days have played; the heads glide after k */
  lapse?: { trail: Trail; k: number } | null;
  /** the box's height, px (default 220, as the 2D fallback) */
  height?: number;
}

/** The change from healthy, for a slide whose tool is { kind: 'shift' }: one chart that holds across the deck's slides, a state's slot shown once its slide is reached. */
export function ShiftCard({ stages, vals, trails, at, lit, whatIf, live, waitDays, lapse: lp, height }: ShiftCardProps) {
  // a time-lapse's days: its last state is the next one that ends a lapse; the first day is the trail's first row
  const li = lp ? lapseStage(stages, at) : -1, on = !!lp && li > 0;
  const v2 = useMemo(() => (on ? vals.map((v, i) => (i === li - 1 ? (rowVals(lp!.trail[0]) as Readings) : v)) : vals), [on, vals, li, lp?.trail]);  // eslint-disable-line react-hooks/exhaustive-deps
  const tr2 = useMemo(() => (on ? stages.map((_, i) => (i === li ? lp!.trail : trails?.[i] ?? null)) : trails), [on, stages, trails, li, lp?.trail]);  // eslint-disable-line react-hooks/exhaustive-deps
  const goal = on ? Math.max(0, Math.min(1, lp!.k)) : 1;
  const shown = useRef(goal), seen = useRef<unknown>(null);
  if (seen.current !== lp?.trail) { seen.current = lp?.trail; shown.current = on ? Math.min(shown.current, goal) : 1; }
  const spec = (k: number): ShiftSpec => ({ stages, vals: v2, trails: tr2, at: on ? stages[li]!.j : at, lit, whatIf, live, waitDays: on ? false : waitDays, height, lapse: on && k < 1 ? { i: li, trail: lp!.trail, shown: k } : null });
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);

  useEffect(() => {
    if (!on) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = () => { if (ctx.current) painter.current?.show(shiftFrame(spec(shown.current), ctx.current).frame, false); };
    if (reduce || Math.abs(goal - shown.current) < 0.002) { shown.current = goal; draw(); return; }
    const hold = clock.hold('chart:shift');
    let first = true;
    const off = clock.on('tween', (fi) => {
      shown.current = headStep(shown.current, goal, first ? HEAD_DT0 : fi.dt / 1000); first = false;
      if (Math.abs(goal - shown.current) < 0.002) shown.current = goal;
      draw();
      if (shown.current === goal) { off(); hold.release(); }
    });
    return () => { off(); hold.release(); };
  }, [goal, on, li]);  // eslint-disable-line react-hooks/exhaustive-deps

  // (the chart's box stands from the first frame, drawn or not: a state not worked out yet draws the empty box at its height, never nothing.
  //  The card is measured and locked with what it holds when it lands: with no chart it was locked at its header and tiles alone,
  //  and the chart row stood clipped at its foot when the readings came. Hyperdynamic 2 on return from 3, Mohammad 28 Nov. Same root as EvGraph's pending frame.)
  const key = JSON.stringify([stages, v2, tr2?.map((t) => t && [t.length, t[0], t.at(-1)]), at, lit, whatIf, live, waitDays, height, on]);
  return (
    <div className="pz-shift">
      <Chart tag="chart:shift" painter={painter} deps={[key]} label="Change from healthy" build={(c) => { ctx.current = c; return shiftFrame(spec(shown.current), c).frame; }} />
    </div>
  );
}

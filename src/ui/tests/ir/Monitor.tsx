// The one pressure monitor on the card: the 2D monitor's frame (monitor.ts) in a box, redrawn on the clock's tween phase while its measurement plays and when its words change. The recorded trace
// belongs to the source, not to this component, so the pane coming and going never redraws a trace differently.
import { useEffect, useRef } from 'react';
import { clock } from '../../../clock/frame.ts';
import { Chart, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import type { Frame } from '../../charts/scene.ts';

export interface MonSource {
  /** the name the clock shows in ?perf */
  id: string;
  /** the monitor in a sentence, for a screen reader */
  label(): string;
  /** a frame for this box; `sweeping`: the clock is running it (the one draw that moves the waves on) */
  frame(w: number, h: number, sweeping: boolean): Frame;
  /** the clock is moving it (every tween frame draws) */
  active(): boolean;
}

export function Monitor({ src, h, deps, onClick, className = 'chart-box hvpg-box' }: { src: MonSource; h: number; deps: readonly unknown[]; onClick?: () => void; className?: string }) {
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);
  useEffect(() => clock.on('tween', () => {
    const c = ctx.current, p = painter.current;
    if (c && p && src.active()) p.show(src.frame(c.w, h, true), false);
  }), [src, h]);
  return (
    <div className={className} style={{ height: h }} onClick={onClick}>
      <Chart tag={src.id} painter={painter} deps={[h, ...deps]} label={src.label()}
        build={(c) => { ctx.current = c; return src.frame(c.w, h, false); }} />
    </div>
  );
}

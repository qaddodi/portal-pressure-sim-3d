// The one pressure monitor on the card: the 2D monitor's frame (monitor.ts) in a box, redrawn on the clock's tween phase while its measurement plays and when its words change. The recorded trace
// belongs to the source, not to this component, so the pane coming and going never redraws a trace differently.
import { useEffect, useRef, type Ref } from 'react';
import { clock } from '../../../clock/frame.ts';
import { Chart, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import type { Frame } from '../../charts/scene.ts';
import { Cv, useCv, usePaneHost } from '../Cv.tsx';

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

/** `h` is the height it is drawn at before its box has one; the box is 2D's own (.chart-box.hvpg-box), sized by the 2D stylesheet, and the tracing is drawn at the size that gives (Cv.tsx).
 *  `boxRef`: the box's element, for a hand-over's fade. */
export function Monitor({ src, h: h0, deps, onClick, className = 'chart-box hvpg-box', boxRef }: { src: MonSource; h: number; deps: readonly unknown[]; onClick?: () => void; className?: string; boxRef?: Ref<HTMLDivElement> }) {
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);
  const cv = useCv(h0), h = cv.h, host = usePaneHost();
  useEffect(() => clock.on('tween', () => {
    const c = ctx.current, p = painter.current;
    if (c && p && src.active()) p.show(src.frame(c.w, h, true), false);
  }), [src, h]);
  return (
    <div ref={boxRef} className={className} style={host.box(h0)} onClick={onClick}>
      <Cv at={cv.ref}>
        <Chart tag={src.id} painter={painter} deps={[h, ...deps]} label={src.label()}
          build={(c) => { ctx.current = c; return src.frame(c.w, h, false); }} />
      </Cv>
    </div>
  );
}

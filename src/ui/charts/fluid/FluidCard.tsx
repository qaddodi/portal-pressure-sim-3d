import { useMemo, useRef } from 'react';
import { Chart } from '../Chart.tsx';
import { fluidFrame, fluidLabel } from './frame.ts';
import { ForcesAverage, fluidInputs, wantsCaveat, type FluidFrameLike, type FluidParams } from './data.ts';
import type { Forces } from './model.ts';
import '../charts.css';

export interface FluidCardProps {
  /** the slide's fingerprint (what its tiles show): the card shows these numbers, not the beat-to-beat live ones */
  fp?: Record<string, unknown> | null;
  /** the live engine frame (src/engine/store.ts latest.frame): used where the slide has no fingerprint with the fluid terms */
  frame?: FluidFrameLike | null;
  /** the patient's params (albumin, cirrhosis, diuretics) */
  params?: FluidParams | null;
  /** the 2D tool's options: `window` the day card, `forces` the sinusoid wall's forces, `caveat` always show the line that its rates are the model's own */
  window?: boolean;
  forces?: boolean;
  caveat?: boolean;
  /** the slide's compare buttons (their params), for the caveat */
  compare?: { params?: FluidParams }[] | null;
}

/** The fluid balance on a slide's data card (tool kind 'fluid'): the flow picture, or with `window` the day card; `forces` adds the forces across the sinusoid wall. */
export function FluidCard({ fp = null, frame = null, params = null, window: win = false, forces: wantForces = false, caveat = false, compare = null }: FluidCardProps) {
  const avg = useRef(new ForcesAverage());
  const live = useMemo(() => fluidInputs(fp, frame, params), [fp, frame, params]);
  // a live push is eased; a pinned one is the slide's own
  const F: Forces | null = live.forces && !live.pinned ? avg.current.next(live.forces, typeof performance !== 'undefined' ? performance.now() : 0) : live.forces;
  const o = { window: win, forces: wantForces, caveat: wantsCaveat({ caveat }, params, compare) };
  const key = live.f ? [live.f.hep, live.f.spl, live.f.cap, live.f.back, live.f.net, F?.out, F?.pull].map((v) => (v === undefined ? '' : (+v).toFixed(3))).join(',') : '';
  return (
    <div className="pz-fluid" data-kind="fluid">
      <Chart tag="chart:fluid" deps={[key, win, wantForces, o.caveat]} label={fluidLabel(live.f, o)} build={(c) => fluidFrame(live.f, F, c, o)} />
    </div>
  );
}

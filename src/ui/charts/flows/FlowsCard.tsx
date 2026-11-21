import { useEffect, useRef, useState } from 'react';
import { Chart } from '../Chart.tsx';
import { flowParts, sameShares, smallMove, HOLD_MS, type FlowsInput, type Part } from './parts.ts';
import { flowsFrame } from './frame.ts';
import type { Tiers } from './layout.ts';
import '../charts.css';

import { clock } from '../../../clock/frame.ts';
/** The parts the bar shows: a split that moves no part by more than a whole percent waits until the readings rest (HOLD_MS), so the bar never flips on a wobble. */
function useHeld(next: Part[] | null): Part[] | null {
  const [shown, setShown] = useState<Part[] | null>(next);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    clock.cancel(timer.current);
    if (!next) return;
    if (!shown || !smallMove(shown, next)) { setShown(next); return; }
    if (sameShares(shown, next)) return;
    timer.current = clock.after(() => setShown(next), HOLD_MS);
    return () => clock.cancel(timer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next && next.map((p) => `${p.id}:${p.pct}`).join(',')]);
  return shown;
}

/** Where the portal blood goes (tool kind 'flows'), or the liver's inflow (of: 'inflow'): one bar that is all of it, the Healthy split marked over it. */
export function FlowsCard({ of = 'portal', input, healthy }: { of?: 'portal' | 'inflow'; input: FlowsInput | null; healthy?: FlowsInput | null }) {
  const live = input ? flowParts(input, of) : null;
  const parts = useHeld(live);
  const hParts = healthy ? flowParts(healthy, of) : null;
  const tiers = useRef<Tiers | null>(null);
  if (!parts) return null;
  const key = `${of}|${parts.map((p) => `${p.id}:${p.pct}`).join(',')}|${(hParts ?? []).map((p) => `${p.id}:${p.pct}`).join(',')}`;
  return (
    <div className="pz-flows" data-of={of}>
      <Chart tag="chart:flows" deps={[key]} label={of === 'inflow' ? 'Hepatic inflow' : 'Distribution of portal venous flow'}
        build={(c) => { const o = flowsFrame({ of, parts, healthy: hParts, tiers: tiers.current }, c); tiers.current = o.tiers; return o.frame; }} />
    </div>
  );
}

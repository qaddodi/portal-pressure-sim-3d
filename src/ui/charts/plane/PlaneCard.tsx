import { useMemo, useRef } from 'react';
import { Chart } from '../Chart.tsx';
import { planeFrame } from './frame.ts';
import { planeOf, planeWords, summaryHeight, toolPlane, type Fp, type PlanePoint, type PlaneSpec, type Stop, type WalkState } from './model.ts';
import { useUi } from '../../ui-store.ts';
import { layoutOf } from '../../layout/rules2d.ts';
import { pzhOf } from '../../layout/plan.ts';
import '../charts.css';

export interface PlaneCardProps {
  /** the plane: a named one ('csph', 'hvpg-ppg', 'flow-ppg') or the deck's own { x, y, zones, boxes, cuts, … } (the slide's `plane`). The data card (`ring`) with none reads the CSPH plane. */
  plane?: PlaneSpec;
  /** a summary (visual: 'plane'): one point for each patient the slide's `of` lists, with its name (loadPoints) */
  points?: readonly PlanePoint[];
  /** the data card (tool: { kind: 'plane' }): the slide's case, its fingerprint as the tiles print it; null while it is not worked out. Passing it, even null, makes this the card. */
  ring?: Fp | null;
  /** the data card's trail: the slides the patient stood at before this one (trailStops) */
  stops?: readonly Stop[];
  /** the room the card leaves the chart, px (the guideline look's graph is never taller than it less its key and reading) */
  room?: number;
  /** the plot's height, px; the default is the 2D one at this width */
  height?: number;
}

/** Two readings on one plane with a guideline's zones. A summary draws the slide's patients as named points; the data card draws the slide's own case as a dot that moves to each new reading, the trail of the slides before it, and the case's reading under the plot. */
export function PlaneCard({ plane, points, ring, stops, room, height }: PlaneCardProps) {
  const card = ring !== undefined;
  const pl = useMemo(() => (card ? toolPlane({ plane }) : planeOf(plane)), [card, JSON.stringify(plane ?? null)]);  // eslint-disable-line react-hooks/exhaustive-deps
  // the dot's way: kept between frames, started again when the trail or the plane changes
  const walk = useRef<WalkState & { key: string }>({ walk: [], armed: false, key: '' });
  const skey = JSON.stringify([plane ?? null, stops ?? null]);
  if (walk.current.key !== skey) walk.current = { walk: [], armed: false, key: skey };
  // where the dot was: the zones' words keep clear of its way
  const seen = useRef<{ cur: Fp | null; was: Fp | null; k: string }>({ cur: null, was: null, k: '' });
  const rk = JSON.stringify(ring ?? null);
  if (seen.current.k !== rk) seen.current = { was: seen.current.cur, cur: ring ?? null, k: rk };
  const vp = useUi((s) => s.vp);
  if (!pl) return null;
  // a summary on a wide screen is 2D's plot height (the window's, not the width's); the data card and a phone keep theirs
  const own = height ?? (card ? undefined : summaryHeight(pl, layoutOf(vp.w, vp.h), pzhOf(vp)));
  const key = JSON.stringify([plane ?? null, points ?? null, ring ?? null, stops ?? null, room ?? null, own ?? null]);
  return (
    <div className="pz-plane">
      <Chart tag="chart:plane" deps={[key]} label={planeWords(pl, (points ?? []).map((p) => ({ f: p.f, name: p.name })), ring)}
        build={(c) => planeFrame({ plane: pl, points, ring, card, stops, room, height: own, ringWas: seen.current.was, walk: card ? walk.current : undefined }, c).frame} />
    </div>
  );
}

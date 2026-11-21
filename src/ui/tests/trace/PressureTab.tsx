// The Pressure tab (2D dock.js): the chart along the circuit, or the same pressures over time, under a small switch, "Along the circuit" / "Over time". One view at a time on every card size
// (Mohammad, 21 Nov 2026: stacked, the two crammed the card and their readouts collided).
import type { PaneId } from '../panes.ts';
import { useTests } from '../store.ts';
import { lazyRetry } from '../../../boot/lazy-retry.ts';
import { LazyBoundary } from '../../shell/LazyBoundary.tsx';
import { OverTimePane } from './OverTimePane.tsx';
import type { PaneProps } from '../TestsLayer.tsx';

const ProfilePane = lazyRetry(() => import('../profile/ProfilePane.tsx').then((m) => ({ default: m.ProfilePane })));

export const PRESSURE_VIEWS: readonly (readonly [PaneId, string])[] = [['profile', 'Along the circuit'], ['scope', 'Over time']];

function View({ id, p }: { id: PaneId; p: PaneProps }) {
  if (id === 'scope') return <OverTimePane plot={p.plot} />;
  return <LazyBoundary><ProfilePane {...p} /></LazyBoundary>;
}

export function PressureTab({ own, ...p }: PaneProps & { own: PaneId }) {
  const show = useTests((s) => s.show);
  // 2D's own markup (dock.js pressureSwitch: the switch is the pane's first child, its view the next), so the 2D stylesheet's rules for a pane's view reach the view
  return (
    <>
      <div className="pressure-switch" role="group" aria-label="Pressure view">
        {PRESSURE_VIEWS.map(([id, label]) => <button key={id} type="button" className="ps-btn" data-view={id} aria-pressed={id === own} onClick={() => { if (id !== own) show(id); }}>{label}</button>)}
      </div>
      <View id={own} p={p} />
    </>
  );
}

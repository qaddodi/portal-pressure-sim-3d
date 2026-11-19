// The Pressure tab (2D dock.js): the chart along the circuit, or the same pressures over time. Where the card is roomy (a side card 600 px tall or more) the two read as one story, stacked
// with no switch; elsewhere the tab keeps a small switch, "Along the circuit" / "Over time".
import type { PaneId } from '../panes.ts';
import { useTests } from '../store.ts';
import { notYet } from '../../shell/words.ts';
import { BUILT_PANES } from '../panes.ts';
import { OverTimePane } from './OverTimePane.tsx';
import type { PaneProps } from '../TestsLayer.tsx';

export const PRESSURE_VIEWS: readonly (readonly [PaneId, string])[] = [['profile', 'Along the circuit'], ['scope', 'Over time']];

function View({ id, p }: { id: PaneId; p: PaneProps }) {
  if (id === 'scope') return <OverTimePane plot={p.roomy ? Math.min(p.plot, 230) : p.plot} />;
  return BUILT_PANES.includes('profile') ? null : <p className="t-note">{notYet('Pressure along the circuit')}</p>;
}

export function PressureTab({ own, ...p }: PaneProps & { own: PaneId }) {
  const show = useTests((s) => s.show);
  if (p.roomy) return <div className="pt-stack"><View id="profile" p={p} /><View id="scope" p={p} /></div>;
  return (
    <div className="pt-tab">
      <div className="pressure-switch t-seg" role="group" aria-label="Pressure view">
        {PRESSURE_VIEWS.map(([id, label]) => <button key={id} type="button" className="ps-btn" data-view={id} aria-pressed={id === own} onClick={() => { if (id !== own) show(id); }}>{label}</button>)}
      </div>
      <View id={own} p={p} />
    </div>
  );
}

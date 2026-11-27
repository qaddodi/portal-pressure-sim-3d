import { Chart } from '../Chart.tsx';
import { useLens } from '../../../scene/lenses/store.ts';
import { lobuleFrame } from './frame.ts';
import { lobuleWords, viewOf, type LobulePressures } from './model.ts';
import '../charts.css';

const r1 = (v: number | null | undefined): number | null => (Number.isFinite(v) ? Math.round(v! * 10) / 10 : null);

/** Across the lobule (tool kind 'lobule'): the strip from the portal tract to the central vein. Its view follows the lens the figure wears, which the slide's own Oxygen / Pressure buttons set
 *  (ui/talk/controls-run.ts), so the card has no control of its own; `rest` is the view for any other lens (model.ts viewOf). The pressures are the slide's shown state (the tiles' fingerprint). */
export function LobuleCard({ p, rest }: { p: LobulePressures; rest?: unknown }) {
  const lens = useLens((s) => s.lens);
  const a = { view: viewOf(lens, rest), pv: r1(p.pv), sin: r1(p.sin), cv: r1(p.cv) };
  return (
    <div className="pz-stiff pz-lobule">
      <Chart tag="chart:lobule" deps={[a.view, a.pv, a.sin, a.cv]} label={lobuleWords(a)} build={(c) => lobuleFrame(a, c)} />
    </div>
  );
}

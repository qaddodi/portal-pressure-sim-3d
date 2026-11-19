import { Chart } from '../Chart.tsx';
import { stiffFrame } from './frame.ts';
import { stiffWords, type Context, type Organ } from './model.ts';
import '../charts.css';

/** The stiffness bar under the FibroScan number (liver) or the spleen probe's number: the reading, the platelets (liver only) and the verdict. */
export function StiffCard({ lsm, plt = null, organ = 'liver', ctx = null, note = false }: { lsm: number | null; plt?: number | null; organ?: Organ; ctx?: Context; note?: boolean }) {
  const l = Number.isFinite(lsm) ? Math.round(lsm! * 10) / 10 : null, p = Number.isFinite(plt) ? Math.round(plt!) : null;
  return (
    <div className="pz-stiff">
      <Chart tag="chart:stiff" deps={[l, p, organ, ctx, note]} label={stiffWords(l, p, organ, ctx)} build={(c) => stiffFrame({ lsm: l, plt: p, organ, ctx, note }, c)} />
    </div>
  );
}

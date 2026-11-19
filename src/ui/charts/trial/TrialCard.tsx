import { Chart } from '../Chart.tsx';
import { trialOf, fitWords, type Fit } from './model.ts';
import { trialFrame } from './frame.ts';
import { useUi } from '../../ui-store.ts';
import '../charts.css';

/** One landmark trial (tool kind 'trial', id): arms and their shares, the trial's own effect, and (on a slide) whether the slide's patient fits it. */
export function TrialCard({ id, fit = null, head = true }: { id: string; fit?: Fit | null; head?: boolean }) {
  const t = trialOf(id);
  const phone = useUi((s) => s.device === 'phone-portrait' || s.device === 'phone-landscape');
  if (!t) return null;
  return (
    <div className="pz-trial">
      <Chart tag="chart:trial" deps={[id, fitWords(fit), head, phone]} label={t.name} build={(c) => trialFrame(t, fit, c, { head, compact: head && phone })} />
    </div>
  );
}

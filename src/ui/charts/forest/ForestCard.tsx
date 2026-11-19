import { useMemo, useState } from 'react';
import { Chart } from '../Chart.tsx';
import { forestFrame } from './frame.ts';
import { forestWords, trialOf, type FHit, type ForestOpts } from './model.ts';
import type { Trial } from '../trial/model.ts';
import '../charts.css';

/** The trials' effect sizes on one scale. A row is a button over its band (a keyboard and a screen reader reach it); onSelect tells which one was tapped. */
export function ForestCard({ ids, highlight = null, selected = null, notes = null, why = null, onSelect }: { ids: readonly string[]; highlight?: ForestOpts['highlight']; selected?: string | null; notes?: ForestOpts['notes']; why?: ForestOpts['why']; onSelect?: (id: string) => void }) {
  const trials = useMemo(() => ids.map((id) => trialOf(id)).filter((t): t is Trial => !!t), [ids]);
  const [hits, setHits] = useState<FHit[]>([]);
  const hl = highlight ? [...highlight].join() : '';
  return (
    <div className="pz-forest" role="group" aria-label="Trial effects on one scale" style={{ position: 'relative' }}>
      <Chart tag="chart:forest" deps={[ids.join(), hl, selected, JSON.stringify(notes), JSON.stringify(why)]} label={forestWords(trials)}
        build={(c) => {
          const out = forestFrame(trials, c, { highlight, selected, notes, why });
          // the bands of the rows at this width (the buttons over them move only when the layout does)
          setHits((old) => (JSON.stringify(old) === JSON.stringify(out.hits) ? old : out.hits));
          return out.frame;
        }} />
      {onSelect && hits.map((q) => <button key={q.id} type="button" className="tf-hit" aria-pressed={q.id === selected} aria-label={trials.find((t) => t.id === q.id)?.short ?? q.id} onClick={() => onSelect(q.id)} style={{ position: 'absolute', left: 0, right: 0, top: q.y, height: q.h, background: 'transparent', border: 0, padding: 0 }} />)}
    </div>
  );
}

import type { Slide } from '../../decks/schema.ts';
import type { Readings } from '../ui-store.ts';
import { ladderRows, gapOf } from './ladder-model.ts';
import { Roll } from './Roll.tsx';

/** The pressures the slide has measured so far, as bars on one axis; on the result slide, the subtraction and its band. */
export function LadderCard({ ladder, readings }: { ladder: NonNullable<Slide['ladder']>; readings: Readings }) {
  const rows = ladderRows(ladder.rows, readings);
  const gap = ladder.result ? gapOf(readings) : null;
  return (
    <>
      <div className="dk-ladder-head"><p className="dk-kicker">Pressures</p><span>mmHg</span></div>
      <div className="dk-ladder">
        {rows.map((r) => (
          <div key={r.key} className="dk-row" data-tone={r.tone}>
            <span>{r.label}</span>
            <span className="dk-bar" aria-hidden="true"><i style={{ ['--w' as string]: r.frac }} /></span>
            <b className="dk-num"><Roll text={r.text} /></b>
          </div>
        ))}
      </div>
      {gap && (
        <div className="dk-gap">
          <span>HVPG = {gap.whvp} − {gap.fhvp} = <span className="dk-num"><Roll text={gap.hvpg} /></span></span>
          {gap.sev && <span className="dk-pill" data-sev={gap.sev}><i />{gap.pill}</span>}
        </div>
      )}
    </>
  );
}

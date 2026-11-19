import type { Slide } from '../../decks/schema.ts';
import type { Readings } from '../ui-store.ts';
import { ladderRows, gapOf } from './ladder-model.ts';
import { Roll } from './Roll.tsx';

const RATE = { ok: 'ok', caution: 'mid', danger: 'hi' } as const;

/** The data card, on the 2D app's own markup (`.pz-dh`, `.pz-tiles`, `.pz-tile`, `.pzt-k`, `.pzt-v`): the pressures the slide has measured so far, one tile each;
 *  on the result slide the subtraction and its band. The tiles' type, surface and rating colours are the lifted 2D rules. */
export function LadderCard({ ladder, readings }: { ladder: NonNullable<Slide['ladder']>; readings: Readings }) {
  const rows = ladderRows(ladder.rows, readings);
  const gap = ladder.result ? gapOf(readings) : null;
  return (
    <>
      <div className="pz-dh"><span>Pressures</span><span className="pz-unit">mmHg</span></div>
      <div className="pz-tiles" data-n={rows.length}>
        {rows.map((r) => (
          <div key={r.key} className="pz-tile" data-rate={r.key === 'hvpg' && gap?.sev ? RATE[gap.sev] : r.value == null ? 'none' : 'plain'}>
            <span className="pzt-k">{r.label}</span>
            <span className="pzt-vu"><span className="pzt-v"><Roll text={r.text} /></span></span>
          </div>
        ))}
      </div>
      {gap && (
        <p className="pz-line">
          HVPG = {gap.whvp} − {gap.fhvp} = <span className="pz-val"><Roll text={gap.hvpg} /></span>
          {gap.sev && <span className="pz-val tone dk-sev" data-rate={RATE[gap.sev]} style={{ ['--tone' as string]: 'var(--text)' }}> {gap.pill}</span>}
        </p>
      )}
    </>
  );
}

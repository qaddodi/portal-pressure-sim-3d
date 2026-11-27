import type { Slide } from '../../decks/schema.ts';
import type { Readings } from '../ui-store.ts';
import { ladderRows, gapOf } from './ladder-model.ts';
import { Tile, useTileFit } from './TilesCard.tsx';
import { tileView } from './tiles-2d.ts';
import { HV_BLOCKED_KEY, hvpgNotMeasurable } from '../cuts.ts';
import { useRef } from 'react';
import { Roll } from './Roll.tsx';

const RATE = { ok: 'ok', caution: 'mid', danger: 'hi' } as const;

/** The data card, on the 2D app's own markup (`.pz-dh`, `.pz-tiles`, `.pz-tile`, `.pzt-k`, `.pzt-v`): the pressures the slide has measured so far, one tile each, each the 2D tile (its name
 *  and unit from the 2D table, its rating word and colour, its scale bar: tiles-2d.ts); on the result slide the subtraction and its band. */
export function LadderCard({ ladder, readings }: { ladder: NonNullable<Slide['ladder']>; readings: Readings }) {
  const rows = ladderRows(ladder.rows, readings);
  const gap = ladder.result ? gapOf(readings) : null;
  const row = useRef<HTMLDivElement>(null);
  useTileFit(row, rows.map((r) => `${r.key}${r.text}`).join('|'));
  return (
    <>
      <div className="pz-dh"><span>Pressures</span><span className="pz-unit">mmHg</span></div>
      <div className="pz-tiles" ref={row} data-n={rows.length}>
        {rows.map((r) => <Tile key={r.key} t={{ ...tileView(r.key, { [r.key]: r.value, ...(hvpgNotMeasurable(readings) ? { [HV_BLOCKED_KEY]: 1 } : null) }), text: r.text }} />)}
      </div>
      {gap && (
        <p className="pz-line eq-line">
          HVPG = <span className="eq-wedge">{gap.whvp}</span> − <span className="eq-hv">{gap.fhvp}</span> = <span className="pz-val"><Roll text={gap.hvpg} fit /></span>
          {gap.sev && <span className="pz-val tone dk-sev" data-rate={RATE[gap.sev]} style={{ ['--tone' as string]: 'var(--text)' }}> {gap.pill}</span>}
        </p>
      )}
    </>
  );
}

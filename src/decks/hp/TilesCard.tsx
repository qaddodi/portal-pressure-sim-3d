import './tiles.css';
import { useStates } from './calc.ts';
import { tileRows, deltaFrom, type TileSpec } from './tiles-model.ts';
import { Roll } from '../../ui/cards/Roll.tsx';

/** The data card of tiles: each reading from the engine's state of this slide (never typed), the key ones strong, the change from another slide's state beside it. `ids` are the deck's slide ids in order. */
export function TilesCard({ spec, ids }: { spec: TileSpec; ids: readonly string[] }) {
  const results = useStates((s) => s.results[spec.deck]);
  const at = (id: string | null) => { const i = id ? ids.indexOf(id) : -1; return i >= 0 ? results?.[i]?.fp ?? null : null; };
  const rows = tileRows(spec, at(spec.slide), at(deltaFrom(spec, ids)), spec.resp ? at(deltaFrom({ ...spec, delta: spec.resp }, ids)) : null);
  return (
    <div className="hp-tiles">
      {rows.map((r) => (
        <div key={r.key} className="hp-tile" data-key={r.key_}>
          <span>{r.name}<small>{r.sub}</small></span>
          <b className="dk-num"><Roll text={r.text} /></b>
          {r.delta && <span className="hp-delta" data-good={r.delta.good ?? undefined}>{r.delta.text}</span>}
        </div>
      ))}
    </div>
  );
}

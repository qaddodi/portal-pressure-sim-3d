// The Compare view of Tests > IR > TIPS (2D ir-compare.js): what the stent changed since the moment pinned with Compare (the app's own pin, useCompare). A Then | Now | Change table for the stent's own
// readings in the compare table's own look (.cmp-table, lifted from the 2D stylesheet); with nothing pinned the table is there with dashes and one line says how to pin, so pinning fills it in and nothing shifts.
import { latest, useEngine } from '../../../engine/index.ts';
import { useCompare } from '../../compare/store.ts';
import { compareHeads, compareNote, compareRows } from './compare-model.ts';
import type { StentId } from './store.ts';

type M = Record<string, unknown>;
export function CompareView({ which }: { which: StentId }) {
  const snap = useCompare((c) => c.snap);
  // the table follows the live frame: a re-render only when a printed word changes
  useEngine((s) => { void s.frames; return compareRows({ then: (snap?.metrics ?? null) as M | null, now: (latest.frame?.metrics ?? null) as M | null, which }).map((r) => `${r.b}|${r.txt}`).join(); });
  const rows = compareRows({ then: (snap?.metrics ?? null) as M | null, now: (latest.frame?.metrics ?? null) as M | null, which });
  const [thenW, nowW] = compareHeads(snap);
  return (
    <div className="ir-compare ir-fade" data-sub-view="compare">
      <p className="ctl-sub ir-note">{compareNote(snap)}</p>
      <table className="cmp-table">
        <thead><tr><th>Reading</th><th>{thenW}</th><th>{nowW}</th><th>Change</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td><span className="cmp-n">{r.name}</span><span className="unit">{r.unit}</span></td>
              <td className="a">{r.a}</td>
              <td className="b">{r.b}</td>
              <td className={r.cls}>{r.tri ? <span className="tri" aria-hidden="true">{r.tri}</span> : null}{r.txt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

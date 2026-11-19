// `?parity`: how far the 3D app is from the 2D app, as one page for the owner. The numbers are src/parity/score.ts over parity/inventory.json
// (the 2D app's rows, regenerated from the 2D source) and the `claims` each batch exports. Nothing here is typed by hand: a row is "present" only
// while a batch's claim says its control, word or card is on the screen, and "wired" when it also does what the 2D one does.
import { useMemo, useState } from 'react';
import inventory from '../../parity/inventory.json';
import { score, pct, BATCH_NAMES, type Claimed, type Row, type Tally } from './score.ts';
import type { Claim } from './claim.ts';
import './parity.css';

const modules = import.meta.glob<{ claims?: readonly Claim[] }>('./*.ts', { eager: true });
function claimed(): Claimed[] {
  const out: Claimed[] = [];
  for (const [path, m] of Object.entries(modules)) {
    const file = path.slice(2);
    if (!/^(b\d+[a-z]?|s\d)\.ts$/.test(file)) continue;
    for (const c of m.claims ?? []) out.push({ id: c.id, wired: c.wired, file });
  }
  return out;
}

function Bar({ t }: { t: Tally }) {
  return (
    <div className="pp-bar" role="img" aria-label={`${t.x} of ${t.y} present, ${t.w} wired`}>
      <i className="pp-bar-x" style={{ transform: `scaleX(${t.y ? t.x / t.y : 0})` }} />
      <i className="pp-bar-w" style={{ transform: `scaleX(${t.y ? t.w / t.y : 0})` }} />
    </div>
  );
}
const Nums = ({ t }: { t: Tally }) => <span className="pp-nums"><b>{t.x}</b> of {t.y}<small> · {t.w} wired · {pct(t)}%</small></span>;

export function ParityPage() {
  const rows = inventory.rows as Row[];
  const s = useMemo(() => score(rows, claimed()), [rows]);
  const [showAll, setShowAll] = useState(false);
  const [batch, setBatch] = useState<string | null>(null);
  const from = inventory.generatedFrom as { commit: string; branch?: string };
  return (
    <div className="pp-scroll"><main className="pp selectable">
      <header>
        <h1>3D app against the 2D app</h1>
        <p className="pp-big"><b>{s.total.x}</b> of {s.total.y} rows present<small> · {s.total.w} wired · {pct(s.total)}% present, {pct(s.total, 'w')}% wired</small></p>
        <Bar t={s.total} />
        <p className="pp-note">
          A row is a control, word, shortcut, preset, deck, slide or card in the 2D app (read from its source, 2D commit {from.commit.slice(0, 8)}). <b>Present</b> means the 3D app shows it with the 2D words; <b>wired</b> means it also does what the 2D one does. Rows no batch has built are listed under each group.
        </p>
        <label className="pp-check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Also list the rows that are present</label>
      </header>

      <section>
        <h2>By batch</h2>
        <table className="pp-table">
          <tbody>
            {s.byBatch.map(({ batch: b, tally }) => (
              <tr key={b} className={batch === b ? 'on' : ''} onClick={() => setBatch(batch === b ? null : b)}>
                <th scope="row">{b} <span>{BATCH_NAMES[b] ?? ''}</span></th>
                <td><Bar t={tally} /></td>
                <td><Nums t={tally} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {batch && <p className="pp-note">Showing only {batch}'s rows below. <button onClick={() => setBatch(null)}>Show all</button></p>}
      </section>

      <section>
        <h2>By area</h2>
        {s.byArea.map((g) => {
          const list = g.rows.filter((r) => !batch || r.batch === batch);
          const shown = showAll ? list : list.filter((r) => r.state === 'missing');
          const present = g.rows.filter((r) => r.state === 'present' && (!batch || r.batch === batch)).length;
          if (batch && !g.batches.includes(batch)) return null;
          return (
            <details key={g.group} className="pp-group">
              <summary>
                <span className="pp-name">{g.group}</span>
                <Bar t={g.tally} />
                <Nums t={g.tally} />
              </summary>
              {shown.length === 0 ? <p className="pp-none">{g.tally.x === g.tally.y ? 'Everything here is present.' : 'Nothing to list.'}</p> : (
                <ul>
                  {shown.map((r) => <li key={r.id} data-state={r.state}><span className="pp-tag">{r.batch}</span> {r.label} <code>{r.id}</code>{r.state !== 'missing' && <em> {r.state}</em>}</li>)}
                </ul>
              )}
              {!showAll && present > 0 && <p className="pp-none">{present} present but not yet wired (tick the box above to list them).</p>}
            </details>
          );
        })}
      </section>

      {(s.unknown.length > 0 || s.duplicates.length > 0) && (
        <section>
          <h2>Claims that do not match the inventory</h2>
          <ul>
            {s.unknown.map((c) => <li key={c.file + c.id}>{c.file} claims <code>{c.id}</code>, not in the 2D inventory</li>)}
            {s.duplicates.map((d) => <li key={d.id}><code>{d.id}</code> is claimed by {d.files.join(' and ')}</li>)}
          </ul>
        </section>
      )}
    </main></div>
  );
}

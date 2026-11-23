// "What happened" (docs/approved/timeline-chart.md): the events and changes as a ruled list, a page at a time (nothing scrolls inside a card). The chosen row opens to its words and numbers; a TIPS
// opens to its route, its stent and the numbers before and after.
import { useMemo } from 'react';
import { baseName, type Data } from './data.ts';
import { isTips, readingsAt, tipsFacts, type Params } from './facts.ts';
import { useBig } from './store.ts';
import { useBox } from './use-box.ts';
import { BT } from './words.ts';

const ROW = 38, OPEN_EXTRA = 56, FOOT = 40;
const TONE: Record<string, string> = { ok: 'var(--ok-ink)', caution: 'var(--caution-ink)', danger: 'var(--danger-ink)', change: 'var(--text)', info: 'var(--text-2)' };

export function Happened({ data, onPick }: { data: Data; onPick(day: number): void }) {
  const row = useBig((s) => s.row), page = useBig((s) => s.page), hidden = useBig((s) => s.hidden), set = useBig.getState().set;
  const box = useBox<HTMLDivElement>();
  const rows = useMemo(() => data.happened.filter((e) => !(e.kind === 'change' && hidden.has(baseName(e.label)) && !e.keys?.some((k) => k.startsWith('drug:')))), [data.happened, hidden]);
  const open = rows.find((r) => r.id === row) ?? null;
  const per = Math.max(3, Math.floor((box.h - FOOT - (open ? OPEN_EXTRA : 0)) / ROW)), pages = Math.max(1, Math.ceil(rows.length / per));
  const at = Math.max(0, Math.min(pages - 1, page < 0 ? pages - 1 : page));
  // a first look shows the newest (page -1 follows the last page as rows come); Earlier and Later page from there
  const shown = rows.slice(at * per, at * per + per);
  if (!rows.length) return <div ref={box.ref} className="bt-happen"><p className="bt-empty"><b>{BT.nothingHappened}</b></p></div>;
  return (
    <div ref={box.ref} className="bt-happen">
      <ol className="bt-list">
        {shown.map((r) => {
          const isOpen = r.id === row;
          const end = data.full[1];
          const ser = { pv: data.series.pv, ivc: data.series.ivc, hvpg: data.hvpg, shunt: data.series.shunt, asc: data.series.asc };
          const facts = isOpen && isTips(r.keys, r.params) ? tipsFacts(r.params as Params, r.day, end, ser) : [];
          return (
            <li key={r.id} data-open={isOpen || undefined} data-kind={r.kind}>
              <button type="button" aria-expanded={isOpen} onClick={() => { set({ row: isOpen ? null : r.id }); if (!isOpen) onPick(r.day); }}>
                <span className="bt-when">{BT.day(r.day)}</span>
                <span className="bt-what" style={isOpen ? { color: TONE[r.tone] } : undefined}>{r.label}</span>
              </button>
              {isOpen && (
                <div className="bt-more">
                  {r.detail && r.kind === 'event' && <p>{r.detail}</p>}
                  {facts.length > 0 ? <dl>{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : <p className="bt-read">{readingsAt(r.day, { pv: data.series.pv, ivc: data.series.ivc, hvpg: data.hvpg })}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {pages > 1 && (
        <p className="bt-pager">
          <button type="button" disabled={at <= 0} onClick={() => set({ page: at - 1 })}>{BT.earlier}</button>
          <button type="button" disabled={at >= pages - 1} onClick={() => set({ page: at + 1 >= pages - 1 ? -1 : at + 1 })}>{BT.later}</button>
        </p>
      )}
    </div>
  );
}

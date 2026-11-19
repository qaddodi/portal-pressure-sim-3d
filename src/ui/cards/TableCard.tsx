// The summary table (the 2D `visual: 'table'`), in the data card's place: one block per patient, its readings in a grid under its name, each with the arrow the 2D table draws against normal
// (or against the row it is compared with) and the colour that goes with it. Every cell is computed by table-model.ts from the 2D app's own cut-offs. A row that names a slide opens that slide.
// Text keeps its size and nothing scrolls: the blocks stack, and a screen that cannot hold them all makes the card taller (the planner pages or widens), never smaller type.
import { useEffect, useMemo, useState } from 'react';
import type { Deck, Slide } from '../../decks/schema.ts';
import { useUi } from '../ui-store.ts';
import { tableModel, type Cell } from '../talk/table-model.ts';
import { resolveTable, useTables, fpOfSlide, pendingRows } from '../talk/table-rows.ts';
import { CUT } from '../deck/from2d/table-marks.js';

const ARROW = ['↓↓', '↓', '•', '↑', '↑↑'];
const glyph = (c: Cell) => (c.kind === 'blank' ? '○' : c.kind === 'dir' ? ARROW[c.arrow + 2] : '');

export function TableCard({ deck, slide }: { deck: Deck; slide: Slide }) {
  const spec = slide.table!;
  const key = `${deck.id}:${slide.id}`;
  const stored = useTables((s) => s.rows[key]);
  const pending = useMemo(() => pendingRows(deck, slide), [deck, slide]);
  const rows = stored ?? pending;
  const [cut, setCut] = useState('');
  useEffect(() => { resolveTable(deck, slide); }, [deck, slide]);
  const model = useMemo(() => tableModel(spec, rows, (id) => fpOfSlide(deck, id)), [rows, spec, deck]);
  const showCut = (k: string, label: string) => () => setCut(`${label}: ${(CUT as Record<string, string>)[k] ?? ''}`);
  return (
    <div className="dk-tbl" aria-label={spec.rowHead || 'Summary table'}>
      <div className="dk-tbl-head"><p className="dk-kicker">{spec.rowHead || 'Summary'}</p></div>
      {model.rows.map((r, n) => (
        <section key={`${r.key}:${n}`} className="dk-trow" data-ref={r.ref || undefined} data-focus={r.focus || undefined} data-cont={r.cont || undefined}
          data-on={r.i >= 0 || undefined} tabIndex={r.i >= 0 ? 0 : undefined} role={r.i >= 0 ? 'button' : undefined} aria-description={r.i >= 0 ? 'Press Enter to go to this slide' : undefined}
          onClick={r.i >= 0 ? () => useUi.getState().go(r.i) : undefined} onKeyDown={r.i >= 0 ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); useUi.getState().go(r.i); } } : undefined}>
          <header>
            {r.head && !r.cont ? <span className="dk-tkick" data-site={r.site}>{r.head}</span> : null}
            <b>{r.title}</b>
            {r.vs ? <i>{r.vs}</i> : null}
          </header>
          <div className="dk-tcells">
            {r.cells.map((c, j) => {
              const col = model.cols[j];
              return (
                <div key={c.k + j} className="dk-tcell" data-kind={c.kind} data-rate={c.rate ?? undefined} data-eff={c.eff ?? undefined} data-miss={c.miss || undefined} data-zero={c.kind === 'dir' && c.arrow === 0 ? '' : undefined}>
                  <button type="button" className="dk-tl" onClick={(e) => { e.stopPropagation(); showCut(col.k, col.label)(); }} aria-label={`${col.label}: ${col.cut}`}>{col.label}</button>
                  <span className="dk-tv" aria-hidden="true">{c.kind === 'dir' || c.kind === 'blank' ? <em className="dk-ta">{glyph(c)}</em> : null}{c.kind === 'blank' || c.kind === 'pend' ? '' : c.text}</span>
                  {c.miss ? <span className="dk-tm" aria-hidden="true">{c.miss}</span> : null}
                  <span className="sr-only">{c.sr}</span>
                </div>
              );
            })}
          </div>
          {r.notes.map((t, j) => (t ? <p key={j} className="dk-tnote">{model.noteHeads[j] ? <b className="dk-tnh">{model.noteHeads[j]}</b> : null}{t}</p> : null))}
        </section>
      ))}
      <p className="dk-tfoot">{model.legend}</p>
      {cut ? <p className="dk-tcut" role="status">{cut}</p> : null}
    </div>
  );
}

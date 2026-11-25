// The summary table (the 2D `visual: 'table'`), drawn as the 2D app draws it (presenter.js summaryTable, its own stylesheet in src/ui/styles: `.pz-table`): ONE heading row, a row per patient
// (its site's heading over its name), and in each cell the arrow against normal (or against the row it is compared with) in the colour that goes with it, and no number: the numbers are
// the reference row's (the anchor for the arrows) and the words a screen reader and a long press hear. On a phone each row is one line of a grid (styles: `.pz-table tr`). Every cell is computed by
// table-model.ts from the 2D app's own cut-offs. A row's finding (its `note`) is one quiet line under its name, never a row of its own (the approved one-line-per-case layout, docs/approved/comparison-table.md). A row that names a slide opens that slide. Text keeps its size and nothing scrolls inside the card.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Deck, Slide } from '../../decks/schema.ts';
import { useUi } from '../ui-store.ts';
import { tableModel, type Cell } from '../talk/table-model.ts';
import { resolveTable, useTables, fpOfSlide, pendingRows } from '../talk/table-rows.ts';
import { CUT } from '../deck/from2d/table-marks.js';
import { missWords, longestWord, colChars, gridOf } from './table-words.ts';
import { WaveCell } from './WaveCell.tsx';
import { observeThenFit } from '../layout/fit-later.ts';
import { turnHeads } from './table-heads.ts';

/** 2D's purpose-drawn arrow (styles `.pz-arr`): one arrow, two, or the level dash for a cell within normal. */
export const Arrow = ({ n }: { n: number }) => {
  const m = Math.abs(n);
  return <span className={`pz-arr${n < 0 ? ' dn' : ''}${n === 0 ? ' zero' : ''}${m === 2 ? ' two' : ''}`} aria-hidden="true"><i className="pz-ag">{Array.from({ length: Math.max(1, m) }, (_, k) => <i key={k} />)}</i></span>;
};
const None = () => <span className="pz-nm" aria-hidden="true" />;
/** A legend line with its symbols drawn as the table's own (2D withArrows): arrows, the dash and the ring. */
/** `rated`: the table's cells are rated against normal (not against a row), so a legend arrow wears the colour its cells do: one arrow past normal amber, two past the red cut-off red, below and level quiet (the cells' `data-rate`). */
export const withArrows = (t: string, rated = false) => t.split(/(↑↑|↓↓|↑|↓|•|○)/).map((x, i) => {
  const tone = (r: 'mid' | 'hi' | null, el: ReactNode) => (rated && r ? <span key={i} className="pz-lg" data-rate={r}>{el}</span> : el);
  return x === '↑↑' ? tone('hi', <Arrow key={i} n={2} />) : x === '↓↓' ? tone('hi', <Arrow key={i} n={-2} />) : x === '↑' ? tone('mid', <Arrow key={i} n={1} />) : x === '↓' ? <Arrow key={i} n={-1} /> : x === '•' ? <Arrow key={i} n={0} /> : x === '○' ? <None key={i} /> : x;
});

/** "114/68 (83)" with a place to break after the slash: on a phone its column (a seventh of the row) is narrower than "114/68" itself, and a word that cannot break runs into the next cell. */
export const bpBreaks = (t: string) => t.split('/').flatMap((x, i) => (i ? [<wbr key={i} />, '/' + x] : [x]));

/** What a flat trace says (table-wave.ts waveWords: the hover title of a row with no flow). */
const NO_FLOW = 'No flow';

function Td({ c }: { c: Cell }) {
  switch (c.kind) {
    case 'wave': return <td className="num wave" aria-hidden="true" title={c.wave!.title || undefined}>{c.wave!.trace ? <><WaveCell trace={c.wave!.trace} vessel={c.wave!.vessel} max={c.wave!.max} words={c.sr} />{c.wave!.title === NO_FLOW ? <span className="dk-tnone dk-noflow">{NO_FLOW}</span> : null}</> : c.wave!.pending ? <span className="dk-tpend" /> : <span className="dk-tnone">—</span>}<span className="sr-only">{c.sr}</span></td>;
    case 'pend': return <td className="num pend" aria-busy="true"><span className="dk-tpend" aria-hidden="true" /><span className="sr-only">calculating</span></td>;
    case 'blank': return <td className="num blank" title={c.sr}><None /><span className="sr-only">{c.sr}</span></td>;
    case 'removed': return <td className="num none">Removed</td>;
    case 'none': return <td className="num none" colSpan={2}>{c.text}</td>;   // ("No ascites" across the SAAG and protein columns it stands for: a bare "None" read as the value of one of them)
    case 'ref': return <td className={c.k === 'map' ? 'num ref bp' : 'num ref'} data-rate={c.rate ?? undefined}>{c.k === 'map' ? bpBreaks(c.text) : c.text}<span className="sr-only">{c.sr}</span></td>;
    default: return (
      <td className={`num dir${c.k === 'map' ? ' bp' : ''}${c.arrow === 0 ? ' zero' : ''}${c.miss ? ' miss' : ''}`} data-rate={c.rate ?? undefined} data-eff={c.eff ?? undefined} title={c.miss ? `${c.sr}` : `${c.text}`}>
        <Arrow n={c.arrow} /><span className="sr-only">{c.sr}</span>
      </td>
    );
  }
}

/** A column head wider than its cell: its widest word past the cell's content box (a word that spills into the cell's own 2 px of padding is still cut by the table's edge on the last column: the Liver flow head, 2 px, iPhone Quick run), or the cell's scroll width past its width. */
export function headOver(t: HTMLElement): boolean {
  if (t.scrollWidth > t.clientWidth + 1) return true;
  const cs = getComputedStyle(t), room = t.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const r = document.createRange(); r.selectNodeContents(t);
  return r.getBoundingClientRect().width > room + 0.5;
}

export function TableCard({ deck, slide }: { deck: Deck; slide: Slide }) {
  const spec = slide.table!;
  const key = `${deck.id}:${slide.id}`;
  const stored = useTables((s) => s.rows[key]);
  const pending = useMemo(() => pendingRows(deck, slide), [deck, slide]);
  const rows = stored ?? pending;
  const [cut, setCut] = useState<{ label: string; text: string } | null>(null);
  useEffect(() => { resolveTable(deck, slide); }, [deck, slide]);
  const model = useMemo(() => tableModel(spec, rows, (id) => fpOfSlide(deck, id)), [rows, spec, deck]);
  const showCut = (k: string, label: string, cutText?: string) => () => setCut({ label, text: cutText || (CUT as Record<string, string>)[k] || '' });
  const nc = model.cols.length;
  // 2D fitHeads (presenter.js): where the column heads are too wide for their columns (a phone, many columns) they stand upright (`tr.th-up`), and the name's column takes the room they give back.
  // Judged by measuring, with the upright style off, whenever the table's width or its columns change (the heads are set once, so no frame ever shows a clipped head).
  const root = useRef<HTMLDivElement>(null), headRow = useRef<HTMLTableRowElement>(null);
  const [up, setUp] = useState(false);
  const colKey = model.cols.map((c) => c.k).join();
  useLayoutEffect(() => {
    const box = root.current, tr = headRow.current;
    if (!box || !tr) return;
    const fit = () => {
      const was = tr.classList.contains('th-up');
      tr.classList.remove('th-up'); box.classList.remove('dk-up');
      const over = Array.from(tr.querySelectorAll<HTMLElement>('th.num')).some((t) => headOver(t));
      turnHeads(tr, box, over);   // (written on the page now: the card that holds this table measures in the effect that follows this one, and must see the heads as they will stand)
      if (over !== was) setUp(over);
    };
    fit();
    // The heads are judged by measuring words, and a word's width is its font's: a judgement made in the fallback font stands wrong when the real one arrives (a width the box did not change, so the observer is silent): the heads
    // stood flat, the name column narrower, every name taller, and the card was measured and locked at that taller table while the table sank to its upright one (Circuit 11 and Precipitants 11, ~100 px of empty card, capture f23a4c59).
    // So the heads are judged again when fonts arrive (registered here, before the card's own fonts pass, so the card measures the table as it will stand).
    let alive = true;
    const again = () => { if (alive) fit(); };
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts && fonts.status !== 'loaded') void fonts.ready.then(again);
    fonts?.addEventListener?.('loadingdone', again);
    const off = observeThenFit([box], fit);   // (the pass writes `dk-up` on the box it observes: never inside the observer's own delivery)
    return () => { alive = false; fonts?.removeEventListener?.('loadingdone', again); off(); };
  }, [colKey]);
  // (a Doppler column is wider than a pressure's: the grid's columns follow what each holds)
  // (the name's column takes what the value columns leave: fewer columns, a wider name; the site stands over its rows as a heading row on a phone, so a name has its column to itself)
  // (and never narrower than the longest word a name holds, which cannot break: "Schistosomiasis" ran under the next column's arrows, capture 4fb2f869)
  const longest = useMemo(() => longestWord(model.rows.map((r) => r.title)), [model.rows]);
  // (and each value column never narrower than what its cells print: "0.50" ran to the table's edge and "113/72 (86)" stood on three lines when every column was an equal share of what the name left, capture f23a4c59)
  const { grid, need } = useMemo(() => gridOf(model.cols.map((c) => c.k), model.cols.map((c, j) => colChars(model.rows.map((r) => r.cells[j])))), [model]);
  return (
    <div ref={root} className={`pz-table dk-pztable${model.rows.length >= 7 ? ' long' : ''}${up ? ' dk-up' : ''}`} role="group" aria-label={spec.rowHead || 'Summary table'} style={{ ['--nc' as string]: nc, ['--dk-wn' as string]: longest, ['--dk-grid' as string]: grid, ['--dk-cols' as string]: need }}>
      <table>
        <thead>
          <tr ref={headRow} className={up ? 'th-up' : undefined}>
            <th>{model.rowHead}</th>
            {model.cols.map((c) => (
              <th key={c.k} className="num" title={c.cut || undefined} tabIndex={c.cut ? 0 : undefined}
                style={{ ['--hl' as string]: c.label.length }} onClick={c.cut ? showCut(c.k, c.label, c.cut) : undefined} onKeyDown={c.cut ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); showCut(c.k, c.label, c.cut)(); } } : undefined}><span className="hd">{c.label}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((r, n) => {
            const go = r.i >= 0 ? () => useUi.getState().go(r.i) : undefined;
            return (
              <Fragment key={`${r.key}:${n}`}>
                <tr className={`${r.i >= 0 ? '' : 'static'}${r.focus ? ' pzv-focus' : ''}${r.cont ? ' pz-cont' : ''}`.trim() || undefined} data-ref={r.ref || undefined}
                  tabIndex={r.i >= 0 ? 0 : undefined} aria-label={r.i >= 0 ? `${r.title}: go to this slide` : undefined}
                  onClick={go} onKeyDown={go ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); go(); } } : undefined}>
                  <th scope="row">
                    <span className="pz-kick" data-site={r.site || 'none'}>{r.head}</span>
                    <span className="tw"><span className="tn">{r.title}</span>{r.vs ? <span className="vs">{r.vs}</span> : null}{r.notes.map((t, j) => (t ? <span key={j} className="vs dk-tfind">{model.noteHeads.length > 1 && model.noteHeads[j] ? `${model.noteHeads[j]}: ` : ''}{t}</span> : null))}{missWords(r.cells, model.cols) ? <span className="vs dk-tfind pz-missnote">{missWords(r.cells, model.cols)}</span> : null}</span>
                  </th>
                  {r.cells.map((c, j) => <Td key={c.k + j} c={c} />)}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="pz-foot dk-tfoot">{withArrows(model.legend, !model.rel)}{cut ? <span className="pz-cutl" role="status"><b>{cut.label}: </b>{withArrows(cut.text.replace(/\.?$/, '.'))}</span> : null}</p>
    </div>
  );
}

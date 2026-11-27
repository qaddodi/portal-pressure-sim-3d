// The summary table (the 2D `visual: 'table'`), drawn as the 2D app draws it (presenter.js summaryTable, its own stylesheet in src/ui/styles: `.pz-table`): ONE heading row, a row per patient
// (its site's heading over its name), and in each cell an arrow, against normal (or against the row it is compared with), in the colour that goes with it;
// only the reference row prints its numbers (owner, 27 Nov: arrows without numbers on each row; this reversed L6's value in every cell).
// On a phone each row is one line of a grid (styles: `.pz-table tr`). Every cell is computed by
// table-model.ts from the 2D app's own cut-offs. A row's finding (its `note`) is one quiet line under its name, never a row of its own (the approved one-line-per-case layout, docs/approved/comparison-table.md). A row that names a slide opens that slide. Text keeps its size and nothing scrolls inside the card.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Deck, Slide } from '../../decks/schema.ts';
import { useUi } from '../ui-store.ts';
import { tableModel, type Cell } from '../talk/table-model.ts';
import { resolveTable, useTables, fpOfSlide, pendingRows } from '../talk/table-rows.ts';
import { CUT } from '../deck/from2d/table-marks.js';
import { missWords, longestWord, twoLineWidest, colChars, gridOf, waveMaxH, pastEdge } from './table-words.ts';
import { WaveCell } from './WaveCell.tsx';
import { observeThenFit } from '../layout/fit-later.ts';
import { readBox, readStyle, readMetric, readTextRects } from '../layout-snap.ts';
import { chooseHeads, wrapFits, roomFits, HEAD_AIR_PX, slantPitch, slantHeight, slantReach, slantLeftover, setHeads, headModeOf, groupRuns, showGroups, type HeadMode } from './table-heads.ts';
import { pageSpan } from './pages.ts';
import { reduced, fadeMs, D_SURFACE } from '../a11y/motion.ts';
import { ARRIVE_CSS } from '../../clock/tween.ts';

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

function Td({ c, waveH }: { c: Cell; waveH: number }) {
  switch (c.kind) {
    case 'wave': return <td className="num wave" aria-hidden="true" title={c.wave!.title || undefined}>{c.wave!.trace ? <><WaveCell trace={c.wave!.trace} vessel={c.wave!.vessel} max={c.wave!.max} words={c.sr} maxH={waveH} />{c.wave!.title === NO_FLOW ? <span className="dk-tnone dk-noflow">{NO_FLOW}</span> : null}</> : c.wave!.pending ? <span className="dk-tpend" /> : <span className="dk-tnone">—</span>}<span className="sr-only">{c.sr}</span></td>;
    case 'pend': return <td className="num pend" aria-busy="true"><span className="dk-tpend" aria-hidden="true" /><span className="sr-only">calculating</span></td>;
    case 'blank': return <td className="num blank" title={c.sr}><None /><span className="sr-only">{c.sr}</span></td>;
    case 'removed': return <td className="num none">Removed</td>;
    case 'none': return <td className="num none" colSpan={2}>{c.text}</td>;   // ("No ascites" across the SAAG and protein columns it stands for: a bare "None" read as the value of one of them)
    case 'ref': return <td className={c.k === 'map' ? 'num ref bp' : 'num ref'} data-rate={c.rate ?? undefined}>{c.k === 'map' ? bpBreaks(c.text) : c.text}<span className="sr-only">{c.sr}</span></td>;
    default: {
      // (a cell that compares is its arrow and nothing else: owner, 27 Nov 2026; its number is the hover and the screen reader's, `printsValue` in table-words.ts)
      const cls = ['num dir', c.arrow === 0 ? 'zero' : '', c.miss ? 'miss' : ''].filter(Boolean).join(' ');
      return (
        <td className={cls} data-rate={c.rate ?? undefined} data-eff={c.eff ?? undefined} title={c.miss ? `${c.sr}` : `${c.text}`}>
          <Arrow n={c.arrow} /><span className="sr-only">{c.sr}</span>
        </td>
      );
    }
  }
}

/** A column head wider than its cell: its widest word past the cell's content box (a word that spills into the cell's own 2 px of padding is still cut by the table's edge on the last column: the Liver flow head, 2 px, iPhone Quick run), or the cell's scroll width past its width. */
export function headOver(t: HTMLElement): boolean {
  if (t.scrollWidth > t.clientWidth + 1) return true;
  const cs = getComputedStyle(t), room = t.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const r = document.createRange(); r.selectNodeContents(t);
  return r.getBoundingClientRect().width > room + 0.5;
}

/** `page` of `pages`: a table too tall at the 12 px floor shows its rows by whole rows (L2, owner 27 Nov);
 *  the columns, the heads and the legend are the whole table's on every page, so a page turn moves only the rows. */
export function TableCard({ deck, slide, page = 0, pages = 1 }: { deck: Deck; slide: Slide; page?: number; pages?: number }) {
  const spec = slide.table!;
  const key = `${deck.id}:${slide.id}`;
  const stored = useTables((s) => s.rows[key]);
  const pending = useMemo(() => pendingRows(deck, slide), [deck, slide]);
  const rows = stored ?? pending;
  const [cut, setCut] = useState<{ label: string; text: string } | null>(null);
  useEffect(() => { resolveTable(deck, slide); }, [deck, slide]);
  const model = useMemo(() => tableModel(spec, rows, (id) => fpOfSlide(deck, id)), [rows, spec, deck]);
  const showCut = (k: string, label: string, cutText?: string) => () => setCut({ label, text: cutText || (CUT as Record<string, string>)[k] || '' });
  const nc = model.cols.length, waveH = waveMaxH(model.rows.length);
  // The rows on show: the whole table, or one page of it by whole rows (pages.ts pageSpan).
  // Everything that sizes the table (its columns, its longest name, its Doppler's height, its class `long`) is read from ALL its rows below,
  // so no page has a different grid from another and a page turn never moves a column.
  const span = pageSpan(model.rows.length, pages, Math.max(0, Math.min(page, pages - 1)));
  const shown = pages > 1 ? model.rows.slice(span.from, span.to) : model.rows;
  const body = useRef<HTMLTableSectionElement>(null), turned = useRef(span.from);
  // A page turned while the card is on screen fades its rows in on the arrive curve (nothing pops); before the card lands (the layer walks its pages out of sight) nothing is drawn.
  useLayoutEffect(() => {
    const was = turned.current;
    turned.current = span.from;
    const el = body.current;
    if (was === span.from || !el || typeof el.animate !== 'function' || el.closest('.dk-pos')?.getAttribute('data-live') !== 'true') return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs(D_SURFACE, reduced()), easing: ARRIVE_CSS });
  }, [span.from]);
  const runs = useMemo(() => groupRuns(model.cols.map((c) => c.group)), [model.cols]), groups = showGroups(runs);
  // (and each value column never narrower than what its cells print: "0.50" ran to the table's edge and "113/72 (86)" stood on three lines when every column was an equal share of what the name left, capture f23a4c59)
  const keys = useMemo(() => model.cols.map((c) => c.k), [model.cols]), chars = useMemo(() => model.cols.map((c, j) => colChars(model.rows.map((r) => r.cells[j]))), [model]);
  const { grid, need } = useMemo(() => gridOf(keys, chars), [keys, chars]);
  const gridIn = useRef({ keys, chars });
  gridIn.current = { keys, chars };   // (the fit pass below reads the columns as they are now, not as they were when it was set up)
  // How the column heads stand (table-heads.ts, ONE rule for every table: flat, else two lines, else 45 degrees, else staggered; never upright), and the name's column takes
  // the room the narrow heads give back.
  // Judged by measuring, with each way tried in turn, whenever the table's width or its columns change (the way is written on the page at once, so no frame ever shows a clipped head).
  const root = useRef<HTMLDivElement>(null), headRow = useRef<HTMLTableRowElement>(null);
  const [mode, setMode] = useState<HeadMode>('flat');
  // (kept in state as well as written on the page at once, as the heads are: a render that changes the box's class would otherwise wipe it)
  const [tight, setTight] = useState(false);
  const colKey = model.cols.map((c) => c.k).join();
  useLayoutEffect(() => {
    const box = root.current, tr = headRow.current;
    if (!box || !tr) return;
    const cells = () => Array.from(tr.querySelectorAll<HTMLElement>('th.num'));
    const hdOf = (t: HTMLElement) => t.firstElementChild as HTMLElement | null;
    const lineOf = (e: Element, was: number) => parseFloat(readStyle(e).lineHeight) || was;
    // Wrapped heads: a word inside its cell, on two lines at most.
    const wrapOver = () => cells().some((t) => {
      const hd = hdOf(t);
      return !wrapFits(headOver(t), hd ? readBox(hd).height : 0, lineOf(t, 14));
    });
    const headPx = () => parseFloat(readStyle(tr.querySelector('th.num') ?? tr).fontSize) || 12;
    // Slanted heads: the row is as tall as the widest head along 45 degrees; the heads lean left over the name column's empty head, and where the first one would pass the
    // table's left edge the name column keeps the room (`--dk-hl`).
    const slant = () => {
      const px = headPx(), hds = cells().map(hdOf);
      const widest = Math.max(0, ...hds.map((h) => (h ? readMetric(h, 'offsetWidth') : 0)));
      box.style.setProperty('--dk-hh', `${slantHeight(widest, px)}px`);
      let hl = 0;
      for (let pass = 0; pass < 3; pass++) {
        const edge = readBox(tr);
        const reaches = cells().map((t, j) => {
          const r = readBox(t), h = hds[j];
          return slantReach(r.left - edge.left, r.width, h ? readMetric(h, 'offsetWidth') : 0, px);
        });
        const more = slantLeftover(reaches);
        if (more <= 1) break;
        hl += more - 1;
        box.style.setProperty('--dk-hl', `${hl}px`);
      }
    };
    // The columns' least widths together must fit the table: where a cell's right edge stands past the table's (name's longest word plus every value
    // column's own width wider than the card), the name column gives way
    // (`dk-fitw`, deck-ui.css: it takes what the value columns leave and breaks its longest word with a hyphen, the last resort), never the last value column out of the card.
    const past = () => pastEdge(Array.from(box.querySelectorAll<HTMLElement>('tbody tr')));
    const widthOf = (hd: HTMLElement, from: number, to: number) => {
      const n = hd.firstChild;
      return n instanceof Text ? Math.max(0, ...readTextRects(n, from, to).map((r) => r.width)) : 0;
    };
    /** What each head asks for as a column's room: its whole width on one line, or its widest word (measured with the heads flat). */
    const asks = () => cells().map((t) => {
      const hd = hdOf(t);
      if (!hd) return { line: 0, word: 0 };
      const text = hd.textContent ?? '';
      let word = 0, at = 0;
      for (const w of text.split(' ')) { word = Math.max(word, widthOf(hd, at, at + w.length)); at += w.length + 1; }
      return { line: widthOf(hd, 0, text.length), word };
    });
    /** The most lines any name stands on now. */
    const nameLines = () => Math.max(1, ...Array.from(box.querySelectorAll<HTMLElement>('tbody th .tn'))
      .map((n) => Math.round(readBox(n).height / lineOf(n, 16))));
    /** Gives the heads room (each column as wide as `w` asks, the name giving way), or takes it back (null). */
    const room = (w: number[] | null) => {
      if (!w) { box.style.removeProperty('--dk-gridx'); box.style.removeProperty('--dk-colsx'); return; }
      const g = gridOf(gridIn.current.keys, gridIn.current.chars, w.map((x) => (x ? x + HEAD_AIR_PX : 0)));
      box.style.setProperty('--dk-gridx', g.grid); box.style.setProperty('--dk-colsx', g.need);
    };
    const fit = () => {
      box.classList.remove('dk-fitw');
      box.style.removeProperty('--dk-hl'); box.style.removeProperty('--dk-hh'); room(null);
      const was = headModeOf(tr);
      setHeads(tr, box, 'flat');
      let next: HeadMode = 'flat';
      if (cells().some((t) => headOver(t))) {
        const want = asks(), before = nameLines();
        // 1. flat with room: the columns as wide as their heads, if no name takes another line and nothing runs past the card
        room(want.map((a) => a.line));
        if (!cells().some((t) => headOver(t)) && roomFits(nameLines(), before, past())) next = 'flat';
        else {
          // 2. two lines: the heads' words break (plain columns, then with room for the widest word)
          room(null); setHeads(tr, box, 'wrap');
          let done = !wrapOver();
          if (!done) { room(want.map((a) => a.word)); done = !wrapOver() && roomFits(nameLines(), before, past()); if (!done) room(null); }
          if (done) next = 'wrap';
          else {
            // 3. 45 degrees (or staggered where the columns are closer than a slant allows)
            const px = headPx();
            next = chooseHeads(true, true, cells().every((t) => t.clientWidth >= slantPitch(px)));
          }
        }
        if (next === 'flat') setHeads(tr, box, 'flat');
      }
      setHeads(tr, box, next);   // (written on the page now: the card that holds this table measures in the effect that follows this one, and must see the heads as they will stand)
      if (next === 'slant') slant();
      const over = past();
      box.classList.toggle('dk-fitw', over);
      setTight(over);
      if (next !== was) setMode(next);
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
    const off = observeThenFit([box], fit);   // (the pass writes classes on the box it observes: never inside the observer's own delivery)
    return () => { alive = false; fonts?.removeEventListener?.('loadingdone', again); off(); };
  }, [colKey, span.from, span.to]);
  // (a Doppler column is wider than a pressure's: the grid's columns follow what each holds)
  // (the name's column takes what the value columns leave: fewer columns, a wider name; the site stands over its rows as a heading row on a phone, so a name has its column to itself)
  // (and never narrower than the longest word a name holds, which cannot break: "Schistosomiasis" ran under the next column's arrows, capture 4fb2f869)
  const longest = useMemo(() => longestWord(model.rows.map((r) => r.title)), [model.rows]);
  // (and, where the value columns leave the room, two lines of the longest name rather than three: --dk-wn2, deck-ui.css)
  const twoLines = useMemo(() => twoLineWidest(model.rows.map((r) => r.title)), [model.rows]);
  // (and each value column never narrower than what its cells print: "0.50" ran to the table's edge and "113/72 (86)" stood on three lines when every column was an equal share of what the name left, capture f23a4c59)
  return (
    <div ref={root} className={`pz-table dk-pztable${model.rows.length >= 7 ? ' long' : ''}${mode === 'slant' ? ' dk-slant' : ''}${mode === 'stagger' ? ' dk-st' : ''}${tight ? ' dk-fitw' : ''}`} role="group" aria-label={spec.rowHead || 'Summary table'} style={{ ['--nc' as string]: nc, ['--dk-wn' as string]: longest, ['--dk-wn2' as string]: twoLines, ['--dk-grid' as string]: grid, ['--dk-cols' as string]: need }}>
      <table>
        <thead>
          {groups ? (
            // (the group band: over the heads in EVERY way they stand, so what each column is ("Pressures", "Ascites") is always on the page; each group a span of its columns, and a
            // column of no group a blank of its own)
            <tr className="th-grp" aria-hidden="true">
              <th />
              {runs.map((r, n) => <th key={n} className="num g" style={{ ['--gs' as string]: r.span }}>{r.label ? <span>{r.label}</span> : null}</th>)}
            </tr>
          ) : null}
          <tr ref={headRow} className={mode === 'wrap' ? 'th-wr' : mode === 'slant' ? 'th-sl' : mode === 'stagger' ? 'th-st' : undefined}>
            <th>{model.rowHead}</th>
            {model.cols.map((c) => (
              <th key={c.k} className="num" title={c.cut || undefined} tabIndex={c.cut ? 0 : undefined}
                onClick={c.cut ? showCut(c.k, c.label, c.cut) : undefined}
                onKeyDown={c.cut ? (e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault(); e.stopPropagation(); showCut(c.k, c.label, c.cut)();
                } : undefined}><span className="hd">{c.label}</span></th>
            ))}
          </tr>
        </thead>
        <tbody ref={body}>
          {shown.map((r, k) => {
            const n = (pages > 1 ? span.from : 0) + k;
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
                  {r.cells.map((c, j) => <Td key={c.k + j} c={c} waveH={waveH} />)}
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

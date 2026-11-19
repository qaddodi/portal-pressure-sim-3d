import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Chart } from '../Chart.tsx';
import { engine } from '../../../engine/index.ts';
import type { CopiedDeck } from '../../../decks/rw/types.ts';
import type { RunSteps } from '../../../decks/rw/numbers.ts';
import { ladderData, type LadderData } from './data.ts';
import { namesFrame, stripFrame } from './frame.ts';
import { causeFit, headOf, pillReadings, stripLabel, type Fp, type LadderRow, type OfRow } from './model.ts';
import '../charts.css';

const engineRun: RunSteps = (steps) => engine().sequence(steps).then((r) => r.map((x) => (x?.fp ?? {}) as never));

/** A case's strip: its pressures on one line (a phone draws each case so; the stylesheet shows it only there, `.pz.stack .pz-pstrip`). */
export function LadderStrip({ fp, healthy, id }: { fp: Fp; healthy: Fp | null; id: string }) {
  const key = JSON.stringify([id, fp.hvpg, fp.ppg, fp.pv, fp.ra, fp.ivc]);
  return <div className="pz-pstrip"><Chart tag="chart:ladder-strip" deps={[key, healthy?.ra]} label={stripLabel(fp)} build={(c) => stripFrame(fp, healthy, c) ?? { w: c.w, h: 0, shapes: [], label: '' }} /></div>;
}

/** The stations named once over the six lines. */
export function LadderNames() {
  return <div className="pz-pstrip names"><Chart tag="chart:ladder-names" deps={[]} label="Stations from gut to heart" build={(c) => namesFrame(c)} /></div>;
}

/** The first row of a cell: the site, the cause stepping down beside it (never under 12 px), and the case's HVPG and PPG as pills (2D presenter.js fitRow). A cause that does not fit at 12 px goes under the site, whole. */
function CellHead({ r }: { r: LadderRow }) {
  const k = useRef<HTMLDivElement>(null), t = useRef<HTMLDivElement>(null), tag = useRef<HTMLDivElement>(null), pills = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ size: number | null; under: boolean }>({ size: null, under: false });
  const pl = useMemo(() => pillReadings(r.f), [r.f]);
  useLayoutEffect(() => {
    const row = k.current, tt = t.current, tg = tag.current;
    if (!row || !tt || !tg) return;
    const run = () => {
      tt.style.removeProperty('font-size'); row.classList.remove('under');
      if (!tt.offsetWidth) return;
      const z = Math.min(2, Math.max(0.5, row.getBoundingClientRect().width / row.offsetWidth || 1)), fs = parseFloat(getComputedStyle(tt).fontSize) || 12;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0, pw = pills.current?.offsetWidth ?? 0, room = row.clientWidth - tg.offsetWidth - gap - (pw ? pw + gap : 0) - 1;
      let f = causeFit(fs, tt.offsetWidth, room, 12 / z);
      if (f.under) f = { ...causeFit(fs, tt.offsetWidth, row.clientWidth - 1, 12 / z), under: true };
      setFit((o) => (o.size === (f.size !== fs ? f.size : null) && o.under === f.under ? o : { size: f.size !== fs ? f.size : null, under: f.under }));
    };
    run();
    const ro = new ResizeObserver(run);
    for (const e of [row, tt, tg, pills.current]) if (e) ro.observe(e);
    return () => ro.disconnect();
  }, [r.name, r.kicker, pl.length]);
  return (
    <div ref={k} className={`pz-cell-k${fit.under ? ' under' : ''}`}>
      <div ref={tag} className="pz-kick" data-site={r.site || 'none'}>{headOf(r)}</div>
      <div ref={t} className="pz-cell-t" style={fit.size ? { fontSize: `${fit.size.toFixed(2)}px` } : undefined}>{r.name}</div>
      <div ref={pills} className="pz-gpills">{pl.map((q) => <span key={q.k} className="pz-gpill" data-k={q.k} data-rate={q.rate}><span className="k">{q.name} </span>{q.v}</span>)}</div>
    </div>
  );
}

/** The six levels side by side (2D visual: 'ladders'): each case in a cell of its own, the site and cause in its first row, its Gut to heart chart under it. A phone draws each case on one
 *  line (the strip) with the stations named once over the six; a wide screen's cell holds `chart`, the profile chart for the row (the `profile` chart; absent, the cell shows the strip).
 *  slide: the slide with its `of` rows; deck: the deck it is in (a row names a slide of it); data: the rows when the caller has them (a specimen, a test); run: how to ask the model. */
export function LaddersCard({ slide, deck, data: given, run = engineRun, chart }: { slide: { id: string; of?: readonly OfRow[] }; deck: CopiedDeck; data?: LadderData | null; run?: RunSteps; chart?: (row: LadderRow, healthy: Fp | null) => ReactNode }) {
  const [got, setGot] = useState<LadderData | null>(null);
  useEffect(() => {
    if (given !== undefined) return;
    let live = true;
    ladderData(slide, deck, run).then((d) => { if (live) setGot(d); }, () => undefined);
    return () => { live = false; };
  }, [slide, deck, given, run]);
  const data = given !== undefined ? given : got;
  return (
    <div className="pz-grid">
      <div className="pz-grid-head" aria-hidden="true"><LadderNames /><LadderNames /></div>
      {(data?.rows ?? []).map((r, i) => (
        <div className="pz-cell" key={`${r.id ?? r.name}-${i}`}>
          <CellHead r={r} />
          <div className="pz-cc">{chart?.(r, data!.healthy)}</div>
          <LadderStrip fp={r.f} healthy={data!.healthy} id={`${r.id ?? r.name}`} />
        </div>
      ))}
    </div>
  );
}

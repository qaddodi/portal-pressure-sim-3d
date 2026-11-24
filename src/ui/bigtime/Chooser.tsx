// "What to graph" (docs/approved/timeline-chart.md): the measures grouped by unit, each a row of its name in its colour, a small history line and the reading at the crosshair. A measure that is
// off is grey. Medicines and procedures are words in the same list; the labs only a case can give are grey words with their reason.
import { useMemo, type CSSProperties } from 'react';
import { Chart, type ChartCtx } from '../charts/Chart.tsx';
import { pen, type Frame } from '../charts/scene.ts';
import { paletteOf } from '../charts/palette.ts';
import { toCss } from '../charts/colour.ts';
import { colourOf, inkOf } from './frame.ts';
import { GROUPS, MEASURES, CASE_ONLY, type Measure } from './measures.ts';
import { baseName, type Data } from './data.ts';
import { valueAt, pointsIn, maxOf, type Series } from './record.ts';
import { useBig } from './store.ts';
import { BT } from './words.ts';
import { useLookId } from '../charts/Chart.tsx';

function Spark({ s, m, off }: { s: Series; m: Measure; off: boolean }) {
  const build = (c: ChartCtx): Frame => {
    const w = Math.max(40, Math.round(c.w)), h = 28, col = colourOf(c.pal, m.tok), peak = Math.max(1e-6, maxOf(s));
    const f0 = s.x[0]!, f1 = Math.max(f0 + 1e-6, s.x[s.x.length - 1]!), X = (d: number) => 1 + (d - f0) / (f1 - f0) * (w - 2), Y = (v: number) => h - 3 - v / peak * (h - 8);
    return { w, h, label: `${m.name} over the run`, shapes: [{ k: 'path', pts: pointsIn(s, f0, f1, X, Y), pen: pen(off ? c.pal.alpha(c.pal.tok('text-3'), 0.7) : col, 1.6, { cap: 'round', join: 'round' }) }] };
  };
  return <Chart tag="bigtime-spark" glide={false} label={`${m.name} over the run`} deps={[s, off, m.id]} build={build} className="bt-spark" />;
}

export function Chooser({ data, at }: { data: Data; at: number }) {
  const on = useBig((s) => s.on), hidden = useBig((s) => s.hidden), toggle = useBig.getState().toggle, mark = useBig.getState().toggleMark;
  const look = useLookId(), pal = paletteOf(look);
  const css = (m: Measure) => toCss(inkOf(pal, m.tok));
  const meds = data.meds, procs = useMemo(() => [...new Set(data.lines.filter((l) => l.kind === 'change').map((l) => baseName(l.label)))], [data.lines]);
  // (how many rows and groups the list holds, so the row height shares the room the card gives it: nothing scrolls, nothing is cut off at the foot)
  const shown = GROUPS.map((g) => MEASURES.filter((m) => m.group === g.id && data.series[m.id])).filter((ms) => ms.length), nRows = shown.reduce((a, ms) => a + ms.length, 0);
  const sized = { '--bt-n': Math.max(1, nRows), '--bt-g': shown.length + (meds.length || procs.length ? 1 : 0) } as CSSProperties;
  return (
    <div className="bt-choose" style={sized}>
      {GROUPS.map((g) => {
        const ms = MEASURES.filter((m) => m.group === g.id && data.series[m.id]);
        if (!ms.length) return null;
        return (
          <section key={g.id} className="bt-grp">
            <header><b>{g.name}</b><span>{g.unit}</span></header>
            {ms.map((m) => {
              const v = valueAt(data.series[m.id], at), off = !on[m.id];
              return (
                <button key={m.id} type="button" className="bt-row" aria-pressed={!off} data-off={off || undefined} style={off ? undefined : { color: css(m) }} onClick={() => toggle(m.id)}>
                  <span className="bt-tick" aria-hidden="true" />
                  <span className="bt-name">{m.name}</span>
                  <Spark s={data.series[m.id]!} m={m} off={off} />
                  <span className="bt-val">{v == null ? '—' : (m.row ?? m.words)(v)}</span>
                </button>
              );
            })}
          </section>
        );
      })}
      {(meds.length > 0 || procs.length > 0) && (
        <section className="bt-grp">
          <header><b>{BT.medsTitle}</b><span>{BT.barsOnChart}</span></header>
          <p className="bt-words bt-marks">
            {meds.map((m) => <button key={m.key} type="button" data-kind="med" data-off={hidden.has(m.key) || undefined} aria-pressed={!hidden.has(m.key)} onClick={() => mark(m.key)}>{m.name}</button>)}
            {procs.map((p) => <button key={p} type="button" data-kind="proc" data-off={hidden.has(p) || undefined} aria-pressed={!hidden.has(p)} onClick={() => mark(p)}>{p}</button>)}
          </p>
        </section>
      )}
      <section className="bt-grp bt-case">
        <header><b>{BT.caseTitle}</b></header>
        <p className="bt-note">{BT.caseNote}</p>
        <p className="bt-words bt-inert">{CASE_ONLY.map((w) => <span key={w}>{w}</span>)}</p>
      </section>
    </div>
  );
}

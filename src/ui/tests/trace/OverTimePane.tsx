// Tests > Pressure > Over time (2D pressure-time.js in the dock): the header (HVPG, its word and its change), the chart (the pressures, the HVPG lane, the EKG strip) drawn by the
// shared chart GL, and under it the trace pills, Smooth and the range. The chart is a frame built from the kept record (feed.ts) on every frame the model sends, and the lines scroll
// with the clock: the right edge runs a little behind the newest sample so the trace glides between frames (LAG_S).
import { useEffect, useMemo, useRef } from 'react';
import { clock } from '../../../clock/frame.ts';
import { latest, onFrame, useEngine } from '../../../engine/index.ts';
import { Chart, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import { feed, record } from '../feed.ts';
import { toCss } from '../../charts/colour.ts';
import { paletteOf } from '../../charts/palette.ts';
import { useLookId } from '../../charts/Chart.tsx';
import { metricsOf } from '../frame.ts';
import { headOf, heroOf, createEase } from './live.ts';
import { TRACES, RANGES, traceFrame, traceLabel, activeTraces, traceColour, type TraceId, type TraceView } from './model.ts';
import { useTrace } from './store.ts';

export function OverTimePane({ plot }: { plot: number }) {
  const range = useTrace((s) => s.range), chosen = useTrace((s) => s.chosen), smooth = useTrace((s) => s.smooth), ekg = useTrace((s) => s.ekg), lane = useTrace((s) => s.lane);
  const set = useTrace.getState;
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);
  const ease = useRef(createEase());
  const wall = useRef(0), dirty = useRef(true);
  const h = Math.max(150, Math.round(plot));
  // the header, as strings: a re-render only when a word changes
  const hero = useEngine((s) => { void s.frames; const m = metricsOf(latest.frame); return JSON.stringify(heroOf(m?.hvpg)); });
  const hv = JSON.parse(hero) as ReturnType<typeof heroOf>;

  const view = (): TraceView => {
    const m = metricsOf(latest.frame), st = useTrace.getState();
    const ends: Partial<Record<TraceId | 'hvpg', number>> = {};
    for (const t of TRACES) if (t.day && Number.isFinite(m?.[t.day])) ends[t.id] = m[t.day];
    return {
      range: st.range, chosen: st.chosen, smooth: st.smooth, ekg: st.ekg, lane: st.lane,
      head: headOf(feed.last, wall.current, performance.now(), !!latest.frame?.running && latest.frame.clock !== 'disease', latest.frame?.speed ?? 1) || (latest.frame?.t ?? 0),
      ends, hvpg: m?.hvpg, hr: m?.hr,
    };
  };
  const draw = () => {
    const c = ctx.current, p = painter.current;
    if (!c || !p) return;
    const now = performance.now();
    const out = traceFrame(record, view(), { w: c.w, h, pal: c.pal, fs: c.type.sm }, (k, lo, hi) => ease.current.fn(k, lo, hi, now));
    p.show(out.frame, false);
    if (ease.current.gliding()) clock.invalidate('trace');
  };

  // the record the chart reads, and the frames that move it
  useEffect(() => {
    const need = RANGES.find((r) => r[0] === range)![2];
    if (!feed.n || feed.last - feed.t[0]! < need - 1) void feed.backfill(need).then(() => { dirty.current = true; clock.invalidate('trace'); });
  }, [range]);
  useEffect(() => {
    let hold: { release(): void } | null = null;
    const off = onFrame((f) => {
      wall.current = performance.now(); dirty.current = true;
      const run = f.running && f.clock !== 'disease';
      if (run && !hold) hold = clock.hold('trace'); else if (!run && hold) { hold.release(); hold = null; }
      clock.invalidate('trace');
    });
    const tick = clock.on('tween', () => { if (dirty.current || hold) { dirty.current = false; draw(); } });
    wall.current = performance.now();
    const f = latest.frame;
    if (f?.running && f.clock !== 'disease') hold = clock.hold('trace');
    return () => { off(); tick(); hold?.release(); };
  }, [h]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ease.current.retarget(); dirty.current = true; clock.invalidate('trace'); }, [range, chosen, smooth, ekg, lane, h]);

  const label = useMemo(() => traceLabel({ range }, +hv.num, activeTraces({ chosen })), [range, chosen, hv.num]);
  const pal = paletteOf(useLookId());
  return (
    <div className="pt">
      <div className="pt-head">
        <div className="pt-hero">
          <span className="pt-k">HVPG</span>
          <span className="pt-v"><b className="pt-num">{hv.num}</b><small>mmHg</small></span>
          <span className="pt-st"><span className="pt-sev" data-sev={hv.sev}>{hv.word}</span><span className="pt-delta" data-dir={hv.dir}>{hv.delta}</span></span>
        </div>
      </div>
      <div className="pt-box" style={{ height: h }}>
        <Chart tag="trace" painter={painter} deps={[range, chosen, smooth, ekg, lane, h]} label={label}
          build={(c) => { ctx.current = c; return traceFrame(record, view(), { w: c.w, h, pal: c.pal, fs: c.type.sm }, (k, lo, hi) => ease.current.fn(k, lo, hi, performance.now())).frame; }} />
      </div>
      <div className="pt-chips" role="group" aria-label="Traces">
        {TRACES.map((t) => (
          <button key={t.id} type="button" className="pt-chip" data-trace={t.id} aria-pressed={chosen.has(t.id)} title={t.label} aria-label={t.label} style={{ ['--chip' as string]: toCss(traceColour(pal, t.tok)) }} onClick={() => set().toggle(t.id)}>
            <i />{t.abbr}
          </button>
        ))}
        <button type="button" className="pt-chip" data-lane="ekg" aria-pressed={ekg} disabled={range !== 'beats'} title="A schematic EKG over the pressures, timed to the model's heartbeat. On the 10 s range only." aria-label="A schematic EKG over the pressures, timed to the model's heartbeat. On the 10 s range only." onClick={() => set().toggleEkg()}><i />EKG</button>
        <button type="button" className="pt-chip" data-lane="hvpg" aria-pressed={lane} title="The HVPG lane under the pressures" aria-label="The HVPG lane under the pressures" onClick={() => set().toggleLane()}><i />HVPG lane</button>
        <div className="pt-ctl">
          <button type="button" className="pt-chip pt-smooth" aria-pressed={smooth} title="Show the mean: hide beat-to-beat and respiratory variation" onClick={() => set().toggleSmooth()}>Smooth</button>
          <div className="t-seg pt-range" role="group" aria-label="Time range">
            {RANGES.map(([id, name]) => <button key={id} type="button" data-range={id} aria-pressed={range === id} onClick={() => set().setRange(id)}>{name}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}

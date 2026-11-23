// Tests > Pressure > Over time (2D pressure-time.js in the dock): the header (HVPG, its word and its change), the chart (the pressures, the HVPG lane, the EKG strip) drawn by the
// shared chart GL, and under it the trace pills, Smooth and the range. The chart is a frame built from the kept record (feed.ts) on every frame the model sends, and the lines scroll
// with the clock: the right edge runs a little behind the newest sample so the trace glides between frames (LAG_S). While the model's own clock stands still under a running page the
// freewheel replays its last beat so the sweep goes on; a time-lapse shows the days (the disease clock's trend) in place of the range chosen, which comes back after it. A
// pointer over the chart (a drag on a touch screen) reads every trace at one moment, and the changes made and the events raised are marked where they happened.
import { useEffect, useMemo, useRef } from 'react';
import { clock } from '../../../clock/frame.ts';
import { latest, onFrame, useEngine } from '../../../engine/index.ts';
import { Chart, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import { feed, record, KEYS } from '../feed.ts';
import { timeline } from '../../timeline/index.ts';
import { toCss } from '../../charts/colour.ts';
import { paletteOf } from '../../charts/palette.ts';
import { useLookId } from '../../charts/Chart.tsx';
import { metricsOf } from '../frame.ts';
import { heroOf, createEase } from './live.ts';
import { TRACES, RANGES, LAG_S, TRACE_OF, traceFrame, traceLabel, activeTraces, traceColour, type Range, type TraceId, type TraceView } from './model.ts';
import { useTrace } from './store.ts';
import { hiddenNow, useHidden, useMeasured } from '../hidden.ts';
import { Cv, useCv, usePaneHost } from '../Cv.tsx';

/** The heart rate the strip is timed to (2D rateNow). */
const rateOf = (hr: number) => Math.min(220, Math.max(30, hr > 20 ? hr : 70));

export function OverTimePane({ plot }: { plot: number }) {
  const userRange = useTrace((s) => s.range), chosen = useTrace((s) => s.chosen), smooth = useTrace((s) => s.smooth), ekg = useTrace((s) => s.ekg), lane = useTrace((s) => s.lane);
  const set = useTrace.getState;
  // The disease clock's trend is the days: while a time-lapse runs the chart shows them, then returns to the range chosen (2D ingest: setRange(clock === 'disease' ? 'days' : userRange)).
  const lapse = useEngine((s) => { void s.frames; return latest.frame?.clock === 'disease'; });
  const range: Range = lapse ? 'days' : userRange;
  // (A time-lapse over the last beats goes on sweeping the EKG strip, which keeps its own window over the days' trend.)
  const stripDays = lapse && userRange === 'beats' && ekg;
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);
  const ease = useRef(createEase());
  const wall = useRef(0), dirty = useRef(true);
  const cross = useRef<number | null>(null);
  const now = useRef({ range, stripDays });
  now.current = { range, stripDays };
  // the trace takes the height the 2D stylesheet leaves its box (.instrument-view.pt .pt-box: what is left of the card, 180 px at least), read by an observer
  const h0 = Math.max(150, Math.round(plot)), cv = useCv(h0), h = cv.h, host = usePaneHost();
  // the header, as strings: a re-render only when a word changes
  const hid = useHidden(), measuredHv = useMeasured((s) => s.lastHVPG?.hvpg ?? null);
  const hero = useEngine((s) => { void s.frames; const m = metricsOf(latest.frame); return JSON.stringify(heroOf(m?.hvpg, now.current.range, hid, measuredHv)); });
  const hv = JSON.parse(hero) as ReturnType<typeof heroOf>;

  /** The right edge of the trace: the freewheel's while the model's clock stands still, else a little behind the newest sample (2D headX). */
  const headX = (): number => {
    const f = latest.frame;
    if (feed.wheel.on) return feed.wheel.head();
    return feed.headNow(f, wall.current, clock.now());   // (the trace's own clock, forward only: never the model's, which runs backwards while a slide eases in)
  };
  /** While the model's own clock stands still under a running page (a state easing in: the frame says how long) it sends no samples: the last beat is replayed over the time that passes. */
  const advanceWheel = (t: number) => {
    const f = latest.frame as (typeof latest.frame & { parkSecs?: number | null }) | null;
    const sweep = f?.clock === 'disease' && (now.current.range === 'beats' || now.current.stripDays);
    if (!f || !f.running || f.parkSecs == null || (f.clock === 'disease' && !sweep)) { feed.wheel.stop(); return; }
    const m = metricsOf(f);
    const lv = KEYS.map((k) => (k === 'hvpg' ? m?.hvpg : TRACE_OF[k as TraceId]?.day ? m?.[TRACE_OF[k as TraceId].day!] : NaN) ?? NaN);
    const left = Math.max(0, f.parkSecs - (t - wall.current) / 1000), hd = feed.head;
    const smp = feed.wheel.advance(t, feed.fine, feed.beat.times, feed.last, feed.wheel.on ? 0 : hd[1] ? hd[0]! + Math.min(0.25, (t - hd[1]!) / 1000) : headX(), LAG_S, rateOf(m?.hr), f.phase, left, lv as never);
    if (smp) feed.layWheel(smp as unknown as Parameters<typeof feed.layWheel>[0]);
  };

  const view = (): TraceView => {
    const m = metricsOf(latest.frame), st = useTrace.getState(), r = now.current.range;
    const ends: Partial<Record<TraceId | 'hvpg', number>> = {};
    for (const t of TRACES) if (t.day && Number.isFinite(m?.[t.day])) ends[t.id] = m[t.day];
    return {
      range: r, chosen: st.chosen, smooth: st.smooth, ekg: st.ekg, lane: st.lane,
      head: headX(), off: feed.off, ends, hvpg: m?.hvpg, hr: m?.hr, hidden: hiddenNow() ?? undefined,
      cross: cross.current, marks: timeline.entries(), dayNow: latest.frame?.day ?? 0, stripHead: now.current.stripDays ? headX() : undefined,
    };
  };
  const draw = () => {
    const c = ctx.current, p = painter.current;
    if (!c || !p) return;
    const t = clock.now();
    advanceWheel(t);
    const v = view();
    if (now.current.range !== 'days') { feed.head[0] = v.head; feed.head[1] = t; }
    const out = traceFrame(record, v, { w: c.w, h, pal: c.pal, fs: c.type.sm }, (k, lo, hi) => ease.current.fn(k, lo, hi, t));
    p.show(out.frame, false);
    if (ease.current.gliding()) clock.invalidate('trace');
  };

  // the record the chart reads, and the frames that move it
  useEffect(() => {
    const need = RANGES.find((r) => r[0] === range)![2];
    if (need && (!feed.n || feed.last - feed.t[0]! < need - 1)) void feed.backfill(need).then(() => { dirty.current = true; clock.invalidate('trace'); });
    return need ? feed.want('trace', need, () => { dirty.current = true; clock.invalidate('trace'); }) : undefined;
  }, [range]);
  // The scroll runs only while the trace is moving: the model running, and a range with a sweep (the days' trend stands still unless its strip goes on).
  const hold = useRef<{ release(): void } | null>(null);
  const sync = () => {
    const f = latest.frame, run = !!f?.running && (now.current.range !== 'days' || now.current.stripDays);
    if (run && !hold.current) hold.current = clock.hold('trace', { steady: true }); else if (!run && hold.current) { hold.current.release(); hold.current = null; }
  };
  useEffect(() => {
    const off = onFrame(() => { wall.current = clock.now(); dirty.current = true; sync(); clock.invalidate('trace'); });
    const offTl = timeline.onChange(() => { dirty.current = true; clock.invalidate('trace'); });
    const tick = clock.on('tween', () => { if (dirty.current || hold.current) { dirty.current = false; draw(); } });
    wall.current = clock.now();
    sync();
    return () => { off(); offTl(); tick(); hold.current?.release(); hold.current = null; };
  }, [h]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sync(); }, [range, stripDays]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ease.current.retarget(); dirty.current = true; clock.invalidate('trace'); }, [range, chosen, smooth, ekg, lane, h, hid]);

  // The crosshair: a mouse over the chart, or a finger dragged on it, reads every trace at that moment. (The box's left edge is read as the pointer comes onto it or presses, and again
  // after a scroll or a resize, never in a move.)
  const left = useRef(0), box = useRef<HTMLDivElement>(null), over = useRef(false);
  const readLeft = () => { if (box.current) left.current = box.current.getBoundingClientRect().left; };
  const redraw = () => { dirty.current = true; clock.invalidate('trace'); };
  const setCross = (e: React.PointerEvent) => { cross.current = e.clientX - left.current; redraw(); };
  const clearCross = () => { over.current = false; cross.current = null; redraw(); };
  useEffect(() => {
    const again = () => { if (over.current) readLeft(); };
    addEventListener('scroll', again, { capture: true, passive: true }); addEventListener('resize', again, { passive: true });
    return () => { removeEventListener('scroll', again, { capture: true }); removeEventListener('resize', again); };
  }, []);

  const label = useMemo(() => traceLabel({ range }, +hv.num, activeTraces({ chosen, range })), [range, chosen, hv.num]);
  const pal = paletteOf(useLookId());
  return (
    <div className={`pt ${host.view}`} data-pane="scope">
      <div className="pt-head">
        <div className="pt-hero">
          <span className="pt-k">HVPG</span>
          <span className="pt-v"><b className="pt-num">{hv.num}</b><small>mmHg</small></span>
          <span className="pt-st"><span className="pt-sev" data-sev={hv.sev}>{hv.word}</span><span className="pt-delta" data-dir={hv.dir}>{hv.delta}</span></span>
        </div>
      </div>
      <div ref={box} className="chart-box pt-box" data-scrub="" style={host.box(h0)}
        onPointerEnter={() => { over.current = true; readLeft(); }}
        onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) setCross(e); }}
        onPointerDown={(e) => { over.current = true; readLeft(); setCross(e); }}
        onPointerLeave={clearCross} onPointerCancel={clearCross}
        onPointerUp={(e) => { if (e.pointerType !== 'mouse') clearCross(); }}>
        <Cv at={cv.ref}>
          <Chart tag="trace" painter={painter} deps={[range, chosen, smooth, ekg, lane, h, hid]} label={label}
            build={(c) => { ctx.current = c; return traceFrame(record, view(), { w: c.w, h, pal: c.pal, fs: c.type.sm }, (k, lo, hi) => ease.current.fn(k, lo, hi, clock.now())).frame; }} />
        </Cv>
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
          <div className="seg pt-range" role="group" aria-label="Time range">
            {RANGES.map(([id, name]) => <button key={id} type="button" data-range={id} aria-pressed={range === id} onClick={() => set().setRange(id)}>{name}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}

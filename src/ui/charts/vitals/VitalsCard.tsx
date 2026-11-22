import { useEffect, useMemo, useRef, useState } from 'react';
import { clock } from '../../../clock/frame.ts';
import { latest, onFrame } from '../../../engine/index.ts';
import { beatWalk, ekgSeries, walkBeats } from '../../tests/copied/ekg.copied.js';
import { feed, startFeed } from '../../tests/feed.ts';
import { metricsOf } from '../../tests/frame.ts';
import { headOf } from '../../tests/trace/live.ts';
import { LAG_S } from '../../tests/trace/model.ts';
import { Chart, type ChartCtx } from '../Chart.tsx';
import type { ChartPainter } from '../painter.ts';
import { metricsOfFp, SPAN_S, vitalCells, vitalsFrame, vitalsLabel, vitalsShown, type Cell, type Strip } from './model.ts';
import '../charts.css';

type Rec = Record<string, unknown>;
const EASE_S = 0.3;

/**
 * The bedside monitor on a slide's data card (2D: tool { kind: 'vitals', show?: ['hr','map','co','hb'], hold?, rail?: 'hb' }, vitals-monitor.js): the schematic EKG strip timed to the model's
 * own beats over up to three vital signs as large numbers. fp: the slide's settled state (its numbers, pinned); without it the live model's own. A reading past its cut-off takes the monitor's
 * alarm colour, held 1.5 s and cleared a little inside the cut-off, so a patient on a cut-off does not flicker. While the model's own clock stands still (a time-lapse, a state easing in)
 * the strip goes on by itself, laying beats at the heart rate shown.
 */
export function VitalsCard({ tool, fp = null }: { tool: Rec; fp?: Rec | null }) {
  const ids = useMemo(() => vitalsShown(tool as { show?: unknown }), [tool]);
  const hold = tool.hold === true, rail = tool.rail === 'hb' ? 'hb' : null;
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);
  const xs = useRef(new Map<string, never>()), shown = useRef(new Map<string, number>());
  const wall = useRef(0), at = useRef(0), moving = useRef(false), label = useRef('Vital signs');
  const synth = useRef<{ w: { x: number; ph: number; bpm: number }; times: number[]; at: number } | null>(null);
  const dirty = useRef(true), told = useRef('Vital signs'), [said, say] = useState('Vital signs');
  const fpRef = useRef(fp);
  fpRef.current = fp;

  const strip = (m: { hr?: number } | null, now: number): Strip | null => {
    const f = latest.frame, running = !!f?.running, parked = running && (f!.clock === 'disease' || f!.morphing);
    const hr = Math.min(220, Math.max(30, (m?.hr ?? NaN) > 20 ? m!.hr! : 70)), period = 60 / hr;
    let x1: number, times: number[];
    if (parked && feed.beat.times.length) {
      if (!synth.current) {
        const live = headOf(feed.last, wall.current, now, false, 1) + LAG_S, last = feed.beat.times[feed.beat.times.length - 1]!;
        synth.current = { w: beatWalk(live, Math.min(0.99, Math.max(0, (live - last) / period)), hr), times: feed.beat.times.slice(-40), at: now };
      }
      const s = synth.current, dt = Math.min(0.25, Math.max(0, (now - s.at) / 1000));
      s.at = now;
      walkBeats(s.w, dt, hr, s.times, null);
      x1 = s.w.x - LAG_S; times = s.times;
    } else {
      synth.current = null;
      if (!Number.isFinite(feed.last)) return null;
      x1 = headOf(feed.last, wall.current, now, running, f?.speed ?? 1) || feed.last; times = feed.beat.times;
    }
    const x0 = Math.max(x1 - SPAN_S, feed.n ? feed.t[0]! : x1 - SPAN_S);
    if (!(x1 > x0 + 0.05) || !times.length) return null;
    const e = ekgSeries(times, x0, x1, period) as { x: number[]; v: number[] };
    return e.x.length > 1 ? { x: e.x.slice(), v: e.v.slice(), x1 } : null;
  };

  const build = (c: ChartCtx) => {
    ctx.current = c;
    const now = clock.now(), f = latest.frame, pin = fpRef.current;
    const m = pin ? metricsOfFp(pin) : metricsOf(f);
    const raw = vitalCells(m, ids, xs.current as never, !!f?.running, now);
    const dt = Math.min(0.1, Math.max(0, (now - at.current) / 1000));
    at.current = now;
    let mv = false;
    const ease = (key: string, v: number, d: number) => {
      let sv = shown.current.get(key);
      if (sv == null || !Number.isFinite(sv)) sv = v;
      else if (Math.abs(v - sv) < Math.pow(10, -d) * 0.05) sv = v;
      else { sv += (v - sv) * -Math.expm1(-dt / EASE_S); mv = true; }
      shown.current.set(key, sv);
      return sv;
    };
    const cells: Cell[] = raw.map((c0) => {
      if (!Number.isFinite(c0.v)) return c0;
      const bp = c0.id === 'map' && Number.isFinite(c0.s) && Number.isFinite(c0.dia);
      return { ...c0, v: ease(c0.id, c0.v, c0.d), s: bp ? ease('map.s', c0.s, 0) : c0.s, dia: bp ? ease('map.d', c0.dia, 0) : c0.dia };
    });
    moving.current = mv;
    const fr = vitalsFrame({ ids, cells, hold, rail, toHb: (m as { blood?: { hbSettled?: number } } | null)?.blood?.hbSettled, strip: strip(m as { hr?: number } | null, now) }, c.w, c.pal);
    label.current = vitalsLabel(cells);
    return fr;
  };

  const draw = () => { const c = ctx.current, p = painter.current; if (c && p) p.show(build(c), false); if (label.current !== told.current) { told.current = label.current; say(label.current); }
    if (moving.current) clock.invalidate('vitals'); };

  useEffect(() => {
    startFeed();
    void feed.backfill(SPAN_S).then(() => clock.invalidate('vitals'));
    let hd: { release(): void } | null = null;
    const sync = () => {
      const f = latest.frame, run = !!f?.running;
      if (run && !hd) hd = clock.hold('vitals', { steady: true }); else if (!run && hd) { hd.release(); hd = null; }
    };
    const off = onFrame(() => { wall.current = clock.now(); sync(); clock.invalidate('vitals'); });
    const tick = clock.on('tween', () => { if (hd || moving.current || dirty.current) { dirty.current = false; draw(); } });
    wall.current = clock.now();
    sync();
    return () => { off(); tick(); hd?.release(); };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { dirty.current = true; clock.invalidate('vitals'); }, [fp, ids, hold, rail]);

  return (
    <div className="pz-vitals">
      <Chart tag="vitals" painter={painter} glide={false} deps={[fp, ids, hold, rail]} label={said} build={build} />
    </div>
  );
}

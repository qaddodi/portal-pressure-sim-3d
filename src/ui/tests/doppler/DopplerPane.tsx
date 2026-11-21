// Tests > Doppler (2D doppler.js in the dock): pulsed-wave velocity in one vessel as the scanner draws it (a grey-scale spectrum on black, flow toward the transducer above the baseline),
// with the reading a sonographer would report beside it: the direction, the velocity against the vessel's usual range, the waveform pattern, and tiles (Speed, Max, Trough, Pulsatility,
// the portal vein's congestion index, a stent's three gates). The vessel menu, the display (Spectrum, Color, Variance), Invert and the sweep window are the 2D controls.
// The words and judgements are the 2D app's (copied: copied/doppler-*.copied.js); the spectrum is drawn on the GPU by the shared chart drawer (model.ts says how).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './copied/doppler-2d.copied.css';
import { I } from '../../shell/icons.tsx';
import { EDGES } from '../../../engine/hales/portal/topology.js';
import { clock } from '../../../clock/frame.ts';
import { onFrame, latest } from '../../../engine/index.ts';
import { Chart, type ChartCtx } from '../../charts/Chart.tsx';
import { MAX_DPR } from '../../charts/gl.ts';
import type { ChartPainter } from '../../charts/painter.ts';
import { feed } from '../feed.ts';
import type { PaneProps } from '../TestsLayer.tsx';
import { DopplerModel, WINDOWS, type DopMode, type Report } from './model.ts';
import { PROBES, EI, PAD_L, PAD_R, probeName } from './copied/doppler-tables.copied.js';
import { DOPPLER_MODES } from './copied/doppler-colours.copied.js';
import { setDopplerProbe, useDopplerProbe, type Gate } from './probe-state.ts';
import { spectrumUnder } from './spectrum-gl.ts';
import { Cv, useCv, usePaneHost } from '../Cv.tsx';
import { useSlidePin } from '../slide/pin.ts';
import { observeThenFit } from '../../layout/fit-later.ts';

const same = (a: Report | null, b: Report) => !!a && JSON.stringify(a) === JSON.stringify(b);
/** The chart canvas's pixel ratio (charts/gl.ts): a spectral line is one of its pixels wide. */
const dprNow = () => Math.min(MAX_DPR, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));

export function DopplerPane(p: PaneProps & { /** a slide's own options (2D tool: mode, calipers, pair, scale, baseline, waves); the next slide returns to the defaults unless it names them */ options?: Record<string, unknown>; /** a slide's data card: the slide's own steady reading (slide/pin.ts), the stent's three places named but not picked (2D createDoppler pickGate: false) */ slide?: boolean }) {
  const model = useRef<DopplerModel | null>(null);
  if (!model.current) { model.current = new DopplerModel(); model.current.gpu = typeof WebGL2RenderingContext !== 'undefined'; model.current.slide = !!p.slide; if (p.options) model.current.configure(p.options); }
  const m = model.current;
  m.slide = !!p.slide;
  const pinN = useSlidePin((s) => s.n);
  const painter = useRef<ChartPainter | null>(null);
  const [mode, setMode] = useState<DopMode>(m.mode);
  const [invert, setInvert] = useState(m.invert);
  const [sweepIndex, setSweepIndex] = useState(m.sweepIndex);
  const [rep, setRep] = useState<Report | null>(null);
  const probe = useDopplerProbe((s) => s.probe);
  const setGate = useDopplerProbe((s) => s.setGate);
  const gate = useDopplerProbe((s) => s.gate);
  const dirty = useRef(true);
  const lastRep = useRef<Report | null>(null);
  // the spectrum is drawn at the size the 2D stylesheet gives its box (.dop-box: 1.6 to 1 beside the report, the height left on a sheet), read by an observer (Cv.tsx)
  const h0 = Math.max(150, Math.round(p.plot)), cv = useCv(h0), h = cv.h, host = usePaneHost();
  const ctxRef = useRef<ChartCtx | null>(null);
  const aria = useRef('Spectral Doppler');
  // (the box's height as the layout gives it now: the clock's draw is registered once, so it must read it here and not from the render it was made in; a draw at the first render's height drew a
  //  trace 150 px tall in a panel laid out 226 px, Mohammad's phone, 20 Nov)
  const hRef = useRef(h);
  hRef.current = h;
  // a slide's data card: the report sits over the monitor's top strip (2D --dop-ov), the trace begins under the strip's words (2D stripLayout: their bottom less the box's top, plus 4 px)
  const reportRef = useRef<HTMLDivElement>(null);
  const [ovTop, setOvTop] = useState<number | null>(null);
  // (2D doppler.js reads `--dop-ov` from the box's style, which its stylesheet sets on a slide's data card, on the Tests card beside the figure and on a phone's sheet: the report sits over the monitor's top strip
  //  and the label and settings go along the foot. It was read from `p.slide` only, so the Tests card drew them along the top, under the report's words, 20 Nov 2026.)
  m.ovTop = ovTop;

  const refresh = () => {
    const r = m.report();
    aria.current = r.aria || 'Spectral Doppler';
    if (!same(lastRep.current, r)) { lastRep.current = r; setRep(r); }
  };
  const draw = () => {
    const c = ctxRef.current, pt = painter.current;
    if (!c || !pt) return;
    m.dpr = dprNow();
    pt.show(m.frameFor(c.w, hRef.current, performance.now(), aria.current, c.pal.tok('doppler')), false);
    if (m.busy) clock.invalidate('doppler');   // (a mark or a letter is easing: frames until it is still, with the model paused too)
  };
  // the spectrum's pixels are 2D's own shaders, drawn under the chart's shapes on the shared context (spectrum-gl.ts); where that cannot be built the shapes lay the spectrum instead
  useEffect(() => {
    const pt = painter.current;
    if (!pt || !m.gpu) return;
    pt.setUnder(spectrumUnder(() => (m.gpu ? m.spec : null), () => { m.gpu = false; dirty.current = true; clock.invalidate('doppler'); }));
    return () => { painter.current?.setUnder(null); };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // the record opens full: the model reads the page's kept record, and the model's own past when that is short
    if (latest.frame) { m.ingest(latest.frame); refresh(); }
    if (!feed.n || feed.last - feed.t[0]! < 14) void feed.backfill(14).then(() => { m.reset(); if (latest.frame) m.ingest(latest.frame); dirty.current = true; refresh(); clock.invalidate('doppler'); });
    let hold: { release(): void } | null = null;
    const off = onFrame((f) => {
      m.ingest(f); refresh(); dirty.current = true;
      const live = m.live;
      if (live && !hold) hold = clock.hold('doppler'); else if (!live && hold) { hold.release(); hold = null; }
      clock.invalidate('doppler');
    });
    const tick = clock.on('tween', () => { if (dirty.current || hold) { dirty.current = false; draw(); } });
    if (m.live) hold = clock.hold('doppler');
    return () => { off(); tick(); hold?.release(); };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { dirty.current = true; clock.invalidate('doppler'); }, [mode, invert, sweepIndex, h, probe, gate]);
  // the slide's state changed (a what-if, a time-lapse day): the reading follows it at once, not at the next frame
  useEffect(() => { refresh(); dirty.current = true; clock.invalidate('doppler'); }, [pinN]);  // eslint-disable-line react-hooks/exhaustive-deps
  // a slide's options change in place (the next slide, a compare button): the display goes back to Spectrum unless the slide names one
  const optKey = JSON.stringify(p.options ?? null);
  const firstOpt = useRef(true);
  useEffect(() => {
    if (firstOpt.current) { firstOpt.current = false; return; }
    m.configure(p.options); setMode(m.mode); refresh(); dirty.current = true; clock.invalidate('doppler');
  }, [optKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  const stripKey = `${rep?.dir}|${rep?.vel}|${rep?.pattern}|${rep?.none}|${rep?.acquiring}`;
  useLayoutEffect(() => {
    const rp = reportRef.current, box = cv.ref.current;
    if (!rp || !box) return;
    const put = () => {
      if (!p.slide && getComputedStyle(box).getPropertyValue('--dop-ov').trim() !== '1') { setOvTop((o) => (o == null ? o : null)); return; }
      let b = -Infinity;
      for (const e of Array.from(rp.querySelectorAll<HTMLElement>('.dop-dir, .dop-vel, .dop-pattern'))) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) b = Math.max(b, r.bottom); }
      if (!Number.isFinite(b)) return;
      const t = Math.ceil(b - box.getBoundingClientRect().top) + 4;
      setOvTop((o) => (o != null && Math.abs(o - t) <= 4 && t <= o ? o : t));
    };
    put();
    if (typeof ResizeObserver !== 'function') return;
    return observeThenFit([rp, box], put);   // (after the observer's delivery: what it sets changes the size of a box above it)
  }, [p.slide, stripKey, h]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { dirty.current = true; clock.invalidate('doppler'); }, [ovTop]);

  const modes = DOPPLER_MODES as { id: DopMode; label: string; short: string }[];
  const kind = rep?.kind ?? 'portal';
  const g = rep?.gauge ?? null;
  // (the gauge's middle runs between its two round ends' centres, 4 px in from each: its share of the track less the two half ends; the track's width is read when the browser reports a new one, 2D gaugeWrite)
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    return observeThenFit([el], () => { const w = el.getBoundingClientRect().width || 0; if (w && Math.abs(w - trackW) > 0.5) setTrackW(w); });   // (after the observer's delivery: what it sets changes the size of a box above it)
  }, [!!g, trackW]);  // eslint-disable-line react-hooks/exhaustive-deps
  const sw = g ? Math.max(0.001, (g.p1 - g.p0) / 100) : 1;
  const kMid = trackW > 8 ? Math.max(0, (sw * trackW - 8) / (trackW - 8)) : sw;
  const gaugeEl = g && (
    <div className="dop-range" data-out={String(!!g.out)} title={g.title}>
      <div className="dop-track" ref={trackRef}>
        <i className="dop-band dop-band-caps">
          <i className="dop-bm" style={{ translate: `${g.p0}cqw 0`, scale: `${kMid.toFixed(4)} 1` }} />
          <i className="dop-bc" style={{ translate: `${g.p0}cqw 0` }} />
          <i className="dop-bc" style={{ translate: `calc(${g.p1}cqw - 8px) 0` }} />
        </i>
        <i className="dop-mark" style={{ translate: `${g.pm}cqw 0` }} />
      </div>
      <div className="dop-ticks">
        <span className="dop-g-zero" data-u="" style={{ translate: `${g.pz}cqw 0` }}>0</span>
        <span className="dop-g-lo" data-u={g.open ? 'cm/s' : ''} style={{ translate: `${g.p0}cqw 0` }}>{g.n0}</span>
        <span className="dop-g-hi" data-u="cm/s" hidden={g.open} style={{ translate: `${g.p1}cqw 0` }}>{g.open ? '' : g.n1}</span>
      </div>
    </div>
  );
  return (
    <div className="dop instrument-view" data-pane="doppler" data-kind={kind}>
      <div className="dop-head">
        <select className="select dop-vessel" aria-label="Vessel" value={probe} onChange={(e) => setDopplerProbe(e.target.value)}>
          {(PROBES as { id: string }[]).map((x) => <option key={x.id} value={x.id} title={EDGES[EI[x.id]!].label}>{probeName(x)}</option>)}
        </select>
        <div className="dop-btns">
          <div className="dop-modes" role="group" aria-label="Doppler display">
            {modes.map((x) => <button key={x.id} type="button" className="dop-mode-opt" data-mode={x.id} aria-pressed={mode === x.id} title={`Doppler display: ${x.label}`} onClick={() => { m.mode = x.id; setMode(x.id); }}>{x.short}</button>)}
          </div>
          <button type="button" className="dop-tint dop-inv" aria-pressed={invert} title="Invert the display: show flow away from the probe above the baseline; swaps the toward/away colors" onClick={() => { m.invert = !m.invert; setInvert(m.invert); }}><i aria-hidden="true">⇅</i><span className="dop-lbl">Invert</span></button>
          <button type="button" className="dop-tint dop-sweep" title={`Sweep window: ${WINDOWS[sweepIndex]} seconds. Tap to cycle.`} aria-label={`Doppler sweep duration: ${WINDOWS[sweepIndex]} seconds. Activate to cycle.`} onClick={() => { m.cycleSweep(); setSweepIndex(m.sweepIndex); }}><I n="clock" /><span className="dop-sweep-label">{WINDOWS[sweepIndex]} s</span></button>
        </div>
      </div>
      <div className="dop-main">
        <div className="chart-box dark dop-box" style={host.box(h0)}>
          <Cv at={cv.ref}><Chart tag="doppler" painter={painter} glide={false} deps={[mode, invert, sweepIndex, h, probe, gate, optKey, ovTop]} label={rep?.aria || 'Spectral Doppler'}
            build={(c) => {
              ctxRef.current = c;
              m.dpr = dprNow();
              m.pickWindow(c.w - (PAD_L as number) - (PAD_R as number));
              if (m.sweepIndex !== sweepIndex) queueMicrotask(() => setSweepIndex(m.sweepIndex));
              return m.frameFor(c.w, h, performance.now(), aria.current, c.pal.tok('doppler'));
            }} /></Cv>
        </div>
        <div className="dop-report" ref={reportRef}>
          <b className="dop-dir" data-sev={rep?.sev || undefined}>{rep ? rep.dir : '—'}</b>
          <div className="dop-velrow">
            <span className="dop-vel" hidden={!!rep?.none} data-out={String(!!g?.out)}><b>{rep && !rep.acquiring ? rep.vel : '—'}</b><small>cm/s<span className="dop-mean" /></small></span>
            <div className="dop-pattern">{rep?.pattern || ''}</div>
          </div>
          <dl className="dop-stats">
            {(rep?.tiles ?? []).map((t) => (
              <div key={t.k} className={[t.k === 'Speed' ? 'dop-speed' : '', t.here ? 'on' : ''].filter(Boolean).join(' ') || undefined} hidden={!t.show} data-out={t.k === 'Speed' || t.seg ? String(!!t.out) : undefined} title={t.title}>
                <dt aria-label={t.k === 'CI' ? 'Congestion index' : undefined}>
                  {t.seg && !p.slide
                    ? <button type="button" className="dop-seg" aria-pressed={!!t.here} title={`Sample the stent at its ${t.label.toLowerCase()} end`} aria-label={`${t.label}, ${t.v} centimeters per second${t.here ? ', sampling here' : ''}. Activate to sample here.`} onClick={() => setGate(t.seg as Gate)}>{t.label}</button>
                    : t.label}
                </dt>
                <dd>{t.v}{t.unit && t.v !== '—' ? <small>{t.unit}</small> : null}</dd>
                {t.k === 'Speed' && gaugeEl}
              </div>
            ))}
          </dl>
          <p className="dop-note">{rep?.note || ''}</p>
        </div>
      </div>
    </div>
  );
}

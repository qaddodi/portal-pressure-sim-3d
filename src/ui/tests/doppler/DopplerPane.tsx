// Tests > Doppler (2D doppler.js in the dock): pulsed-wave velocity in one vessel as the scanner draws it (a grey-scale spectrum on black, flow toward the transducer above the baseline),
// with the reading a sonographer would report beside it: the direction, the velocity against the vessel's usual range, the waveform pattern, and tiles (Speed, Max, Trough, Pulsatility,
// the portal vein's congestion index, a stent's three gates). The vessel menu, the display (Spectrum, Color, Variance), Invert and the sweep window are the 2D controls.
// The words and judgements are the 2D app's (copied: copied/doppler-*.copied.js); the spectrum is drawn on the GPU by the shared chart drawer (model.ts says how).
import { useEffect, useRef, useState } from 'react';
import './doppler.css';
import { clock } from '../../../clock/frame.ts';
import { onFrame, latest } from '../../../engine/index.ts';
import { Chart, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import { feed } from '../feed.ts';
import type { PaneProps } from '../TestsLayer.tsx';
import { DopplerModel, WINDOWS, type DopMode, type Report } from './model.ts';
import { PROBES, PAD_L, PAD_R, probeName } from './copied/doppler-tables.copied.js';
import { DOPPLER_MODES } from './copied/doppler-colours.copied.js';
import { setDopplerProbe, useDopplerProbe, type Gate } from './probe-state.ts';

const same = (a: Report | null, b: Report) => !!a && JSON.stringify(a) === JSON.stringify(b);

export function DopplerPane(p: PaneProps & { /** a slide's own options (2D tool: mode, calipers, pair, scale, baseline, waves); the next slide returns to the defaults unless it names them */ options?: Record<string, unknown> }) {
  const model = useRef<DopplerModel | null>(null);
  if (!model.current) { model.current = new DopplerModel(); if (p.options) model.current.configure(p.options); }
  const m = model.current;
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
  const h = Math.max(150, Math.round(p.plot));
  const ctxRef = useRef<ChartCtx | null>(null);
  const aria = useRef('Spectral Doppler');

  const refresh = () => {
    const r = m.report();
    aria.current = r.aria || 'Spectral Doppler';
    if (!same(lastRep.current, r)) { lastRep.current = r; setRep(r); }
  };
  const draw = () => {
    const c = ctxRef.current, pt = painter.current;
    if (!c || !pt) return;
    pt.show(m.frameFor(c.w, h, performance.now(), aria.current, c.pal.tok('doppler')), false);
    if (m.busy) clock.invalidate('doppler');   // (a mark or a letter is easing: frames until it is still, with the model paused too)
  };
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
  // a slide's options change in place (the next slide, a compare button): the display goes back to Spectrum unless the slide names one
  const optKey = JSON.stringify(p.options ?? null);
  const firstOpt = useRef(true);
  useEffect(() => {
    if (firstOpt.current) { firstOpt.current = false; return; }
    m.configure(p.options); setMode(m.mode); refresh(); dirty.current = true; clock.invalidate('doppler');
  }, [optKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  const modes = DOPPLER_MODES as { id: DopMode; label: string; short: string }[];
  const kind = rep?.kind ?? 'portal';
  return (
    <div className="dop" data-pane="doppler" data-kind={kind}>
      <div className="dop-head">
        <select className="dop-vessel" aria-label="Vessel" value={probe} onChange={(e) => setDopplerProbe(e.target.value)}>
          {(PROBES as { id: string }[]).map((x) => <option key={x.id} value={x.id}>{probeName(x)}</option>)}
        </select>
        <div className="dop-btns">
          <div className="dop-modes t-seg" role="group" aria-label="Doppler display">
            {modes.map((x) => <button key={x.id} type="button" className="dop-mode-opt" data-mode={x.id} aria-pressed={mode === x.id} title={`Doppler display: ${x.label}`} onClick={() => { m.mode = x.id; setMode(x.id); }}>{x.short}</button>)}
          </div>
          <button type="button" className="dop-tint dop-inv" aria-pressed={invert} title="Invert the display: show flow away from the probe above the baseline; swaps the toward/away colors" onClick={() => { m.invert = !m.invert; setInvert(m.invert); }}><i aria-hidden="true">⇅</i><span className="dop-lbl">Invert</span></button>
          <button type="button" className="dop-tint dop-sweep" title={`Sweep window: ${WINDOWS[sweepIndex]} seconds. Tap to cycle.`} aria-label={`Doppler sweep duration: ${WINDOWS[sweepIndex]} seconds. Activate to cycle.`} onClick={() => { m.cycleSweep(); setSweepIndex(m.sweepIndex); }}><span className="dop-sweep-label">{WINDOWS[sweepIndex]} s</span></button>
        </div>
      </div>
      <div className="dop-main">
        <div className="dop-box" style={{ height: h }}>
          <Chart tag="doppler" painter={painter} deps={[mode, invert, sweepIndex, h, probe, gate, optKey]} label={rep?.aria || 'Spectral Doppler'}
            build={(c) => {
              ctxRef.current = c;
              m.pickWindow(c.w - (PAD_L as number) - (PAD_R as number));
              if (m.sweepIndex !== sweepIndex) queueMicrotask(() => setSweepIndex(m.sweepIndex));
              return m.frameFor(c.w, h, performance.now(), aria.current, c.pal.tok('doppler'));
            }} />
        </div>
        <div className="dop-report">
          <b className="dop-dir" data-sev={rep?.sev || undefined}>{rep ? rep.dir : '—'}</b>
          <div className="dop-velrow">
            <span className="dop-vel" hidden={!!rep?.none}><b>{rep && !rep.acquiring ? rep.vel : '—'}</b><small>cm/s</small></span>
            <span className="dop-pattern">{rep?.pattern || ''}</span>
          </div>
          <dl className="dop-stats">
            {(rep?.tiles ?? []).map((t) => (
              <div key={t.k} className={t.k === 'Speed' ? 'dop-speed' : undefined} hidden={!t.show} data-out={t.out || undefined} data-on={t.here || undefined} title={t.title}>
                <dt aria-label={t.k === 'CI' ? 'Congestion index' : undefined}>
                  {t.seg
                    ? <button type="button" className="dop-seg" aria-pressed={!!t.here} title={`Sample the stent at its ${t.label.toLowerCase()} end`} aria-label={`${t.label}, ${t.v} centimeters per second${t.here ? ', sampling here' : ''}. Activate to sample here.`} onClick={() => setGate(t.seg as Gate)}>{t.label}</button>
                    : t.label}
                </dt>
                <dd>{t.v}{t.unit && t.v !== '—' ? <small>{t.unit}</small> : null}</dd>
                {t.k === 'Speed' && rep?.gauge && (
                  <div className="dop-range" data-out={rep.gauge.out || undefined} title={rep.gauge.title}>
                    <div className="dop-track">
                      <i className="dop-band" style={{ translate: `${rep.gauge.p0}cqw 0`, scale: `${Math.max(0.001, (rep.gauge.p1 - rep.gauge.p0) / 100)} 1` }} />
                      <i className="dop-mark" style={{ translate: `${rep.gauge.pm}cqw 0` }} />
                    </div>
                    <div className="dop-ticks">
                      <span className="dop-g-zero" style={{ translate: `${rep.gauge.pz}cqw 0` }}>0</span>
                      <span style={{ translate: `${rep.gauge.p0}cqw 0` }}>{rep.gauge.n0}</span>
                      {!rep.gauge.open && <span style={{ translate: `${rep.gauge.p1}cqw 0` }}>{rep.gauge.n1}</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </dl>
          <p className="dop-note">{rep?.note || ''}</p>
        </div>
      </div>
    </div>
  );
}

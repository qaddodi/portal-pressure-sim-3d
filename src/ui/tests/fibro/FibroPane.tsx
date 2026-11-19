// Tests > FibroScan (2D fibroscan.js): one simulated transient-elastography panel. The median stiffness E in kPa (the model's liver stiffness, or on the spleen's 100 Hz probe its spleen stiffness),
// the shear-wave elastogram (a moving map drawn by the GPU under the words, in the chart pool's own WebGL2 context: no context of the pane's own), the fitted line, the exam's name, and under it the
// stiffness bar with Baveno VIII's cut-offs (the B10 stiff card). The Liver / Spleen switch sits above the map. The map runs only while the Tests card is on this pane; paused or under Reduce Motion
// it is drawn once and held. The number it shows is also what the figure's FibroScan probe shows (probe-state.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './fibro.css';
import { clock } from '../../../clock/frame.ts';
import { latest, useEngine } from '../../../engine/index.ts';
import { lsmContext } from '../../../engine/hales/portal/lsm-cuts.js';
import { Chart, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import { MAX_DPR } from '../../charts/gl.ts';
import { StiffCard } from '../../charts/stiff/StiffCard.tsx';
import type { PaneProps } from '../TestsLayer.tsx';
import { useTests } from '../store.ts';
import { metricsOf } from '../frame.ts';
import { RATE } from '../copied/table-marks.copied.js';
import { fix1 } from '../copied/num.copied.js';
import { fibroscanLabel } from '../copied/instrument-aria.copied.js';
import { ORGAN, ORGAN_WORDS, shearSpeed, elastogramInputs } from './copied/fibro-model.copied.js';
import { elastogramUnder } from './copied/fibro-gl.copied.js';
import { createFollow } from './copied/display-state.copied.js';
import { fibroFrame, layoutOf, driftOf, MAP_RADIUS, type OrganId, type Layout } from './model.ts';
import { setFibroProbe } from './probe-state.ts';

const TAG = 'fibro';
const { F: FIELDS, NB, t0: WAVE_T0 } = elastogramInputs();
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// the simulation's clock for the picture (2D clock.js simTime): it stops while the model is paused and carries on from the same value on resume
let acc = 0, lastReal: number | null = null;
function simTime(now: number, running: boolean): number {
  if (lastReal !== null && running) acc += Math.min(Math.max(now - lastReal, 0), 200);
  lastReal = now;
  return acc / 1000;
}

interface Reading { lsm: number | null; ssm: number | null; plt: number | null; ctx: 'congested' | 'vascular' | null; word: { liver: string; spleen: string } }
function readingNow(): Reading {
  const m = metricsOf(latest.frame);
  const lsm = Number.isFinite(m?.lsm) ? (m.lsm as number) : null, ssm = Number.isFinite(m?.ssm) ? (m.ssm as number) : null;
  const plt = Number.isFinite(m?.spleen?.platelets) ? (m.spleen.platelets as number) : null;
  return {
    lsm, ssm, plt, ctx: m ? (lsmContext(m) as Reading['ctx']) : null,
    word: { liver: lsm == null ? '' : (RATE.lsm(lsm, m) as string[])[1] ?? '', spleen: ssm == null ? '' : (RATE.ssm(ssm, m) as string[])[1] ?? '' },
  };
}

export function FibroPane({ plot }: PaneProps) {
  const organ = useTests((s) => s.fibro), setFibro = useTests((s) => s.setFibro);
  // the reading, as text: the pane re-renders only when a number or a word changes
  const json = useEngine((s) => { void s.frames; return JSON.stringify(readingNow()); });
  const r = useMemo(() => JSON.parse(json) as Reading, [json]);
  const model = organ === 'liver' ? r.lsm : r.ssm;
  const h = Math.max(200, Math.round(plot));
  const [shownTxt, setShownTxt] = useState(model == null ? '–' : fix1(model));

  const painter = useRef<ChartPainter | null>(null), ctxRef = useRef<ChartCtx | null>(null);
  const live = useRef({ organ: organ as OrganId, model, last: model ?? 10, h, txt: shownTxt });
  live.current.organ = organ; live.current.h = h; if (model != null) live.current.last = model; live.current.model = model;
  const follow = useRef(createFollow({ small: 0.05, eps: 0.01 }));
  const lay = useRef<{ key: string; L: Layout } | null>(null);
  const dirty = useRef(true), lastSt = useRef(0), snap = useRef(true);
  const under = useMemo(() => {
    const u = elastogramUnder(FIELDS) as ReturnType<typeof elastogramUnder> & { onReady?: () => void };
    u.onReady = () => { dirty.current = true; clock.invalidate(TAG); };
    return u;
  }, []);

  // one picture of the map's words at the moment `t`, and the map's inputs for the GPU under them
  const paint = useCallback((c: ChartCtx, now: number, running: boolean): { frame: ReturnType<typeof fibroFrame>; txt: string } => {
    const { organ: og, model: mdl, last, h: hh } = live.current;
    const reduce = reducedMotion();
    const st = simTime(now, running), t = reduce ? 3 : st, dt = clamp(st - lastSt.current, 0, 0.2);
    lastSt.current = st;
    const f = follow.current;
    const shown = f.step(mdl ?? last, dt, reduce || !running || snap.current);
    snap.current = false;
    const txt = mdl == null ? '–' : fix1(shown);
    const key = `${c.w}|${hh}|${og}`;
    if (lay.current?.key !== key) lay.current = { key, L: layoutOf(c.w, hh, ORGAN[og].widest) };
    const kpa = mdl == null ? last : shown;
    const dpr = Math.min(MAX_DPR, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    under.set({ NB, t0: WAVE_T0, N: clamp(Math.round(Math.max(c.w, hh) * 0.75), 140, 300), c: shearSpeed(driftOf(kpa, t)), t, rad: MAP_RADIUS * dpr, lo: ORGAN[og].lo, hi: ORGAN[og].hi });
    return { frame: fibroFrame({ organ: og, txt, kpa, t }, c.w, hh, c.pal, lay.current.L), txt };
  }, [under]);

  const draw = useCallback((now: number) => {
    const c = ctxRef.current, p = painter.current;
    if (!c || !p) return;
    const running = !!latest.frame?.running;
    const { frame, txt } = paint(c, now, running);
    p.show(frame, false);
    setFibroProbe({ txt, organ: live.current.organ, kpa: live.current.model });
    if (txt !== live.current.txt) { live.current.txt = txt; setShownTxt(txt); }
  }, [paint]);

  // the GPU map under the chart's shapes
  useEffect(() => {
    const p = painter.current;
    p?.setUnder(under);
    return () => { painter.current?.setUnder(null); };
  }, [under]);
  // the loop: every frame while the model runs, otherwise a frame when something changed
  useEffect(() => {
    let hold: { release(): void } | null = null;
    const sync = () => {
      const run = !!latest.frame?.running && !reducedMotion() && !document.hidden;
      if (run && !hold) hold = clock.hold(TAG); else if (!run && hold) { hold.release(); hold = null; }
    };
    sync();
    const tick = clock.on('tween', (f) => { sync(); if (dirty.current || hold) { dirty.current = false; draw(f.time); } });
    return () => { tick(); hold?.release(); };
  }, [draw]);
  // a change of exam shows its own number at once, never eased across from the other organ's; any change of what is shown draws again
  useEffect(() => { snap.current = true; dirty.current = true; clock.invalidate(TAG); }, [organ]);
  useEffect(() => { dirty.current = true; clock.invalidate(TAG); }, [model, h, json]);
  // the probe on the figure stops reading when the pane goes
  useEffect(() => () => setFibroProbe({ txt: null, kpa: null }), []);

  const none = model == null;
  const label = fibroscanLabel(organ, none ? null : model, none ? '' : r.word[organ]);
  return (
    <div className="fs-pane">
      <div className="pressure-switch t-seg fs-organ" role="group" aria-label="Organ">
        {(ORGAN_WORDS as [OrganId, string][]).map(([id, name]) => <button key={id} type="button" className="ps-btn" data-organ={id} aria-pressed={id === organ} onClick={() => { if (id !== organ) setFibro(id); }}>{name}</button>)}
      </div>
      <div className="fs-box" style={{ height: h }} data-organ={organ}>
        <Chart tag={TAG} deps={[organ, h]} label={label} painter={painter}
          build={(c) => { ctxRef.current = c; painter.current?.setUnder(under); return paint(c, performance.now(), !!latest.frame?.running).frame; }} />
      </div>
      <div className="fs-bar"><StiffCard lsm={none ? null : Math.round(parseFloat(shownTxt) * 10) / 10} plt={organ === 'liver' ? r.plt : null} organ={organ} ctx={r.ctx} note /></div>
    </div>
  );
}

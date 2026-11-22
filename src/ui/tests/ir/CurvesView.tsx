// Tube vs patient (2D ir-curves.js): the stent's flow against one setting of the stent, twice. The solid line is the stent IN THE PATIENT, each point the live patient with only that setting changed and
// settled on the engine's worker; the dashed line is the same stent as a TUBE ON A BENCH. The chart is the deck's own (charts/curve CurveCard) on the tool the 2D file builds (curveToolOf).
// The sweep is one piece of work with a life: WAITING (the change has to stop for SETTLE_MS), LOADING (the live snapshot and fingerprint are asked for), then the card works out its points; a finished sweep
// is kept by the card, and only a changed patient, setting, stent or day makes another. After a TIPS nothing here says HVPG.
import { useEffect, useMemo, useRef, useState } from 'react';
import { engine, latest, patient, shownParams, useEngine } from '../../../engine/index.ts';
import { BENCH_DP } from '../../../engine/hales/portal/stent-geom.js';
import { CurveCard } from '../../charts/curve/CurveCard.tsx';
import type { RunFn, SlideState, State } from '../../charts/curve/data.ts';
import { useParamsTick } from '../../action/params.ts';
import { SWEEPS, LABEL, NO_WAIST, WORKING, SETTLE_MS, curveToolOf, sweepMatters } from './copied/curves-parts.copied.js';
import { liveParams, paramsId, ringFp, sweepKey } from './curves-model.ts';
import type { StentId } from './store.ts';
import { useCv } from '../Cv.tsx';

import { clock } from '../../../clock/frame.ts';
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const NOTE = `Solid: the stent in this patient, each point settled. Dashed: the same shunt on a bench (the stent with its tract into the veins), with a fixed ${BENCH_DP} mmHg from its portal end to its hepatic end and no circulation to answer. The lines are worked out for the patient as they stand when this view opens, and again when the patient, the stent or the day changes; the dashed line stands at the stent as it is now, and moves as you edit it.`;

export function CurvesView({ which, h: h0 }: { which: StentId; h: number }) {
  // the chart takes the height the 2D stylesheet leaves it (.ir-chart: what is left of the card, 150 px at least), read by an observer
  const box = useCv(h0), h = box.h;
  const [sweep, setSweep] = useState<string>('diameter');
  useParamsTick((s) => s.tick);
  const k = which === 'DIPS' ? 'dips' : 'tips';
  // the stent's own numbers move every beat: only the ring's reading (tenths of a mL a minute) and the key of the sweep are watched
  useEngine((s) => { void s.frames; const m = latest.frame?.metrics as Any; const st = m?.[k]; return `${sweepKey(which, sweep, latest.frame)}|${Math.round((st?.flow ?? 0) * 1000)}|${Math.round((st?.bench ?? 0) * 1000)}`; });
  const f = latest.frame, st = (f?.metrics as Any)?.[k] as Any, params = shownParams() as Any;
  const key = sweepKey(which, sweep, f), pid = paramsId(params);
  const matters = sweepMatters(sweep, st) as boolean;

  // the change has to stop for SETTLE_MS before a sweep starts: one sweep, not thirty
  const [asked, setAsked] = useState<{ id: string; slide: SlideState | null } | null>(null);
  const [running, setRunning] = useState(0);
  const want = `${key}|${pid}`;
  const tok = useRef(0);
  useEffect(() => {
    if (!f?.metrics || !st) return;
    const my = ++tok.current;
    const t = clock.after(async () => {
      let got: Any;
      try { got = await Promise.all([engine().request({ type: 'snapshot' }), engine().request({ type: 'metrics' })]); } catch { return; }
      if (my !== tok.current) return;
      const snap = got[0]?.snap, fp = got[1]?.result;
      if (!snap || !fp) return;
      setAsked({ id: `ir|${want}`, slide: { fp, params: patient.params, snap } });
    }, SETTLE_MS);
    return () => clock.cancel(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, !!st]);

  const drawn = asked && asked.id === `ir|${want}` ? asked : null;
  const slide = drawn?.slide ?? null;
  const run: RunFn = useMemo(() => (steps, from) => {
    setRunning((n) => n + 1);
    const base = from === undefined ? slide?.base ?? slide?.snap ?? null : from;
    return engine().sequence(steps, base ?? undefined).then((r) => (r as unknown as State[]) ?? null, () => null).finally(() => setRunning((n) => Math.max(0, n - 1)));
  }, [slide]);
  const tool = useMemo(() => curveToolOf(which, sweep), [which, sweep]);
  const live = useMemo(() => (slide ? { params: liveParams(params, st, sweep, which), fp: ringFp(st, which) as Any } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slide, pid, sweep, which, Math.round((st?.flow ?? 0) * 1000), Math.round((st?.bench ?? 0) * 1000)]);
  const state = drawn && running === 0 ? 'ready' : drawn ? 'working' : st ? 'working' : 'idle';
  return (
    <div className="ir-curves ir-fade" data-sub-view="curves" data-flat={matters ? '' : '1'} data-state={state}>
      <div className="pressure-switch ir-sweep" role="group" aria-label="Setting to vary">
        {(SWEEPS as string[]).map((s) => <button key={s} type="button" className="ps-btn" data-sweep={s} aria-pressed={s === sweep} onClick={() => setSweep(s)}>{(LABEL as Record<string, string>)[s]}</button>)}
      </div>
      <div className="ir-chart" ref={box.ref}><CurveCard tool={tool} slide={slide} live={live} id={drawn?.id} run={run} height={h} /></div>
      <p className="ctl-sub ir-note ir-work" aria-live="polite">{WORKING}</p>
      <p className="ctl-sub ir-note ir-warn">{NO_WAIST}</p>
      <p className="ctl-sub ir-note">{NOTE}</p>
    </div>
  );
}

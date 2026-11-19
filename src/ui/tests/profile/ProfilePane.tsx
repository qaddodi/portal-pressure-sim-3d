// Tests > Pressure > Along the circuit (2D charts.js createProfile in the dock's Pressure tab): the pressure from gut to heart as a chart (model.ts, drawn by the shared chart GL), the
// legend ("Now", "Healthy", and the compared moment while one is pinned), the 2D note, and the three readings under it as figures (HVPG, PPG, portal vein: a name over a number, a word
// only when the number is not normal). The DOM is the 2D app's (`.dock-pane[data-pane="profile"]`, `.chart-box`, `.legend-inline`, `.sub`, `.pp-strip`), so its lifted stylesheet styles it.
// The chart is a frame built from the newest model frame whenever the pressures change by a printed digit; the painter glides between frames, so the line, dots and numbers move as one.
import { useEffect, useMemo, useRef, useState } from 'react';
import { clock } from '../../../clock/frame.ts';
import { latest, onFrame, patient, useEngine } from '../../../engine/index.ts';
import { Chart, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import { useCompare } from '../../compare/store.ts';
import { readings } from './readings.ts';
import { profileLabel } from '../copied/instrument-aria.copied.js';
import { NOTE, LEGEND } from './copied/consts.copied.js';
import { itemsOf, newLock, profileFrame, type ProfileInput } from './model.ts';
import type { PaneProps } from '../TestsLayer.tsx';
import { metricsOf } from '../frame.ts';
import { hiddenNow, useHidden } from '../hidden.ts';

type M = Record<string, number | undefined>;

/** A frame's inputs: the shown pressures (the beat-filtered ones where the frame has them), its metrics, the healthy reference and the pinned moment. */
export function inputOf(hidden: ReadonlySet<string> | null = hiddenNow()): ProfileInput | null {
  const f = latest.frame;
  if (!f) return null;
  const snap = useCompare.getState().snap;
  return { P: f.Pf || f.P, metrics: metricsOf(f) as M, healthy: patient.reference?.P ?? null, snap: snap?.P ?? null, hidden };
}
/** What the chart prints, as one string: a new frame redraws the chart only when a digit it prints (0.1 mmHg) or the compared moment changes. */
const keyOf = (i: ProfileInput): string => {
  let s = '';
  for (let k = 0; k < i.P.length; k++) s += `${Math.round(i.P[k]! * 10)},`;
  const m = i.metrics ?? {};
  return `${s}|${m.whvp?.toFixed?.(1)}|${m.fhvp?.toFixed?.(1)}|${m.pv?.toFixed?.(1)}|${m.ivc?.toFixed?.(1)}|${i.healthy ? 1 : 0}|${i.hidden?.has('trueHVPG') ? 1 : 0}${i.hidden?.has('pv') ? 1 : 0}|${i.snap ? i.snap[0] : ''}`;
};

export function ProfilePane({ plot }: PaneProps) {
  const h = Math.max(150, Math.round(plot));
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);
  const lock = useRef(newLock());
  const last = useRef('');
  const snap = useCompare((s) => s.snap);
  const [label, setLabel] = useState('');
  useEngine((s) => s.presetId);
  const hidden = useHidden();
  // the readings under the chart follow the model's frames, at the model's own rate
  const frames = useEngine((s) => s.frames);
  void frames;
  const rows = useMemo(() => readings(metricsOf(latest.frame) as M | null, hidden), [frames, hidden]);  // eslint-disable-line react-hooks/exhaustive-deps

  const draw = (glide: boolean) => {
    const c = ctx.current, p = painter.current, inp = inputOf();
    if (!c || !p || !inp) return;
    const out = profileFrame(inp, { w: c.w, h, pal: c.pal }, lock.current);
    out.frame.label = profileLabel(out.items, !!(inp.hidden?.has('pv')));
    p.show(out.frame, glide);
    last.current = keyOf(inp);
  };
  // a new model frame draws when what the chart prints changed; the label for a screen reader is rewritten once a second
  useEffect(() => {
    let spoke = 0;
    const off = onFrame(() => {
      const inp = inputOf();
      if (!inp) return;
      const k = keyOf(inp);
      if (k !== last.current) { draw(true); clock.invalidate('profile'); }
      const now = performance.now();
      if (now - spoke > 1000) { spoke = now; const items = profileLabel(itemsOf(inp), !!inp.hidden?.has('pv')); setLabel((o) => (o === items ? o : items)); }
    });
    return off;
  }, [h]);  // eslint-disable-line react-hooks/exhaustive-deps

  const aria = label || 'Pressure profile along the selected path';
  return (
    <div className="dock-pane" data-pane="profile" style={{ position: 'relative', inset: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 0, overflow: 'visible' }}>
      <div className="chart-box" style={{ height: h }}>
        <Chart tag="profile" painter={painter} deps={[h, snap]} label={aria}
          build={(c) => {
            ctx.current = c;
            const inp = inputOf();
            if (!inp) return { w: c.w, h, shapes: [], label: aria };
            const out = profileFrame(inp, { w: c.w, h, pal: c.pal }, lock.current);
            out.frame.label = aria; last.current = keyOf(inp);
            return out.frame;
          }} />
      </div>
      <div className="chart-side">
        <div className="legend-inline">
          <span><i style={{ borderColor: 'var(--text)' }} />{LEGEND[0]}</span>
          <span><i style={{ borderColor: 'var(--text-3)', borderTopStyle: 'dashed' }} />{LEGEND[1]}</span>
          {snap && <span className="lg-compare"><i style={{ borderColor: 'var(--s1)', borderTopStyle: 'dotted' }} />{LEGEND[2]}</span>}
        </div>
        <div className="sub">{NOTE}</div>
      </div>
      <div className="pp-strip strip" aria-label="HVPG, PPG and portal vein pressure">
        {rows.map((r) => (
          <div key={r.id} data-id={r.id} data-sev={r.sev || undefined}>
            <span className="lab">{r.name}</span>
            <span className="v"><span className="num">{r.text}</span><small>mmHg</small></span>
            <span className="note">{r.word}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

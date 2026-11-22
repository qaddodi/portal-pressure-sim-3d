import { useMemo, useRef, useState } from 'react';
import { Chart } from '../Chart.tsx';
import { dropFrame, traceFrame } from './frame.ts';
import { tipsFigureFrame, newKeep } from '../../tests/ir/tips-figure.ts';
import { PANELS, stentState, stentTitle, ten, type Panel, type StentId } from './model.ts';
import { stentGate } from '../../../engine/hales/portal/topology.js';
import './stent.css';

export type StentShow = 'lumen' | 'trace' | 'loss' | 'card';
export type StentLens = 'velocity' | 'pressure' | 'loss';

export interface StentCardProps {
  /** which stent: the TIPS or the DIPS */
  vessel?: StentId;
  /** what it shows (the 2D tool's `show`): the side view (`lumen`), the traces along it (`trace`), where the pressure goes (`loss`), or `card`: the side view with one switch (Velocity | Pressure | Where it goes). Default ['lumen']. */
  show?: StentShow[];
  /** `card`'s starting lens (2D `lens`) */
  lens?: StentLens;
  /** what colours the side view's lumen (2D `color`), and whether the Velocity | Pressure switch shows (2D `colorSwitch !== false`) */
  color?: 'velocity' | 'pressure';
  colorSwitch?: boolean;
  /** the chart the trace shows (2D `pick`) and which charts it offers (2D `panels`) */
  pick?: Panel;
  panels?: Panel[];
  /** where the staircase starts: 'ppg' (the veins outside the stent take their share) or 'stent' (the stent's own drop), and a fixed top for its scale, mmHg (2D `to`, `max`) */
  to?: 'ppg' | 'stent';
  max?: number;
  /** the Doppler third this slide reads, a band behind it (2D `gate`); 'site' is the tightest place */
  gate?: 'proximal' | 'mid' | 'distal' | 'site';
  /** the slide's fingerprint (what its tiles show: the card draws the stent those numbers came from) */
  fp?: Record<string, unknown> | null;
  /** the live engine frame (src/engine/store.ts latest.frame), used where the slide has no fingerprint with the stent's terms */
  frame?: { metrics?: unknown } | null;
  /** the patient's params, for the geometry where the record has none */
  params?: unknown;
}

const LENS_NAMES: [StentLens, string][] = [['velocity', 'Velocity'], ['pressure', 'Pressure'], ['loss', 'Where it goes']];
const PICK_NAMES: Record<Panel, string> = { pressure: 'Pressure', energy: 'Energy lost', velocity: 'Velocity' };

function Switch<T extends string>({ label, items, value, onPick }: { label: string; items: [T, string][]; value: T; onPick(v: T): void }) {
  return (
    <div className="pz-stent-sw" role="group" aria-label={label}>
      {items.map(([k, name]) => <button key={k} type="button" className="pz-stent-btn" data-t={name} aria-pressed={k === value} onClick={() => onPick(k)}>{name}</button>)}
    </div>
  );
}

/** The stent cards of a TIPS or DIPS slide (tool kind 'stent'): the side view, the traces along it and the staircase of where its pressure goes, with the 2D card's switches. */
export function StentCard({ vessel = 'TIPS', show: showIn = ['lumen'], lens: lensIn = 'velocity', color: colorIn = 'velocity', colorSwitch = true, pick: pickIn, panels, to, max, gate, fp = null, frame = null, params = null }: StentCardProps) {
  const id: StentId = vessel === 'DIPS' ? 'DIPS' : 'TIPS';
  // (the side view with the trace is the one card with its one switch: the older pair of switches answered one question twice)
  const filtered = showIn.filter((k) => k === 'lumen' || k === 'loss' || k === 'trace' || k === 'card');
  const show: StentShow[] = !filtered.length ? ['lumen'] : filtered.includes('lumen') && filtered.includes('trace') && !filtered.includes('loss') ? ['card'] : filtered;
  const isCard = show.includes('card');
  const offered = (panels?.length ? PANELS.filter((k) => panels.includes(k)) : [...PANELS]) as Panel[];
  const startLens: StentLens = isCard ? (lensIn === 'pressure' || lensIn === 'loss' ? lensIn : colorIn === 'pressure' || pickIn === 'pressure' ? 'pressure' : 'velocity') : 'velocity';
  const [lens, setLens] = useState<StentLens>(startLens);
  const [colorPick, setColor] = useState<'velocity' | 'pressure'>(colorIn);
  const [tracePick, setPick] = useState<Panel>(pickIn && offered.includes(pickIn) ? pickIn : offered[0]!);
  const st = useMemo(() => stentState(fp ?? frame, id, params), [fp, frame, id, params]);
  const eff = isCard ? ['lumen', lens === 'loss' ? 'loss' : 'trace'] : show;
  const has = (k: string) => eff.includes(k);
  const color = isCard ? (lens === 'pressure' ? 'pressure' : 'velocity') : colorPick;
  const pick = isCard ? (lens === 'pressure' ? 'pressure' : 'velocity') : tracePick;
  // (one stent figure for every card: the TIPS card's own, tests/ir/tips-figure.ts; its velocity or pressure chart rides under it on the same x, so a slide's trace is that chart)
  const onFigure = has('trace') && pick !== 'energy';
  const keep = useRef(newKeep());
  const gateOf = gate ? (stentGate(gate, params, id) as 'proximal' | 'mid' | 'distal') : null;
  const key = `${id}|${st.have}|${[st.s, st.site, st.d, st.flow, st.tract, st.wall, st.ends, st.jet, st.ppg, st.ivc, st.sh.len, st.sh.waist, st.sh.trans, st.sh.red, ...st.g].map((v) => (+v).toFixed(3)).join(',')}`;
  return (
    <div className="pz-stent" data-kind="stent" data-vessel={id}>
      {has('lumen') && (
        <Chart tag="chart:stent-side" deps={[key, color, onFigure, gateOf]} label={`${stentTitle({ vessel: id, show })}: ${st.have ? `flow ${ten(st.flow)} L/min` : 'no stent'}`}
          build={(c) => tipsFigureFrame(st, c, { lens: color, labels: true, chart: onFigure, card: !onFigure, gate: gateOf, keep: keep.current })} />
      )}
      {isCard && <Switch<StentLens> label="What the stent shows" items={LENS_NAMES} value={lens} onPick={setLens} />}
      {!isCard && has('lumen') && colorSwitch && <Switch<"velocity" | "pressure"> label="Color the lumen by" items={[['velocity', 'Velocity'], ['pressure', 'Pressure']]} value={colorPick} onPick={setColor} />}
      {has('trace') && !isCard && offered.length > 1 && <Switch<Panel> label="Chart along the stent" items={offered.map((k): [Panel, string] => [k, PICK_NAMES[k]])} value={tracePick} onPick={setPick} />}
      {has('trace') && !onFigure && (
        <Chart tag="chart:stent-trace" deps={[key, pick]} label={`${id}: pressure, energy lost and velocity along the stent`} build={(c) => traceFrame(st, c, { pick })} />
      )}
      {has('loss') && (
        <Chart tag="chart:stent-drop" deps={[key, to, max]} label={`${id}: where the pressure goes`} build={(c) => dropFrame(st, c, { to, max })} />
      )}
    </div>
  );
}

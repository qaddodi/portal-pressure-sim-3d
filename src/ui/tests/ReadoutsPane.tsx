// Tests > Readouts: every readout the 2D bottom bar carried, live, each with its scale bar; a tap says what drives it (Why?). Pressure, Flow and Consequences, then Systemic.
// The tile rows come from readouts-model.ts (the 2D dock's tile table). A number changes when the model sends a frame; the bar's fill is a transform, so it glides without layout.
import { useRef } from 'react';
import { useFrame, paramsNow } from './frame.ts';
import { tileRows, vitalRows, GROUP_LIST, SYSTEMIC_CAP, type Row } from './readouts-model.ts';
import { useTests } from './store.ts';
import { useShell } from '../shell/store.ts';

const TREND_S = 5, TREND_FRAC = 0.03;   // (readouts-pane.js: a sustained change over five seconds, larger than 3 % of the scale)

function Tile({ r, trend, name }: { r: Row; trend: string; name: string }) {
  const openWhy = useTests((s) => s.openWhy), show = useTests((s) => s.show);
  const go = () => {
    if (r.pane) { show(r.pane as never); return; }
    if (r.id === 'hvpg' && r.band === 'none') { show('hvpg'); return; }   // (an HVPG not yet measured opens the procedure that measures it)
    if (r.why) openWhy(r.why);
  };
  const interactive = !!(r.why || r.pane);
  return (
    <button type="button" className="rp-tile" data-id={r.id} data-sev={r.band} data-static={interactive ? undefined : ''} aria-label={r.aria} title={r.title} onClick={interactive ? go : undefined}>
      <span className="rp-k">{name}</span>
      <span className="rp-v">{r.pre ?? ''}{r.value}<span className="rp-u">{r.unit}</span>{trend && <span className="rp-tr" aria-hidden="true">{trend === 'up' ? '▲' : '▼'}</span>}</span>
      <span className="rp-s">{r.word}</span>
      <span className="rp-bar" aria-hidden="true">
        <span className="rp-fill" style={{ transform: `scaleX(${r.fill})` }} />
        {r.ticks.map((t, i) => <span key={i} className="rp-tick" style={{ left: `${t * 100}%` }} />)}
      </span>
    </button>
  );
}

export function ReadoutsPane({ narrow }: { narrow: boolean }) {
  const f = useFrame();
  const hist = useRef(new Map<string, Array<[number, number]>>());
  const vitals = useRef<Record<string, object>>({});
  if (!f) return null;
  const m = f.metrics, params = paramsNow();
  const now = performance.now();
  const groups = tileRows(m, params);
  const trendOf = (id: string, v: number | null, span: number): string => {
    if (v == null || !Number.isFinite(v)) { hist.current.delete(id); return ''; }
    const hs = hist.current.get(id) ?? [];
    if (!hs.length || now - hs[hs.length - 1]![0] > 500) { hs.push([now, v]); while (hs.length && now - hs[0]![0] > TREND_S * 1000 + 600) hs.shift(); }
    hist.current.set(id, hs);
    if (now - hs[0]![0] < TREND_S * 1000 * 0.8) return '';
    const d = v - hs[0]![1];
    return d > TREND_FRAC * span ? 'up' : d < -TREND_FRAC * span ? 'down' : '';
  };
  const sys = vitalRows(m, useShellRunning(), now, vitals.current);
  return (
    <div className="t-pane" data-pane="readouts">
      {GROUP_LIST.map(([g, label], gi) => (
        <section key={g} className="rp-group" data-group={g} aria-label={label}>
          <h3 className="rp-cap">{label}</h3>
          <div className="rp-tiles">{groups[gi]!.rows.map((r) => <Tile key={r.id} r={r} name={narrow ? r.short : r.name} trend={trendOf(r.id, Number.isFinite(parseFloat(r.value)) ? r.fill : null, 1)} />)}</div>
        </section>
      ))}
      <section className="rp-group" data-group="systemic" aria-label={SYSTEMIC_CAP}>
        <h3 className="rp-cap">{SYSTEMIC_CAP}</h3>
        <div className="rp-tiles">{sys.map((r) => <Tile key={r.id} r={r} name={narrow ? r.short : r.name} trend="" />)}</div>
      </section>
    </div>
  );
}
const useShellRunning = () => useShell((s) => s.transport.running);

// Tests > Readouts (2D readouts-pane.js): every readout the old bottom bar carried, live, in the 2D app's own tile (tile-el.js: `.metric` with its name, number, unit, trend, scale bar with
// cut-off ticks and status line), so the lifted stylesheet (app-01-chrome.css .metric, tests-card.css "Readouts") styles it: plain figures in four groups, hairlines between, the bars
// and boxes of the older look gone. A tap says what drives it (Why?); an HVPG not yet measured opens the procedure that measures it. While a moment is pinned each tile says its change
// from then in place of its word. The tile rows come from readouts-model.ts (the 2D dock's tile table). A number changes when the model sends a frame; the bar's fill is a transform.
import { useRef, type CSSProperties } from 'react';
import { useFrame, paramsNow } from './frame.ts';
import { tileRows, vitalRows, GROUP_LIST, SYSTEMIC_CAP, type Row } from './readouts-model.ts';
import { useTests } from './store.ts';
import { useShell } from '../shell/store.ts';
import { useCompare } from '../compare/store.ts';
import { openWhy } from '../why/store.ts';
import { hiddenNow } from './hidden.ts';

const TREND_S = 5, TREND_FRAC = 0.03;   // (readouts-pane.js: a sustained change over five seconds, larger than 3 % of the scale)
const RANK: Record<string, number> = { none: -1, ok: 0, caution: 1, danger: 2, critical: 3 };
const q = (v: number) => Math.round(v * 1000) / 1000;

/** One tile, in the 2D markup. `flash` is the class a reading that has just crossed into a worse band wears (the two names alternate so the animation starts again: app-07-floating.css .flash, .flash2). */
function Tile({ r, trend, vital, flash }: { r: Row; trend: string; vital: boolean; flash: string }) {
  const show = useTests((s) => s.show);
  const go = () => {
    if (r.pane) { show(r.pane as never); return; }
    if (r.id === 'hvpg' && r.band === 'none' && r.word === 'Not measured') { show('hvpg'); return; }   // (an HVPG not yet measured opens the procedure that measures it)
    if (r.why) openWhy(r.why);
  };
  const interactive = !!(r.why || r.pane);
  const none = r.band === 'none';
  const fill = none ? 0 : r.fill, zero = r.zero;
  const lo = Math.min(fill, zero), len = Math.abs(fill - zero);
  const aria = r.aria + (trend ? `, ${trend === 'up' ? 'rising' : 'falling'}` : '');
  const title = `${r.title}${interactive ? (r.pane ? '\nClick to open the Ascites view.' : '\nClick for what is driving it.') : ''}`;
  return (
    <button type="button" className={`metric${vital ? ' rp-vital' : ''}${flash ? ` ${flash}` : ''}${r.value === '?' || r.value === '—' ? ' hidden-val' : ''}`} data-id={r.id} data-sev={r.band} aria-label={aria} title={title}
      style={interactive ? undefined : { cursor: 'default' }} onClick={interactive ? go : undefined}>
      <span className="k">{vital ? <><span className="k-l">{r.name}</span><span className="k-s">{r.short}</span></> : r.name}</span>
      <span className="v">
        {r.bp ? <><span className="val v-bp">{r.bp.pre}</span><span className="v-map"><span className="val v-bp">(</span><span className="val">{r.bp.mean}</span><span className="val v-bp">)</span></span></> : <span className="val">{r.value}</span>}
        <span className={r.u === '%' ? 'unit pct' : 'unit'}>{r.u ?? r.unit}{r.ux ? <span className="u-x">{r.ux}</span> : null}</span>
        {!vital && <span className="tr" aria-hidden="true">{trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''}</span>}
      </span>
      <span className="rb" aria-hidden="true">
        <i className="rb-fill" style={{ '--fl': q(lo), '--fw': q(len) } as CSSProperties} />
        {r.ticks.map((t, i) => <i key={i} className="rb-tick" style={{ left: `${t * 100}%` }} />)}
      </span>
      <span className="s">
        {r.cmp ? <span className={`cmp ${r.cmp.dir}`}>{r.cmp.text}</span> : <span className={`status${none && r.word === 'Not measured' ? ' unmeas' : ''}`}>{r.word}</span>}
      </span>
    </button>
  );
}

export function ReadoutsPane(_: { narrow?: boolean }) {
  const f = useFrame();
  const snap = useCompare((s) => s.snap);
  const hist = useRef(new Map<string, Array<[number, number]>>());
  const vitals = useRef<Record<string, object>>({});
  const was = useRef(new Map<string, { band: string; flash: string }>());
  if (!f) return null;
  const m = f.metrics, params = paramsNow();
  const now = performance.now();
  const then = snap?.metrics ?? null;
  const groups = tileRows(m, params, hiddenNow(), then);
  const trendOf = (id: string, v: number | null, span: number): string => {
    if (v == null || !Number.isFinite(v)) { hist.current.delete(id); return ''; }
    const hs = hist.current.get(id) ?? [];
    if (!hs.length || now - hs[hs.length - 1]![0] > 500) { hs.push([now, v]); while (hs.length && now - hs[0]![0] > TREND_S * 1000 + 600) hs.shift(); }
    hist.current.set(id, hs);
    if (now - hs[0]![0] < TREND_S * 1000 * 0.8) return '';
    const d = v - hs[0]![1];
    return d > TREND_FRAC * span ? 'up' : d < -TREND_FRAC * span ? 'down' : '';
  };
  // a reading that crosses into a worse band flashes once (2D: RANKS, .flash / .flash2)
  const flashOf = (id: string, band: string): string => {
    const o = was.current.get(id);
    if (!o) { was.current.set(id, { band, flash: '' }); return ''; }
    if (o.band === band) return o.flash;
    const worse = RANK[band]! > RANK[o.band]! && o.band !== 'none';
    const flash = worse ? (o.flash === 'flash' ? 'flash2' : 'flash') : '';
    was.current.set(id, { band, flash });
    return flash;
  };
  const sys = vitalRows(m, useShellRunning(), now, vitals.current);
  return (
    <>
      {GROUP_LIST.map(([g, label], gi) => (
        <section key={g} className="rp-group" data-group={g} aria-label={label}>
          <h3 className="rp-cap">{label}</h3>
          <div className="rp-tiles">{groups[gi]!.rows.map((r) => <Tile key={r.id} r={r} vital={false} flash={flashOf(r.id, r.band)} trend={trendOf(r.id, Number.isFinite(parseFloat(r.value)) ? r.fill : null, 1)} />)}</div>
        </section>
      ))}
      <section className="rp-group" data-group="systemic" aria-label={SYSTEMIC_CAP}>
        <h3 className="rp-cap">{SYSTEMIC_CAP}</h3>
        <div className="rp-tiles">{sys.map((r) => <Tile key={r.id} r={r} vital flash={flashOf(r.id, r.band)} trend="" />)}</div>
      </section>
    </>
  );
}
const useShellRunning = () => useShell((s) => s.transport.running);

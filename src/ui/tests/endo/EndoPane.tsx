// Tests > Endoscopy (2D instruments.js createEndoscopy, dock.js): the endoscopic view of the distal esophagus: the varices as the model has them (size, red wale and cherry-red marks, the bleed),
// the bands placed and the Band (EVL) button, five readings (bands placed, grade, diameter, wall thickness, stigmata), EUS-PPG (EusPpg.tsx), and Wall mechanics as the second view (WallView.tsx).
// The picture is a frame on the charts' shared GPU drawer (frame.ts, built from the 2D shader's own columns); it eases as the 2D scope does (motion.ts) on the one clock.
import { useEffect, useMemo, useRef } from 'react';
import './endo.css';
import { clock } from '../../../clock/frame.ts';
import { latest, onFrame, useEngine } from '../../../engine/index.ts';
import { Chart, useLookId, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import { paletteOf } from '../../charts/palette.ts';
import { OrderIcon } from '../../action/icons.tsx';
import { appEnv } from '../../treat/env.ts';
import { procLabel } from '../../../scene/procedures/copied/procedure-names.js';
import { gastricUp } from '../../../engine/hales/portal/scenario.js';
import { fmt } from '../copied/num.copied.js';
import { airRatio } from '../copied/endo-size.copied.js';
import { scopeTear } from '../copied/endo-motion.copied.js';
import { endoscopyLabel } from '../copied/instrument-aria.copied.js';
import { ENDO_WORDS as W } from '../copied/endo-words.copied.js';
import { metricsOf } from '../frame.ts';
import type { PaneProps } from '../TestsLayer.tsx';
import { FieldMotion, OverlayMotion, type ScopeIn } from './motion.ts';
import { scopeFrame, type OverlayState } from './frame.ts';
import { EusPpg } from './EusPpg.tsx';
import { WallView } from './WallView.tsx';
import { useScope } from './scope-state.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** What the readings print for a frame (one place: the pane renders it and the test reads it). */
export function readingsOf(f: Any, airOpt = 0, redOpt: boolean | null = null, withPressures = false) {
  const m = metricsOf(f), vx = m?.varix;
  if (!vx) return null;
  const nb = Math.round(f.bands || 0), present = !!vx.present;
  const grade: string = vx.grade.label;
  const diam = `${fmt(vx.d * (airRatio(vx.air, airOpt) as number), 1)} mm`;
  const red = !present ? W.red.none : (redOpt ?? vx.redWale) ? `${W.red.word}${W.red.more}` : W.red.none;
  // a lesson slide's three more rows (2D `readings`): the pressure in the varix, in the lumen (the air's) and across the wall
  const inV = (vx.ptm as number | undefined) ?? NaN, pressures = withPressures ? { inV: `${fmt(inV, 1)} mmHg`, lum: `${fmt(airOpt, 1)} mmHg`, across: `${fmt(inV - airOpt, 1)} mmHg` } : null;
  return { pressures, present, grade, sev: grade === 'Small' ? 'caution' : grade === 'None' ? 'ok' : 'danger', diam, wall: `${fmt(vx.w, 1)} mm`, red, redOn: red !== W.red.none, bands: nb, label: endoscopyLabel({ present, grade, diam, red: red !== W.red.none, bands: nb }) as string };
}

/** A slide's own options for the scope (2D createEndoscopy `configure`): the air's pressure in the lumen (0 to 20 mmHg), the red marks forced on or off, and the three pressure rows. */
export interface ScopeOptions { air?: unknown; red?: unknown; readings?: unknown }
export const scopeOpts = (o?: ScopeOptions | null) => ({ air: Math.min(20, Math.max(0, Number(o?.air) || 0)), red: typeof o?.red === 'boolean' ? o.red : null, readings: !!o?.readings });

function ScopeView({ square, options }: { square: number; options?: ScopeOptions | null }) {
  const opt = scopeOpts(options);
  const optRef = useRef(opt); optRef.current = opt;
  const json = useEngine((s) => { void s.frames; return JSON.stringify(readingsOf(latest.frame, opt.air, opt.red, opt.readings)); });
  const r = useMemo(() => (json && json !== 'null' ? JSON.parse(json) as NonNullable<ReturnType<typeof readingsOf>> : null), [json]);
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);
  const field = useRef(new FieldMotion()), over = useRef(new OverlayMotion());
  const look = useLookId();
  const dirty = useRef(true), hold = useRef<{ release(): void } | null>(null), key = useRef('');
  const preset = useEngine((s) => s.presetId);

  const build = (c: ChartCtx) => {
    const f = latest.frame as Any, o = over.current, fm = field.current.state, m = metricsOf(f);
    const ov: OverlayState = { balloon: o.bal, jet: o.jet, pool: o.pool, rate: m?.bleeding?.rate, hr: m?.vitals?.hr ?? m?.hr, seconds: still() ? 0.3 : (f?.t ?? 0), tearGrow: fm.g };
    return scopeFrame({ field: fm, over: ov }, Math.round(c.w), c.pal);
  };
  // one tick of the clock: take the model's newest state in, ease, and draw the frame when it differs from the one shown
  const tick = (now: number) => {
    const f = latest.frame as Any, m = metricsOf(f), c = ctx.current, p = painter.current;
    if (!f || !m?.varix || !c || !p) return;
    const vx = m.varix;
    const inp: ScopeIn = { d: vx.d, ratio: vx.ratio, air: vx.air, bands: f.bands || 0, snap: f.running === false || !!f.jump, airOpt: optRef.current.air, redOpt: optRef.current.red };
    const busy = field.current.step(inp, now);
    const bleedNow = !!(f.bleed?.active && f.bleed.site === 'VAR');
    const moving = over.current.step(now, { balloon: !!f.params?.balloonEso, shut: gastricUp(f.params || {}), bleedNow, total: f.bleed?.total ?? 0, still: still() });
    const bleeding = bleedNow || over.current.jet > 0;
    const s = field.current.state, o = over.current;
    const k = [Math.round(c.w), c.look, s.bands, Math.round(s.grow * 64), Math.round(s.vis * 64), Math.round(s.red * 64), ...s.def.map((x) => Math.round(x * 64)), ...s.kn.map((x) => Math.round(x * 64)), Math.round(o.bal * 64), Math.round(o.jet * 64), Math.round(o.pool * 64), bleeding ? Math.round(now / 33) : 0].join('|');
    if (k !== key.current || dirty.current) { key.current = k; dirty.current = false; p.show(build(c), false); }
    const want = busy || moving || bleeding;
    if (want && !hold.current) hold.current = clock.hold('endo-scope'); else if (!want && hold.current) { hold.current.release(); hold.current = null; }
  };
  useEffect(() => {
    const off = onFrame(() => { dirty.current = false; clock.invalidate('endo-scope'); });
    const t = clock.on('tween', (fr) => tick(fr.time));
    clock.invalidate('endo-scope');
    return () => { off(); t(); hold.current?.release(); hold.current = null; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // a new patient lands where the model is (nothing eases across a jump)
  useEffect(() => { field.current.reset(); dirty.current = true; key.current = ''; clock.invalidate('endo-scope'); }, [preset]);
  useEffect(() => { dirty.current = true; clock.invalidate('endo-scope'); }, [look, square, opt.air, opt.red]);
  useEffect(() => { useScope.getState().setBands(r?.bands ?? 0); }, [r?.bands]);

  const present = r?.present ?? false;
  const pal = paletteOf(look);
  void pal;
  return (
    <div className="en-view" data-view="scope">
      <div className="endo-stage en-stage">
        <div className="en-pic" style={{ ['--en-sq' as string]: `${square}px` }}>
          <Chart tag="endo-scope" painter={painter} deps={[square, look]} label={r?.label ?? W.viewAria} build={(c) => { ctx.current = c; return build(c); }} />
        </div>
        <span className="endo-pos">{W.position}</span>
      </div>
      <div className="en-side chart-side">
        {r && (
          <dl className="endo-read">
            <div className="endo-chip" data-on={r.bands !== 0}><dt>{W.tiles.bands}<span className="endo-dt-x">{W.tiles.bandsX}</span></dt><dd className="endo-chip-v">{r.bands}</dd></div>
            <div className="endo-g" title={W.gradeTip}><dt>{W.tiles.grade}</dt><dd className="endo-grade" data-sev={r.sev}><b /><span>{r.grade}</span></dd></div>
            <div className="endo-tile"><dt>{W.tiles.diameter}</dt><dd className="endo-num">{r.diam}</dd></div>
            <div className="endo-tile"><dt>{W.tiles.wall}<span className="endo-dt-x">{W.tiles.wallX}</span></dt><dd className="endo-num">{r.wall}</dd></div>
            {r.pressures && ([['Intravariceal', r.pressures.inV, 'Intravariceal pressure.'], ['Intraluminal', r.pressures.lum, 'Intraluminal esophageal pressure around the varix, set by insufflation (simulated).'], ['Transmural', r.pressures.across, 'Transmural pressure = intravariceal − intraluminal pressure: the pressure that distends the varix wall.']] as const).map(([k, v, t]) => <div key={k} className="endo-tile endo-pr" title={t}><dt>{k}</dt><dd className="endo-num">{v}</dd></div>)}
            <div className="endo-chip endo-red" data-on={r.redOn} title={W.redTip}><dt>{W.tiles.stigmata}</dt><dd className="endo-chip-v" data-long={r.redOn ? '' : undefined}><span>{r.redOn ? W.red.word : W.red.none}</span><span className="endo-more">{r.redOn ? W.red.more : ''}</span></dd></div>
          </dl>
        )}
        <button type="button" className="btn primary en-band" disabled={!present} title={present ? '' : W.noBand} onClick={() => { useScope.getState().band(); appEnv.action({ kind: 'band' }); }}>
          <OrderIcon n="band" className="ac-ic" />{procLabel('band')}
        </button>
        <EusPpg />
      </div>
    </div>
  );
}
void scopeTear;

export function EndoPane({ square, options }: PaneProps & { /** a slide's own options for the scope (air, red, readings); the next slide's come in place of them */ options?: ScopeOptions | null }) {
  const view = useScope((s) => s.view);
  useEffect(() => { useScope.getState().setActive(true); return () => useScope.getState().setActive(false); }, []);
  const sq = Math.max(150, Math.round(square));
  return (
    <div className="en" data-pane="endoscopy" data-sub={view}>
      <div className="pressure-switch t-seg" role="group" aria-label={W.switchAria}>
        {(W.views as [string, string][]).map(([id, label]) => (
          <button key={id} type="button" className="ps-btn" data-view={id} aria-pressed={view === id} onClick={() => useScope.getState().setView(id as 'scope' | 'wall')}>{label}</button>
        ))}
      </div>
      {view === 'scope' ? <ScopeView square={sq} options={options} /> : <WallView square={sq} />}
    </div>
  );
}

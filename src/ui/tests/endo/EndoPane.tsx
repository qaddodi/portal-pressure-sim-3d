// Tests > Endoscopy (2D instruments.js createEndoscopy, dock.js): the endoscopic view of the distal esophagus: the varices as the model has them (size, red wale and cherry-red marks, the bleed),
// the bands placed and the Band (EVL) button, five readings (bands placed, grade, diameter, wall thickness, stigmata), EUS-PPG (EusPpg.tsx), and Wall mechanics as the second view (WallView.tsx).
// The picture is a frame on the charts' shared GPU drawer (frame.ts, built from the 2D shader's own columns); it eases as the 2D scope does (motion.ts) on the one clock.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { clock } from '../../../clock/frame.ts';
import { latest, onFrame, useEngine } from '../../../engine/index.ts';
import { Chart, useLookId, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import { paletteOf } from '../../charts/palette.ts';
import { OrderIcon } from '../../action/icons.tsx';
import { appEnv } from '../../treat/env.ts';
import { procLabel } from '../../../scene/procedures/copied/procedure-names.js';
import { gastricUp } from '../../../engine/hales/portal/scenario.js';
import { scopeTear } from '../copied/endo-motion.copied.js';
import { ENDO_WORDS as W } from '../copied/endo-words.copied.js';
import { metricsOf } from '../frame.ts';
import type { PaneProps } from '../TestsLayer.tsx';
import { FieldMotion, OverlayMotion, type ScopeIn } from './motion.ts';
import { scopeFrame, type OverlayState } from './frame.ts';
import { endoUnder } from './endo-under.ts';
import { EusPpg, useEusReset } from './EusPpg.tsx';
import { Cv, useCv, usePaneHost } from '../Cv.tsx';
import { WallView } from './WallView.tsx';
import { useScope } from './scope-state.ts';
import { useSlidePin, pinnedVarix } from '../slide/pin.ts';
import { readingsOf, scopeOptions, type EndoOpt } from './readings.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ScopeView({ square, opt, slide }: { square: number; opt: EndoOpt; slide: boolean }) {
  useSlidePin((s) => s.n);   // (a slide's own numbers: the readings follow the state it pins)
  const pin = slide ? pinnedVarix() : null, pinRef = useRef(pin); pinRef.current = pin;
  const json = useEngine((s) => { void s.frames; return JSON.stringify(readingsOf(latest.frame, opt, slide ? pinnedVarix() : null)); });
  const r = useMemo(() => (json && json !== 'null' ? JSON.parse(json) as NonNullable<ReturnType<typeof readingsOf>> : null), [json]);
  const optRef = useRef(opt); optRef.current = opt;
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);
  const field = useRef(new FieldMotion()), over = useRef(new OverlayMotion());
  const look = useLookId();
  const dirty = useRef(true), hold = useRef<{ release(): void } | null>(null), key = useRef('');
  const preset = useEngine((s) => s.presetId);
  const cv = useCv(square), host = usePaneHost();
  useEusReset(preset);

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
    const inp: ScopeIn = { d: pinRef.current && Number.isFinite(pinRef.current.d) ? pinRef.current.d : vx.d, ratio: vx.ratio, air: vx.air, bands: f.bands || 0, snap: f.running === false || !!f.jump, airOpt: optRef.current.air, redOpt: optRef.current.red };
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
  useEffect(() => { dirty.current = true; clock.invalidate('endo-scope'); }, [look, square, opt.air, opt.red]);   // a slide's air or red: the field eases to it as it does to any change
  useEffect(() => { useScope.getState().setBands(r?.bands ?? 0); }, [r?.bands]);
  // the field itself is the 2D shader's, shaded under the frame's shapes on the shared drawer's context (endo-under.ts): it reads the state of the frame it is drawn with
  useEffect(() => {
    const p = painter.current;
    p?.setUnder(endoUnder(() => (ctx.current ? { st: field.current.state, size: Math.round(ctx.current.w) } : null)));
    return () => { painter.current?.setUnder(null); };
  }, [square, look]);

  const present = r?.present ?? false;
  const pal = paletteOf(look);
  void pal;
  return (
    <div className={host.view} data-pane="endoscopy">
      <div className="endo-stage">
        <div className="chart-box square" style={host.slide ? { width: square, height: square } : undefined}>
          <Cv at={cv.ref}>
            <Chart tag="endo-scope" painter={painter} deps={[square, look]} label={r?.label ?? W.viewAria} build={(c) => { ctx.current = c; return build(c); }} />
          </Cv>
        </div>
        <span className="endo-pos">{W.position}</span>
      </div>
      <div className="chart-side">
        {r && (
          <dl className="endo-read">
            <div className="endo-chip" data-on={r.bands !== 0}><dt>{W.tiles.bands}<span className="endo-dt-x">{W.tiles.bandsX}</span></dt><dd className="endo-chip-v">{r.bands}</dd></div>
            <div className="endo-g" title={W.gradeTip}><dt>{W.tiles.grade}</dt><dd className="endo-grade" data-sev={r.sev}><b /><span>{r.grade}</span></dd></div>
            <div className="endo-tile"><dt>{W.tiles.diameter}</dt><dd className="endo-num">{r.diam}</dd></div>
            <div className="endo-tile"><dt>{W.tiles.wall}<span className="endo-dt-x">{W.tiles.wallX}</span></dt><dd className="endo-num">{r.wall}</dd></div>
            {opt.readings && W.pressures.map((p, i) => <div key={p.name} className="endo-tile endo-pr" title={p.title}><dt>{p.name}</dt><dd className="endo-num">{r.pressures[i]}</dd></div>)}
            <div className="endo-chip endo-red" data-on={r.redOn} title={W.redTip}><dt>{W.tiles.stigmata}</dt><dd className="endo-chip-v" data-long={r.redOn ? '' : undefined}><span>{r.redOn ? W.red.word : W.red.none}</span><span className="endo-more">{r.redOn ? W.red.more : ''}</span></dd></div>
          </dl>
        )}
        <button type="button" className="btn primary" disabled={!present} title={present ? '' : W.noBand} onClick={() => { useScope.getState().band(); appEnv.action({ kind: 'band' }); }}>
          <OrderIcon n="band" className="ac-ic" />{procLabel('band')}
        </button>
        <EusPpg width={square} />
      </div>
    </div>
  );
}
void scopeTear;

export function EndoPane({ square, options }: PaneProps & { /** a slide's own options (2D tool: air, red, readings); given, the pane is a slide's data card and reads the slide's own numbers (slide/pin.ts) */ options?: Record<string, unknown> | null }) {
  const view = useScope((s) => s.view);
  const air = scopeOptions(options).air, red = scopeOptions(options).red, readings = scopeOptions(options).readings;
  const opt = useMemo(() => ({ air, red, readings }), [air, red, readings]);
  useEffect(() => { useScope.getState().setActive(true); return () => useScope.getState().setActive(false); }, []);
  const sq = Math.max(150, Math.round(square));
  // 2D's own markup (instruments.js createEndoscopy, createVarixWall; dock.js puts the view switch, the pane's own row, above the views and writes the open view on the pane as data-sub, which the 2D
  // stylesheet shows one view by). The pane is the Tests card's own element, so its data-sub is written on it here, before the paint, and taken off when the tab is left.
  const host = usePaneHost(), slide = host.slide;
  useLayoutEffect(() => {
    const pane = slide ? null : document.getElementById('pane-endoscopy');   // (the tab's panel: the id is 2D's own, dock.js `'pane-' + id`)
    if (!pane) return;
    pane.dataset.sub = view;
    return () => { delete pane.dataset.sub; };
  }, [view, slide]);
  return (
    <>
      {!host.slide && (
        <div className="pressure-switch" role="group" aria-label={W.switchAria}>
          {(W.views as [string, string][]).map(([id, label]) => (
            <button key={id} type="button" className="ps-btn" data-view={id} aria-pressed={view === id} onClick={() => useScope.getState().setView(id as 'scope' | 'wall')}>{label}</button>
          ))}
        </div>
      )}
      {view === 'scope' ? <ScopeView key="scope" square={sq} opt={opt} slide={!!options} /> : <WallView key="wall" square={sq} slide={!!options} />}
    </>
  );
}

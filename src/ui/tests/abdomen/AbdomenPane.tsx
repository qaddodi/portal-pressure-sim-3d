// Tests > Ascites and paracentesis (2D instruments.js createAbdomen). What you read first, flat and unpressable: the belly with the litres, its grade and the daily balance, the pressure dial
// beside it, the drain on its other side, the abdominal pressure as a slim bar, and the tap's three numbers; then what you change: serum albumin and diuretics, in the app's control words.
import { useEffect, useMemo, useRef, useState } from 'react';
import { clock } from '../../../clock/frame.ts';
import { latest, useEngine } from '../../../engine/index.ts';
import { Chart, type ChartCtx, useLookId } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import { fmt } from '../../charts/fmt.ts';
import { updateParams } from '../../action/params.ts';
import { appEnv } from '../../treat/env.ts';
import { balanceHold } from '../copied/balance-hold.copied.js';
import { metricsOf, paramsNow } from '../frame.ts';
import { abView, bellyFrame, dialFrame, bellyW, dialW, WORDS, albuminTip, albuminText, IAP_MAX, type AbView } from './model.ts';

const hold = balanceHold();
let held: number | null = null;
/** The view of the newest frame, with the daily balance held steady (it swings with every breath: balance-hold.js). */
function viewNow(): AbView | null {
  const b = hold.step(metricsOf(latest.frame)?.ascites?.ratePerDay, performance.now());
  if (b != null) held = b;
  return abView(metricsOf(latest.frame), paramsNow(), hold.shown ?? held);
}

function Stepper({ label, unit, value, min, max, step, dp, onSet, cls = '' }: { label: string; unit: string; value: number; min: number; max: number; step: number; dp: number; onSet(v: number): void; cls?: string }) {
  const go = (d: number) => onSet(+Math.min(max, Math.max(min, value + d)).toFixed(dp));
  return (
    <div className={`ab-dp-vol ${cls}`} role="group" aria-label={label}>
      <button type="button" className="ab-dp-sb" aria-label={`${label}: less`} disabled={value <= min} onClick={() => go(-step)}>−</button>
      <output className="ab-dp-l" aria-live="polite"><span className="ab-dp-n">{fmt(value, dp)}</span><small>{unit}</small></output>
      <button type="button" className="ab-dp-sb" aria-label={`${label}: more`} disabled={value >= max} onClick={() => go(step)}>+</button>
    </div>
  );
}

export function AbdomenPane({ square }: { square?: number }) {
  void square;
  const json = useEngine((s) => { void s.frames; return JSON.stringify(viewNow()); });
  const v = useMemo(() => (json ? JSON.parse(json) as AbView : null), [json]);
  const root = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(360);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardW(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el); setCardW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  const [L, setL] = useState(5);
  const [alb, setAlb] = useState(true);
  const warn = L > 5 && !alb;
  const bw = bellyW(cardW), dw = dialW(bw);
  const bellyPainter = useRef<ChartPainter | null>(null), dialPainter = useRef<ChartPainter | null>(null);
  const dialCtx = useRef<ChartCtx | null>(null);
  const knob = useRef<{ shown: number; goal: number }>({ shown: NaN, goal: 0 });
  const pal = useLookId();

  // the knob eases round the ring to the reading (2D knobStep: D_SURFACE on the arrive curve); a still dial costs nothing
  const goal = v ? Math.min(Math.max(0, Math.round(v.iap) || 0), IAP_MAX) : 0;
  useEffect(() => {
    const k = knob.current;
    k.goal = goal;
    if (!Number.isFinite(k.shown)) k.shown = goal;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = () => { const c = dialCtx.current; if (c && v) dialPainter.current?.show(dialFrame(v.iap, k.shown, dw, bw, c.pal), false); };
    if (reduce || Math.abs(k.goal - k.shown) < 0.01) { k.shown = goal; draw(); return; }
    const h = clock.hold('ab-dial');
    const off = clock.on('tween', (f) => {
      k.shown += (k.goal - k.shown) * (1 - Math.exp(-Math.min(0.1, f.dt / 1000) / 0.09));
      if (Math.abs(k.goal - k.shown) < 0.02) k.shown = k.goal;
      draw();
      if (k.shown === k.goal) { off(); h.release(); }
    });
    return () => { off(); h.release(); };
  }, [goal, dw, bw, pal]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!v) return <p className="t-note">The model is not running yet.</p>;
  const fluid = v.fluid;
  return (
    <div className="ab" data-pane="abdomen" ref={root}>
      <div className="ab-main">
        <div className="ab-read">
          <div className="ab-vol" style={{ ['--ab-bw' as string]: `${bw}px` }}>
            <div className="ab-dial-box" style={{ width: dw }} title={WORDS.dialTip}>
              <Chart tag="ab-dial" painter={dialPainter} deps={[bw, dw, json]} label={`Intra-abdominal pressure ${Math.round(v.iap)} mmHg`}
                build={(c) => { dialCtx.current = c; return dialFrame(v.iap, Number.isFinite(knob.current.shown) ? knob.current.shown : v.iap, dw, bw, c.pal); }} />
            </div>
            <div className="ab-gauge" title={v.gradeTip} data-sev={v.sev}>
              <Chart tag="ab-belly" painter={bellyPainter} deps={[bw, json]} label={`Ascites ${v.num} litres, ${v.grade}`} build={(c) => bellyFrame(v, bw, c.pal)} />
            </div>
            <div className="ab-dp" role="group" aria-label={WORDS.paracentesis}>
              <div className="ab-dp-k">{WORDS.drain}</div>
              <Stepper label={WORDS.volumeToDrain} unit="L" value={L} min={1} max={10} step={0.5} dp={1} onSet={setL} />
              <button type="button" className="ab-dp-alb" role="switch" aria-checked={alb} data-warn={warn || undefined} title={albuminTip(L, warn)} onClick={() => setAlb(!alb)}>
                <span className="ab-dp-at"><b>{WORDS.albumin}</b><small>{albuminText(L, alb)}</small></span>
                <span className="switch-vis" aria-hidden="true"><i /></span>
              </button>
              <button type="button" className="ab-drain" disabled={!fluid} onClick={() => appEnv.action({ kind: 'paracentesis', mL: L * 1000, albumin: alb })}>{fluid ? WORDS.drain : WORDS.noAscites}</button>
            </div>
          </div>
          <div className="ab-trend" aria-live="off">{v.trend}</div>
          <div className="ab-iap">
            <div className="ab-kv"><span>{WORDS.iapKey}</span><span className="ab-v"><b>{v.iapNum}</b><span className="ab-w" data-sev={v.iapSev}>{v.iapWord}</span></span></div>
            <div className="ab-iap-bar" role="img" title={WORDS.iapTip} aria-label={`${WORDS.iapKey} ${v.iapNum}`}>
              <i className="ab-iap-fill" data-sev={v.iapSev} style={{ transform: `scaleX(${v.iapFill})` }} />
              <i className="ab-iap-mark" style={{ left: '40%' }} /><i className="ab-iap-mark" style={{ left: '66.7%' }} />
            </div>
          </div>
          <div className="ab-tiles" data-empty={v.tapped ? undefined : ''}>
            {[[WORDS.tiles[0], v.saag, v.tipSaag], [WORDS.tiles[1], v.protein, null], [WORDS.tiles[2], v.albumin, null]].map(([k, n, tip]) => (
              <dl className="ab-tile" key={k} title={tip ?? undefined}><dt>{k}</dt><dd><span className="ab-n">{n}</span><span className="ab-u">{WORDS.unit}</span></dd></dl>
            ))}
            <div className="ab-why">{v.why}</div>
          </div>
        </div>
        <div className="ab-ctl">
          <div className="ab-row">
            <span className="ab-txt"><b>{WORDS.serumAlbumin}</b></span>
            <span className="ab-end">{v.serum != null && <Stepper label={WORDS.serumAlbumin} unit="g/dL" value={v.serum} min={1.5} max={5} step={0.1} dp={1} cls="ab-sa" onSet={(x) => updateParams((p) => { p.albumin = x; return p; }, { label: WORDS.serumAlbumin })} />}</span>
          </div>
          <button type="button" className="ab-row ab-tg" role="switch" aria-checked={v.diuretics} title={WORDS.diureticsTip} onClick={() => updateParams((p) => { p.diuretics = !p.diuretics; return p; }, { label: WORDS.diuretics })}>
            <span className="ab-txt"><b>{WORDS.diuretics}</b><small>{WORDS.diureticsSub}</small></span>
            <span className="switch-vis" aria-hidden="true"><i /></span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Tests > Ascites and paracentesis (2D instruments.js createAbdomen). What you read first, flat and unpressable: the belly with the litres, its grade and the daily balance (2D's own element, filled by the stylesheet), the pressure dial
// beside it (a chart frame), the drain on its other side, the abdominal pressure as a slim bar, and the tap's three numbers; then what you change: serum albumin and diuretics, in the app's control words.
import { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../../shell/icons.tsx';
import { usePaneHost } from '../Cv.tsx';
import { clock } from '../../../clock/frame.ts';
import { latest, useEngine } from '../../../engine/index.ts';
import { Chart, type ChartCtx, useLookId } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import { fmt } from '../../charts/fmt.ts';
import { updateParams } from '../../action/params.ts';
import { appEnv } from '../../treat/env.ts';
import { useProc } from '../../deck/procs-state.ts';
import { useStates } from '../../../decks/hp/calc.ts';
import { copiedOf } from '../../../decks/hp/deck.ts';
import { balanceHold } from '../copied/balance-hold.copied.js';
import { caseBalance } from '../../case/rate.ts';
import { metricsOf, paramsNow } from '../frame.ts';
import { abView, dialFrame, riseTxt, slideTxt, RATE_ARROW, WORDS, albuminTip, albuminText, tapWords, tapPeak, tapRemoved, tapDrainL, TAP_RESERVE, IAP_MAX, type AbView } from './model.ts';

/** The litres the model drains on the slide `key` ('deck/slide') names, from the deck's chain of states (decks/hp/calc.ts): 0 until both states are in. */
function drainedOnSlide(key: string, results: ReturnType<typeof useStates.getState>['results']): number {
  const at = key.indexOf('/');
  if (at < 0) return 0;
  const id = key.slice(0, at), i = copiedOf(id)?.slides.findIndex((s) => s.id === key.slice(at + 1)) ?? -1;
  return i > 0 ? tapDrainL(results[id]?.[i - 1]?.fp?.asc, results[id]?.[i]?.fp?.asc) : 0;
}

const hold = balanceHold();
let held: number | null = null;
/** The view of the newest frame, with the daily balance held steady (it swings with every breath: balance-hold.js). */
function viewNow(): AbView | null {
  const b = hold.step(metricsOf(latest.frame)?.ascites?.ratePerDay, clock.now());
  if (b != null) held = b;
  // (a playing case says its own day's balance, from the course: the live one swings, and what it had settled to depended on when the card was opened)
  return abView(metricsOf(latest.frame), paramsNow(), hold.shown ?? held, caseBalance());
}

/** 2D's stepper (instruments.js stepper, and the litres to drain): − value +, the value between the buttons. `less` and `more` are the buttons' names. */
function Stepper({ label, less, more, unit, value, min, max, step, dp, onSet, cls = '', live = false }: { label: string; less: string; more: string; unit: string; value: number; min: number; max: number; step: number; dp: number; onSet(v: number): void; cls?: string; live?: boolean }) {
  const go = (d: number) => onSet(+Math.min(max, Math.max(min, value + d)).toFixed(dp));
  return (
    <div className={`ab-dp-vol${cls ? ` ${cls}` : ''}`} role="group" aria-label={label}>
      <button type="button" className="ab-dp-sb" aria-label={less} disabled={value <= min} onClick={() => go(-step)}>−</button>
      <output className="ab-dp-l" aria-live={live ? 'polite' : undefined}><span className="ab-dp-n">{fmt(value, dp)}</span><small>{unit}</small></output>
      <button type="button" className="ab-dp-sb" aria-label={more} disabled={value >= max} onClick={() => go(step)}>+</button>
    </div>
  );
}

export function AbdomenPane({ square }: { square?: number }) {
  const json = useEngine((s) => { void s.frames; return JSON.stringify(viewNow()); });
  const v = useMemo(() => (json ? JSON.parse(json) as AbView : null), [json]);
  const [L, setL] = useState(5);
  const [alb, setAlb] = useState(true);
  const warn = L > 5 && !alb;
  const dialPainter = useRef<ChartPainter | null>(null);
  const dialCtx = useRef<ChartCtx | null>(null);
  const knob = useRef<{ shown: number; goal: number }>({ shown: NaN, goal: 0 });
  const pal = useLookId(), host = usePaneHost();
  // a slide's paracentesis (Ascites 13): the litres taken off so far (the most the belly held on this slide less what it holds now) and the albumin that goes with them
  const tapping = useProc((s) => s.name === WORDS.paracentesis);
  // (the model's own litres for the slide: the state before it less its own, the two its run morphs between; the count is held to them and is the whole of them once done)
  const tapKey = useProc((s) => (s.name === WORDS.paracentesis ? s.key : '')), tapDone = useProc((s) => s.phase === 'done');
  const drainL = useStates((st) => drainedOnSlide(tapKey, st.results));
  const peak = useRef(0);
  const litres = v ? Number.parseFloat(v.num) : NaN;
  const wasTapping = useRef(false);
  peak.current = tapPeak(peak.current, litres, tapping && !wasTapping.current);   // (counted from the moment the procedure begins, not from the pane's first frame)
  wasTapping.current = tapping;
  // (the two lines are in the figure from the first frame of the slide: before, they were added with the first litre and the instrument card grew by their height on screen, 24 Nov)
  const removed = tapRemoved(Number.isFinite(litres) ? peak.current - litres : 0, drainL, tapDone);
  const tap = host.slide && tapping ? tapWords(removed) : null;
  const tapOn = !!tap && removed >= 0.05;   // (the two lines hold their room from the start of the slide, and come in as the first litre goes: nothing moves)
  // the dial is one drawing in a 76 × 128 box (2D iapDial), as wide as the 2D stylesheet makes its box (--ab-dw)
  const dial = (c: ChartCtx, iap: number, shown: number) => dialFrame(iap, shown, c.w, Math.round(c.w * 128 / 76), c.pal);

  // the knob eases round the ring to the reading (2D knobStep: D_SURFACE on the arrive curve); a still dial costs nothing
  const goal = v ? Math.min(Math.max(0, Math.round(v.iap) || 0), IAP_MAX) : 0;
  useEffect(() => {
    const k = knob.current;
    k.goal = goal;
    if (!Number.isFinite(k.shown)) k.shown = goal;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = () => { const c = dialCtx.current; if (c && v) dialPainter.current?.show(dial(c, v.iap, k.shown), false); };
    if (reduce || Math.abs(k.goal - k.shown) < 0.01) { k.shown = goal; draw(); return; }
    const h = clock.hold('ab-dial');
    const off = clock.on('tween', (f) => {
      k.shown += (k.goal - k.shown) * (1 - Math.exp(-Math.min(0.1, f.dt / 1000) / 0.09));
      if (Math.abs(k.goal - k.shown) < 0.02) k.shown = k.goal;
      draw();
      if (k.shown === k.goal) { off(); h.release(); }
    });
    return () => { off(); h.release(); };
  }, [goal, pal]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!v) return <p className="ctl-sub">The model is not running yet.</p>;
  const fluid = v.fluid;
  // (A slide's card has no 2D wrapper yet, so its belly keeps the size it is handed; in the Tests card the 2D stylesheet sizes it.)
  // 2D's own markup (instruments.js createAbdomen), laid out and dressed by the 2D stylesheet (.instrument-view.ab: the belly between the dial and the drain, the tap's tiles, then the two rows; two
  // columns on a wide sheet). The belly is 2D's element: the fluid rises by sliding up inside it (translate, whole percents), the litres, the grade and the daily balance written in it.
  return (
    <div className={`ab ${host.view}`} data-pane="abdomen" data-belly="84">
      <div className="ab-main">
        <div className="ab-read">
          <div className="ab-vol">
            <div className="ab-vol-l"><div className="ab-trend">{v.trend}</div></div>
            <div className="ab-gauge">
              <div className="ab-belly" style={host.slide && square ? { width: square, height: square, maxHeight: 'none' } : undefined}   /* (2D's own rule caps a belly's height at 22 pzh, 86 px on a phone on its side, while this width stays: a pill with the litres clipped, capture 4fb2f869) */>
                <i className="ab-belly-fill" style={{ translate: riseTxt(v.fill) }} />
                <div className="ab-big">
                  <b data-sev={v.sev}><span>{v.num}</span><small>L</small></b>
                  <span className="ab-grade" data-sev={v.sev} title={v.gradeTip}>{v.grade}</span>
                  <span className="ab-rate" data-dir={v.rateDir} data-refill={v.rate.startsWith('Refilling') ? '' : undefined}><i className="ab-rate-a" aria-hidden="true">{v.rate ? RATE_ARROW[v.rateDir] : ''}</i><span>{v.rate}</span></span>
                </div>
              </div>
              {tap && <div className="ab-tap" role="status" data-on={tapOn ? '' : undefined} data-dose={removed > 5 ? '' : undefined}><div className="ab-tap-now"><b>{tap.removed}</b><span>{tap.dose}</span></div>{TAP_RESERVE.map((r, k) => <em key={k} className="ab-tap-hold" aria-hidden="true"><b>{r.removed}</b><span>{r.dose}</span></em>)}</div>}
              <div className="ab-dial-box svg-gl-box" title={WORDS.dialTip}>
                <Chart tag="ab-dial" painter={dialPainter} deps={[json]} label={`Intra-abdominal pressure ${Math.round(v.iap)} mmHg`}
                  build={(c) => { dialCtx.current = c; return dial(c, v.iap, Number.isFinite(knob.current.shown) ? knob.current.shown : v.iap); }} />
              </div>
            </div>
            <div className="ab-dp" role="group" aria-label={WORDS.paracentesis}>
              <div className="ab-dp-k">{WORDS.drain}</div>
              <Stepper label={WORDS.volumeToDrain} less={WORDS.decrease} more={WORDS.increase} unit="L" value={L} min={1} max={10} step={0.5} dp={1} onSet={setL} live />
              <button type="button" className={`ab-dp-alb${warn ? ' ab-warn' : ''}`} role="switch" aria-checked={alb} title={albuminTip(L, warn)} onClick={() => setAlb(!alb)}>
                <span className="ab-dp-at"><b>{WORDS.albumin}</b><small className={warn ? 'ab-warn' : undefined}>{albuminText(L, alb)}</small></span>
                <span className="switch-vis" aria-hidden="true"><i /></span>
              </button>
              <button type="button" className="ab-drain" disabled={!fluid} onClick={() => appEnv.action({ kind: 'paracentesis', mL: L * 1000, albumin: alb })}>{fluid ? WORDS.drain : WORDS.noAscites}</button>
            </div>
          </div>
          <div className="ab-iap">
            <div className="ab-kv"><span>{WORDS.iapKey}</span><span className="ab-v"><b>{v.iapNum}</b><span className="ab-w" data-sev={v.iapSev}>{v.iapWord}</span></span></div>
            <div className="ab-iap-bar" role="img" title={WORDS.iapTip} aria-label={`${WORDS.iapKey} ${v.iapNum}, ${v.iapWord}`}>
              <i className="ab-iap-fill" data-sev={v.iapSev} style={{ translate: slideTxt(v.iapFill) }} />
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
            <I n="drop" />
            <span className="ab-txt"><b>{WORDS.serumAlbumin}</b></span>
            <span className="ab-end">{v.serum != null && <Stepper label={WORDS.serumAlbumin} less={`${WORDS.serumAlbumin}: less`} more={`${WORDS.serumAlbumin}: more`} unit="g/dL" value={v.serum} min={1.5} max={5} step={0.1} dp={1} cls="ab-sa" onSet={(x) => updateParams((p) => { p.albumin = x; return p; }, { label: WORDS.serumAlbumin })} />}</span>
          </div>
          <button type="button" className="ab-row ab-tg" role="switch" aria-checked={v.diuretics} title={WORDS.diureticsTip} onClick={() => updateParams((p) => { p.diuretics = !p.diuretics; return p; }, { label: WORDS.diuretics })}>
            <I n="pill" />
            <span className="ab-txt"><b>{WORDS.diuretics}</b><small>{WORDS.diureticsSub}</small></span>
            <span className="switch-vis" aria-hidden="true"><i /></span>
          </button>
        </div>
      </div>
    </div>
  );
}

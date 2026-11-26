// Tests > IR (2D hvpg-proc.js, ir-ppg.js, ir-tips.js): the interventional-radiology instrument. Measure: the HVPG catheter's measurement on the one pressure monitor (the 2D monitor.js, copied, drawn
// into a chart frame), the free, wedged and HVPG readings, the four steps, a caption; the Watch row of treatments played on the anatomy (TIPS, BRTO…) and the PPG by IR, whose monitor takes
// the HVPG tracing's place while it plays and for six seconds after. TIPS: the stent's own test ("Test TIPS in IR" on a stent card opens it): TipsView.tsx (the stent to scale with its chart, the numbers, the editor, Tube vs patient, Compare). The measurements run on `run.ts`; the moment's words are `side.ts`.
import { useEffect } from 'react';
import './ir.css';
import { latest, shownParams, useEngine } from '../../../engine/index.ts';
import { registerFeature } from '../../shell/features.ts';
import { useShell } from '../../shell/store.ts';
import { Icon } from '../../shell/icons.tsx';
import { useSelection } from '../../action/selection.ts';
import { useParamsTick } from '../../action/params.ts';
import { useTests } from '../store.ts';
import { takeStent } from '../from-orders.ts';
import type { PaneProps } from '../TestsLayer.tsx';
import { Monitor } from './Monitor.tsx';
import { HandOver } from './HandOver.tsx';
import { hvpgSource, ppgSource } from './sources.ts';
import { R, useRun, phase, values, busy, startHvpg, playProc, startPpg, closePpg, resetAll, watchButtons, procSay, ppgCaption, ppgShown, hvpgRunning } from './run.ts';
import { sideOf } from './side.ts';
import { measureLabel, hvBlocked, STEPS } from './hvpg.ts';
import { useIr, stentsNow } from './store.ts';
import { NO_STENT_WHY } from './copied/tips-parts.copied.js';
import { TipsView } from './TipsView.tsx';
import { hvpgNote, useMeasured } from '../hidden.ts';
import { usePaneHost } from '../Cv.tsx';
import { OwnerNote, useBlocker } from '../OwnerNote.tsx';
import { useTalkOn } from '../../../state/deck.ts';
import { fadeAttrs } from '../../fade.tsx';

const touch = (e: React.PointerEvent, go: () => void, disabled: boolean) => { if (e.pointerType !== 'mouse' && !disabled) go(); };
const KV: [keyof ReturnType<typeof values>, string][] = [['fhvp', 'FHVP'], ['whvp', 'WHVP'], ['hvpg', 'HVPG']];

function Measure({ h }: { h: number }) {
  useRun((s) => s.n);
  // the readings follow the model while idle: a re-render only when a printed tenth changes
  useEngine((s) => { void s.frames; const m = latest.frame?.metrics; return `${Math.round(((m?.fhvp as number) ?? 0) * 10)}|${Math.round(((m?.whvp as number) ?? 0) * 10)}|${m?.pv ? 1 : 0}`; });
  useParamsTick((s) => s.tick);
  const mode = useTalkOn() ? 'deck' : 'free', measured = useMeasured((s) => s.hvpgMeasured);
  const ph = phase(), running = hvpgRunning(), other = useBlocker('ir'), isBusy = busy() || !!other;
  const side = sideOf({ ph, t: R.t, started: R.t0 != null, blocked: R.blocked, blockedNow: hvBlocked(shownParams()), v: values(), hasFrame: !!latest.frame });
  const ppg = ppgShown(), watch = watchButtons();
  const caption = procSay() || ppgCaption() || side.caption;
  return (
    <>
      <div className="hvpg-bar">
        <button type="button" className="btn primary" disabled={isBusy} onClick={startHvpg} onPointerUp={(e) => touch(e, startHvpg, isBusy)}>
          <Icon n="catheter" /><span>{measureLabel(running, !!R.result)}</span>
        </button>
        <dl className="hvpg-kv">
          {KV.map(([k, name]) => (
            <div key={k}><dt>{name}</dt><dd data-sev={side.sev[k] || undefined} data-nm={side.nm[k] ? '1' : undefined}>{side.texts[k]}</dd></div>
          ))}
        </dl>
      </div>
      <HandOver over={ppg}
        base={(at) => <Monitor boxRef={at} src={hvpgSource} h={h} deps={[ph, R.result, R.blocked, side.open]} />}
        top={(at) => <div className="hvpg-ir" data-state={R.ppg.take}><div className="pz-mon pz-reading"><Monitor boxRef={at} src={ppgSource} h={h} deps={[R.ppg.take]} onClick={closePpg} /></div></div>} />
      <div className="chart-side">
        {!ppg && (
          <ol className="hvpg-steps">
            {STEPS.map((s, i) => <li key={String(s[0])} data-step={s[0]} data-state={side.steps[i] || undefined} title={String(s[2])}><span>{s[3]}</span></li>)}
          </ol>
        )}
        <OwnerNote me="ir" />
        <p className="ctl-sub hvpg-caption" aria-live="polite">{caption}</p>
        <div className="hvpg-procs" role="group" aria-label="Play a procedure on the anatomy">
          <span className="hvpg-procs-k">Watch</span>
          {watch.map((b) => (
            <button key={b.kind} type="button" className={`btn sm hvpg-proc-btn${b.off ? ' off' : ''}`} {...fadeAttrs(!b.hidden)} disabled={isBusy} aria-pressed={b.on}
              aria-label={`Play ${b.name} on the anatomy`} onClick={() => playProc(b.kind)} onPointerUp={(e) => touch(e, () => playProc(b.kind), isBusy)}>
              <Icon n="play" /><span>{b.name}</span>
            </button>
          ))}
          <button type="button" className="btn sm hvpg-proc-btn" disabled={isBusy} aria-label="Play the PPG by interventional radiology on the anatomy"
            title="PPG by interventional radiology: the IVC pressure through the neck, then the portal vein pressure through the skin and the liver." onClick={startPpg} onPointerUp={(e) => touch(e, startPpg, isBusy)}>
            <Icon n="play" /><span>PPG by IR</span>
          </button>
        </div>
        <p className="ctl-sub hvpg-note">{hvpgNote(mode === 'deck', measured)}</p>
      </div>
    </>
  );
}

export function IrPane(p: PaneProps) {
  const view = useIr((s) => s.view), setView = useIr((s) => s.setView), openStent = useIr((s) => s.openStent);
  useParamsTick((s) => s.tick);
  const ids = stentsNow(), has = ids.length > 0, host = usePaneHost();
  const h = Math.max(190, Math.round(p.narrow ? Math.min(p.plot, 220) : p.plot));

  // a new patient starts with no measurement (the pane going away stops nothing: what plays goes on, the figure shows it, and the owner's claim says so: owner.ts)
  const presetId = useEngine((s) => s.presetId);
  useEffect(() => { resetAll(); }, [presetId]);
  // "Test TIPS in IR" on a stent card: this pane on the TIPS view, on that stent. The card closes with the tap, so the stent is the one the Tests card handed over (from-orders.ts), or, while the
  // card is still up (this pane's own handler runs before it closes, and a tap on the IR tab leaves it up), the selected one.
  useEffect(() => {
    const open = () => { const sel = useSelection.getState().sel, id = takeStent() ?? (sel?.type === 'edge' ? sel.id : null); if (id) openStent(id); };
    open();
    const off = registerFeature('ir', () => { useShell.getState().close(); useTests.getState().show('hvpg'); open(); });
    // (the Tests card's own handler is put back when this pane is left)
    return () => { off(); registerFeature('ir', () => { useShell.getState().close(); useTests.getState().show('hvpg'); }); };
  }, [openStent]);
  // a stent taken away with the TIPS view open sends it back to Measure
  useEffect(() => { if (!has && view === 'tips') setView('measure'); }, [has, view, setView]);

  // 2D's own markup (hvpg-proc.js, ir-tips.js; dock.js puts the switch, the pane's head row, before the view): the 2D stylesheet lays it out, and shows one view by data-view
  return (
    <>
      <div className="pressure-switch ir-switch" role="group" aria-label="IR view">
        <button type="button" className="ps-btn" data-view="measure" aria-pressed={view === 'measure'} onClick={() => setView('measure')}>Measure</button>
        <button type="button" className={`ps-btn${has ? '' : ' off'}`} data-view="tips" aria-pressed={view === 'tips'} aria-disabled={!has}
          onClick={() => { if (!has) { useShell.getState().say(NO_STENT_WHY); return; } setView('tips'); }}><span>{ids.includes('TIPS') || !ids.length ? 'TIPS' : ids[0]}</span></button>
      </div>
      <div className={host.view} data-pane="hvpg" data-view={view}>
        {view === 'tips' ? <TipsView h={h} /> : <Measure h={h} />}
      </div>
    </>
  );
}

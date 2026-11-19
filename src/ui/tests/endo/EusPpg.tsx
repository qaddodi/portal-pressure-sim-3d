// EUS-PPG on the Endoscopy tab (2D eus-ppg.js): the endoscopic ultrasound-guided portal pressure gradient, played step by step on the anatomy as the HVPG is (the figure's own procedure, proc-anim.js
// MEASURES.eus: the echoendoscope, its ultrasound sector and the 25-gauge needle, scene/procedures). The tab keeps a "Measure · EUS-PPG" button; while the needle works (and a few seconds after) a panel
// shows the two readings and their difference as the needle takes them, the numbered steps, and the step's words. It changes nothing in the model: a measurement.
import { useEffect, useRef, useState } from 'react';
import { OrderIcon } from '../../action/icons.tsx';
import { sceneApi } from '../../../scene/api.ts';
import { MEASURES, READS, markAt, specOf } from '../../../scene/procedures/copied/proc-anim.js';
import { hvpgSev, hvpgWord, EUS_LINE_NOTE, EUS_SITE_NOTE, NOT_SHOWN } from '../../../engine/hales/portal/pressure-cuts.js';
import { latest } from '../../../engine/index.ts';
import { useShell } from '../../shell/store.ts';
import { ENDO_WORDS as W } from '../copied/endo-words.copied.js';
import { useScope } from './scope-state.ts';

const EUS = MEASURES.eus as unknown as { steps: [string, string, string, string][]; T: { end: number } };
const word = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : NOT_SHOWN);
const TECHNIQUE = `${W.eusIdle} ${W.eusSite} ${EUS_SITE_NOTE} ${EUS_LINE_NOTE}`;
/** how long the result is held over the scope before it fades away (2D monitor-takeover.js) */
export const HOLD_MS = 4500;

interface Reads { pv: number; hv: number; ppg: number }
const readsRef = READS as unknown as { eus: Reads };
const reads = (): Reads => ({ ...readsRef.eus });

export function EusPpg() {
  const phase = useScope((s) => s.eus), step = useScope((s) => s.step);
  const [rd, setRd] = useState<Reads>(reads);
  const done = useRef(false), timer = useRef(0), got = useRef(-1);

  const finish = (ok: boolean) => {
    useScope.getState().setEus(ok ? 'hold' : 'idle');
    setRd(reads());
    window.clearTimeout(timer.current);
    if (ok) timer.current = window.setTimeout(() => useScope.getState().setEus('idle'), HOLD_MS);
  };
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    if (sceneApi.procedure.playing?.kind === 'eus') sceneApi.procedure.stop();
    useScope.getState().setEus('idle');
  }, []);

  const play = () => {
    if (phase === 'run') return;
    if (sceneApi.procedure.playing) { useShell.getState().say(W.eusBusy); return; }
    window.clearTimeout(timer.current);
    done.current = false; got.current = -1;
    for (const k of Object.keys(readsRef.eus)) (readsRef.eus as unknown as Record<string, number>)[k] = NaN;
    setRd(reads());
    useScope.getState().setEus('run', 0);
    sceneApi.procedure.play('eus', {
      onFrame: (r) => {
        const t = sceneApi.procedure.playing?.t ?? 0, spec = specOf('eus') as { capture(i: number, rd: unknown, f: unknown): void };
        if (r.step !== useScope.getState().step) useScope.getState().setEus('run', r.step);
        // each reading is taken once its callout has come (the needle has reached the vein and the pressure has settled): the model's frame then
        const mk = r.step < 0 ? -1 : t >= markAt('eus', r.step) ? r.step : r.step - 1;
        for (let i = got.current + 1; i <= mk; i++) { spec.capture(i, readsRef.eus, latest.frame); got.current = i; setRd(reads()); }
        if (t >= EUS.T.end - 1) done.current = true;
      },
      onEnd: () => finish(done.current),
    });
  };

  const sev = Number.isFinite(rd.ppg) ? hvpgSev(rd.ppg) : '';
  const cap = phase === 'run' && step >= 0 ? EUS.steps[step]![2]
    : phase === 'hold' && Number.isFinite(rd.ppg) ? `${hvpgWord(rd.ppg, true)}${W.eusDone[0]}${word(rd.pv)}${W.eusDone[1]}${word(rd.hv)}${W.eusDone[2]}${word(rd.ppg)}${W.eusDone[3]}` : W.eusIdle;
  const tip = phase === 'idle' && Number.isFinite(rd.ppg) ? `Last EUS-PPG ${word(rd.ppg)}${W.eusLast[0]}${word(rd.pv)}${W.eusLast[1]}${word(rd.hv)}${W.eusLast[2]}` : TECHNIQUE;
  return (
    <div className="eus-ppg" data-eus="" data-state={phase}>
      <div className="hvpg-procs" role="group" aria-label="EUS-guided portal pressure gradient">
        <span className="hvpg-procs-k">{W.measure}</span>
        <button type="button" className="btn sm hvpg-proc-btn" aria-label={W.eusAria} aria-pressed={phase === 'run'} title={tip} disabled={phase === 'run'} onClick={play}>
          <OrderIcon n="needle" className="ac-ic" /><span>{W.eusName}</span>
        </button>
      </div>
      <div className="eus-panel" onClick={() => { if (phase === 'hold') useScope.getState().setEus('idle'); }}>
        <dl className="hvpg-kv">
          {(W.eusKeys as [keyof Reads, string][]).map(([k, t]) => (
            <div key={k}><dt>{t}</dt><dd data-sev={k === 'ppg' ? sev : undefined}>{word(rd[k])}</dd></div>
          ))}
        </dl>
        <ol className="hvpg-steps">
          {EUS.steps.map(([id, title, , short], i) => <li key={id} title={title} data-state={phase === 'run' ? (i < step ? 'done' : i === step ? 'now' : undefined) : phase === 'hold' ? 'done' : undefined}><span>{short}</span></li>)}
        </ol>
        <p className="ctl-sub hvpg-caption" aria-live="polite">{cap}</p>
      </div>
    </div>
  );
}

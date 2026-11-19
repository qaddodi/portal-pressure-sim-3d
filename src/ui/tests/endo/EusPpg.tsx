// EUS-PPG on the Endoscopy tab (2D eus-ppg.js): the endoscopic ultrasound-guided portal pressure gradient, played step by step on the anatomy as the HVPG is (the figure's own procedure, proc-anim.js
// MEASURES.eus: the echoendoscope, its ultrasound sector and the 25-gauge needle, scene/procedures). Two parts in one element, as in 2D: the "Measure · EUS-PPG" row (beside Band) and
// the panel (over the scope's picture): the one pressure monitor on the needle's clock, the two readings and their difference as the needle takes them, the numbered steps and the step's words.
// The monitor takes the scope's place while the needle plays, holds the result a few seconds, then fades away and the scope fades back (monitor-takeover.js); a tap on the held result takes it away sooner.
// It changes nothing in the model: a measurement. The run is eus-run.ts, the monitor's source eus-source.ts.
import { useEffect } from 'react';
import { OrderIcon } from '../../action/icons.tsx';
import { hvpgSev } from '../../../engine/hales/portal/pressure-cuts.js';
import { ENDO_WORDS as W } from '../copied/endo-words.copied.js';
import { Monitor } from '../ir/Monitor.tsx';
import { useScope } from './scope-state.ts';
import { E, tk, reads, playEus, resetEus, useEus } from './eus-run.ts';
import { EUS, TECHNIQUE, word, monitorHeight, captionOf, type Reads } from './eus-words.ts';
import { eusSource, eusWords, M } from './eus-source.ts';

const touch = (e: React.PointerEvent, go: () => void, disabled: boolean) => { if (e.pointerType !== 'mouse' && !disabled) go(); };

/** The Endoscopy tab leaving (or a new patient): the needle stops, the scope comes back. */
export function useEusReset(preset: unknown): void {
  useEffect(() => () => resetEus(), []);
  useEffect(() => { resetEus(); }, [preset]);
}

/** 2D's own element (eus-ppg.js): `.eus-ppg[data-eus][data-state]` holding the "Measure · EUS-PPG" row and the panel (the monitor, the readings, the steps, the step's words). The 2D stylesheet lays
 *  the row beside Band and the panel over the scope's picture while the needle plays and its result is held (scope-card.css: data-state run or hold), and fades the picture out under it. */
export function EusPpg({ width }: { width: number }) {
  const phase = useScope((s) => s.eus), step = useScope((s) => s.step);
  useEus((s) => s.n);
  const rd = reads(), run = phase === 'run', sev = Number.isFinite(rd.ppg) ? hvpgSev(rd.ppg) : '';
  const tip = !tk.shown() && E.done && Number.isFinite(rd.ppg) ? `Last EUS-PPG ${word(rd.ppg)}${W.eusLast[0]}${word(rd.pv)}${W.eusLast[1]}${word(rd.hv)}${W.eusLast[2]}` : TECHNIQUE;
  const h = monitorHeight(width);
  return (
    <div className="eus-ppg" data-eus="" data-state={phase}>
      <div className="hvpg-procs" role="group" aria-label="EUS-guided portal pressure gradient">
        <span className="hvpg-procs-k">{W.measure}</span>
        <button type="button" className="btn sm hvpg-proc-btn" aria-label={W.eusAria} aria-pressed={run} title={tip} disabled={run} onClick={playEus} onPointerUp={(e) => touch(e, playEus, run)}>
          <OrderIcon n="needle" className="ac-ic" /><span>{W.eusName}</span>
        </button>
      </div>
      <div className="eus-panel" aria-hidden={phase === 'idle' ? true : undefined} onClick={() => tk.close()}
        onKeyDown={(e) => { if (phase === 'hold' && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tk.close(); } }}
        tabIndex={phase === 'hold' ? 0 : -1} role={phase === 'hold' ? 'button' : undefined} aria-label={phase === 'hold' ? 'EUS-PPG result: close' : undefined}>
        <div className="pz-mon pz-reading">
          <Monitor src={eusSource} h={h} deps={[phase, M.take]} />
          <div className="sr-only" role="group" aria-label="Pressure readings"><p>{eusWords()}</p></div>
        </div>
        <dl className="hvpg-kv">
          {(W.eusKeys as [keyof Reads, string][]).map(([k, t]) => (
            <div key={k}><dt>{t}</dt><dd data-sev={k === 'ppg' ? sev : undefined}>{word(rd[k])}</dd></div>
          ))}
        </dl>
        <ol className="hvpg-steps">
          {EUS.steps.map(([id, title, , short], i) => <li key={id} data-step={id} title={title} data-state={phase === 'run' ? (i < step ? 'done' : i === step ? 'now' : undefined) : phase === 'hold' ? 'done' : undefined}><span>{short}</span></li>)}
        </ol>
        <p className="ctl-sub hvpg-caption" aria-live="polite">{captionOf(phase, step, rd)}</p>
      </div>
    </div>
  );
}

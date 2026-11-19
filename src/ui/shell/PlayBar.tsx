import { useRef } from 'react';
import { UI } from '../strings.generated.ts';
import { useEngine } from '../../engine/index.ts';
import { useShell } from './store.ts';
import { Anchored } from './Pop.tsx';
import { Icon } from './icons.tsx';
import { runFeature } from './features.ts';
import { jump, setSpeed, settle, togglePlay } from './transport.ts';
import { PLAY_TITLES, SETTLED } from './words.ts';
import { useCompare } from '../compare/store.ts';
import { useTimeline } from '../timeline/store.ts';
import { restartPatient } from '../patients/index.ts';
import { CMP } from '../compare/words.ts';
// @ts-ignore the pinned engine copy is plain JS
import * as cuts from '../../engine/hales/portal/pressure-cuts.js';

const pb = UI.playbar;
const HOLD_MS = 450;

function SpeedMenu() {
  const { speed, lapse } = useShell((s) => s.transport);
  const pick = (v: number, l: boolean) => { setSpeed(v, l); useShell.getState().close(); };
  return (
    <>
      <div className="sh-title">{pb.menu[0]}</div>
      {pb.speeds.map((v) => <button key={v} type="button" className="sh-row" aria-pressed={!lapse && speed === v} onClick={() => pick(v, false)} style={{ gridTemplateColumns: '1fr' }}><span className="sh-t">{v}×</span></button>)}
      <div className="sh-title">{pb.menu[1]}</div>
      {pb.lapses.map((l) => <button key={l.short} type="button" className="sh-row" aria-pressed={lapse === l.days} onClick={() => pick(l.days, true)} style={{ gridTemplateColumns: '1fr' }}><span className="sh-t">{l.long}</span></button>)}
    </>
  );
}

function JumpMenu({ compare }: { compare: boolean }) {
  const done = () => useShell.getState().close();
  const canUndo = useTimeline((t) => t.canUndo), comparing = useCompare((c) => !!c.snap);
  return (
    <>
      {canUndo && <button type="button" className="sh-row" style={{ gridTemplateColumns: '1fr' }} onClick={() => { done(); runFeature('undo', pb.menu[2]); }}><span className="sh-t">{pb.menu[2]}</span></button>}
      <div className="sh-title">{pb.menu[3]}</div>
      {pb.jumps.map((j) => <button key={j.short} type="button" className="sh-row" style={{ gridTemplateColumns: '1fr' }} onClick={() => { done(); jump(j.days); }}><span className="sh-t">{`Jump ${j.long} ahead`}</span></button>)}
      <button type="button" className="sh-row" style={{ gridTemplateColumns: '1fr' }} onClick={() => { done(); jump('event'); }}><span className="sh-t">{pb.menu[4]}</span></button>
      <button type="button" className="sh-row" style={{ gridTemplateColumns: '1fr' }} onClick={() => { done(); settle(); useShell.getState().say(SETTLED); }}><span className="sh-t">{pb.menu[5]}</span></button>
      {compare && <button type="button" className="sh-row" style={{ gridTemplateColumns: '1fr' }} onClick={() => { done(); runFeature('compare', pb.menu[6]); }}><span className="sh-t">{comparing ? CMP.stop : pb.menu[6]}</span></button>}
    </>
  );
}

/** One key readout of the dock's strip (2D dock.js tileEl: .metric.primary with .k, .v, .unit and .s). */
function Metric({ label, value, sev, word }: { label: string; value: number | null; sev: string; word: string }) {
  return (
    <div className="metric inert primary" data-sev={value == null ? 'none' : sev} role="group" aria-label={label}>
      <span className="k">{label}</span>
      <span className="v"><span className="val">{value == null ? '—' : value.toFixed(1)}</span>{value != null && <span className="unit">mmHg</span>}</span>
      <span className="s"><span className="status">{value == null ? '' : word}</span></span>
    </div>
  );
}

/** Play, speed, restart, the clock, jumps, History, Compare and the two headline readouts. Play and pause, speed, jumps, restart and settle reach the engine. */
export function PlayBar({ phone }: { phone: boolean }) {
  const { running, speed, lapse, time } = useShell((s) => s.transport);
  const mode = useShell((s) => s.mode);
  const hvpg = useEngine((s) => s.hvpg), pv = useEngine((s) => s.pv), ivc = useEngine((s) => s.ivc);
  const ppg = pv != null && ivc != null ? pv - ivc : null;
  const comparing = useCompare((c) => !!c.snap), histCount = useTimeline((t) => t.count);
  const hold = useRef<{ t: ReturnType<typeof setTimeout> | undefined; held: boolean }>({ t: undefined, held: false });
  const lap = pb.lapses.find((l) => l.days === lapse);
  const speedText = lapse ? (lap ? lap.short : `${lapse} d/s`) : `${speed}×`;
  const hvpgSev = hvpg == null ? 'ok' : (cuts.hvpgSev(hvpg) as string), ppgSev = ppg == null ? 'ok' : (cuts.ppgSev(ppg) as string);
  const doHist = () => runFeature('history', pb.controls[3]);
  return (
    <div className="sh-play vdock" data-hidden={mode === 'deck'} data-phone={phone || undefined} role="group" aria-label="Playback">
      <div className="stage-bar bottom">
        <div className="timeline" role="group" aria-label="Timeline">
          <div className="tl-left">
            <div className="tl-split">
              <Anchored sheet="speed" place="above" align="start" width={280} label={PLAY_TITLES.speed} button={({ id, open, toggle }) => (
                <button type="button" className={`tl-speed${lapse ? ' lapse' : ''}`} data-opens="speed" aria-haspopup="menu" aria-expanded={open} aria-controls={id} title={PLAY_TITLES.speed} aria-label={`${pb.controls[2]}, ${speedText}`} onClick={toggle}>{speedText}</button>)}>
                <SpeedMenu />
              </Anchored>
              <button type="button" className={`ib play${lapse ? ' lapse' : ''}`} aria-label={running ? 'Pause' : 'Play'} title={PLAY_TITLES.playPause}
                onPointerDown={() => { hold.current.held = false; clearTimeout(hold.current.t); hold.current.t = setTimeout(() => { hold.current.held = true; useShell.getState().open('speed'); }, HOLD_MS); }}
                onPointerUp={() => clearTimeout(hold.current.t)} onPointerLeave={() => clearTimeout(hold.current.t)} onPointerCancel={() => clearTimeout(hold.current.t)} onContextMenu={(e) => e.preventDefault()}
                onClick={() => { if (hold.current.held) { hold.current.held = false; return; } togglePlay(); }}>
                <Icon n={running ? 'pause' : lapse ? 'playlapse' : 'play'} />
              </button>
            </div>
            {/* 2D keeps Restart in the DOM and hides it at every size (app-08-cards.css .timeline .tl-restart): it is in the search and Reset. */}
            <button type="button" className="ib tl-restart" aria-label={pb.controls[1]} title={PLAY_TITLES.restart} onClick={() => { void restartPatient(); }}><Icon n="reset" /></button>
          </div>
          <span className="tl-time" aria-live="off"><span className="tl-t-long">{time}</span><span className="tl-t-short" aria-hidden="true">{time}</span></span>
          <div className="tl-jumps">
            <Anchored sheet="jump" place="above" align="end" width={300} label={pb.controls[4]} button={({ id, open, toggle }) => (
              <button type="button" className="ib tl-ff" data-opens="jump" aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={pb.controls[4]} title={PLAY_TITLES.ffwd} onClick={toggle}><Icon n="ffwd" /></button>)}>
              <JumpMenu compare={phone} />
            </Anchored>
          </div>
          <button type="button" className="tl-hist" aria-haspopup="dialog" aria-label={pb.controls[3]} title={PLAY_TITLES.history} onClick={doHist}><Icon n="clock" /><span className="tl-hl">{pb.controls[3]}</span><span className="tl-hc">{histCount > 0 ? histCount : ''}</span></button>
          <button type="button" className="tl-pin" aria-pressed={comparing} aria-label={comparing ? CMP.stop : pb.controls[5]} title={comparing ? PLAY_TITLES.stopCompare : PLAY_TITLES.compare} onClick={() => runFeature('compare', pb.controls[5])}><Icon n="compare" /><span>{comparing ? 'Stop' : 'Compare'}</span></button>
        </div>
      </div>
      <section className="readouts" aria-label="Clinical readouts">
        <Metric label="HVPG" value={hvpg} sev={hvpgSev} word={hvpg == null ? '' : (cuts.hvpgWord(hvpg) as string)} />
        <Metric label="PPG" value={ppg} sev={ppgSev} word={ppg == null ? '' : (cuts.ppgWord(ppg) as string)} />
      </section>
    </div>
  );
}

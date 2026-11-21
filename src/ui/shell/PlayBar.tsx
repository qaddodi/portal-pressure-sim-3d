import { useRef } from 'react';
import { UI } from '../strings.generated.ts';
import { useEngine } from '../../engine/index.ts';
import { useShell } from './store.ts';
import { Anchored } from './Pop.tsx';
import { I } from './icons.tsx';
import { runFeature } from './features.ts';
import { jump, setSpeed, settle, togglePlay } from './transport.ts';
import { PLAY_TITLES, SETTLED } from './words.ts';
import { useCompare } from '../compare/store.ts';
import { useTimeline } from '../timeline/store.ts';
import { restartPatient } from '../patients/index.ts';
import { CMP } from '../compare/words.ts';
import { envNow } from '../action/env.ts';
import { Roll } from '../cards/Roll.tsx';
import { useSwitching } from '../patients/switching.ts';
import { lobuleOf } from '../action/read.ts';
import { LOBULE_TILES, roomFor, type Scale } from './lobule-strip.ts';
// @ts-ignore the pinned engine copy is plain JS
import * as cuts from '../../engine/hales/portal/pressure-cuts.js';

import { clock } from '../../clock/frame.ts';
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


const SCALE_MAX = 25;   // (2D dock.js TILES: scale [0, 25] for both)
const MMHG: Scale = { lo: 0, hi: SCALE_MAX };
const posIn = (sc: Scale, v: number) => Math.min(1, Math.max(0, (v - sc.lo) / (sc.hi - sc.lo)));

/** One headline reading, as 2D's tile-el.js builds it: .metric.primary.inert > .k, .v (.val, .unit), .rb (.rb-fill, .rb-tick), .s (.status). */
function Tile({ id, k, value, from, sev, word, ticks, scale = MMHG, unit = 'mmHg', unitWords = '', fixed = 1 }: { id: string; k: string; value: number | null; from: number; sev: string; word: string; ticks: number[]; scale?: Scale; unit?: string; unitWords?: string; fixed?: number }) {
  const shown = value == null ? null : value.toFixed(fixed);
  const switching = useSwitching((s) => s.on);   // (a new patient: the number rolls to the new one; live ticks stay plain)
  const pos = (v: number) => posIn(scale, v);
  return (
    <div className={`metric inert primary${value == null ? ' hidden-val' : ''}`} data-id={id} data-sev={value == null ? 'none' : sev} role="group"
      aria-label={value == null ? k : `${k}: ${shown} ${unit}${unitWords}, ${word}`} title={k}>
      <span className="k">{k}</span>
      <span className="v"><span className="val" style={{ ['--vr' as string]: roomFor(fixed) }}>{switching && shown != null ? <Roll text={shown} /> : (shown ?? '—')}</span><span className={unit === '%' ? 'unit pct' : 'unit'}>{unit}{unitWords ? <span className="u-x">{unitWords}</span> : null}</span><span className="tr" aria-hidden="true" /></span>
      <span className="rb" aria-hidden="true"><i className="rb-fill" style={{ ['--fl' as string]: pos(from), ['--fw' as string]: value == null ? 0 : pos(value) - pos(from) }} />{ticks.map((t) => <i key={t} className="rb-tick" style={{ left: `${pos(t) * 100}%` }} />)}</span>
      <span className="s"><span className="status">{word}</span><span className="cmp" /></span>
    </div>
  );
}

/** The lobule's flows against the healthy patient's, in percent (2D lobuleFlows × 100): the sinusoids' and the portal venule's; null before the model has run. */
export function lobuleFlowPct(): { 'lz-sin': number; 'lz-pv': number } | null {
  const env = envNow();
  if (!env) return null;
  const m = lobuleOf(env);
  return { 'lz-sin': (m.flow) * 100, 'lz-pv': (m.portal) * 100 };
}

function LobuleReadouts() {
  useEngine((s) => s.hvpg);   // (a new frame: the reading is worked out from the engine's newest, as the cards are)
  const v = lobuleFlowPct();
  return (
    <section className="readouts lob" id="strip" aria-label="Clinical readouts" data-lobule="">
      <div className="ro-row">
        <div className="ro-group" data-group="lobule" role="group" aria-label="Lobule, % of normal" style={{ ['--n' as string]: LOBULE_TILES.length }}>
          <span className="ro-cap" aria-hidden="true">Lobule, % of normal</span>
          <div className="ro-tiles">
            {LOBULE_TILES.map((t) => {
              const x = v ? v[t.id] : null;
              return <Tile key={t.id} id={t.id} k={t.k} value={x} from={0} sev={x == null ? 'ok' : t.sev(x)} word={x == null ? '' : t.word(x)} ticks={[...t.ticks]} scale={t.scale} unit="%" unitWords={t.reversible && x != null && x < -2 ? ' of healthy, reversed' : ' of healthy'} fixed={0} />;
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The dock's readout strip: HVPG and PPG (2D dock.js PRIMARY); the lobule's two key flows in the Lobule and Sinusoid views (2D LOBULE_PRIMARY). */
export function Readouts() {
  const view = useShell((s) => s.view);
  const hvpg = useEngine((s) => s.hvpg), pv = useEngine((s) => s.pv), ivc = useEngine((s) => s.ivc);
  if (view === 'lobule' || view === 'sinusoid') return <LobuleReadouts />;
  const pos = (v: number) => posIn(MMHG, v);
  const ppg = pv != null && ivc != null ? pv - ivc : null;
  return (
    <section className="readouts" id="strip" aria-label="Clinical readouts">
      <div className="ro-row">
        <div className="ro-group" data-group="pressure" role="group" aria-label="Pressure">
          <span className="ro-cap" aria-hidden="true">Pressure</span>
          <div className="ro-tiles">
            <Tile id="hvpg" k="HVPG" value={hvpg} from={0} sev={hvpg == null ? 'ok' : (cuts.hvpgSev(hvpg) as string)} word={hvpg == null ? '' : (cuts.hvpgWord(hvpg) as string)} ticks={[cuts.HVPG_CUTS.amber, cuts.HVPG_CUTS.red]} />
            <Tile id="ppg" k="PPG" value={ppg} from={ivc != null ? pos(ivc) * SCALE_MAX : 0} sev={ppg == null ? 'ok' : (cuts.ppgSev(ppg) as string)} word={ppg == null ? '' : (cuts.ppgWord(ppg) as string)} ticks={[cuts.PPG_CUTS.amber, cuts.PPG_CUTS.red]} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** The timeline row of the dock, as 2D's timeline.js builds it: .tl-left > .tl-split (.tl-speed, .ib.play) and .tl-restart, .tl-time, .tl-jumps > .tl-ff, .tl-hist, .tl-pin. */
export function Timeline({ phone }: { phone: boolean }) {
  const { running, speed, lapse, time } = useShell((s) => s.transport);
  const hold = useRef<{ t: number | undefined; held: boolean }>({ t: undefined, held: false });
  const comparing = useCompare((c) => !!c.snap), histCount = useTimeline((t) => t.count);
  const lap = pb.lapses.find((l) => l.days === lapse);
  const speedText = lapse ? (lap ? lap.short : `${lapse} d/s`) : `${speed}×`;
  return (
    <div className="timeline" id="timeline" role="group" aria-label="Timeline">
      <div className="tl-left">
        <div className="tl-split">
          <Anchored sheet="speed" place="above" align="start" width={280} label={PLAY_TITLES.speed} button={({ id, open, toggle, ref }) => (
            <button type="button" ref={ref} className={`tl-speed${lapse ? ' lapse' : ''}`} data-opens="speed" aria-haspopup="menu" aria-expanded={open} aria-controls={id} title={PLAY_TITLES.speed} aria-label={`${pb.controls[2]}, ${speedText}`} onClick={toggle}>{speedText}</button>)}>
            <SpeedMenu />
          </Anchored>
          <button type="button" className={`ib play${lapse && !running ? ' lapse' : ''}`} aria-label={running ? 'Pause' : 'Play'} title={PLAY_TITLES.playPause}
            onPointerDown={() => { hold.current.held = false; clock.cancel(hold.current.t); hold.current.t = clock.after(() => { hold.current.held = true; useShell.getState().open('speed'); }, HOLD_MS); }}
            onPointerUp={() => clock.cancel(hold.current.t)} onPointerLeave={() => clock.cancel(hold.current.t)} onPointerCancel={() => clock.cancel(hold.current.t)} onContextMenu={(e) => e.preventDefault()}
            onClick={() => { if (hold.current.held) { hold.current.held = false; return; } togglePlay(); }}>
            <I n={running ? 'pause' : lapse ? 'playlapse' : 'play'} />
          </button>
        </div>
        <button type="button" className="ib tl-restart" aria-label={pb.controls[1]} title={PLAY_TITLES.restart} onClick={() => { void restartPatient(); }}><I n="reset" /></button>
      </div>
      <span className="tl-time" aria-live="off"><span className="tl-t-long">{time}</span><span className="tl-t-short" aria-hidden="true">{time}</span></span>
      <div className="tl-jumps">
        <Anchored sheet="jump" place="above" align="end" width={300} label={pb.controls[4]} button={({ id, open, toggle, ref }) => (
          <button type="button" ref={ref} className="ib tl-ff" data-opens="jump" aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={pb.controls[4]} title={PLAY_TITLES.ffwd} onClick={toggle}><I n="ffwd" /></button>)}>
          <JumpMenu compare={phone} />
        </Anchored>
      </div>
      <button type="button" className="tl-hist" aria-haspopup="dialog" aria-label={pb.controls[3]} title={PLAY_TITLES.history} onClick={() => runFeature('history', pb.controls[3])}><I n="clock" className="mi-ic" /><span className="tl-hl">{pb.controls[3]}</span><span className="tl-hc">{histCount > 0 ? histCount : ''}</span></button>
      <button type="button" className="tl-pin" aria-pressed={comparing} aria-label={comparing ? CMP.stop : pb.controls[5]} title={comparing ? PLAY_TITLES.stopCompare : PLAY_TITLES.compare} onClick={() => runFeature('compare', pb.controls[5])}><I n="compare" className="mi-ic" /><span>{comparing ? 'Stop' : 'Compare'}</span></button>
    </div>
  );
}

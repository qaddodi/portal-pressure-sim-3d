// What the IR pane does while something plays (2D hvpg-proc.js start / play / loop, ir-ppg.js, monitor-takeover.js): the HVPG measurement on its own clock, a treatment played on the anatomy (the
// pane's "Watch" row), and the PPG by IR played the same way. The figure's catheter is the scene's procedure layer (sceneApi.procedure, the 2D app's own choreography); the numbers on the
// monitor are the model's. State the pane's words depend on lives here, in one place, and `bump()` tells React when a word changes: nothing here re-renders per frame, only when a phase,
// a step or a reading changes. The monitors read `R` (the kept record) on the clock's tween phase.
import { create } from 'zustand';
import { clock } from '../../../clock/frame.ts';
import { latest, patient } from '../../../engine/index.ts';
import { sceneApi } from '../../../scene/api.ts';
import type { ShotName } from '../../../scene/camera/shots.ts';
import { PROCS, PROC_KINDS, MEASURES, READS, specOf, markAt, stepMarks, procBlocked as procBlockedJs, procOffered as procOfferedJs } from '../../../scene/procedures/copied/proc-anim.js';
import { ppgWord } from '../../../engine/hales/portal/pressure-cuts.js';
import { T, newWave, syncWave } from '../copied/hvpg-clock.copied.js';
import { createTakeover } from '../copied/monitor-takeover.copied.js';
import { scriptOf, phaseOf } from './copied/reading-scripts.copied.js';
import { TB, hvBlocked } from './hvpg.ts';
import { updateParams } from '../../action/params.ts';
import { runCards, type CardRun } from '../../../scene/labels/proc-cards.ts';
import { setProcMarks, type ProcMark } from '../../../scene/labels/proc-marks.ts';
import { useShell } from '../../shell/store.ts';
import { E } from '../endo/eus-run.ts';
import { goToView } from '../../shell/view-actions.ts';
import { useUi } from '../../ui-store.ts';
import { freeRoom } from '../../shell/room.ts';
import { tipCloseShot } from '../../deck/cath-shot.ts';
import { cutRoom } from '../room.ts';
import type { MonitorState } from './monitor.ts';
import { useMeasured } from '../hidden.ts';
import { claim } from '../owner.ts';

export interface Readings { fhvp: number; whvp: number; hvpg: number }
type Obj = Record<string, number>;
// the 2D copy's `m = null` default types its metrics argument as null: the real one is the frame's metrics
const procBlocked = procBlockedJs as (kind: string, p: unknown, m?: Obj | null) => string | null | false;
const procOffered = procOfferedJs as (kind: string, p: unknown, m?: Obj | null) => boolean;

/** The HVPG measurement's kept state (2D hvpg-proc.js: t0, t, result, snap, blocked). */
export const R = {
  t0: null as number | null, t: 0, result: null as (Readings & { t?: number; day?: number }) | null, snap: null as Readings | null, blocked: false,
  cam: '' as string, ph: 'idle' as 'idle' | 'enter' | 'free' | 'wedge' | 'result' | 'abort', stage: 'idle|000',
  // a treatment played from the Watch row
  procKind: '', procStep: -1, procT: 0, procApplied: false, procCam: '', playT: 0,
  // the PPG by IR (ir-ppg.js): the kinds' clocks, the step, the phase of the takeover
  ppg: { run: false, kind: '' as '' | 'irivc' | 'irpv', step: -1, done: false, take: 'idle' as 'idle' | 'run' | 'hold', tk: {} as Record<string, number>, mark: -3 },
  wave: newWave(),
};
export const tEnd = (): number => (R.blocked ? TB.end : T.end);
export const hvpgRunning = (): boolean => R.t0 != null && R.t < tEnd();
export const busy = (): boolean => hvpgRunning() || !!R.procKind || R.ppg.run || E.run;   // (an EUS run holds the procedure layer too)

/** Bumps when a word on the pane changes (a phase, a step, a reading, a button's state). */
export const useRun = create<{ n: number }>(() => ({ n: 0 }));
const irPhase = (): string | null =>
  R.ppg.run || R.ppg.take === 'run' ? `PPG by IR, step ${Math.max(0, R.ppg.step) + 1}` : R.procKind ? `${(PROCS as Record<string, { name: string }>)[R.procKind]!.name}, step ${Math.max(0, R.procStep) + 1}` : hvpgRunning() ? `HVPG, ${R.ph}` : null;
/** Every change of a word is also a change of who holds the figure (owner.ts): the claim is published with it. */
const bump = () => { useRun.setState((s) => ({ n: s.n + 1 })); claim('ir', irPhase()); };

const say = (t: string) => useShell.getState().say(t);
const metrics = (): Obj | null => (latest.frame?.metrics ?? null) as Obj | null;
const params = () => patient.params as unknown;

// ── the loop: one clock hold while anything plays, one tween callback ──
let hold: { release(): void } | null = null, off: (() => void) | null = null;
function wake(): void {
  if (off) return;
  hold = clock.hold('ir');
  off = clock.on('tween', () => tick());
}
function sleep(): void { off?.(); off = null; hold?.release(); hold = null; }

const room = () => { const { vp, device } = useUi.getState(); return cutRoom(freeRoom(vp, device)); };
/** The 2D step shots on the 3D camera's: the route down from the neck, the tip close up, home. */
const SHOT: Record<string, ShotName> = { route: 'route', way: 'route', tip: 'hvpg', fill: 'hvpg', free: 'free', wedge: 'wedge', home: 'play' };
/** The readings' close-up is the deck's (cath-shot.ts tipCloseShot): read from the route itself, centred between the tip and the vein ahead of it where the wedged reading hangs, framed so the balloon and
 *  the vein fill the free room. The Tests had a hand-set shot of their own ('hvpg': a fixed 1.7 x 1.4 scene window on the right lobe, two to three times wider than the deck's), so the same measurement was
 *  framed looser here than on its slide (Mohammad, 20 Nov: "fix the camera zoom in HVPG measurement, should be better and zoomed in as we measure"). A blocked vein holds the tip and the ostium it cannot pass. */
function camTo(name: string): void {
  const close = name === 'tip' || name === 'fill' ? tipCloseShot(R.blocked ? 'ostium' : 'tip') : null;
  const s = close ?? SHOT[name];
  if (s) sceneApi.goTo(s, room());
}
/** A catheter is drawn on the body, so the view leaves the Circuit, the lobule and the sinusoid first (2D leaveFor). */
function onBody(): void { if (useShell.getState().view !== 'anatomic') goToView('anatomic'); }

const live = (): Readings => { const m = metrics(); return { fhvp: m?.fhvp ?? 0, whvp: m?.whvp ?? 0, hvpg: m?.hvpg ?? 0 }; };
/** The readings the HVPG pane shows now: the captured ones, the snapshot taken as the catheter started, else the live model's. */
export const values = (): Readings => R.result || R.snap || live();
type Ph = 'idle' | 'enter' | 'free' | 'wedge' | 'result' | 'abort';
/** The phase on the run clock, read exactly: the tracing's (it is drawn on the same clock, every frame). */
export const phaseAt = (): Ph => {
  const t = R.t;
  return R.t0 == null && !R.result ? 'idle' : R.blocked ? (t < TB.abort ? 'enter' : 'abort') : t < T.free ? 'enter' : t < T.inflate ? 'free' : t < T.result ? 'wedge' : 'result';
};
/** The phase the pane's WORDS stand on (the step row, the caption, the readings, the buttons): published once at each boundary by `syncPhase`, never read off the mutable run clock at a render that
 *  something else happened to cause (review #4: the trace sat in "Settling" while the step row still said "1 Catheter"). `R.stage` adds the boundaries inside a phase the words change at. */
export const phase = (): Ph => R.ph;
function syncPhase(): void {
  const p = phaseAt(), t = R.t, stage = `${p}|${t >= T.callout ? 1 : 0}${t >= T.sum ? 1 : 0}${R.blocked && t >= TB.probe0 ? 1 : 0}`;
  R.ph = p;
  if (stage !== R.stage) { R.stage = stage; bump(); }
}

// ── the HVPG measurement ──
let cards: CardRun | null = null;   // (the reading cards on the figure for the run that plays: the catheter's FHVP, WHVP and the HVPG; the PPG's IVC, portal vein and PPG)
export function startHvpg(): void {
  if (busy() || !latest.frame) return;
  hidePpg();
  onBody();
  R.result = null; R.t0 = performance.now(); R.t = 0; R.cam = ''; R.blocked = hvBlocked(params());
  R.snap = { ...live() };
  syncPhase();
  // the catheter on the figure: the whole procedure, or, for a thrombosed vein, as far as the ostium (2D figureBlocked: it probes and is withdrawn)
  cards?.end(); cards = R.blocked ? null : runCards('hvpgcath', { capture: true });
  if (R.blocked) sceneApi.procedure.play('hvpgcath', { to: T.zoom + 600, keep: true });
  else sceneApi.procedure.play('hvpgcath', { onFrame: () => cards?.frame(sceneApi.procedure.playing?.t ?? 0, latest.frame), onEnd: () => { cards?.end(); cards = null; } });
  wake(); bump();
}
function finish(): void {
  const f = latest.frame;
  if (!f?.metrics) return;
  R.result = { ...(R.snap || { fhvp: f.metrics.fhvp as number, whvp: f.metrics.whvp as number, hvpg: f.metrics.hvpg as number }), t: f.t, day: f.day };
  useMeasured.getState().mark(R.result);   // (2D hvpg-proc.js: store.lastHVPG and hvpgMeasured, so the readouts, the charts and the trials hear it)
  bump();
}
function stepHvpg(): void {
  R.t = Math.min(tEnd(), performance.now() - (R.t0 as number));
  if (!R.result && !R.blocked && R.t >= T.result) finish();
  syncPhase();
  // the camera: the route while the catheter travels, the tip close up for the readings, then back
  const t = R.t, want = t < T.zoom ? 'route' : (R.blocked ? t < TB.back + 1500 : t < T.back) ? 'tip' : 'home';
  if (want !== R.cam && (want !== 'route' || t > 250)) { R.cam = want; camTo(want); }
  if (R.blocked && t >= TB.back && sceneApi.procedure.playing == null) sceneApi.procedure.stop();
  if (t >= tEnd()) { if (R.blocked) sceneApi.procedure.stop(); bump(); }
}
export function resetHvpg(): void {
  cards?.end(); cards = null;
  if (hvpgRunning()) sceneApi.procedure.stop();
  R.t0 = null; R.t = 0; R.result = null; R.snap = null; R.blocked = false; R.cam = '';
  syncPhase(); bump();
}

// ── a treatment played on the anatomy (the Watch row) ──
export const procState = () => ({ kind: R.procKind, step: R.procStep });
export function playProc(kind: string): void {
  if (performance.now() - R.playT < 600 || busy()) return;
  R.playT = performance.now();
  const why = procBlocked(kind, params(), metrics());
  if (why) { say(why); return; }
  onBody();
  const T0 = (PROCS as Record<string, { T: { apply: number }; label: string; apply: (p: unknown) => unknown }>)[kind]!;
  R.procKind = kind; R.procStep = 0; R.procApplied = false; R.procCam = '';
  let shown = -3;   // (the step whose callout stands on the figure: 2D onMark; a step's word once the step has happened, none while it plays)
  sceneApi.procedure.play(kind, {
    onFrame: (rec) => {
      const t = sceneApi.procedure.playing?.t ?? 0;
      const mk = rec.step < 0 ? -2 : t >= markAt(kind, rec.step) ? rec.step : -1;
      if (mk !== shown && mk > -2) { shown = mk; setProcMarks(mk >= 0 ? (stepMarks(kind, mk) as ProcMark[]) : []); }
      if (rec.step !== R.procStep && rec.step >= 0) { R.procStep = rec.step; bump(); }
      const shot = String(rec.shot || '');
      if (shot && shot !== R.procCam) { R.procCam = shot; camTo(shot); }
      // the model takes the change as the sequence passes its apply time
      if (!R.procApplied && t >= T0.T.apply) { R.procApplied = true; updateParams((p) => T0.apply(p) as never, { label: T0.label }); }
    },
    onEnd: () => { setProcMarks([]); R.procKind = ''; R.procStep = -1; camTo('home'); bump(); },
  });
  wake(); bump();
}

// ── the PPG by IR (ir-ppg.js) ──
const SLIDE = { procedure: { kind: 'irivc', then: 'irpv' } };
export const ppgScript = (): { clock: { now(tk: Obj): number }; vals(fp: unknown, o: Obj): Obj } & Record<string, unknown> => scriptOf(SLIDE.procedure) as never;
const fpLive = { ivc: NaN, pv: NaN, ppg: NaN };
export const ppgShown = (): boolean => R.ppg.take !== 'idle';
/** The takeover's clock (monitor-takeover.js: idle > run > hold > idle, HOLD_MS 6000): its phase is `R.ppg.take`. */
const tk = createTakeover({ onChange: (ph: string) => { R.ppg.take = ph as 'idle' | 'run' | 'hold'; bump(); } }) as { start(): void; finish(done: boolean): void; close(): void; reset(): void };
export function hidePpg(): void {
  const p = R.ppg;
  if (p.run) sceneApi.procedure.stop();
  cards?.end(); cards = null;
  p.run = false; p.kind = ''; p.step = -1; p.done = false; p.tk = {};
  tk.reset();
}
/** A tap on the held result takes it away. */
export function closePpg(): void { tk.close(); }
function beginPpg(kind: 'irivc' | 'irpv'): void {
  const p = R.ppg, rd = (READS as Record<string, Record<string, number>>)[kind];
  if (rd) for (const k in rd) rd[k] = NaN;
  p.kind = kind; p.step = -1; p.mark = -3;
  const P = specOf(kind) as { capture(i: number, rd: unknown, f: unknown): void; steps: unknown[][] };
  cards?.end(); cards = runCards(kind, { quiet: true });
  sceneApi.procedure.play(kind, {
    onFrame: (rec) => {
      const t = sceneApi.procedure.playing?.t ?? 0;
      p.tk[kind] = t;
      cards?.frame(t, latest.frame);
      if (rec.step !== p.step && rec.step >= 0) { p.step = rec.step; bump(); }
      // each reading is taken as its callout comes (2D playProcedure: capture at the step's mark)
      const mk = rec.step < 0 ? -2 : t >= markAt(kind, rec.step) ? rec.step : -1;
      if (mk !== p.mark && mk > -2) { p.mark = mk; if (mk >= 0 && rd) P.capture(mk, rd, latest.frame); }
      const shot = String(rec.shot || '');
      if (shot && shot !== R.procCam) { R.procCam = shot; camTo(shot); }
    },
    onEnd: () => {
      cards?.end(); cards = null;
      if (kind === 'irivc') { beginPpg('irpv'); return; }   // the second approach goes on by itself, from its start
      p.run = false; p.kind = ''; p.step = -1; p.done = true; camTo('home'); R.procCam = '';
      tk.finish(true);
      bump();
    },
  });
}
export function startPpg(): void {
  const p = R.ppg;
  if (performance.now() - R.playT < 600 || p.run || busy()) return;
  R.playT = performance.now();
  const why = procBlocked('irivc', params(), metrics()) || procBlocked('irpv', params(), metrics());
  if (why) { say(why); return; }
  onBody();
  p.tk = {}; p.done = false; p.run = true; R.procCam = '';
  tk.start();
  beginPpg('irivc');
  wake(); bump();
}
/** The words under the pane while the PPG plays or holds its result ('' when it has nothing to say). */
export function ppgCaption(): string {
  const p = R.ppg;
  if (p.run) return p.kind && p.step >= 0 ? String((MEASURES as Record<string, { steps: string[][] }>)[p.kind]!.steps[p.step]![2]) : '';
  if (!p.done || p.take === 'idle') return '';
  const rd = (READS as Record<string, Record<string, number>>).irpv!, ppg = rd.ppg!, word = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—');
  return Number.isFinite(ppg) ? `${ppgWord(ppg, true)}. PPG = PV − IVC = ${word(rd.pv!)} − ${word(rd.iv!)} = ${word(ppg)} mmHg.` : '';
}
/** What the PPG's monitor is handed now. */
export function ppgMonitor(out: { st: MonitorState; v: Obj }): MonitorState {
  const S = ppgScript(), p = R.ppg;
  const m = metrics();
  if (!p.run && p.take === 'run') { /* between the two approaches */ }
  if (m && !p.run) { fpLive.ivc = m.ivc as number; fpLive.pv = m.pv as number; fpLive.ppg = m.ppg as number; }
  S.vals(fpLive, out.v);
  const st = out.st;
  st.ph = phaseOf(S, p.tk) as MonitorState['ph'];
  const t = S.clock.now(p.tk);
  st.t = Number.isFinite(t) ? t : 0;
  st.running = true; st.probing = false; st.wave = R.wave;
  st.v = out.v;
  if (st.ph === 'run') syncWave(R.wave, latest.frame, st.t, performance.now());
  return st;
}

// ── the loop's step ──
function tick(): void {
  if (hvpgRunning()) stepHvpg();
  const any = hvpgRunning() || !!R.procKind || R.ppg.run;
  if (!any) { sleep(); bump(); }
}

/** A new patient or a jump in time starts with no measurement. */
export function resetAll(): void { hidePpg(); if (R.procKind) { sceneApi.procedure.stop(); R.procKind = ''; R.procStep = -1; setProcMarks([]); } resetHvpg(); sleep(); }

// the names the Watch row lists, in 2D's order, with what each says and whether it is offered (hidden) or can be played (dimmed) for this patient
export interface WatchBtn { kind: string; name: string; hidden: boolean; off: boolean; on: boolean }
export function watchButtons(): WatchBtn[] {
  const p = params(), m = metrics();
  return (PROC_KINDS as string[]).map((k) => ({
    kind: k, name: (PROCS as Record<string, { name: string }>)[k]!.name,
    hidden: !procOffered(k, p, m) && R.procKind !== k, off: !!procBlocked(k, p, m), on: R.procKind === k,
  }));
}
/** The step a treatment on the Watch row says now. */
export const procSay = (): string => (R.procKind ? String((PROCS as Record<string, { steps: string[][] }>)[R.procKind]!.steps[Math.max(0, R.procStep)]![2]) : '');

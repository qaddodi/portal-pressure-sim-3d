// The play bar's reach into the engine: play and pause, the speed ladder, the jumps, restart, settle. Each is one message to the worker, as the 2D timeline sends it
// (main.js setSpeed, timeline.js jump). The play bar reads the engine's state back through `syncTransport`, which writes the store only when a shown word changes.
import { engine, live, type EngineFrame } from '../../engine/index.ts';
import { clock } from '../../clock/frame.ts';
import { useShell } from './store.ts';
import { jumpAhead } from '../timeline/index.ts';
import { restartPatient } from '../patients/index.ts';

/** 2D: timeline.js fmtClock. A day count once days have passed; minutes and seconds (or hours) before. */
export function fmtClock(t: number, day: number): string {
  if (day > 0) return `Day ${day}`;
  const s = Math.max(0, Math.floor(t)), m = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const play = (running: boolean) => engine().send({ type: 'run', running });
/** (the LIVE model's running state: the shown frame is a pinned one in Compare's Then and a forged one in Force, and says nothing about the model) */
export const togglePlay = () => play(!(live.frame?.running ?? useShell.getState().transport.running));
/** A speed just asked for: the next frames may still carry the old one (they were posted before the worker saw the message), so the pill keeps the asked value until a frame agrees or this runs out. */
let asked: { speed: number; clock: 'hemo' | 'disease'; until: number } | null = null;
const ASK_MS = 600;
/** The pill takes the asked speed at once (a frame corrects it if the worker did not take it: `mirrorTransport`). */
export function askSpeed(v: number, lapse: boolean): void {
  useShell.setState({ transport: { ...useShell.getState().transport, speed: lapse ? useShell.getState().transport.speed : v, lapse: lapse ? v : 0 } });
  asked = { speed: v, clock: lapse ? 'disease' : 'hemo', until: clock.now() + ASK_MS };
}
export function setSpeed(v: number, lapse: boolean) {
  askSpeed(v, lapse);
  engine().send(lapse ? { type: 'run', speed: v, clock: 'disease' } : { type: 'run', speed: v, clock: 'hemo' });
}
/** A jump of the disease clock, recorded in History (ui/timeline). */
export const jump = (days: number | 'event') => jumpAhead(days);
export const settle = () => engine().send({ type: 'settle' });
export const restart = () => { void restartPatient(); };
export const step = () => { engine().send({ type: 'run', running: true }); clock.after(() => engine().send({ type: 'run', running: false }), 60); };

/** Start mirroring the engine into the store (call once, after the engine has booted). The clock's engine phase reads the newest frame; the store changes only
 *  when the running state, the speed or the clock's words do. Returns the remover. */
export function syncTransport(): () => void {
  return clock.on('engine', () => { if (live.frame) mirrorTransport(live.frame); });   // (the model's own frame, whatever the figure shows)
}
/** The play bar's words from one engine frame. The worker owns the speed and the clock: it puts both back on a rupture, when a lapse ends, on every morph and on a `lapse` message,
 *  so the pill follows the frame (audit W6); a speed just asked for stands until a frame agrees or ASK_MS runs out. */
export function mirrorTransport(f: Pick<EngineFrame, 't' | 'day' | 'running' | 'speed' | 'clock'>): void {
  const s = useShell.getState().transport;
  const time = fmtClock(f.t, f.day);
  let { speed, lapse } = s;
  if (asked && (clock.now() > asked.until || (f.clock === asked.clock && f.speed === asked.speed))) asked = null;
  if (!asked) { if (f.clock === 'disease') lapse = f.speed; else { speed = f.speed; lapse = 0; } }
  if (s.running !== f.running || s.time !== time || s.day !== f.day || s.speed !== speed || s.lapse !== lapse) useShell.setState({ transport: { ...s, running: f.running, time, day: f.day, speed, lapse } });
}

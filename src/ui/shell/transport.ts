// The play bar's reach into the engine: play and pause, the speed ladder, the jumps, restart, settle. Each is one message to the worker, as the 2D timeline sends it
// (main.js setSpeed, timeline.js jump). The play bar reads the engine's state back through `syncTransport`, which writes the store only when a shown word changes.
import { engine, latest, useEngine } from '../../engine/index.ts';
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
export const togglePlay = () => play(!(latest.frame?.running ?? useShell.getState().transport.running));
export function setSpeed(v: number, lapse: boolean) {
  useShell.setState({ transport: { ...useShell.getState().transport, speed: lapse ? useShell.getState().transport.speed : v, lapse: lapse ? v : 0 } });
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
  return clock.on('engine', () => {
    const f = latest.frame;
    if (!f) return;
    const s = useShell.getState().transport;
    const time = fmtClock(f.t, f.day);
    if (s.running !== f.running || s.time !== time || s.day !== f.day) useShell.setState({ transport: { ...s, running: f.running, time, day: f.day } });
  });
}

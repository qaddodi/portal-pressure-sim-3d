// The one timeline of the page, joined to the engine and the shell: History, Undo and Redo, jumps, Compare's "Compare with now". `startTimeline()` is called once by the shell
// (after the engine has booted); until then nothing is recorded.
import { yoursName } from '../readings/yours.ts';
import { engine, latest, live, patient, useEngine } from '../../engine/index.ts';
import { setParams } from '../../engine/store.ts';
import { clock } from '../../clock/frame.ts';
import { UI } from '../strings.generated.ts';
import { useShell } from '../shell/store.ts';
import { registerFeature } from '../shell/features.ts';
import { Timeline, type EventIn, type Snap, type TimelineHost } from './model.ts';
import { announce } from './announce.ts';
import { useTimeline } from './store.ts';

export { fmtClock, captureFrame } from './model.ts';
export type { Entry, Pinned } from './model.ts';

/** 2D: patientLabel (readouts-text.js): the preset's label, or Custom once the parameters have been moved. */
export const patientLabel = (id: string | null = useEngine.getState().presetId): string => UI.presets.find((p) => p.id === id)?.label || yoursName(id) || 'Custom';

let labels: (params: unknown) => Map<string, string> = () => new Map();
/** The Treat batch hands over 2D's activeInterventions (key to label of every active change) so a change is named as it is in 2D. */
export function setInterventionLabels(fn: (params: unknown) => Map<string, string>): void { labels = fn; }
export const getInterventionLabels = () => labels;

const host: TimelineHost = {
  snapshot: async () => ((await engine().request({ type: 'snapshot' })) as unknown as { snap?: Snap }).snap ?? null,
  restore: (snap) => { engine().send({ type: 'restore', snap }); setParams(snap.params); },
  frame: () => latest.frame,
  params: () => patient.params,
  advance: (days) => engine().send(days === 'event' ? { type: 'advance', untilEvent: true } : { type: 'advance', days }),
  scenarioLabel: () => patientLabel(),
  labelsOf: (p) => labels(p),
  say: (t) => useShell.getState().say(t),
  announce,
  now: () => performance.now(),
  later: (fn, ms) => setTimeout(fn, ms),
  cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export const timeline = new Timeline(host);

const publish = () => useTimeline.setState((s) => ({ rev: s.rev + 1, count: timeline.count(), canUndo: timeline.canUndo(), canRedo: timeline.canRedo() }));
timeline.onChange(publish);

/** 2D: the labels of the jumps (timeline.js JUMPS). */
export const JUMP_LONG: Record<number, string> = Object.fromEntries(UI.playbar.jumps.map((j) => [j.days, j.long]));
/** A jump of the disease clock, recorded in History. `days` is a number of days or 'event' (until something happens). */
export const jumpAhead = (days: number | 'event') => timeline.jump(days, days === 'event' ? '' : (JUMP_LONG[days] ?? `${days} days`));

let started = false;
/** Join the timeline to the engine's events and the shell's controls. Returns the remover. */
export function startTimeline(): () => void {
  if (started) return () => undefined;
  started = true;
  let seen: unknown = null;
  const off = clock.on('engine', () => {
    const f = live.frame;   // (the live model's, also while Compare holds a pinned frame on show)
    if (!f || f === seen) return;
    seen = f;
    if (f.events?.length) timeline.addEvents(f.events as EventIn[]);
  });
  const offs = [
    registerFeature('undo', () => { timeline.undo(); }),
    registerFeature('redo', () => { timeline.redo(); }),
  ];
  return () => { started = false; off(); for (const o of offs) o(); };
}

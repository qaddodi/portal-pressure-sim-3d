// The one timeline of the page, joined to the engine and the shell: History, Undo and Redo, jumps, Compare's "Compare with now". `startTimeline()` is called once by the shell
// (after the engine has booted); until then nothing is recorded.
import { yoursName } from '../readings/yours.ts';
import { historyName } from '../histories/meta.ts';
import { engine, latest, onFrame, patient, useEngine } from '../../engine/index.ts';
import { setParams } from '../../engine/store.ts';
import { sanitizeParams } from '../../engine/hales/portal/scenario.js';
import { clock, type TimerId } from '../../clock/frame.ts';
import { UI } from '../strings.generated.ts';
import { useShell } from '../shell/store.ts';
import { registerFeature } from '../shell/features.ts';
import { Timeline, type EventIn, type Snap, type TimelineHost } from './model.ts';
import { announce } from './announce.ts';
import { record } from '../tests/feed.ts';
import { useTimeline } from './store.ts';
import { isCustomCase } from '../action/case-name.ts';
import { switchBegins, switchLands } from '../patients/switching.ts';

export { fmtClock, captureFrame } from './model.ts';
export type { Entry, Pinned } from './model.ts';

/** 2D: patientLabel (readouts-text.js): the preset's label, or Custom once the parameters have been moved. */
export const patientLabel = (id: string | null = useEngine.getState().presetId, params: unknown = id === useEngine.getState().presetId ? patient.params : null): string =>
  isCustomCase(id, params) ? 'Custom' : UI.presets.find((p) => p.id === id)?.label || historyName(id) || yoursName(id) || 'Custom';

let labels: (params: unknown) => Map<string, string> = () => new Map();
/** The Treat batch hands over 2D's activeInterventions (key to label of every active change) so a change is named as it is in 2D. */
export function setInterventionLabels(fn: (params: unknown) => Map<string, string>): void { labels = fn; }
export const getInterventionLabels = () => labels;

/** The most days one jump is sampled in: a jump is sent to the worker a day at a time (a few days at a time past this) so every frame it posts is a point of the day record and the chart
 *  draws the curve the model went through, not a straight line between the two ends. The worker does the same steps as before; each frame costs about 1 ms more. */
export const JUMP_SAMPLES = 200;
export const jumpStep = (days: number): number => Math.max(1, Math.ceil(days / JUMP_SAMPLES));
function advanceDays(days: number): void {
  const step = jumpStep(days);
  for (let left = Math.round(days); left > 0; left -= step) engine().send({ type: 'advance', days: Math.min(step, left) });
}
/** Until the next event: a few days at a time, a frame for each, looking at the frames' events between (the worker's own run to an event posted no frame on the way). */
const UNTIL_EVENT_MAX = 730, UNTIL_EVENT_BATCH = 4;
async function advanceUntilEvent(): Promise<void> {
  let hit = false;
  const off = onFrame((f) => { if (f.events?.length) hit = true; });
  try {
    for (let done = 0; done < UNTIL_EVENT_MAX && !hit; done += UNTIL_EVENT_BATCH) {
      for (let i = 0; i < UNTIL_EVENT_BATCH; i++) engine().send({ type: 'advance', days: 1 });
      await engine().request({ type: 'metrics' });   // (answered after the days before it: a barrier)
    }
  } catch { /* the worker went away: nothing more to run */ } finally { off(); }
}

/** Going back (or forward) to a moment is a switch of the figure, like opening a patient: the numbers roll to the moment's instead of landing at once, and the days after it
 *  are kept as the future (the feed keeps them until a change branches the patient). The curtain lands on the first frame of the restored state. */
function restoreThrough(snap: Snap): void {
  switchBegins();
  record.keepDaysTo(snap.day);
  const off = onFrame((f) => { if (f.jump) { off(); switchLands(); } });
  engine().send({ type: 'restore', snap });
  setParams(sanitizeParams(snap.params));
}

const host: TimelineHost = {
  snapshot: async () => ((await engine().request({ type: 'snapshot' })) as unknown as { snap?: Snap }).snap ?? null,
  restore: (snap) => restoreThrough(snap),
  branched: () => record.dropFuture(),
  frame: () => latest.frame,
  params: () => patient.params,
  advance: (days) => { if (days === 'event') void advanceUntilEvent(); else advanceDays(days); },
  scenarioLabel: () => patientLabel(),
  labelsOf: (p) => labels(p),
  say: (t) => useShell.getState().say(t),
  announce,
  now: () => clock.now(),
  later: (fn, ms) => clock.after(fn, ms),
  cancel: (h) => clock.cancel(h as TimerId),
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
  // (every frame the engine posts, not the newest at a tick: a jump posts a frame for each day it runs, and an event on one of them must not be lost)
  const off = onFrame((f) => { if (f.events?.length) timeline.addEvents(f.events as EventIn[]); });
  const offs = [
    registerFeature('undo', () => { timeline.undo(); }),
    registerFeature('redo', () => { timeline.redo(); }),
  ];
  return () => { started = false; off(); for (const o of offs) o(); };
}

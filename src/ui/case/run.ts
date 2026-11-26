// Playing a model patient's case (docs/approved/play-the-case.md). Play walks the days from stop to stop and the figure follows them; at each stop the camera takes that stop's shot, as a
// slide's does, and the case waits for Continue (Mohammad's pick 2, 26 Nov: "Wait for continue"). Nothing moves on by itself at a stop, and Play never goes past the next stop.
//  - The days run on the engine's own time-lapse (the worker's 'lapse', the slides' time-lapse: silent days, the course's ramps eased over them), so the walk is the course's disease, not a
//    copy of it, and the record's points along the way are the course's own (the feed's replay: tests/feed.ts).
//  - Each stop lands on the model the course kept there (History's "Show on the figure", eased in as a slide's time-lapse lands): what the figure shows at a stop is the course's, exactly.
//  - The camera sets off for the stop's shot in the last second of the days, so it lands with them.
import { engine, latest, onFrame, type ToWorker } from '../../engine/index.ts';
import { clock, type TimerId } from '../../clock/frame.ts';
import { timeline, getInterventionLabels } from '../timeline/index.ts';
import { viewOf } from '../timeline/story-view.ts';
import { record } from '../tests/feed.ts';
import { openHistory } from '../histories/open.ts';
import { historyOf } from '../histories/meta.ts';
import { stopsOf } from './stops.ts';
import { CAMERA_LEAD_MS, LAND_MS, RUSH_MS, daysAt, legMs, legRamp, skipPace, skipSpeed, type Pace } from './walk.ts';
import { CASE_OFF, useCase } from './store.ts';
import { showShot } from './shot.ts';
import type { Stop } from './types.ts';

/** a little past the days' own end before the landing, so the last day's frame is in (decks/hp/lapse.ts TAIL_MS) */
const TAIL_MS = 150, TICK_MS = 150;
/** the record goes back to recording the learner's own days once the landing's eased frames are done; this long at most if no frame says so */
const REPLAY_MAX_MS = LAND_MS + 1500;

/** The leg under way: where it goes, its pace (the bar's day), and its timers. */
interface Leg { to: number; from: number; days: number; pace: Pace; endAt: number; camera: boolean; timers: TimerId[]; ticker: TimerId | null }
let leg: Leg | null = null;
let replayOff: (() => void) | null = null;

const send = (m: ToWorker) => { try { engine().send(m); } catch { /* the engine is not up yet */ } };
const reduced = (): boolean => { try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** The stops of the patient on the page now (the story of its History, the course's own word on each). */
export function caseStops(id: string): Stop[] {
  const v = viewOf({ tl: timeline, days: record.days, future: record.future, hidden: null, labelsOf: getInterventionLabels(), chapters: historyOf(id)?.chapters ?? null });
  return stopsOf(v.chapters, timeline.entries(), historyOf(id)?.play?.stops ?? []);
}

function clearLeg(): void {
  if (!leg) return;
  for (const t of leg.timers) clock.cancel(t);
  if (leg.ticker) clock.cancel(leg.ticker);
  leg = null;
  send({ type: 'lapse', days: 0 });
}
/** The page follows the course (the walk): the record lays in the course's own days and History takes nothing the model raises on the way as news (it is the course's, in History already). */
function follow(on: boolean): void { record.replay(on); timeline.follow(on); }
/** The page goes back to the learner's own days: after the landing's eased frames (the next frame that is neither the jump nor a blend), or after REPLAY_MAX_MS. */
function endReplaySoon(): void {
  replayOff?.();
  let jumped = false, timer: TimerId | null = null;
  const done = () => { off(); if (timer) clock.cancel(timer); replayOff = null; follow(false); };
  const off = onFrame((f) => { if (f.jump) jumped = true; else if (jumped && !f.morphing) done(); });
  timer = clock.after(done, REPLAY_MAX_MS, 'case-replay');
  replayOff = () => { off(); if (timer) clock.cancel(timer); replayOff = null; };
}

/** Stand at stop `i`: the model the course kept there (eased in from the walk, or at once for a jump), its shot, and the case waiting. */
function arrive(i: number, eased: boolean): void {
  const s = useCase.getState(), stop = s.stops[i];
  if (!stop) return;
  if (eased) { timeline.goTo(stop.entry, { quiet: true, ease: LAND_MS }); endReplaySoon(); }
  else { replayOff?.(); follow(false); timeline.goTo(stop.entry, { quiet: true }); showShot(stop.shot); }
  useCase.setState({ phase: 'stop', at: i, to: null, day: stop.day, paused: false });
}

/** The days from `fromDay` to stop `i`, in `ms` (the leg's own length, or what Next stop leaves it). */
function walk(i: number, fromDay: number, ms?: number): void {
  clearLeg();
  const s = useCase.getState(), stop = s.stops[i]!;
  const days = Math.max(0, Math.round(stop.day - fromDay));
  if (!days || reduced()) { showShot(stop.shot); land(i, !reduced()); return; }
  const len = ms ?? legMs(days), now = clock.now();
  follow(true);
  // (at least a day a second: the worker runs whole days only at that speed or more; a one-day leg is then done early, and the landing still waits for the leg's time)
  send({ type: 'lapse', days, speed: Math.max(1, days / (len / 1000)), ramp: legRamp(historyOf(s.id)?.play?.ramps, fromDay, stop.day) });
  const l: Leg = { to: i, from: fromDay, days, pace: { t0: now, d0: 0, rate: days / len, days }, endAt: now + len, camera: false, timers: [], ticker: null };
  leg = l;
  l.ticker = clock.every(() => { if (leg === l) useCase.setState({ day: Math.floor(l.from + daysAt(l.pace, clock.now())) }); }, TICK_MS, 'case-day');
  schedule(l, len);
  useCase.setState({ phase: 'travel', to: i, paused: false });
}
/** the camera's lead and the landing, for what is left of the leg (`left` ms) */
function schedule(l: Leg, left: number): void {
  for (const t of l.timers) clock.cancel(t);
  l.timers = [];
  const stop = useCase.getState().stops[l.to]!;
  if (!l.camera) l.timers.push(clock.after(() => { l.camera = true; showShot(stop.shot); }, Math.max(0, left - CAMERA_LEAD_MS), 'case-camera'));
  l.timers.push(clock.after(() => land(l.to, true), left + TAIL_MS, 'case-land'));
}
function land(i: number, eased: boolean): void {
  clearLeg();
  arrive(i, eased);
}

/** Start playing a model patient's case from its first stop (the patient as they came). False when it is not one, or it has fewer than two stops. */
export async function startCase(id: string): Promise<boolean> {
  endCase();
  if (!historyOf(id) || !(await openHistory(id))) return false;
  const stops = caseStops(id);
  if (stops.length < 2) return false;
  useCase.setState({ ...CASE_OFF, phase: 'stop', id, stops, at: 0, day: stops[0]!.day });
  arrive(0, false);
  return true;
}

/** Continue (Play at a stop): the days run to the next stop. False at the last stop, or when the case is not waiting at one. */
export function continueCase(): boolean {
  const s = useCase.getState();
  if (s.phase !== 'stop' || s.at >= s.stops.length - 1) return false;
  walk(s.at + 1, s.stops[s.at]!.day);
  return true;
}

/** Next stop while the days run: what is left of them runs in RUSH_MS and lands on the stop (the slides' Next during a time-lapse). At a stop it is Continue. */
export function nextStop(): boolean {
  const s = useCase.getState();
  if (s.phase === 'stop') return continueCase();
  if (s.phase !== 'travel' || s.to == null) return false;
  if (s.paused || !leg) { walk(s.to, dayNow(), RUSH_MS); return true; }
  const l = leg, now = clock.now(), d = daysAt(l.pace, now);
  send({ type: 'run', speed: skipSpeed(l.days - d) });
  l.pace = skipPace(l.days, d, now);
  l.endAt = now + RUSH_MS;
  schedule(l, RUSH_MS);
  return true;
}

/** Go straight to stop `i` (the bar's previous and next, the strip let go of): the model the course kept there at once, its shot, the case waiting. */
export function goStop(i: number): boolean {
  const s = useCase.getState();
  if (s.phase === 'off' || s.phase === 'left' || !s.stops[i]) return false;
  clearLeg();
  arrive(i, false);
  return true;
}

/** the day the model is at (a paused leg stands on it) */
const dayNow = (): number => Math.round(latest.frame?.day ?? useCase.getState().day);

/** Pause on the way: the days stop where they are, the case still on its way to the same stop. */
export function pauseCase(): boolean {
  const s = useCase.getState();
  if (s.phase !== 'travel' || s.paused) return false;
  clearLeg();
  useCase.setState({ paused: true, day: dayNow() });
  return true;
}
/** Play after a pause: the days that are left run on to the stop. */
export function resumeCase(): boolean {
  const s = useCase.getState();
  if (s.phase !== 'travel' || !s.paused || s.to == null) return false;
  walk(s.to, dayNow());
  return true;
}

/** Stop playing: the patient stays where the case was, as their History has them. */
export function endCase(): void {
  clearLeg();
  replayOff?.();
  follow(false);
  if (useCase.getState().phase !== 'off') useCase.setState({ ...CASE_OFF });
}

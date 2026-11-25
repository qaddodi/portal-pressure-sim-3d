// THE background-work slot (loading plan L1, 21 Nov). Anything that can wait ("build the lobule", "send the geometries to the GPU", "read in the instruments", "register the offline worker")
// runs here, and nowhere else asks the browser for idle time (scripts/lint-rules.mjs `raw-idle`: no requestIdleCallback outside this file). Root cause it replaces: there was no primitive for
// "run this when nobody is watching motion", so six callers each invented one, and every Safari fallback was a blind timer that fired mid-gesture.
//
//   whenQuiet(step, { tag, budgetMs = 4, delayMs = 0, maxWaitMs })   → { cancel(), rush(), done }
//
// A job is a STEP function that returns true when it is finished (false: more to do). The slot calls it again and again until `budgetMs` is spent, then yields for a rest and comes back.
// A step runs only when
//   · no MOTION hold is live (no tween, camera move, gesture or deck entry: clock.moving === 0). A steady hold (`clock.hold(tag, { steady: true })`: a live Doppler, a running trace, any instrument that asks for
//     frames for as long as it runs) does not count: it would park every job for minutes (22 Nov integration review I1). The ambient flow asks for one-frame invalidations, not holds,
//   · no finger or pointer is down and no input arrived in the last QUIET_INPUT_MS (250 ms),
//   · and it is in a task of its own: requestIdleCallback where the browser has it, otherwise a MessageChannel task (the post-frame task Safari needs; never a fixed timer). Never inside a frame.
// If input is pending mid-slice (isInputPending, where it exists) the slice stops and the next step waits. `rush()` lets a job the user is already waiting for (a dive straight after the load)
// run through motion; it still works in budgeted slices with a rest between. `maxWaitMs` lets a job that is not about the picture (the offline worker) go after that long even while busy.
// A rushed job also skips requestIdleCallback (a busy page never idles, and the callback then waits for its 1 s timeout every slice: the Lobule did not open on a slow machine, review F10).
// Every slice is counted per tag (`slotStats()`: slices, total ms, worst single step), shown in ?perf; a finished job leaves a `slot:<tag>` row in the startup spans.
import { clock } from './frame.ts';

export const QUIET_INPUT_MS = 250;
/** The rest between slices: about a frame, so the page's own frames and input get the main thread between two slices. */
export const REST_MS = 12;
export const DEFAULT_BUDGET_MS = 4;
/** A rushed job (the user is waiting for it, nothing else moves: a held dive) takes at least this long a slice. */
export const RUSH_BUDGET_MS = 12;

export interface QuietOpts {
  /** Names the job in ?perf and in the span log. */
  tag: string;
  /** What the job is doing now, read after each step: the slowest step's name is kept in the job's stat (the audit's boot digest prints it). */
  label?: () => string;
  /** How long one slice keeps taking steps (ms). */
  budgetMs?: number;
  /** Do not start before this long (page time): the first picture comes first. */
  delayMs?: number;
  /** A job not about the picture goes after this long even while something moves (ms); no limit by default. */
  maxWaitMs?: number;
}
export interface QuietJob { cancel(): void; rush(): void; readonly done: boolean }
export interface SlotStat { tag: string; slices: number; steps: number; totalMs: number; worstStepMs: number; /** what the job said it was doing in its slowest step (QuietOpts.label), so a long step is named in the report, not guessed */ worstLabel?: string; done: boolean; /** the motion holds the job last waited behind (?perf, the boot digest): a tag here for long is a hold nobody lets go */ parkedBy?: string[] }

export interface QuietEnv<H = number> {
  now(): number;
  /** Live MOTION holds (0: nothing the eye follows moves; steady holds are not counted). */
  held(): number;
  /** The tags of the live motion holds (what a waiting job is parked behind), for the stats. */
  heldTags?(): string[];
  /** Told each time the last hold lets go. Returns the remover. */
  onCalm(fn: () => void): () => void;
  after(fn: () => void, ms: number): H;
  cancel(id: H | null): void;
  /** requestIdleCallback, when the browser has it. */
  idle?: (fn: () => void) => void;
  /** A task of its own after the current one (MessageChannel). */
  post(fn: () => void): void;
  input: { last(): number; down(): boolean; pending?(): boolean };
  /** A slice that ran, on the page clock (for naming what a long task was). */
  sliced?(tag: string, t0: number, t1: number): void;
  /** A finished job's total, for the span log. */
  finished?(s: SlotStat): void;
}

interface Job {
  step: () => boolean; label?: () => string; tag: string; budget: number; readyAt: number; since: number; maxWait: number;
  rush: boolean; cancelled: boolean; done: boolean; stat: SlotStat;
}

export function createQuiet<H = number>(env: QuietEnv<H>) {
  const jobs: Job[] = [];
  const stats: SlotStat[] = [];
  let timer: H | null = null, armed = false, offCalm: (() => void) | null = null;

  const open = (j: Job, t: number): boolean => {
    if (j.rush) return true;
    if (j.maxWait > 0 && t - j.since >= j.maxWait) return true;
    return env.held() === 0 && !env.input.down() && t - env.input.last() >= QUIET_INPUT_MS;
  };

  function wake(ms: number): void {
    env.cancel(timer);
    timer = env.after(() => { timer = null; pump(false); }, Math.max(1, ms));
  }

  /** Decide what happens next: run a job that may run, or arm the one thing that will let one run. `exec` is true when called from the slot's own task. */
  function pump(exec: boolean): void {
    for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i]!.cancelled || jobs[i]!.done) jobs.splice(i, 1);
    if (!jobs.length) return;
    const t = env.now();
    const pick = jobs.find((j) => j.readyAt <= t && open(j, t));
    if (pick) {
      if (!exec) {
        if (armed) return;
        armed = true;
        const go = () => { armed = false; pump(true); };
        // A job the user is waiting for (rushed) never waits for the browser's idle time: a page drawing a heavy frame every tick is never idle,
        // and requestIdleCallback then answers only at its timeout (a second a slice), which is how the Lobule never opened on a slow machine
        // (review F10). It takes a task of its own between two frames, as the Safari path always did.
        if (env.idle && !pick.rush) env.idle(go); else env.post(go);
        return;
      }
      slice(pick);
      // (a rest, then the next slice: the page's own frames and input get the thread in between; a rushed job rests half as long, the user is waiting)
      wake(pick.rush ? REST_MS / 2 : REST_MS);
      return;
    }
    // nothing may run now: arm what lets one run — a job's start time, the end of the input gap, a max wait, or the last hold letting go
    let next = Infinity;
    for (const j of jobs) {
      if (j.readyAt > t) next = Math.min(next, j.readyAt - t);
      else {
        if (j.maxWait > 0) next = Math.min(next, Math.max(1, j.since + j.maxWait - t));
        if (env.held() === 0 && !env.input.down()) next = Math.min(next, Math.max(1, QUIET_INPUT_MS - (t - env.input.last())));
      }
    }
    if (env.held() > 0) { const by = env.heldTags?.(); if (by) for (const j of jobs) if (j.readyAt <= t && !j.rush) j.stat.parkedBy = by; }
    if (env.held() > 0 && !offCalm) offCalm = env.onCalm(() => { offCalm?.(); offCalm = null; pump(false); });
    if (env.input.down()) next = Math.min(next, QUIET_INPUT_MS);   // (a finger that stays down is looked at again, so a lost "up" cannot park the slot for ever)
    if (Number.isFinite(next)) wake(next);
  }

  function slice(j: Job): void {
    const t0 = env.now();
    let first = true;
    try {
      while (!j.cancelled) {
        if (!first && (env.now() - t0 >= (j.rush ? Math.max(j.budget, RUSH_BUDGET_MS) : j.budget) || env.input.pending?.())) break;   // (budget spent, or input is waiting: the next step waits)
        first = false;
        const s0 = env.now();
        const fin = j.step();
        const d = env.now() - s0;
        j.stat.steps++; if (d > j.stat.worstStepMs) { j.stat.worstStepMs = d; if (j.label) j.stat.worstLabel = j.label(); }
        if (fin) { j.done = true; break; }
      }
    } catch (e) {
      console.error(`[slot] ${j.tag} threw`, e);
      j.done = true;   // (a job that throws is finished: it is not asked again)
    }
    j.stat.slices++; j.stat.totalMs += env.now() - t0;
    env.sliced?.(j.tag, t0, env.now());
    j.since = env.now();
    if (j.done) { j.stat.done = true; try { env.finished?.(j.stat); } catch { /* (the log must never stop the slot) */ } }
    else { const i = jobs.indexOf(j); if (i >= 0) { jobs.splice(i, 1); jobs.push(j); } }   // (round robin: the next job gets the next slice)
  }

  return {
    whenQuiet(step: () => boolean, o: QuietOpts): QuietJob {
      const t = env.now();
      const stat: SlotStat = { tag: o.tag, slices: 0, steps: 0, totalMs: 0, worstStepMs: 0, done: false };
      const j: Job = { step, label: o.label, tag: o.tag, budget: o.budgetMs ?? DEFAULT_BUDGET_MS, readyAt: t + (o.delayMs ?? 0), since: t, maxWait: o.maxWaitMs ?? 0, rush: false, cancelled: false, done: false, stat };
      jobs.push(j); stats.push(stat);
      pump(false);
      return {
        cancel() { j.cancelled = true; },
        rush() { if (!j.done && !j.cancelled) { j.rush = true; j.readyAt = 0; pump(false); } },
        get done() { return j.done; },
      };
    },
    stats: (): SlotStat[] => stats.map((s) => ({ ...s })),
    /** Test helper. */
    pending: (): number => jobs.filter((j) => !j.cancelled && !j.done).length,
  };
}
export type Quiet = ReturnType<typeof createQuiet>;

// ── the browser's environment ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the page's input did last: any pointer, touch, wheel or key, and whether a finger or button is down. Listeners are passive and on the window, installed once. */
function pageInput(): QuietEnv['input'] {
  let last = -1e9, downs = 0, downAt = 0;
  if (typeof window !== 'undefined') {
    const mark = () => { last = clock.now(); };
    const opts = { capture: true, passive: true } as const;
    for (const t of ['pointermove', 'touchmove', 'wheel', 'keydown']) window.addEventListener(t, mark, opts);
    window.addEventListener('pointerdown', () => { mark(); downs++; downAt = last; }, opts);
    window.addEventListener('touchstart', () => { mark(); downs = Math.max(downs, 1); downAt = last; }, opts);
    const up = () => { mark(); downs = 0; };   // (every pointer up or cancel clears it: a lost one cannot leave the slot parked)
    for (const t of ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'blur']) window.addEventListener(t, up, opts);
  }
  const sched = (globalThis as { navigator?: { scheduling?: { isInputPending?: () => boolean } } }).navigator?.scheduling;
  return {
    last: () => last,
    down: () => downs > 0 && clock.now() - downAt < 10000,   // (a finger held longer than this is a lost "up")
    pending: sched?.isInputPending ? () => sched.isInputPending!() : undefined,
  };
}

function postTask(): (fn: () => void) => void {
  if (typeof MessageChannel === 'undefined') return (fn) => { clock.after(fn, 0, 'slot-post'); };
  const mc = new MessageChannel(), q: (() => void)[] = [];
  // (under node, an open port with a handler keeps the process alive for ever, so a test file that built a scene never exited: the port holds the process only while a task is waiting on it. A browser's port has no ref/unref.)
  const hold = mc.port1 as MessagePort & { ref?: () => void; unref?: () => void };
  mc.port1.onmessage = () => { const f = q.shift(); if (!q.length) hold.unref?.(); f?.(); };
  hold.unref?.();   // (after the handler: setting onmessage refs the port again, so an unref before it is undone and a port never posted to held node open)
  return (fn) => { q.push(fn); hold.ref?.(); mc.port2.postMessage(0); };
}

let post: ((fn: () => void) => void) | null = null;
/** Resolves in a task of its own, after the tasks already waiting (a MessageChannel post: input, timers and the compositor's frames run between): what a long job awaits between its steps so no one task is all of it. */
export const nextTask = (): Promise<void> => new Promise<void>((r) => { (post ??= postTask())(r); });

// (the last slices, on the browser's real clock, so a long task can be named: `slotAround`)
const recent: { tag: string; t0: number; t1: number }[] = Array.from({ length: 64 }, () => ({ tag: '', t0: -1, t1: -1 }));
let recentAt = 0;
/** The tag of the background slice that ran during real time [t0, t1] (a long-task entry's span), or null. */
export function slotAround(t0: number, t1: number): string | null {
  for (const r of recent) if (r.tag && r.t0 < t1 && r.t1 > t0) return r.tag;
  return null;
}

let shared: Quiet | null = null;
let finishedSink: ((s: SlotStat) => void) | null = null;
/** Who hears a finished job (boot/spans.ts writes the `slot:<tag>` row). */
export const setSlotFinishedSink = (fn: ((s: SlotStat) => void) | null): void => { finishedSink = fn; };

function browserQuiet(): Quiet {
  if (shared) return shared;
  const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  shared = createQuiet({
    now: () => clock.now(),
    held: () => clock.moving,   // (motion only: a steady hold, an instrument that runs for minutes, never parks the slot)
    heldTags: () => clock.movingTags(),
    onCalm: (fn) => clock.onCalm(fn),
    after: (fn, ms) => clock.after(fn, ms, 'slot'),
    cancel: (id) => clock.cancel(id),
    idle: ric ? (fn) => { ric.call(globalThis, fn, { timeout: 1000 }); } : undefined,   // (the timeout only bounds the wait for an idle period: the gate is checked again inside)
    post: postTask(),
    input: pageInput(),
    finished: (s) => finishedSink?.(s),
    sliced: (tag, t0, t1) => { const r1 = performance.now(); recent[recentAt] = { tag, t0: r1 - (t1 - t0) / clock.scale, t1: r1 }; recentAt = (recentAt + 1) % recent.length; },
  });
  return shared;
}

/** Run `step` (returns true when finished) in the page's one background slot. See the header. */
export const whenQuiet = (step: () => boolean, o: QuietOpts): QuietJob => browserQuiet().whenQuiet(step, o);
/** A job of one step: run `fn` once, in a quiet slot. */
export const whenQuietOnce = (fn: () => void, o: QuietOpts): QuietJob => whenQuiet(() => { fn(); return true; }, o);
/** Slot counters per tag, for ?perf and the audit. */
export const slotStats = (): SlotStat[] => (shared ? shared.stats() : []);

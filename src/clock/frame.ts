// THE frame loop. Nothing else in the app calls requestAnimationFrame (tests/one-clock.test.ts greps for it).
//
// One frame runs five phases in this fixed order:  engine → tween → camera → render → tags
//   engine  adopt the newest engine frame (vessel data texture, store)
//   tween   advance every eased value (card moves, shot blends, fades)
//   camera  place the camera and the projection shift from the tweened values
//   render  draw the 3D (the R3F bridge calls advance() here)
//   tags    write 3D-anchored label positions (transform and opacity only, straight on the DOM, never through React)
//
// Render on demand: the loop runs only while something needs it. A system asks for frames with
//   const hold = clock.hold('camera-shot');  …  hold.release();       (as long as it moves)
//   clock.invalidate('engine-frame');                                    (exactly one more frame)
// and when nothing asks, no frame is drawn and no timer runs ("0 frames drawn when nothing moves").
// Every frame is timed; the slowest ones (with the tags that were asking for frames, and the phase that cost most) feed ?perf.

import { boundBy, type Bound } from './render-stats.ts';

export const PHASES = ['engine', 'tween', 'camera', 'render', 'tags'] as const;
export type Phase = (typeof PHASES)[number];

export interface FrameInfo {
  /** ms on the page's own clock (performance.now at the start of this frame) */
  time: number;
  /** ms since the previous frame that ran; 0 on the first frame after the loop woke */
  dt: number;
  /** frames run since the page started */
  frame: number;
}
export type System = (f: FrameInfo) => void;
export interface Hold { release(): void }

/** The handle of a wait made by `clock.after` / `afterReal` / `every`. Opaque on purpose: it is not a number, so it cannot be handed to the browser's `clearTimeout` (which would cancel nothing, or someone else's timer),
 *  and a number from `window.setTimeout` cannot be handed to `clock.cancel`. A timer is cancelled by the source that made it, and the compiler checks the pairing. */
export class TimerId {
  readonly #n: number;
  constructor(n: number) { this.#n = n; }
  /** the clock's own key (only the clock reads it) */
  get key(): number { return this.#n; }
}

export interface SlowFrame {
  frame: number;
  at: number;
  /** ms from the start of the frame's work to its end (the draw is included; the browser's own present is not) */
  ms: number;
  /** ms between this frame's start and the previous one's (what the eye sees as a hitch) */
  gap: number;
  phases: Record<Phase, number>;
  tags: string[];
  /** what the frame was waiting on: its scripts, or the GPU / compositor (a long gap after short work); null when neither stood out */
  bound: Bound | null;
  /** the renderer's numbers for the frame (draw calls, triangles, programs, geometries, textures), when a probe is set */
  gl?: unknown;
}

export interface Env {
  raf(cb: (t: number) => void): number;
  cancel(id: number): void;
  now(): number;
  /** a timer that fires `cb` after `ms` (default: setTimeout, looked up at the call so a test's fake timers answer) */
  timer?(cb: () => void, ms: number): unknown;
  untimer?(id: unknown): void;
  /** a repeating timer in real time (default: setInterval) */
  every?(cb: () => void, ms: number): unknown;
  unevery?(id: unknown): void;
}

/** A timer's scaled wait: 1/n of it, but a short one (a poll, a retry, a debounce) keeps at least 16 ms, or it becomes a hot loop (a 50 ms poll at 20x would run every 2.5 ms and starve the page). */
export const scaledDelay = (ms: number, n: number): number => (ms <= 0 ? ms : Math.max(ms / n, Math.min(ms, 16)));

const RING = 240;      // frames of history kept for ?perf
const SLOW_KEEP = 40;  // slowest frames listed
export const SLOW_MS = 20;   // done bar: no frame over 20 ms in a 10 s run of the deck

let faultSink: ((phase: string, err: unknown) => void) | null = null;
/** Who hears a system that throws (the crash net, boot/crash-net.ts): the loop still catches it so one system cannot stop the others. */
export const setClockFaultSink = (fn: ((phase: string, err: unknown) => void) | null): void => { faultSink = fn; };

export function createClock(env: Env) {
  // ONE source of time (R3). `now()` is page time: the real clock times `scale` from the moment the scale was set, so the audit's speed mode
  // (?audit&speed=N) changes one number and every tween, delay and sampler that reads the clock follows. Nothing else reads performance.now().
  let scale = 1, page0 = 0, real0 = 0;
  const now = () => (scale === 1 && page0 === real0 ? env.now() : page0 + (env.now() - real0) * scale);
  const sched = env.timer ?? ((cb, ms) => setTimeout(cb, ms));
  const unsched = env.untimer ?? ((id) => clearTimeout(id as number));
  const repeat = env.every ?? ((cb, ms) => setInterval(cb, ms));
  const unrepeat = env.unevery ?? ((id) => clearInterval(id as number));
  let nextTimer = 1;
  const timers = new Map<number, { tag: string; cancel: () => void }>();
  const wait = (fn: (...a: never[]) => void, ms: number, tag: string): TimerId => {
    const id = nextTimer++;
    const h = sched(() => { timers.delete(id); (fn as () => void)(); }, ms);
    timers.set(id, { tag, cancel: () => unsched(h) });
    return new TimerId(id);
  };   // waits made by after()/every() and not yet fired or cancelled
  const systems = Object.fromEntries(PHASES.map((p) => [p, [] as { order: number; fn: System }[]])) as Record<Phase, { order: number; fn: System }[]>;
  const holds = new Map<symbol, string>();
  const steady = new Set<symbol>();       // holds that last as long as something RUNS (a live Doppler, a running trace), not a motion the eye follows: they ask for frames, but `moving` does not count them
  const asked = new Set<string>();       // one-frame invalidations made since the last frame started
  let nextAsked = new Set<string>();     // invalidations made while a frame runs: they ask for the following frame
  let rafId = 0, running = false, last = 0, frame = 0, lastStart = 0;
  const ring = new Float32Array(RING);   // frame work times (ms)
  const gaps = new Float32Array(RING);
  const realAt = new Float64Array(RING), realMs = new Float32Array(RING), worstPh = new Uint8Array(RING);   // (when each recent frame really ran, for naming what a long task was: frameAround)
  let ringAt = 0, drawn = 0, wokeAt = 0;
  const slow: SlowFrame[] = [];
  let probe: (() => unknown) | null = null;   // (?perf and ?audit hand in a reader of the renderer's numbers: read only for a slow frame)
  let boundCpu = 0, boundGpu = 0;           // (frames that waited on the scripts / on the GPU or compositor, since the last reset)
  const listeners = new Set<(awake: boolean) => void>();
  const calmListeners = new Set<() => void>();   // (told when the last hold lets go: the background-work slot, clock/idle.ts, waits on it)

  const wanted = () => holds.size > 0 || asked.size > 0 || nextAsked.size > 0;

  function schedule() {
    if (rafId || !wanted()) return;
    if (!running) { running = true; last = 0; wokeAt = now(); for (const l of listeners) l(true); }
    rafId = env.raf(run);
  }

  function run() {
    rafId = 0;
    const start = now();
    const tags = [...holds.values(), ...asked, ...nextAsked];
    // (asked and nextAsked are both answered by this frame; an invalidate made while it runs asks for the next)
    nextAsked = new Set();
    const info: FrameInfo = { time: start, dt: last ? start - last : 0, frame: frame++ };
    last = start;
    asked.clear();
    const phases = { engine: 0, tween: 0, camera: 0, render: 0, tags: 0 } as Record<Phase, number>;
    for (const p of PHASES) {
      const t0 = now();
      // (copy: a system may add or remove systems while it runs)
      for (const s of systems[p].slice()) {
        try { s.fn(info); } catch (err) { console.error(`[clock] ${p} system threw`, err); try { faultSink?.(p, err); } catch { /* (the net must never stop a frame) */ } }
      }
      phases[p] = now() - t0;
    }
    const ms = now() - start;
    const gap = lastStart ? start - lastStart : 0;
    lastStart = start;
    realAt[ringAt] = env.now() - ms / scale; realMs[ringAt] = ms / scale; worstPh[ringAt] = PHASES.indexOf((Object.entries(phases) as [Phase, number][]).reduce((a, b) => (b[1] > a[1] ? b : a))[0]);
    ring[ringAt] = ms; gaps[ringAt] = gap; ringAt = (ringAt + 1) % RING; drawn++;
    const bound = boundBy(ms, gap);
    if (bound === 'cpu') boundCpu++; else if (bound === 'gpu/compositor') boundGpu++;
    if (ms > SLOW_MS || gap > 50) {
      slow.push({ frame: info.frame, at: start, ms, gap, phases, tags: [...new Set(tags)], bound, gl: probe ? probe() : undefined });
      slow.sort((a, b) => Math.max(b.ms, b.gap) - Math.max(a.ms, a.gap));
      if (slow.length > SLOW_KEEP) slow.length = SLOW_KEEP;
    }
    if (wanted()) schedule();
    else { running = false; lastStart = 0; for (const l of listeners) l(false); }
  }

  return {
    /** Add a system to a phase (lower `order` first inside the phase). Returns its remover. */
    on(phase: Phase, fn: System, order = 0): () => void {
      const s = { order, fn };
      const list = systems[phase];
      list.push(s);
      list.sort((a, b) => a.order - b.order);
      return () => { const i = list.indexOf(s); if (i >= 0) list.splice(i, 1); };
    },
    /** Ask for frames for as long as the hold lives. `tag` names the asker in ?perf. */
    hold(tag: string, o: { steady?: boolean } = {}): Hold {
      const key = Symbol(tag);
      holds.set(key, tag);
      if (o.steady) steady.add(key);
      schedule();
      return { release: () => { const was = steady.delete(key); if (holds.delete(key) && !was && holds.size - steady.size === 0) for (const l of [...calmListeners]) l(); } };
    },
    /** Ask for frames for `ms` milliseconds (a motion whose length is known). */
    frameFor(tag: string, ms: number) {
      const h = this.hold(tag);
      this.after(() => h.release(), ms, tag);   // (a timer that only lets go: it paints nothing)
    },
    /** Page time in ms: the one reader of time (replaces performance.now()). Scaled by `scale`. */
    now,
    /** The speed of page time (1 = real). Only the audit sets it. */
    get scale() { return scale; },
    setScale(n: number) {
      const k = Number.isFinite(n) && n > 0 ? n : 1;
      page0 = now(); real0 = env.now(); scale = k;
    },
    /** Run `fn` after `ms` of PAGE time (1/scale of the wall time, never under 16 ms for a short wait). Holds no frames. Returns an id for cancel(). `tag` names it in ?perf. */
    after(fn: (...a: never[]) => void, ms: number, tag = 'after'): TimerId {
      return wait(fn, scaledDelay(ms, scale), tag);
    },
    /** Like `after`, but in REAL time, never scaled: a human's wait (a press-and-hold, a double-tap window) must not be shortened by the audit's speed mode. */
    afterReal(fn: (...a: never[]) => void, ms: number, tag = 'after-real'): TimerId {
      return wait(fn, ms, tag);
    },
    /** Run `fn` every `ms` of REAL time (a poll, a readout; not scaled, as setInterval never was). Returns an id for cancel(). */
    every(fn: (...a: never[]) => void, ms: number, tag = 'every'): TimerId {
      const id = nextTimer++;
      const h = repeat(fn as () => void, ms);
      timers.set(id, { tag, cancel: () => unrepeat(h) });
      return new TimerId(id);
    },
    /** The phase of the frame that ran during real time [t0, t1] (ms on the browser's own clock, as a long-task entry gives it), or null when no recent frame did. */
    frameAround(t0: number, t1: number): { frame: number; phase: Phase } | null {
      const n = Math.min(drawn, RING);
      for (let k = 1; k <= n; k++) {
        const i = (ringAt - k + RING) % RING;
        if (realAt[i]! < t1 && realAt[i]! + realMs[i]! > t0) return { frame: drawn - k, phase: PHASES[worstPh[i]!]! };
        if (realAt[i]! + realMs[i]! < t0 - 1000) break;
      }
      return null;
    },
    /** Cancel an after() or every() (an id that already fired, was cancelled, or is undefined does nothing, like clearTimeout). */
    cancel(id: TimerId | null | undefined) {
      if (id == null) return;
      const t = timers.get(id.key);
      if (t) { timers.delete(id.key); t.cancel(); }
    },
    /** Ask for exactly one more frame. */
    invalidate(tag: string) {
      if (running && rafId === 0) nextAsked.add(tag); else asked.add(tag);
      schedule();
    },
    /** How many holds are live: a tween, a camera move, a gesture, a deck entry or an instrument asking for frames as long as it moves (not the one-frame invalidations of the ambient flow). 0 is "nothing is moving". */
    get held() { return holds.size; },
    /** How many MOTION holds are live (a tween, a camera move, a gesture, a card glide): `held` less the steady ones (`hold(tag, { steady: true })`: an instrument that runs). 0 is "nothing the eye follows is moving";
     *  the background slot (clock/idle.ts) waits on this, so a live Doppler or a running trace never parks the page's background work. */
    get moving() { return holds.size - steady.size; },
    /** The tags of the motion holds live now (what parks the background slot, for ?perf). */
    movingTags(): string[] { const out: string[] = []; for (const [k, t] of holds) if (!steady.has(k)) out.push(t); return out; },
    /** Called each time the last live MOTION hold lets go (steady holds do not count). Returns its remover. */
    onCalm(fn: () => void) { calmListeners.add(fn); return () => { calmListeners.delete(fn); }; },
    /** Whether the loop is awake (frames being drawn). */
    get awake() { return running; },
    onAwake(fn: (awake: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    stats() {
      const n = Math.min(drawn, RING), times = Array.from(ring.subarray(0, n)).sort((a, b) => a - b);
      const q = (p: number) => (n ? times[Math.min(n - 1, Math.floor(p * n))]! : 0);
      return { timers: [...timers.values()].map((t) => t.tag), framesDrawn: drawn, windowFrames: n, p50: q(0.5), p95: q(0.95), max: n ? times[n - 1]! : 0, slow: slow.slice(), awake: running, holds: [...holds.values()], wokeAt, boundCpu, boundGpu };
    },
    resetStats() { ring.fill(0); gaps.fill(0); ringAt = 0; drawn = 0; slow.length = 0; boundCpu = 0; boundGpu = 0; },
    /** A reader of the renderer's numbers, called only for a frame kept as slow. */
    setProbe(fn: (() => unknown) | null) { probe = fn; },
  };
}
export type Clock = ReturnType<typeof createClock>;

const browserEnv: Env = typeof window !== 'undefined'
  // (the one raw requestAnimationFrame in the app)
  ? { raf: (cb) => window.requestAnimationFrame(cb), cancel: (id) => window.cancelAnimationFrame(id), now: () => performance.now() }
  : { raf: (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number, cancel: (id) => clearTimeout(id), now: () => performance.now() };

/** The app's clock. */
export const clock: Clock = createClock(browserEnv);
export const frameFor = (tag: string, ms: number) => clock.frameFor(tag, ms);

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

export interface SlowFrame {
  frame: number;
  at: number;
  /** ms from the start of the frame's work to its end (the draw is included; the browser's own present is not) */
  ms: number;
  /** ms between this frame's start and the previous one's (what the eye sees as a hitch) */
  gap: number;
  phases: Record<Phase, number>;
  tags: string[];
}

export interface Env {
  raf(cb: (t: number) => void): number;
  cancel(id: number): void;
  now(): number;
}

const RING = 240;      // frames of history kept for ?perf
const SLOW_KEEP = 40;  // slowest frames listed
export const SLOW_MS = 20;   // done bar: no frame over 20 ms in a 10 s run of the deck

export function createClock(env: Env) {
  const systems = Object.fromEntries(PHASES.map((p) => [p, [] as { order: number; fn: System }[]])) as Record<Phase, { order: number; fn: System }[]>;
  const holds = new Map<symbol, string>();
  const asked = new Set<string>();       // one-frame invalidations made since the last frame started
  let nextAsked = new Set<string>();     // invalidations made while a frame runs: they ask for the following frame
  let rafId = 0, running = false, last = 0, frame = 0, lastStart = 0;
  const ring = new Float32Array(RING);   // frame work times (ms)
  const gaps = new Float32Array(RING);
  let ringAt = 0, drawn = 0, wokeAt = 0;
  const slow: SlowFrame[] = [];
  const listeners = new Set<(awake: boolean) => void>();

  const wanted = () => holds.size > 0 || asked.size > 0 || nextAsked.size > 0;

  function schedule() {
    if (rafId || !wanted()) return;
    if (!running) { running = true; last = 0; wokeAt = env.now(); for (const l of listeners) l(true); }
    rafId = env.raf(run);
  }

  function run() {
    rafId = 0;
    const start = env.now();
    const tags = [...holds.values(), ...asked, ...nextAsked];
    // (asked and nextAsked are both answered by this frame; an invalidate made while it runs asks for the next)
    nextAsked = new Set();
    const info: FrameInfo = { time: start, dt: last ? start - last : 0, frame: frame++ };
    last = start;
    asked.clear();
    const phases = { engine: 0, tween: 0, camera: 0, render: 0, tags: 0 } as Record<Phase, number>;
    for (const p of PHASES) {
      const t0 = env.now();
      // (copy: a system may add or remove systems while it runs)
      for (const s of systems[p].slice()) {
        try { s.fn(info); } catch (err) { console.error(`[clock] ${p} system threw`, err); }
      }
      phases[p] = env.now() - t0;
    }
    const ms = env.now() - start;
    const gap = lastStart ? start - lastStart : 0;
    lastStart = start;
    ring[ringAt] = ms; gaps[ringAt] = gap; ringAt = (ringAt + 1) % RING; drawn++;
    if (ms > SLOW_MS || gap > 50) {
      slow.push({ frame: info.frame, at: start, ms, gap, phases, tags: [...new Set(tags)] });
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
    hold(tag: string): Hold {
      const key = Symbol(tag);
      holds.set(key, tag);
      schedule();
      return { release: () => { holds.delete(key); } };
    },
    /** Ask for frames for `ms` milliseconds (a motion whose length is known). */
    frameFor(tag: string, ms: number) {
      const h = this.hold(tag);
      setTimeout(() => h.release(), ms);   // (a timer that only lets go: it paints nothing)
    },
    /** Ask for exactly one more frame. */
    invalidate(tag: string) {
      if (running && rafId === 0) nextAsked.add(tag); else asked.add(tag);
      schedule();
    },
    /** Whether the loop is awake (frames being drawn). */
    get awake() { return running; },
    onAwake(fn: (awake: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    stats() {
      const n = Math.min(drawn, RING), times = Array.from(ring.subarray(0, n)).sort((a, b) => a - b);
      const q = (p: number) => (n ? times[Math.min(n - 1, Math.floor(p * n))]! : 0);
      return { framesDrawn: drawn, windowFrames: n, p50: q(0.5), p95: q(0.95), max: n ? times[n - 1]! : 0, slow: slow.slice(), awake: running, holds: [...holds.values()], wokeAt };
    },
    resetStats() { ring.fill(0); gaps.fill(0); ringAt = 0; drawn = 0; slow.length = 0; },
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

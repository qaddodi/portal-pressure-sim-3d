// A main-thread block timer for browsers that have no long-task observer (Safari, the owner's iPhone, iPad and Mac): a 4 ms timer that is late by more than 50 ms means something held the thread, and the marks the
// app leaves at known places (`mark('talk:open-deck')`) say what was running or had just run (22 Nov: the audit's 77-89 ms gaps at the opening of a talk had 2 ms of clock work, so the time was spent outside
// the frame and nothing could name it). Off until a debug page starts it (?audit, ?perf): a timer every 4 ms is not for a phone in someone's hand. Real time (performance.now), so it lives here with the clock.
export interface Block { at: number; ms: number; marks: string[] }
const RING = 64;
const names: string[] = new Array<string>(RING).fill(''), times = new Float64Array(RING);
let n = 0;
const realNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Leave a mark: "this is where the app was". Cheap (a ring write), always on. */
export function mark(name: string): void { const i = n % RING; names[i] = name; times[i] = realNow(); n++; }
/** The marks left in real time [t0, t1], oldest first, each with its offset into the window; and the last one before t0 (as `^name`), which started the task the block was in. */
export function marksIn(t0: number, t1: number): string[] {
  const out: string[] = []; let before = '';
  for (let k = Math.min(n, RING); k >= 1; k--) {
    const i = (n - k) % RING;
    if (times[i]! < t0) before = names[i]!;
    else if (times[i]! <= t1) out.push(`${names[i]}@+${Math.round(times[i]! - t0)}`);
  }
  return before ? [`^${before}`, ...out] : out;
}
export const resetMarks = (): void => { n = 0; names.fill(''); times.fill(0); };

export interface BlockEnv { now(): number; later(fn: () => void, ms: number): void }
export const TICK_MS = 4, BLOCK_MS = 50;
/** The timer: every `TICK_MS` it looks at how late it is. Returns stop(). `env` is injectable for tests. */
export function watchBlocks(onBlock: (b: Block) => void, env: BlockEnv = { now: realNow, later: (fn, ms) => { setTimeout(fn, ms); } }): () => void {
  let on = true, last = env.now();
  const tick = (): void => {
    if (!on) return;
    const t = env.now(), late = t - last - TICK_MS;
    if (late > BLOCK_MS) onBlock({ at: last + TICK_MS, ms: late, marks: marksIn(last, t) });
    last = t; env.later(tick, TICK_MS);
  };
  env.later(tick, TICK_MS);
  return () => { on = false; };
}

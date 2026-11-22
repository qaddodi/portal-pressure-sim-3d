// The simulation workers: where one is started, and what happens when one fails or does not answer. ONE place (before 22 Nov three files each started
// their own worker, with their own rules: boot.ts crashed the app, calc.ts and what-if.ts waited for ever on a worker that had died).
//
//   enginePool.live()      the worker the figure's clock runs on (the EngineClient owns it: client.ts, boot.ts)
//   enginePool.sequence    a second engine of its own: a deck's states, one 'sequence' at a time (decks/hp/calc.ts)
//   enginePool.whatIf      a third: the Model line's "settled with this treatment" questions (ui/trials/what-if.ts)
//
// A second engine starts on its first message, paused (no live clock on a model nobody looks at), and is dropped when it fails: its subscriber is told
// `{ type: 'crash', message }` once (every request waiting on it settles with that), and the next message starts a fresh one.
import type { WorkerLike } from './client.ts';

import { clock, type TimerId } from '../clock/frame.ts';
/** How long a request to a second engine may wait before the worker is taken for stalled and dropped. A deck's chain is seconds on a laptop; this is for a worker that never answers. */
export const SECOND_WAIT_MS = 120000;

/** Starts a simulation worker: the one `new Worker` of the engine. Throws with the reason in words the boot screen shows. */
export function startWorker(): WorkerLike {
  try { return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike; }
  catch (e) { throw new Error(`The simulation worker could not start: ${String((e as { message?: string } | null)?.message ?? e)}`); }
}

export type SecondMessage = { type: string; reqId?: number; message?: string; [k: string]: unknown };

/** A second engine: lazily started, paused, and replaced when it fails. `start` is injectable for tests. */
export class Second {
  private w: WorkerLike | null = null;
  private cb: ((m: SecondMessage) => void) | null = null;
  private timer: TimerId | undefined;
  private readonly start: () => WorkerLike;
  private readonly waitMs: number;
  constructor(start: () => WorkerLike = startWorker, waitMs = SECOND_WAIT_MS) { this.start = start; this.waitMs = waitMs; }

  /** Who hears this engine's messages, and its crash. One at a time: a newer listener replaces the older. */
  subscribe(f: (m: SecondMessage) => void): void { this.cb = f; }

  /** Sends one message; starts the worker first when there is none. A message that is a request (`reqId`) arms the stall timer, a message back while it runs rearms it, and `idle()` (the caller has its answer) stops it. */
  post(m: SecondMessage): void {
    try {
      if (!this.w) this.w = this.open();
      this.w.postMessage(m);
      if (m.reqId != null) this.arm();
    } catch (e) { this.fail(String((e as { message?: string } | null)?.message ?? e)); }
  }

  private open(): WorkerLike {
    const w = this.start();
    w.onmessage = (e) => { if (w !== this.w) return; if (this.timer !== undefined) this.arm(); this.cb?.(e.data as unknown as SecondMessage); };   // (a message while a request waits is progress: the wait starts again)
    w.onerror = (e) => { (e as { preventDefault?: () => void } | null)?.preventDefault?.(); if (w === this.w) this.fail(`The simulation worker failed: ${String((e as { message?: string } | null)?.message || 'it could not be loaded or it stopped')}`); };
    w.onmessageerror = () => { if (w === this.w) this.fail('The simulation worker sent a message the page could not read.'); };
    w.postMessage({ type: 'init' });
    w.postMessage({ type: 'run', running: false });   // (no live clock on a model nobody looks at)
    return w;
  }
  // (the stall rule: a worker silent for waitMs after a request is dropped; an answer, or the next request, starts the wait again)
  private arm(): void { clock.cancel(this.timer); this.timer = clock.afterReal(() => this.fail('The simulation did not answer in time.'), this.waitMs); }

  /** The worker is gone: end it, tell the listener once, and let the next message start a new one. */
  fail(message: string): void {
    this.idle();
    const w = this.w; this.w = null;
    if (!w) return;
    w.onmessage = w.onerror = w.onmessageerror = null;
    try { w.terminate?.(); } catch { /* already gone */ }
    this.cb?.({ type: 'crash', message });
  }

  /** A request that has been answered: nothing is waiting, so the stall timer stops. */
  idle(): void { clock.cancel(this.timer); this.timer = undefined; }

  /** Ends the worker for good (a deck's states are no longer wanted). The listener is not told. */
  dispose(): void {
    this.idle();
    const w = this.w; this.w = null;
    if (w) { w.onmessage = w.onerror = w.onmessageerror = null; try { w.terminate?.(); } catch { /* already gone */ } }
  }
}

export const enginePool = {
  live: startWorker,
  sequence: new Second(),
  whatIf: new Second(),
};

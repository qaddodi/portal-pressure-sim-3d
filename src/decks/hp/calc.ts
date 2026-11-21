// The second engine: a deck's states are computed off screen, one 'sequence' in a worker of their own, so the live figure never shows a half-made state
// (the 2D app does the same, calc-client.js). Each slide's result is handed over as soon as it is ready, so a deck opens on its first slide without
// waiting for the last. One deck at a time; a second ask waits its turn.
import { create } from 'zustand';
import { chainOf, sequencer, type Fp, type StepResult } from './numbers.ts';
import type { CopiedDeck } from './types.ts';

import { clock } from '../../clock/frame.ts';
interface Calc { post(msg: unknown): void; subscribe(cb: (m: never) => void): void; dispose(): void }

let calc: Calc | null = null;
function open(): Calc {
  if (calc) return calc;
  const w = new Worker(new URL('../../engine/worker.ts', import.meta.url), { type: 'module' });
  let cb: ((m: never) => void) | null = null;
  w.onmessage = (e) => cb?.(e.data as never);
  w.postMessage({ type: 'init' });
  w.postMessage({ type: 'run', running: false });   // (no live clock on a model nobody looks at)
  return (calc = { post: (m) => w.postMessage(m), subscribe: (f) => { cb = f; }, dispose: () => { w.terminate(); calc = null; } });
}

/** The states of the decks computed so far: results[deck][i] is slide i's (the outline's step is not kept). */
interface StatesStore { results: Record<string, (StepResult | undefined)[]>; failed: Record<string, string> }
export const useStates = create<StatesStore>(() => ({ results: {}, failed: {} }));

let queue: Promise<void> = Promise.resolve();
const started = new Set<string>();
const retries = new Map<string, number>();   // (a run that failed asks again, twice at most: a card waiting for its numbers never waits on a failure nobody retried)
let nextReq = 1;

/** Start computing a deck's states (once); resolves when the last is in. */
export function ensureStates(deck: CopiedDeck): Promise<void> {
  if (started.has(deck.id)) return queue;
  started.add(deck.id);
  const steps = chainOf(deck.slides);
  queue = queue.then(async () => {
    const c = open();
    const reqId = nextReq++;
    const seq = sequencer(reqId);
    const out: (StepResult | undefined)[] = [];
    c.subscribe((m) => {
      seq.message(m as Parameters<typeof seq.message>[0]);
      const t = m as { type: string; reqId?: number; i?: number };
      if (t.type === 'seqStep' && t.reqId === reqId && t.i! >= 1) {   // (step 0 is the outline's)
        out[t.i! - 1] = seq.results[t.i!];
        useStates.setState((s) => ({ results: { ...s.results, [deck.id]: [...out] } }));
      }
    });
    c.post({ type: 'sequence', steps, reqId });
    try { await seq.done; } catch (e) {
      useStates.setState((s) => ({ failed: { ...s.failed, [deck.id]: String((e as Error).message) } }));
      started.delete(deck.id);
      const n = retries.get(deck.id) ?? 0;
      if (n < 2) { retries.set(deck.id, n + 1); clock.after(() => void ensureStates(deck), 1500 * (n + 1)); }
    }
  });
  return queue;
}

export const fpOf = (deckId: string, i: number): Fp | null => useStates.getState().results[deckId]?.[i]?.fp ?? null;

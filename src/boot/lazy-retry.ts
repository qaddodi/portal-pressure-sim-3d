// A part of the app that loads on demand (an instrument, a card's pane) is fetched again when the fetch fails, then says so in words; it never leaves an empty pane or a blank app.
// Offline before the idle cache fill, or a tab left open across two deploys whose hashed files the worker dropped, are the two ways a dynamic import rejects for good.
//   retryImport(load)  runs `load` up to 3 times with a backoff; the last failure is a ChunkError (never retried again by an outer retry).
//   lazyRetry(load)    React.lazy on top of it, for a component. A failed one can be asked again with retryFailedChunks() (the pane boundary's Try again): React.lazy keeps a rejection for ever, so a new lazy takes its place.
//   chunkProblem(err)  the words and the choice of buttons for a failure: offline, a newer build is out, or just failed.
import { createElement, lazy, type ComponentType } from 'react';

export class ChunkError extends Error {
  offline: boolean; stale: boolean; reason: unknown;
  constructor(message: string, offline: boolean, stale: boolean, reason?: unknown) { super(message); this.name = 'ChunkError'; this.offline = offline; this.stale = stale; this.reason = reason; }
}

/** The waits between the tries: three tries in all. */
export const RETRY_DELAYS_MS: readonly number[] = [400, 1200];

let stale = false;
/** Vite found a preload failing (its `vite:preloadError`, main.tsx): files this page names are gone, so a newer build is out (or the network failed; the words check `navigator.onLine`). */
export const markStale = (): void => { stale = true; };
export const isStale = (): boolean => stale;
export const resetStale = (): void => { stale = false; };
const offlineNow = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

export async function retryImport<T>(load: () => Promise<T>, o: { delays?: readonly number[]; wait?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const delays = o.delays ?? RETRY_DELAYS_MS;
  const wait = o.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let i = 0; i <= delays.length; i++) {
    try { return await load(); } catch (e) {
      if (e instanceof ChunkError) throw e;
      last = e;
      if (i < delays.length) await wait(delays[i]!);
    }
  }
  throw new ChunkError(`A part of the app did not load after ${delays.length + 1} tries: ${last instanceof Error ? last.message : String(last)}`, offlineNow(), stale, last);
}

const resets = new Set<() => void>();
/** `React.lazy` that tries three times and can be asked again. The one place the app makes a lazy component (tests/lazy-retry.test.ts fails a bare `lazy(`). */
export function lazyRetry<C extends ComponentType<any>>(load: () => Promise<{ default: C }>): C {   // eslint-disable-line @typescript-eslint/no-explicit-any
  let failed = false;
  const make = () => lazy(() => retryImport(load).catch((e: unknown) => { failed = true; throw e; }));
  let Inner = make();
  resets.add(() => { if (failed) { failed = false; Inner = make(); } });
  return function LazyRetry(props: object) { return createElement(Inner as unknown as ComponentType<object>, props); } as unknown as C;
}
/** Ask every failed lazy component again (the next render fetches it afresh). */
export function retryFailedChunks(): void { for (const r of resets) r(); }

export interface ChunkProblem { text: string; /** a newer build may be out: Reload is the way */ reload: boolean; /** asking again may work now */ again: boolean }
/** What to tell the person when a part failed: `err` is what the boundary caught. */
export function chunkProblem(err: unknown, env: { online?: boolean; stale?: boolean } = {}): ChunkProblem {
  const online = env.online ?? !offlineNow(), isNew = env.stale ?? stale;
  if (!(err instanceof ChunkError)) return { text: 'This part stopped. Try again.', reload: false, again: true };
  if (!online || err.offline) return { text: 'This part needs a connection.', reload: false, again: true };
  if (isNew || err.stale) return { text: 'A newer version is out. Reload to get this part.', reload: true, again: false };
  return { text: 'This part could not load.', reload: true, again: true };
}

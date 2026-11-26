// A part of the app the first picture does not draw (the sheets, the talk's UI): one chunk, read in once, never rejecting. The pattern the boot-entry budget asks for (tests/boot-entry.test.ts):
// make the part with `lazyPart(() => import('./Part.tsx').then((m) => m.Part))` in a small file that imports nothing of the part, mount it through <LazyMount/> (boot/LazyMount.tsx),
// and add its `load` to the idle ladder (boot/warm.ts). A failed read, after three tries (boot/lazy-retry.ts), is asked again on the next call.
import { retryImport } from './lazy-retry.ts';

export interface LazyPart<T> {
  /** Read the part in (once; never rejects). Resolves true when it is in. */
  load(): Promise<boolean>;
  /** Whether it is in. */
  ready(): boolean;
  /** The part, once it is in. */
  get(): T | null;
  /** Why the last read failed (for chunkProblem's words), or null. */
  failure(): unknown;
  /** For tests: forget what is held. */
  reset(): void;
}

export function lazyPart<T>(read: () => Promise<T>): LazyPart<T> {
  let part: T | null = null, loading: Promise<boolean> | null = null, failure: unknown = null;
  const load = (src: () => Promise<T> = read): Promise<boolean> => {
    if (part) return Promise.resolve(true);
    return (loading ??= retryImport(src).then((m) => { part = m; failure = null; return true; }, (e) => { failure = e; loading = null; return false; }));
  };
  return { load, ready: () => part !== null, get: () => part, failure: () => failure, reset: () => { part = null; loading = null; failure = null; } };
}

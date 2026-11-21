// The host's entry as the app sees it (worker-core.js is untyped JavaScript); the messages are in protocol.d.ts.
import type { ToWorker } from './protocol.d.ts';

/** One per thread. `post` is the thread's postMessage; `handle` takes one `ToWorker` message and resolves when it is done. */
export interface Core {
  handle(msg: ToWorker): Promise<void>;
  engine(): unknown;
  dispose(): void;
}
/** `post` receives `FromWorker` messages (protocol.d.ts); `M` lets a listener narrow what it takes, as a test's does. */
export function createCore<M = unknown>(post: (msg: M, transfer?: Transferable[]) => void): Core;

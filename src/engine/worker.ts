// The simulation worker's entry: the host (worker-core.js, copied by scripts/sync-engine.mjs) runs the engine; this file only wires it to the thread.
import { createCore } from './hales/host/worker-core.js';

const core = createCore((msg: unknown, transfer?: Transferable[]) => self.postMessage(msg, transfer ?? []));
self.onmessage = (e: MessageEvent) => { void core.handle(e.data); };

// The watcher of keys-pool.ts: starts the key workers and tells the sleeping caller (through the shared counters) when they are all finished, or when one has died: an 'error', or an 'exit' with no 'done' before it.
import { Worker, workerData } from 'node:worker_threads';
import type { KeyJobs } from './keys-pool.ts';

const { ctl, ports, jobs, n } = workerData as { ctl: SharedArrayBuffer; ports: import('node:worker_threads').MessagePort[]; jobs: KeyJobs; n: number };
const c = new Int32Array(ctl), all: Worker[] = [];
const wake = (): void => { Atomics.notify(c, 1); };
const fail = (): void => { Atomics.store(c, 2, 1); for (const w of all) void w.terminate(); wake(); };
for (let w = 0; w < n; w++) {
  let done = false;
  const worker = new Worker(new URL('./keys-worker.ts', import.meta.url), { workerData: { ctl, port: ports[w], jobs }, transferList: [ports[w]!] });
  all.push(worker);
  worker.on('message', (m) => { if (m === 'done') { done = true; Atomics.add(c, 1, 1); wake(); } });
  worker.on('error', fail);
  worker.on('exit', () => { if (!done) fail(); });
}

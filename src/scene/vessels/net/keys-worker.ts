// One worker of keys-pool.ts: takes regions off the shared counter until none are left, and posts each one's keys down its port.
import { parentPort, workerData } from 'node:worker_threads';
import { regionKeysOf } from './keys.ts';
import type { KeyJobs } from './keys-pool.ts';

const { ctl, port, jobs } = workerData as { ctl: SharedArrayBuffer; port: import('node:worker_threads').MessagePort; jobs: KeyJobs };
const c = new Int32Array(ctl);
const fault = process.env.PPS_KEYS_FAULT;   // (the pool's test: 'exit' dies without a word, 'throw' fails inside a region)
try {
  if (fault === 'exit') process.exit(3);
  if (fault === 'throw') throw new Error('keys fault (test)');
  for (let o = Atomics.add(c, 0, 1); o < jobs.order.length; o = Atomics.add(c, 0, 1)) { const i = jobs.order[o]!; port.postMessage({ i, keys: regionKeysOf(jobs.skel, jobs.m, jobs.done[i]!, jobs.arms[i]!, jobs.states, jobs.bakeScale) }); }
} catch (e) { port.postMessage({ err: String((e as Error)?.stack ?? e) }); }
parentPort?.postMessage('done');   // (the supervisor counts it)

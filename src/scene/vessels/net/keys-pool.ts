// The keys of a bake's regions on worker threads (plan owner, 22 Nov: the net bake's biggest share, 16 s of 42, is key baking; each region's keys depend on that region alone).
// `runKeyJobs` is SYNCHRONOUS, like the mesher around it: the workers (keys-worker.ts) each take the next region from a shared counter, post its keys down their own port and count themselves finished;
// the caller sleeps on that count (Atomics.wait) and then reads the ports. Node only (`process.getBuiltinModule`, as load.ts does, so no bundle sees node:worker_threads); anywhere else, or if a worker cannot start, it
// returns null and the caller keys the regions itself, one after another, to the same bytes.
import type { FitDone, FitMesh } from './fit.ts';
import type { RegionKeys } from './keys.ts';
import type { Skeleton } from './types.ts';

/** `order`: the regions' indices, dearest first (a worker takes the next off the list, so the biggest region does not start last). */
export interface KeyJobs { order: number[]; skel: Skeleton; m: FitMesh; done: readonly FitDone[]; arms: number[][]; states: readonly (readonly number[])[]; bakeScale: number[] }
type Reply = { i: number; keys: RegionKeys } | { err: string };
const MAX_WAITS = 30 * 60;   // one second each

export function runKeyJobs(jobs0: Omit<KeyJobs, 'order'>, workers: number): RegionKeys[] | null {
  const jobs: KeyJobs = { ...jobs0, order: jobs0.done.map((_, i) => i).sort((a, b) => jobs0.done[b]!.rg.free[1] * jobs0.arms[b]!.length - jobs0.done[a]!.rg.free[1] * jobs0.arms[a]!.length || a - b) };
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  if (!proc?.getBuiltinModule) return null;
  const wt = proc.getBuiltinModule('node:worker_threads') as typeof import('node:worker_threads') | undefined;
  if (!wt?.Worker || typeof SharedArrayBuffer === 'undefined') return null;
  const n = Math.min(workers, jobs.done.length), ctl = new Int32Array(new SharedArrayBuffer(8)), ports: import('node:worker_threads').MessagePort[] = [], started: import('node:worker_threads').Worker[] = [];   // ctl: [next job, workers finished]
  try {
    for (let w = 0; w < n; w++) {
      const { port1, port2 } = new wt.MessageChannel();
      ports.push(port1);
      started.push(new wt.Worker(new URL('./keys-worker.ts', import.meta.url), { workerData: { ctl: ctl.buffer, port: port2, jobs }, transferList: [port2] }));
    }
  } catch { for (const w of started) void w.terminate(); for (const p of ports) p.close(); return null; }
  for (let seen = Atomics.load(ctl, 1), waits = 0; seen < n; seen = Atomics.load(ctl, 1)) {
    Atomics.wait(ctl, 1, seen, 1000);
    if (++waits > MAX_WAITS) { for (const w of started) void w.terminate(); throw new Error('the key workers did not finish'); }   // (a worker that died without counting itself)
  }
  const out: (RegionKeys | undefined)[] = new Array(jobs.done.length).fill(undefined);
  let err = '';
  for (const p of ports) for (let r = wt.receiveMessageOnPort(p); r; r = wt.receiveMessageOnPort(p)) { const m = r.message as Reply; if ('err' in m) err ||= m.err; else out[m.i] = m.keys; }
  for (const w of started) void w.terminate();
  for (const p of ports) p.close();
  if (err) throw new Error(`a key worker failed: ${err}`);
  if (out.some((k) => !k)) throw new Error('a key worker returned too few regions');
  return out as RegionKeys[];
}

// The page's end of the simulation worker. It owns the worker, sends actions, matches answers to requests by reqId, and hands every
// engine frame to `onFrame`. A WorkerLike can be a real Worker or (in tests, and as the fallback) the host running on this thread.
import type { FromWorker, ToWorker, EngineFrame } from './protocol.ts';

export interface WorkerLike {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate?(): void;
  onmessage: ((e: { data: FromWorker }) => void) | null;
  onerror?: ((e: unknown) => void) | null;
}

export interface ClientHandlers {
  onFrame(f: EngineFrame): void;
  onCrash(message: string): void;
}

type Reply = Extract<FromWorker, { reqId: number }>;

export class EngineClient {
  private nextId = 1;
  private waiting = new Map<number, { resolve(m: FromWorker): void; reject(e: Error): void }>();
  private worker: WorkerLike;
  private h: ClientHandlers;
  constructor(worker: WorkerLike, h: ClientHandlers) {
    this.worker = worker; this.h = h;
    worker.onmessage = (e) => this.receive(e.data);
    worker.onerror = (e) => this.h.onCrash(`The simulation worker failed: ${String((e as { message?: string })?.message ?? e)}`);
  }

  /** Fire and forget. */
  send(msg: ToWorker) { this.worker.postMessage(msg); }

  /** Send a message the worker answers (it carries a reqId back); resolves with the answer, rejects with the worker's error. */
  request<T extends FromWorker = FromWorker>(msg: ToWorker): Promise<T> {
    const reqId = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(reqId, { resolve: resolve as (m: FromWorker) => void, reject });
      this.worker.postMessage({ ...msg, reqId });
    });
  }

  private receive(m: FromWorker) {
    if (m.type === 'frame') { this.h.onFrame(m); return; }
    if (m.type === 'crash') { this.h.onCrash(m.message); this.failAll(new Error(m.message)); return; }
    const reqId = (m as { reqId?: number }).reqId;
    if (reqId == null) return;
    const w = this.waiting.get(reqId);
    if (!w) return;
    this.waiting.delete(reqId);
    if (m.type === 'error') w.reject(new Error(m.message)); else w.resolve(m as Reply);
  }

  private failAll(err: Error) { for (const w of this.waiting.values()) w.reject(err); this.waiting.clear(); }

  dispose() { this.failAll(new Error('engine client disposed')); this.worker.terminate?.(); this.worker.onmessage = null; }
}

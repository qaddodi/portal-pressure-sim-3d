// A capture's files, kept on the device's disk as they arrive (IndexedDB), so a page that runs out of memory or is ended by the browser does not take the capture with it
// (Safari on a Mac, 26 Nov: the page
// crashed after the whole audit had finished, before the zip was saved, and everything was gone). Root cause: the pictures were held in the page's memory several times over
// (each frame, the copies posted up, the
// joined list, the zip) and nothing was written down. Now each talk's (or case's) files are written as that talk ends, the page keeps only their names, the zip is made from
// storage one file at a time (zipStream),
// and the next visit to the capture page offers "Recover last capture".
// This file is the logic over a small `Backend`; the browser's IndexedDB is one (idbBackend), a Map in memory is the other (the tests, and a browser that gives no storage). Nothing is sent anywhere.
import { zipStream, type ZipFile } from '../../capture/zip.ts';

export interface RunMeta {
  id: string;
  startedAt: string; updatedAt: string;
  build: string;
  /** what the run takes, in words (the README's "Taken") */
  words: string;
  sizes: string[];
  /** running: the page was still going when it was last written; finished: it ended whole; stopped: Stop ended it */
  status: 'running' | 'finished' | 'stopped';
  files: number; bytes: number;
  /** the name the zip is saved under */
  zipName: string;
  /** when the person saved the zip (a saved run is not offered again) */
  savedAt?: string;
}

export interface Backend {
  putRun(r: RunMeta): Promise<void>;
  listRuns(): Promise<RunMeta[]>;
  putFiles(run: string, files: readonly ZipFile[]): Promise<void>;
  fileNames(run: string): Promise<string[]>;
  readFile(run: string, name: string): Promise<Uint8Array | null>;
  deleteRun(run: string): Promise<void>;
}

/** A backend in memory: the tests', and what a browser with no storage falls back to (nothing then survives a crash, and the page says so). */
export function memoryBackend(): Backend {
  const runs = new Map<string, RunMeta>(), files = new Map<string, Map<string, Uint8Array>>();
  return {
    async putRun(r) { runs.set(r.id, { ...r }); if (!files.has(r.id)) files.set(r.id, new Map()); },
    async listRuns() { return [...runs.values()].map((r) => ({ ...r })); },
    async putFiles(run, fs) { const m = files.get(run) ?? new Map<string, Uint8Array>(); files.set(run, m); for (const f of fs) m.set(f.name, f.data.slice()); },
    async fileNames(run) { return [...(files.get(run)?.keys() ?? [])]; },
    async readFile(run, name) { return files.get(run)?.get(name) ?? null; },
    async deleteRun(run) { runs.delete(run); files.delete(run); },
  };
}

/** The newest run that has files and was not saved: what "Recover last capture" offers. Null when there is none. */
export function recoverable(runs: readonly RunMeta[]): RunMeta | null {
  const open = runs.filter((r) => r.files > 0 && !r.savedAt).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return open[0] ?? null;
}

export interface Session {
  readonly id: string;
  /** a write to storage failed (no room, no storage): the files since are held in memory, and the page says the capture would not survive a crash */
  readonly degraded: string;
  /** write files (one transaction); on a failure they are held in memory instead */
  add(files: readonly ZipFile[]): Promise<void>;
  /** every file's name, in the order they came */
  names(): string[];
  read(name: string): Promise<Uint8Array | null>;
  /** the run ended (or the person stopped it) */
  finish(status: 'finished' | 'stopped'): Promise<void>;
  /** the zip, made one file at a time from storage */
  zip(at: Date, progress?: (done: number, of: number) => void): Promise<Blob>;
  /** the person saved the zip: it is not offered again */
  saved(): Promise<void>;
  /** the run's files are no longer needed */
  discard(): Promise<void>;
}

const guard = async <T>(f: () => Promise<T>): Promise<{ ok: true; v: T } | { ok: false; why: string }> => {
  try { return { ok: true, v: await f() }; } catch (e) { return { ok: false, why: String((e as Error)?.message ?? e) }; }
};

/** Start a run: the older runs go (all but the run just before, if it was not saved, so a crashed run can still be recovered while the next one is made),
 *  then the run is written down. A backend that fails to
 *  open gives a session that keeps everything in memory, with `degraded` saying why. */
export async function openSession(be: Backend | null, meta: Omit<RunMeta, 'id' | 'updatedAt' | 'status' | 'files' | 'bytes'>, id = `run-${new Date().getTime().toString(36)}`): Promise<Session> {
  const now = (): string => new Date().toISOString();
  const run: RunMeta = { ...meta, id, updatedAt: now(), status: 'running', files: 0, bytes: 0 };
  const order: string[] = [], mem = new Map<string, Uint8Array>();
  let degraded = be ? '' : 'this browser gives the page no storage';
  let b = be;
  if (b) {
    const r = await guard(async () => {
      const old = (await b!.listRuns()).sort((x, y) => (x.startedAt < y.startedAt ? 1 : -1)), keep = old[0] ? recoverable([old[0]])?.id : undefined;
      for (const o of old) if (o.id !== keep) await b!.deleteRun(o.id);
      await b!.putRun(run);
    });
    if (!r.ok) { degraded = r.why; b = null; }
  }
  const write = async (): Promise<void> => {
    run.updatedAt = now();
    if (b) { const r = await guard(() => b!.putRun(run)); if (!r.ok) degraded = r.why; }
  };
  const self: Session = {
    id,
    get degraded() { return degraded; },
    async add(files) {
      if (!files.length) return;
      for (const f of files) if (!order.includes(f.name)) order.push(f.name);
      run.files = order.length; run.bytes += files.reduce((n, f) => n + f.data.length, 0);
      const r = b ? await guard(() => b!.putFiles(id, files)) : ({ ok: false, why: degraded } as const);
      if (!r.ok) { degraded = r.why; for (const f of files) mem.set(f.name, f.data); }
      await write();
    },
    names: () => [...order],
    async read(name) {
      const held = mem.get(name);
      if (held) return held;
      if (!b) return null;
      const r = await guard(() => b!.readFile(id, name));
      return r.ok ? r.v : null;
    },
    async finish(status) { run.status = status; await write(); },
    zip: (at, progress) => zipStream([...order].sort(), (n) => self.read(n), at, { progress }),
    async saved() { run.savedAt = now(); await write(); },
    async discard() { mem.clear(); order.length = 0; if (b) await guard(() => b!.deleteRun(id)); },
  };
  return self;
}

/** A stored run, opened again (after a reload): its files by name, and the zip from them. */
export async function reopenSession(be: Backend, run: RunMeta): Promise<Session> {
  const names = (await be.fileNames(run.id)).sort();
  const r = { ...run };
  const self: Session = {
    id: run.id, degraded: '',
    async add() { /* a recovered run is read, not written */ },
    names: () => [...names],
    read: (n) => be.readFile(run.id, n),
    async finish() { /* as it was */ },
    zip: (at, progress) => zipStream(names, (n) => self.read(n), at, { progress }),
    async saved() { r.savedAt = new Date().toISOString(); await be.putRun(r); },
    async discard() { await be.deleteRun(run.id); },
  };
  return self;
}

/** The browser's IndexedDB as a backend, or null when there is none (or it will not open: a private window, a full disk). Files are stored as ArrayBuffers, one record each, keyed by run and name. */
export async function idbBackend(): Promise<Backend | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await new Promise<IDBDatabase | null>((ok) => {
    try {
      const q = indexedDB.open('pps-capture', 1);
      q.onupgradeneeded = () => {
        const d = q.result;
        d.createObjectStore('runs', { keyPath: 'id' });
        d.createObjectStore('files', { keyPath: ['run', 'name'] }).createIndex('run', 'run');
      };
      q.onsuccess = () => ok(q.result);
      q.onerror = () => ok(null);
      q.onblocked = () => ok(null);
    } catch { ok(null); }
  });
  if (!db) return null;
  const tx = <T>(stores: string[], mode: IDBTransactionMode, work: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> => new Promise((ok, no) => {
    const t = db.transaction(stores, mode);
    const req = work(t);
    t.oncomplete = () => ok(req ? req.result : undefined);
    t.onerror = () => no(t.error ?? new Error('storage error'));
    t.onabort = () => no(t.error ?? new Error('storage aborted (no room?)'));
  });
  const own = (d: Uint8Array): ArrayBuffer => (d.byteOffset === 0 && d.byteLength === d.buffer.byteLength ? (d.buffer as ArrayBuffer) : (d.slice().buffer as ArrayBuffer));
  return {
    async putRun(r) { await tx(['runs'], 'readwrite', (t) => { t.objectStore('runs').put(r); }); },
    async listRuns() { return (await tx<RunMeta[]>(['runs'], 'readonly', (t) => t.objectStore('runs').getAll())) ?? []; },
    async putFiles(run, files) { await tx(['files'], 'readwrite', (t) => { const s = t.objectStore('files'); for (const f of files) s.put({ run, name: f.name, data: own(f.data) }); }); },
    async fileNames(run) {
      const keys = (await tx<IDBValidKey[]>(['files'], 'readonly', (t) => t.objectStore('files').index('run').getAllKeys(IDBKeyRange.only(run)))) ?? [];
      return keys.map((k) => String((k as unknown[])[1]));
    },
    async readFile(run, name) {
      const row = await tx<{ data: ArrayBuffer } | undefined>(['files'], 'readonly', (t) => t.objectStore('files').get([run, name]));
      return row ? new Uint8Array(row.data) : null;
    },
    async deleteRun(run) {
      await tx(['files', 'runs'], 'readwrite', (t) => { t.objectStore('files').delete(IDBKeyRange.bound([run, ''], [run, '￿'])); t.objectStore('runs').delete(run); });
    },
  };
}

/** What "Recover last capture" says about a stored run, in plain words (pure). */
export function recoverLine(r: RunMeta): string {
  const mb = Math.max(0.1, Math.round(r.bytes / 1e5) / 10);
  const how = r.status === 'running' ? 'the page ended before the run did' : r.status === 'stopped' ? 'it was stopped' : 'it finished, and its zip was not saved';
  const sizes = r.sizes.length ? ` in ${r.sizes.join(', ')}` : '';
  return `The last capture: ${r.files} files (${mb} MB)${sizes}, build ${r.build}, started ${r.startedAt.slice(0, 16).replace('T', ' ')} UTC; ${how}.`;
}

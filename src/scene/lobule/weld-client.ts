// Planning the Lobule's welds takes about ten seconds of CPU (about 210 skins, each a remesh), far too long for a phone, so the plan is made once at BUILD time (scripts/bake-welds.mjs writes
// `lobule/welds.bin` into the site, weld-codec.ts) and the page only fetches and unpacks it: no planning on the phone. A file made for other numbers than this page's own (its digest) is never laid
// in. With no baked file (`npm run dev`, a build whose bake failed) the plan is made in a worker, never on the page's own thread. With no worker either (a test, an old browser) it is made where it
// is asked for, only when the caller says so (`inline`). The scene lays the plan in while the Lobule is out of sight, so nothing pops.
// The file is 1.7 MB and only the Lobule uses it, so it is NOT part of the first download: the page reads it in the quiet ladder once it is usable (a fast link,
// boot/warm.ts rung `welds`), or when the Lobule is first asked for (a dive waits
// for it behind the "Preparing the lobule" note, which shows how far it has come).
import { planWelds, type WeldCourse, type WeldPlan } from './welds.ts';
import { decodePlan, weldDigest } from './weld-codec.ts';
import { fetchBin } from '../../boot/fetch-bin.ts';

export interface WeldRequest { courses: WeldCourse[]; avoid: { x: number; y: number; r: number }[] }

/** Where the baked plan is, next to the page (the same folder in a preview and on the live site). */
export const BAKED_WELDS = 'lobule/welds.bin';

/**
 * The baked file's bytes, read and unzipped: fetched once however often it is asked (the quiet ladder asks ahead on a fast link, boot/warm.ts; the first dive asks when it is not in yet),
 * progress reported to whoever asks (0 to 1 of the file's size on the wire). Null when there is no file, no way to unzip it, or the read failed (a failed read is tried again by the next ask).
 */
let bytes: Promise<ArrayBuffer | null> | null = null;
let seen = 0;
const watchers = new Set<(k: number) => void>();
const tell = (): void => { for (const w of watchers) w(seen); };
export function weldBytes(): Promise<ArrayBuffer | null> {
  if (bytes) return bytes;
  // (a gzip file; no DecompressionStream, no baked plan: the worker plans it)
  if (typeof window === 'undefined' || typeof fetch === 'undefined' || typeof DecompressionStream === 'undefined') return (bytes = Promise.resolve(null));
  seen = 0;
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  // (by progress, and asked for once more: boot/fetch-bin.ts; the share of the file that has come is what the cue says)
  const read = fetchBin(`${env?.BASE_URL ?? '/'}${BAKED_WELDS}`, { gunzip: true, label: 'welds', onProgress: (k) => { seen = k; tell(); } }).catch(() => null);
  bytes = read.then((b) => { if (!b) bytes = null; return b; });
  return bytes;
}
/** Lets go of what was read (a test's next page). */
export function forgetWeldBytes(): void { bytes = null; seen = 0; }
/** Says how far the file has come (0 to 1) each time more of it arrives; returns the way to stop listening. */
export function watchWelds(fn: (k: number) => void): () => void { watchers.add(fn); return () => { watchers.delete(fn); }; }

async function baked(req: WeldRequest): Promise<WeldPlan | null> {
  try {
    const b = await weldBytes();
    return b ? decodePlan(b, weldDigest(req)) : null;
  } catch { return null; }
}

/** The plan baked at build time for this network, or null (no file, not this network's, no unzip). */
export const requestBakedWelds = baked;

/**
 * The plan made in a worker, never on the page's own thread (null with no worker: the Lobule then keeps its round-ended tubes). Ten seconds of CPU somewhere else: the baked
 * file is what a person waits for.
 */
export function planWeldsInWorker(req: WeldRequest): Promise<WeldPlan | null> {
  if (typeof Worker === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let w: Worker | null = null;
    try { w = new Worker(new URL('./weld-worker.ts', import.meta.url), { type: 'module' }); } catch { resolve(null); return; }
    w.onmessage = (e: MessageEvent<WeldPlan>) => { resolve(e.data); w?.terminate(); };
    w.onerror = () => { resolve(null); w?.terminate(); };
    w.postMessage(req);
  });
}

/** The plan for a network, or null when there is no baked plan and no worker to make it in (the Lobule then keeps its round-ended tubes). */
export async function requestWelds(req: WeldRequest, inline = false): Promise<WeldPlan | null> {
  if (inline) return planWelds(req.courses, { avoid: req.avoid, splay: false });
  const b = await baked(req);
  if (b) return b;
  return planWeldsInWorker(req);
}

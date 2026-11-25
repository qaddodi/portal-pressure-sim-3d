// How the page reads a data file the figure needs (the baked skins, welds and organs, organs.bin, the organs' art): by PROGRESS, never by the clock (independent review, F11 and F12).
// A slow phone on a slow line keeps a download that keeps arriving, however long it takes; a download that stops is given up on after BIN_QUIET_MS of no bytes at all, counted in poll steps
// (as boot/ready.ts watchStall does), so a main thread that was busy for seconds never makes the quiet time look longer than it was.
// A file that fails for a reason that may pass (the network, a 5xx, a stall) is asked for once more; a 4xx means the file is not there, and the caller's own fallback takes over at once.
// After the retry the error is thrown, and whoever needed the file says so in plain words (the callers: scene/organs/meshes.ts, scene/organs/organ-art.ts), or plans live (the baked skins, the welds).
import { clock, type TimerId } from '../clock/frame.ts';
import { spanAsync } from './spans.ts';

/** No bytes for this long: the download is stuck and is dropped (then asked for once more). Bytes arriving keep it alive for as long as they take. */
export const BIN_QUIET_MS = 8000;
/** The pause before the one more try (a network that just dropped needs a moment). */
export const BIN_RETRY_PAUSE_MS = 600;
const POLL_MS = 500;

export interface FetchBinOptions {
  /** The file is gzip: it is gunzipped as it comes (the baked files). */
  gunzip?: boolean;
  /** The name `?perf` shows for the fetch span (default: the address). */
  label?: string;
  quietMs?: number;
  /** Tries after the first one (default 1). */
  retries?: number;
}

/** Aborts `ctl` once `quietMs` of poll steps go by with no `seen()`. */
function quietWatch(ctl: AbortController, quietMs: number, what: string): { seen(): void; stop(): void } {
  const step = Math.min(POLL_MS, Math.max(10, quietMs / 4));
  let quiet = 0, timer: TimerId | undefined, off = false;
  const poll = (): void => {
    if (off) return;
    quiet += step;
    if (quiet >= quietMs) { ctl.abort(new Error(`${what}: no bytes for ${Math.round(quietMs / 1000)} s`)); return; }
    timer = clock.afterReal(poll, step, 'fetch-quiet');
  };
  timer = clock.afterReal(poll, step, 'fetch-quiet');
  return { seen: () => { quiet = 0; }, stop: () => { off = true; clock.cancel(timer); } };
}

const retryable = (status: number): boolean => status >= 500 || status === 408 || status === 429;

/** One try: the whole file, or null when it is not there (a 4xx), or an error (the network, a 5xx, a stall). */
async function attempt(url: string, gunzip: boolean, quietMs: number): Promise<ArrayBuffer | null> {
  const ctl = new AbortController();
  const watch = quietWatch(ctl, quietMs, url);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) { if (retryable(r.status)) throw new Error(`${url} ${r.status}`); return null; }
    watch.seen();   // (the headers are bytes too: the body's first chunk gets the same quiet time)
    if (!r.body) return await r.arrayBuffer();   // (an old browser with no streaming body: no progress to watch, the whole file or an error)
    const reader = (gunzip ? r.body.pipeThrough(new DecompressionStream('gzip')) : r.body).getReader();
    const chunks: Uint8Array[] = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); n += value.byteLength; watch.seen();
    }
    const out = new Uint8Array(n); let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.byteLength; }
    return out.buffer;
  } catch (e) {
    ctl.abort();   // (frees the connection; the quiet watch's own abort carries the reason, which is what the caller reads)
    throw e;
  } finally { watch.stop(); }
}

/** The file's bytes (gunzipped when asked), or null when the file is not there (a 4xx: the caller's fallback), or throws what the last try failed with, after the one more try. */
export async function fetchBin(url: string, o: FetchBinOptions = {}): Promise<ArrayBuffer | null> {
  const { gunzip = false, label = url, quietMs = BIN_QUIET_MS, retries = 1 } = o;
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    if (i > 0) await new Promise<void>((done) => { clock.afterReal(done, BIN_RETRY_PAUSE_MS, 'fetch-retry'); });
    try { return await spanAsync(`fetch:${label}`, () => attempt(url, gunzip, quietMs)); } catch (e) {
      last = e;
      console.warn(`[boot] ${label}: try ${i + 1} of ${retries + 1} failed:`, e instanceof Error ? e.message : e);
    }
  }
  throw last instanceof Error ? last : new Error(`${label} did not load`);
}

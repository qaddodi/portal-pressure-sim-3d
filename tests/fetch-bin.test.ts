// How the page reads a data file (src/boot/fetch-bin.ts, independent review F11 and F12): by progress, never by the clock; asked once more when it fails; null when the file is not there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { fetchBin, BIN_QUIET_MS } from '../src/boot/fetch-bin.ts';
import { reportFileLoss, useFileLoss } from '../src/scene/file-loss.ts';

const real = globalThis.fetch;
const quiet = (): void => { console.warn = () => undefined; };
/** A body that hands out `parts` one after another, `gap` ms apart (a slow line), or never ends when `stall` is set after the parts. */
const slowBody = (parts: Uint8Array[], gap: number, stall = false, signal?: AbortSignal): Response => {
  let i = 0;
  return new Response(new ReadableStream<Uint8Array>({
    start(c) { signal?.addEventListener('abort', () => c.error(signal.reason ?? new Error('aborted'))); },   // (a real body errors when its fetch is aborted)
    async pull(c) {
      if (i < parts.length) { await new Promise((r) => setTimeout(r, gap)); c.enqueue(parts[i++]!); return; }
      if (stall) await new Promise(() => undefined);
      c.close();
    },
  }));
};
const bytes = (n: number, v = 7): Uint8Array => new Uint8Array(n).fill(v);

test('a download that keeps arriving is waited for however long it takes (progress, not the clock)', async () => {
  quiet();
  // 8 parts, 120 ms apart: about a second in all, with a quiet limit of 400 ms. A total-time bound of 400 ms would have cut it.
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => slowBody(Array.from({ length: 8 }, () => bytes(1000)), 120, false, init?.signal ?? undefined)) as typeof fetch;
  const t0 = Date.now();
  const buf = await fetchBin('/x.bin', { quietMs: 400, retries: 0 });
  assert.equal(buf!.byteLength, 8000);
  assert.ok(Date.now() - t0 > 800, 'it took longer than the quiet limit');
  globalThis.fetch = real;
});

test('a download that stops is given up on after the quiet time, asked for once more, then thrown', async () => {
  quiet();
  let asked = 0;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => { asked++; return slowBody([bytes(100)], 10, true, init?.signal ?? undefined); }) as typeof fetch;
  await assert.rejects(fetchBin('/stuck.bin', { quietMs: 300 }), /no bytes/);
  assert.equal(asked, 2, 'one try and one more');
  globalThis.fetch = real;
});

test('a first failure that passes: the one more try delivers the file', async () => {
  quiet();
  let asked = 0;
  globalThis.fetch = (async () => { if (++asked === 1) throw new TypeError('network down'); return new Response(new Blob([new Uint8Array(10)])); }) as typeof fetch;
  const buf = await fetchBin('/flaky.bin', { quietMs: 300 });
  assert.equal(buf!.byteLength, 10); assert.equal(asked, 2);
  globalThis.fetch = real;
});

test('a 5xx is retried; a 4xx is the file not being there: null at once, no retry', async () => {
  quiet();
  let asked = 0;
  globalThis.fetch = (async () => { asked++; return new Response('nope', { status: 503 }); }) as typeof fetch;
  await assert.rejects(fetchBin('/down.bin', { quietMs: 300 }), /503/); assert.equal(asked, 2);
  asked = 0;
  globalThis.fetch = (async () => { asked++; return new Response('gone', { status: 404 }); }) as typeof fetch;
  assert.equal(await fetchBin('/missing.bin', { quietMs: 300 }), null); assert.equal(asked, 1);
  globalThis.fetch = real;
});

test('gunzip: the baked files come out unzipped', async () => {
  quiet();
  const raw = Buffer.from('SKB1 and then some numbers'.repeat(50));
  globalThis.fetch = (async () => new Response(gzipSync(raw))) as typeof fetch;
  const buf = await fetchBin('/z.bin', { gunzip: true, quietMs: 300 });
  assert.equal(Buffer.from(buf!).toString(), raw.toString());
  globalThis.fetch = real;
});

test('a file that failed is said, once, for the note over the figure', () => {
  useFileLoss.setState({ lost: [] });
  reportFileLoss('organs'); reportFileLoss('organs'); reportFileLoss('organ-art');
  assert.deepEqual(useFileLoss.getState().lost, ['organs', 'organ-art']);
  useFileLoss.setState({ lost: [] });
});

test('the quiet time is a real wait on the network, not a hair trigger', () => {
  assert.ok(BIN_QUIET_MS >= 5000);
});

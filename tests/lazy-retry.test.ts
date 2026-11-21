// A part that loads on demand is fetched again, then named in words (P0-2): lazyRetry/retryImport, the pane boundary, and no bare React.lazy left in src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ChunkError, RETRY_DELAYS_MS, chunkProblem, retryImport } from '../src/boot/lazy-retry.ts';

const noWait = async () => undefined;
test('a load that fails twice then works resolves, after two waits', async () => {
  let n = 0; const waits: number[] = [];
  const v = await retryImport(async () => { if (++n < 3) throw new Error('Failed to fetch'); return 'ok'; }, { wait: async (ms) => { waits.push(ms); } });
  assert.equal(v, 'ok'); assert.equal(n, 3); assert.deepEqual(waits, [...RETRY_DELAYS_MS]);
});
test('a load that fails three times is a ChunkError, after exactly three tries', async () => {
  let n = 0;
  await assert.rejects(retryImport(async () => { n++; throw new Error('Failed to fetch dynamically imported module'); }, { wait: noWait }), (e: unknown) => e instanceof ChunkError && /3 tries/.test(e.message) && /Failed to fetch/.test(e.message));
  assert.equal(n, 3);
});
test('a ChunkError from an inner retry is not retried again by an outer one (no 3 x 3)', async () => {
  let n = 0;
  await assert.rejects(retryImport(() => retryImport(async () => { n++; throw new Error('x'); }, { wait: noWait }), { wait: noWait }), ChunkError);
  assert.equal(n, 3);
});
test('the words: offline, a newer build, plain failure, and a pane that threw', () => {
  const e = (offline: boolean, stale: boolean) => new ChunkError('x', offline, stale);
  assert.deepEqual(chunkProblem(e(false, false), { online: false, stale: false }), { text: 'This part needs a connection.', reload: false, again: true });
  assert.deepEqual(chunkProblem(e(true, false), { online: true, stale: false }), { text: 'This part needs a connection.', reload: false, again: true });
  const n = chunkProblem(e(false, false), { online: true, stale: true });
  assert.ok(n.reload && !n.again && /newer version/.test(n.text));
  const p = chunkProblem(e(false, false), { online: true, stale: false });
  assert.ok(p.reload && p.again);
  assert.deepEqual(chunkProblem(new TypeError('boom'), { online: true }), { text: 'This part stopped. Try again.', reload: false, again: true });
});

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = walk('src').filter((f) => !f.includes(join('src', 'engine', 'hales')) && !f.includes(join('src', 'engine', 'host')));

test('src/ has no bare React.lazy: every lazy component is lazyRetry (apply everywhere)', () => {
  const bad = src.filter((f) => f !== join('src', 'boot', 'lazy-retry.ts') && (/\blazy\s*\(/.test(strip(readFileSync(f, 'utf8'))) || /import\s*\{[^}]*\blazy\b[^}]*\}\s*from\s*'react'/.test(readFileSync(f, 'utf8'))));
  assert.deepEqual(bad, []);
});
test('every instrument loader goes through retryImport, and every lazy pane sits in a LazyBoundary, not a bare Suspense', () => {
  const l = readFileSync('src/ui/tests/dock/lazy.ts', 'utf8');
  const loaders = l.slice(l.indexOf('export const LOADERS'), l.indexOf('} as const'));
  const lines = loaders.split('\n').filter((x) => /import\(/.test(x));
  assert.ok(lines.length >= 6);
  for (const x of lines) assert.match(x, /retryImport\(/, x);
  for (const f of ['src/ui/tests/TestsLayer.tsx', 'src/ui/talk/ToolCardBody.tsx', 'src/ui/tests/trace/PressureTab.tsx']) {
    const t = readFileSync(f, 'utf8');
    assert.ok(!/<Suspense/.test(t), `${f} has a bare Suspense`);
    assert.match(t, /<LazyBoundary>/, f);
  }
});
test('main.tsx hears vite:preloadError without swallowing it, and offers the update toast once', () => {
  const m = readFileSync('src/main.tsx', 'utf8');
  assert.match(m, /addEventListener\('vite:preloadError'/);
  assert.ok(!/preventDefault/.test(m.slice(m.indexOf('vite:preloadError'), m.indexOf('vite:preloadError') + 500)), 'the rejection reaches lazyRetry and the pane boundary');
  assert.match(m, /markStale\(\)/); assert.match(m, /UPDATE_TOAST/);
});

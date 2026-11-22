// The ?geom=net corner badge and the loader's reasons: a tester who sees no difference can tell which mesh is drawn. Node only (no DOM: the badge records its state, the page shows it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { netBadge, netBadgeText, showNetBadge } from '../src/scene/vessels/net/badge.ts';
import { loadNetResult } from '../src/scene/vessels/net/load.ts';

test('the badge says network, loading, or fallback with its reason (trimmed), and is recorded without a document', () => {
  assert.equal(netBadgeText('network'), 'Mesh: network');
  assert.equal(netBadgeText('loading'), 'Mesh: loading network');
  assert.equal(netBadgeText('fallback', 'net-1.bin: HTTP 404'), 'Mesh: fallback (net-1.bin: HTTP 404)');
  assert.equal(netBadgeText('fallback'), 'Mesh: fallback');
  assert.ok(netBadgeText('fallback', 'x'.repeat(400)).length < 170, 'a long reason is cut');
  showNetBadge('fallback', 'why'); assert.deepEqual(netBadge(), { state: 'fallback', text: 'Mesh: fallback (why)' });
  showNetBadge('network'); assert.equal(netBadge()?.state, 'network');
});

test('files the deploy did not carry (HTTP 404) come back as a reason naming the file and the address', async () => {
  const real = globalThis.fetch, warn = console.warn;
  const seen: string[] = [];
  globalThis.fetch = (async (u: string) => { seen.push(String(u)); return { ok: false, status: 404, body: null }; }) as unknown as typeof fetch;
  console.warn = () => undefined;
  try {
    const r = await loadNetResult('./');
    assert.equal(r.data, null);
    assert.match(r.why, /^anatomy\/net-\d+\.bin: HTTP 404 \(\.\/anatomy\/net-\d+\.bin\)/);
    assert.ok(seen.length >= 16 && seen.every((u) => u.startsWith('./anatomy/net-')), 'one fetch per network, from the page\'s own base');
  } finally { globalThis.fetch = real; console.warn = warn; }
});

test('a network error is a reason too, not a silent null', async () => {
  const real = globalThis.fetch, warn = console.warn;
  globalThis.fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  console.warn = () => undefined;
  try { const r = await loadNetResult('./'); assert.equal(r.data, null); assert.match(r.why, /net-\d+\.bin: offline/); } finally { globalThis.fetch = real; console.warn = warn; }
});

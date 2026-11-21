import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The copy of hales-engine (core, portal and the host) is never edited by hand: every file must match the hash scripts/sync-engine.mjs recorded.
const pinned = JSON.parse(readFileSync('src/engine/PINNED.json', 'utf8')) as { engine: { commit: string }; files: Record<string, string> };

test('the pin names the engine commit (the simulation host is the engine itself: hales/host)', () => {
  assert.match(pinned.engine.commit, /^[0-9a-f]{40}$/);
  assert.ok(!('host' in pinned), 'no entry for the 2D app: the host is in hales-engine');
  assert.ok('hales/host/worker-core.js' in pinned.files && 'hales/host/protocol.d.ts' in pinned.files);
});

test('every vendored file matches its recorded hash', () => {
  const changed: string[] = [];
  for (const [path, hash] of Object.entries(pinned.files)) {
    const text = readFileSync(`src/engine/${path}`, 'utf8');
    if (createHash('sha256').update(text).digest('hex') !== hash) changed.push(path);
  }
  assert.deepEqual(changed, [], 'edit hales-engine and run npm run sync:engine, not the copy');
});

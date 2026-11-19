import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The copy of hales-engine and the host is never edited by hand: every file must match the hash scripts/sync-engine.mjs recorded.
const pinned = JSON.parse(readFileSync('src/engine/PINNED.json', 'utf8')) as { engine: { commit: string }; host: { commit: string }; files: Record<string, string> };

test('the pin names a commit for the engine and for the host', () => {
  assert.match(pinned.engine.commit, /^[0-9a-f]{40}$/);
  assert.match(pinned.host.commit, /^[0-9a-f]{40}$/);
});

test('every vendored file matches its recorded hash', () => {
  const changed: string[] = [];
  for (const [path, hash] of Object.entries(pinned.files)) {
    const text = readFileSync(`src/engine/${path}`, 'utf8');
    if (createHash('sha256').update(text).digest('hex') !== hash) changed.push(path);
  }
  assert.deepEqual(changed, [], 'edit hales-engine and run npm run sync:engine, not the copy');
});

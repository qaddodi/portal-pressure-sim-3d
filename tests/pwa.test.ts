// Offline: the worker the build writes names its cache as the build pill expects, holds every built file, and the page falls back to its cache; no WebGL 2 shows the 2D link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSw, listFiles } from '../scripts/pwa.mjs';
import { cachePrefix } from '../src/ui/shell/build-pill.ts';
import { hasWebGL2 } from '../src/boot/webgl.ts';
import { NO_WEBGL } from '../src/ui/shell/words.ts';

test('listFiles gives every built file, slash-separated, without the worker or the build note', () => {
  const d = mkdtempSync(join(tmpdir(), 'pwa-'));
  mkdirSync(join(d, 'assets')); mkdirSync(join(d, 'brand'));
  for (const f of ['index.html', 'assets/a-123.js', 'brand/icon-192.png', 'sw.js', 'build-info.txt', 'manifest.webmanifest']) writeFileSync(join(d, f), 'x');
  assert.deepEqual(listFiles(d), ['assets/a-123.js', 'brand/icon-192.png', 'index.html', 'manifest.webmanifest']);
});

test('the worker\'s cache is one per scope and build, with the prefix the build pill drops', () => {
  const sw = buildSw({ build: 'abc1234', files: ['index.html', 'assets/a-1.js'] });
  assert.ok(sw.includes('const BUILD = "abc1234"'));
  assert.ok(sw.includes('"assets/a-1.js"'));
  assert.ok(sw.includes("'pps3d@' + SCOPE.pathname + '@'"));
  assert.equal(cachePrefix('https://x.test/portal-pressure-sim-3d/preview/?a=1'), 'pps3d@/portal-pressure-sim-3d/preview/@');
  assert.ok(sw.includes('caches.match(HOME)'), 'offline: the front page comes from the cache');
  assert.ok(sw.includes('skipWaiting') && sw.includes('clients.claim'));
  assert.doesNotThrow(() => new Function(sw));
});

test('where the browser has no WebGL 2 the page says so and links the 2D simulator', () => {
  assert.equal(hasWebGL2(() => ({ getContext: () => null })), false);
  assert.equal(hasWebGL2(() => ({ getContext: () => { throw new Error('no'); } })), false);
  assert.equal(hasWebGL2(() => ({ getContext: (id) => (id === 'webgl2' ? {} : null) })), true);
  assert.match(NO_WEBGL.href, /^https:\/\/qaddodi\.github\.io\/portal-pressure-simulator\/$/);
});

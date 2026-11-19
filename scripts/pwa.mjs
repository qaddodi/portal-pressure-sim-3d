#!/usr/bin/env node
// Offline: writes dist/sw.js, a service worker that holds every built file (the build's file names are hashed, so a cache is one build). Run by scripts/build.mjs after vite.
// One cache per copy of the site (the live site and /preview/ each have their own scope), named `pps3d@<scope path>@<build>`. A new build installs its cache, takes over, and
// drops the older ones except the one before it (a tab still open on it keeps working). The build pill (src/ui/shell/BuildPill.tsx) drops this copy's worker and caches to
// load the newest build at once. Pages (navigations) are network first (a new build shows when online) and fall back to the cache when offline.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Every file under `dir` as a path relative to it, '/'-separated, without the worker itself or the build note. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p).split('\\').join('/')); } };
  walk(dir);
  return out.filter((f) => f !== 'sw.js' && f !== 'build-info.txt').sort();
}

export function buildSw({ build, files }) {
  return `// Portal Pressure 3D service worker, build ${build}. Written by scripts/pwa.mjs; do not edit.
const BUILD = ${JSON.stringify(build)};
const FILES = ${JSON.stringify(files)};
const SCOPE = new URL('./', self.registration.scope);
const PREFIX = 'pps3d@' + SCOPE.pathname + '@';
const NAME = PREFIX + BUILD;
const URLS = FILES.map((f) => new URL(f, SCOPE).href);
const HOME = new URL('index.html', SCOPE).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(NAME).then((c) => c.addAll(URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== NAME);
    // keep the one build before this (a tab still open on it); drop the rest
    const order = keys.sort();
    await Promise.all(order.slice(0, Math.max(0, order.length - 1)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (req.mode === 'navigate') {
    // only this copy's own front page; another copy under this one (the /preview/ folder of the live site) is its own worker's
    const home = url.pathname === SCOPE.pathname || url.pathname === SCOPE.pathname + 'index.html';
    if (!home) return;
    e.respondWith((async () => {
      try { return await Promise.race([fetch(req), new Promise((_, no) => setTimeout(no, 4000))]); }
      catch { return (await caches.match(HOME)) || (await caches.match(req)) || Response.error(); }
    })());
    return;
  }
  const bare = url.origin + url.pathname;
  if (!URLS.includes(bare)) return;
  e.respondWith(caches.match(bare).then((hit) => hit || fetch(req)));
});
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url));
  const build = process.argv[3] ?? 'local';
  const files = listFiles(dist);
  writeFileSync(join(dist, 'sw.js'), buildSw({ build, files }));
  console.log(`sw.js: ${files.length} files, build ${build}`);
}

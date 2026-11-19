#!/usr/bin/env node
// Offline: writes dist/sw.js, a service worker that holds every built file (the build's file names are hashed, so a cache is one build). Run by scripts/build.mjs after vite.
// One cache per copy of the site (the live site and /preview/ each have their own scope), named `pps3d@<scope path>@<build>`.
// The files are held in the order the app needs them (orderFiles): the page, then what it loads before its first picture (the entry, the chunks it imports
// statically, the style sheets, the engine's worker, the fonts, the organ data), then the parts opened later (lazy chunks). Install is the first list only, file by
// file, each asked again on a failed answer and skipped when already held, so an install cut short goes on from where it stopped and a worker that is active can
// always start the app offline. The second list is filled once the page is quiet ('pps:fill', src/pwa/register.ts), and any of it asked for before then is kept as it is served.
// A new build installs its cache, takes over, and drops the older ones except the newest of them (a tab still open on it keeps finding its own files). "Newest" is the
// order the caches were made in (caches.keys() lists them so), never the order of their names: a name ends in a commit hash, and hashes do not sort by date.
// The build pill (src/ui/shell/BuildPill.tsx) drops this copy's worker and caches to load the newest build at once. Pages (navigations) are network first
// (a new build shows when online) and fall back to this build's page when offline.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Every file under `dir` as a path relative to it, '/'-separated, without the worker itself, the build note and the tester guides (two 2.6 MB PDFs testers open from a link: not worth holding offline). */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p).split('\\').join('/')); } };
  walk(dir);
  return out.filter((f) => f !== 'sw.js' && f !== 'build-info.txt' && !f.startsWith('guides/')).sort();
}

const isText = (f) => /\.(html|js|mjs|css)$/.test(f);
/** What one built file needs before it can run: a page's scripts, preloads, style sheets and icons; a script's static imports, its workers (`new URL(…, import.meta.url)`) and
 *  the public files it names (the organ data); a style sheet's `url(…)` files. A dynamic `import(…)` is not a need: that is a part opened later. */
function needsOf(file, text, files) {
  const dir = posix.dirname(file), out = [];
  const add = (ref) => { const p = posix.normalize(posix.join(dir, ref.split(/[?#]/)[0])); if (files.has(p)) out.push(p); };
  if (file.endsWith('.html')) for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) add(m[1]);
  else if (file.endsWith('.css')) for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) { if (!/^(data:|#|https?:)/.test(m[1])) add(m[1]); }
  else {
    for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*(["'`])(\.{1,2}\/[^"'`]+)\1/g)) add(m[2]);
    for (const m of text.matchAll(/new URL\(\s*(["'`])([^"'`]+)\1\s*,\s*import\.meta\.url\s*\)/g)) add(m[2]);
    for (const f of files) if (!f.startsWith('assets/') && f.includes('/') && isText(file) && text.includes(f)) out.push(f);   // (a public file a boot script fetches by name: anatomy/organs.bin)
  }
  return out;
}

/** The built files in the order the app needs them. `boot`: the page first, then everything it loads before the first picture, in the order met; `later`: the rest.
 *  `read(file)` gives a file's text (the build's own files; a test hands a table). */
export function orderFiles(files, read, page = 'index.html') {
  const all = new Set(files), boot = [], seen = new Set();
  const visit = (f) => {
    if (seen.has(f)) return;
    seen.add(f); boot.push(f);
    if (isText(f)) for (const n of needsOf(f, read(f), all)) visit(n);
  };
  if (all.has(page)) visit(page);
  return { boot, later: files.filter((f) => !seen.has(f)) };
}

/** The worker's text. `boot` and `later` are orderFiles' two lists (left out: every file is a boot file).
 *  @param {{ build: string, files: string[], boot?: string[], later?: string[] }} o */
export function buildSw({ build, files, boot = files, later = [] }) {
  return `// Portal Pressure 3D service worker, build ${build}. Written by scripts/pwa.mjs; do not edit.
const BUILD = ${JSON.stringify(build)};
const BOOT = ${JSON.stringify(boot)};
const LATER = ${JSON.stringify(later)};
const SCOPE = new URL('./', self.registration.scope);
const PREFIX = 'pps3d@' + SCOPE.pathname + '@';
const NAME = PREFIX + BUILD;
const href = (f) => new URL(f, SCOPE).href;
const URLS = new Set(BOOT.concat(LATER).map(href));
const HOME = href('index.html');

// A file asked again on a failed answer (right after a deploy an edge of the host can still be on the old site), up to three more times, past the HTTP cache.
const pull = async (url) => { let res; for (let i = 0; i < 4; i++) { try { res = await fetch(url, i ? { cache: 'reload' } : undefined); if (res.status < 400) return res; } catch (err) { if (i === 3) throw err; } await new Promise((r) => setTimeout(r, 400 * 2 ** i)); } return res; };
// Put one file in this build's cache unless it is there. \`must\`: a failure stops the install; otherwise it is left for the next fill.
const hold = async (c, f, must) => {
  const url = href(f);
  if (await c.match(url)) return;
  try { const res = await pull(url); if (res.status !== 200) throw new Error('sw: ' + f + ' ' + res.status); await c.put(url, res); }
  catch (err) { if (must) throw err; }
};
// In list order, a few at a time: what the app needs first is held first.
const holdAll = async (list, must) => { const c = await caches.open(NAME); let i = 0; const lane = async () => { while (i < list.length) await hold(c, list[i++], must); }; await Promise.all([lane(), lane(), lane(), lane()]); };

self.addEventListener('install', (e) => { e.waitUntil(holdAll(BOOT, true).then(() => self.skipWaiting())); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // keys() lists caches in the order they were made: the last of the older ones is the build before this (a tab still open on it); the rest go
    const older = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== NAME);
    await Promise.all(older.slice(0, -1).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 'pps:fill': the page is quiet, hold the parts opened later. 'pps:files': which files this build holds (the page tells an update that changed its files from one it already runs).
self.addEventListener('message', (e) => {
  if (e.data === 'pps:files' && e.ports[0]) e.ports[0].postMessage(BOOT.concat(LATER));
  else if (e.data === 'pps:fill') e.waitUntil(holdAll(LATER, false).catch(() => {}));
});

// This build's copy, else the copy of the build before it (an older tab asks for its own hashed files, which the server no longer has). Only this scope's caches.
const held = async (url) => {
  const own = await (await caches.open(NAME)).match(url);
  if (own) return own;
  for (const k of (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== NAME).reverse()) { const hit = await (await caches.open(k)).match(url); if (hit) return hit; }
  return undefined;
};

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
      catch { return (await held(HOME)) || Response.error(); }
    })());
    return;
  }
  const bare = url.origin + url.pathname;
  const mine = URLS.has(bare);
  if (!mine && !url.pathname.startsWith(SCOPE.pathname + 'assets/')) return;
  e.respondWith((async () => {
    const hit = await held(bare);
    if (hit) return hit;
    const res = await fetch(req);
    // a file of this build asked for before the fill reached it is kept as it is served
    if (mine && res.status === 200 && res.type === 'basic') { const copy = res.clone(); e.waitUntil(caches.open(NAME).then((c) => c.put(bare, copy)).catch(() => {})); }
    return res;
  })());
});
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url));
  const build = process.argv[3] ?? 'local';
  const files = listFiles(dist);
  const { boot, later } = orderFiles(files, (f) => readFileSync(join(dist, f), 'utf8'));
  writeFileSync(join(dist, 'sw.js'), buildSw({ build, files, boot, later }));
  const kb = (list) => Math.round(list.reduce((a, f) => a + statSync(join(dist, f)).size, 0) / 1024);
  console.log(`sw.js: ${files.length} files, build ${build}; held at install (before the first picture): ${boot.length} files, ${kb(boot)} kB; filled when quiet: ${later.length} files, ${kb(later)} kB`);
}

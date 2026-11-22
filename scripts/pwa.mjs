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
// (a new build shows when online) and fall back to this build's page when offline, or when the network says nothing for 1.5 s and a copy is held (NAV_WAIT_MS: a bad signal does not keep a
// phone on the splash; with no copy held the page waits for the network). The fill of the parts opened later is skipped on Save-Data or a 2g link (fetched on use and kept, as before).
// Navigation preload is NOT used: the preload request obeys the HTTP cache, and the host lets a browser keep the page ten minutes, which is the stale-build bug the no-cache fetch below was written against.
// The build also writes the byte total of the install list into the page (<meta name="pps-boot-bytes">, stampBootBytes): index.html's wait bar fills with the bytes that arrived against it.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Every file under `dir` as a path relative to it, '/'-separated, without the worker itself, the build note the tester guides (two 2.6 MB PDFs testers open from a link: not worth holding offline)
 *  and the printed notes' pictures (brand/handout/, 14 MB, asked for only when a person prints a talk's notes: never part of the first load or of an install). */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p).split('\\').join('/')); } };
  walk(dir);
  return out.filter((f) => f !== 'sw.js' && f !== 'build-info.txt' && !f.startsWith('guides/') && !f.startsWith('brand/handout/')).sort();
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

/** Files the first picture does not need, kept out of the install list whatever names them (a boot script's string or `new URL` names them, but the page asks for them only later, or never on most devices):
 *  the Lobule's baked weld plan and the worker that plans it when there is none (asked ~3 s after the first picture, src/scene/micro3d/lobule3d.ts WELDS_ASK_MS), and the fonts' other alphabets
 *  (the browser fetches one only when a character in its range is drawn). They are filled when the page is quiet, and a page that asks first is served from the network and keeps the copy. */
export const LATE = [/^lobule\//, /^assets\/weld-worker-[^/]*\.js$/, /^fonts\/.*-(?:latin-ext|greek|greek-ext|cyrillic|cyrillic-ext|vietnamese)\.woff2$/];
export const isLate = (f) => LATE.some((re) => re.test(f));

/** What `list` costs on the wire, in bytes: text is sent gzipped by the host (Pages), the .bin data is already compressed or int16 and goes as it is. `read(file)` gives a file's bytes. */
export function wireBytes(list, read) {
  return list.reduce((a, f) => { const b = read(f); return a + (/\.(html|js|mjs|css|json|svg|webmanifest)$/.test(f) ? gzipSync(b).length : b.length); }, 0);
}
const BOOT_META = /(<meta name="pps-boot-bytes" content=")\d*(">)/;
/** The page with the install list's byte total written into its `pps-boot-bytes` meta (index.html reads it for the wait bar). A page without the meta is an error: the bar would never fill. */
export function stampBootBytes(html, bytes) {
  if (!BOOT_META.test(html)) throw new Error('pwa: index.html has no <meta name="pps-boot-bytes">');
  return html.replace(BOOT_META, `$1${Math.round(bytes)}$2`);
}

/** The built files in the order the app needs them. `boot`: the page first, then everything it loads before the first picture, in the order met; `later`: the rest.
 *  `read(file)` gives a file's text (the build's own files; a test hands a table). */
export function orderFiles(files, read, page = 'index.html') {
  const all = new Set(files), boot = [], seen = new Set();
  const visit = (f) => {
    if (seen.has(f) || isLate(f)) return;
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
// How long a page waits for the network before the held copy is shown, when one is held (the install holds one, so only a first visit waits for the network alone).
const NAV_WAIT_MS = 1500;
// Save-Data on, or a 2g link: the parts opened later are not filled in the background (they are fetched on use and kept, as ever). iOS's Low Data Mode is not visible to a page; Chrome's Data Saver is.
const lowData = () => { const c = self.navigator && self.navigator.connection; return !!c && (c.saveData === true || /^(slow-)?2g$/.test(c.effectiveType || '')); };

// A file asked again on a failed answer (right after a deploy an edge of the host can still be on the old site), up to three more times, past the HTTP cache.
// (A file whose name carries no hash (the page, the manifest, the data) is asked past the HTTP cache: the host lets a browser keep it ten minutes, and the page held at install was an old one.)
const hashed = (url) => url.includes("/assets/");
const pull = async (url) => { let res; for (let i = 0; i < 4; i++) { try { res = await fetch(url, i ? { cache: 'reload' } : hashed(url) ? undefined : { cache: 'no-cache' }); if (res.status < 400) return res; } catch (err) { if (i === 3) throw err; } await new Promise((r) => setTimeout(r, 400 * 2 ** i)); } return res; };
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
  else if (e.data === 'pps:fill' && !lowData()) e.waitUntil(holdAll(LATER, false).catch(() => {}).then(() => e.ports[0]?.postMessage('filled')));
});

// This build's copy, else (when older is true) the copy of the build before it (an older tab asks for its own hashed files, which the server no longer has). Only this scope's caches.
const held = async (url, older = true) => {
  const own = await (await caches.open(NAME)).match(url);
  if (own || !older) return own;
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
      // (past the HTTP cache, as 2D's worker: the host lets a browser keep the page ten minutes, which showed the build before the one just deployed)
      const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
      const copy = await held(HOME);   // (a cache read: a few ms, while the network is already on its way)
      if (!copy) return net.catch(() => Response.error());
      try { return await Promise.race([net, new Promise((_, no) => setTimeout(no, NAV_WAIT_MS))]); }
      catch { return copy; }
    })());
    return;
  }
  const bare = url.origin + url.pathname;
  const mine = URLS.has(bare);
  if (!mine && !url.pathname.startsWith(SCOPE.pathname + 'assets/')) return;
  // A hashed file (assets/) never changes under its name, so the build before may serve it to a tab that still runs it. A file whose name carries no hash (the baked meshes, the organ data) changes under
  // its name: the build before holds the OLD one, so it is never served in this build's place (22 Nov: ?geom=net was refused on a phone for the network meshes of the build before, 10 minutes and a deploy
  // after they were rebaked). Such a file comes from this build's own copy, else from the network past the HTTP cache (the host lets a browser keep it ten minutes), and the build before only answers offline.
  const hashedAsset = url.pathname.startsWith(SCOPE.pathname + 'assets/');
  e.respondWith((async () => {
    const hit = await held(bare, hashedAsset);
    if (hit) return hit;
    let res;
    try { res = await fetch(hashedAsset ? req : req.url, hashedAsset ? undefined : { cache: 'no-cache', credentials: 'same-origin' }); }
    catch (err) { const old = hashedAsset ? undefined : await held(bare); if (old) return old; throw err; }
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
  // the page's wait bar knows what the first picture costs: the install list's bytes on the wire, written into the page before the worker lists it
  writeFileSync(join(dist, 'index.html'), stampBootBytes(readFileSync(join(dist, 'index.html'), 'utf8'), wireBytes(boot, (f) => readFileSync(join(dist, f)))));
  writeFileSync(join(dist, 'sw.js'), buildSw({ build, files, boot, later }));
  const kb = (list) => Math.round(list.reduce((a, f) => a + statSync(join(dist, f)).size, 0) / 1024);
  // what a first visit downloads: text is sent gzipped by the host (Pages); the .bin data is already compressed or int16, sent as it is
  const wire = (list) => Math.round(wireBytes(list, (f) => readFileSync(join(dist, f))) / 1024);
  console.log(`sw.js: ${files.length} files, build ${build}; held at install (before the first picture): ${boot.length} files, ${kb(boot)} kB on disk, about ${wire(boot)} kB on the wire; filled when quiet: ${later.length} files, ${kb(later)} kB on disk, about ${wire(later)} kB on the wire`);
}

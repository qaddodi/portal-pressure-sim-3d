// Offline: the worker the build writes names its cache as the build pill expects, holds every built file, and the page falls back to its cache; no WebGL 2 shows the 2D link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildSw, listFiles, orderFiles } from '../scripts/pwa.mjs';
import { isUpdate, mayRegister } from '../src/pwa/register.ts';
import { cachePrefix } from '../src/ui/shell/build-pill.ts';
import { hasWebGL2 } from '../src/boot/webgl.ts';
import { NO_WEBGL } from '../src/ui/shell/words.ts';

test('listFiles gives every built file, slash-separated, without the worker or the build note', () => {
  const d = mkdtempSync(join(tmpdir(), 'pwa-'));
  mkdirSync(join(d, 'assets')); mkdirSync(join(d, 'brand'));
  for (const f of ['index.html', 'assets/a-123.js', 'brand/icon-192.png', 'sw.js', 'build-info.txt', 'manifest.webmanifest']) writeFileSync(join(d, f), 'x');
  assert.deepEqual(listFiles(d), ['assets/a-123.js', 'brand/icon-192.png', 'index.html', 'manifest.webmanifest']);
});

test('the tester guides are served but not held offline', () => {
  const d = mkdtempSync(join(tmpdir(), 'pwa-'));
  mkdirSync(join(d, 'guides'));
  for (const f of ['index.html', 'guides/beta-start-guide.pdf', 'guides/beta-start-guide-iphone.pdf']) writeFileSync(join(d, f), 'x');
  assert.deepEqual(listFiles(d), ['index.html']);
});

test('the atlas art (Settings > Figure depth) is served but never part of an install', () => {
  const d = mkdtempSync(join(tmpdir(), 'pwa-'));
  mkdirSync(join(d, 'atlas'));
  for (const f of ['index.html', 'atlas/organs-healthy.glb', 'atlas/courses.json', 'atlas/atlas-grain.png']) writeFileSync(join(d, f), 'x');
  assert.deepEqual(listFiles(d), ['index.html']);
});

test('the worker\'s cache is one per scope and build, with the prefix the build pill drops', () => {
  const sw = buildSw({ build: 'abc1234', files: ['index.html', 'assets/a-1.js'] });
  assert.ok(sw.includes('const BUILD = "abc1234"'));
  assert.ok(sw.includes('"assets/a-1.js"'));
  assert.ok(sw.includes("'pps3d@' + SCOPE.pathname + '@'"));
  assert.equal(cachePrefix('https://x.test/portal-pressure-sim-3d/preview/?a=1'), 'pps3d@/portal-pressure-sim-3d/preview/@');
  assert.ok(sw.includes('held(HOME)'), 'offline: the front page comes from the cache');
  assert.ok(sw.includes('skipWaiting') && sw.includes('clients.claim'));
  assert.doesNotThrow(() => new Function(sw));
});

test('where the browser has no WebGL 2 the page says so and links the 2D simulator', () => {
  assert.equal(hasWebGL2(() => ({ getContext: () => null })), false);
  assert.equal(hasWebGL2(() => ({ getContext: () => { throw new Error('no'); } })), false);
  assert.equal(hasWebGL2(() => ({ getContext: (id) => (id === 'webgl2' ? {} : null) })), true);
  assert.match(NO_WEBGL.href, /^https:\/\/qaddodi\.github\.io\/portal-pressure-simulator\/$/);
});

// ---- the order the files are held in, the order old caches go in, and the registration ---------------------------------------------------------------------------
const BUILT: Record<string, string> = {
  'index.html': '<link rel="manifest" href="./manifest.webmanifest"><link rel="stylesheet" href="./fonts/fonts.css"><script type="module" crossorigin src="./assets/index-Zz.js"></script>'
    + '<link rel="modulepreload" crossorigin href="./assets/react-Aa.js"><link rel="stylesheet" crossorigin href="./assets/index-Cc.css">',
  'assets/index-Zz.js': 'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./Gallery-Bb.js"])))=>i;import{a}from"./react-Aa.js";import"./engine-Qq.js";'
    + 'fetch(`anatomy/organs.bin`);const g=()=>import("./Gallery-Bb.js");',
  'assets/engine-Qq.js': 'new Worker(new URL(new URL(`worker-Ww.js`,import.meta.url).href,``+import.meta.url),{type:`module`})',
  'assets/react-Aa.js': 'export const a=1;',
  'assets/worker-Ww.js': 'self.onmessage=()=>{};',
  'assets/Gallery-Bb.js': 'import{a}from"./react-Aa.js";import"./Deep-Aa.js";',
  'assets/Deep-Aa.js': '',
  'assets/index-Cc.css': '.a{background:url(./mark-Mm.png)} .b{fill:url(#og)} .c{background:url("data:image/svg+xml,x")}',
  'assets/mark-Mm.png': '',
  'fonts/fonts.css': '@font-face{src:url(inter-latin.woff2)}',
  'fonts/inter-latin.woff2': '',
  'anatomy/organs.bin': '',
  'manifest.webmanifest': '{}',
  'brand/icon-512.png': '',
};

test('the files are held in the order the app needs them: the page, what it loads before the first picture, then the parts opened later', () => {
  const files = Object.keys(BUILT).sort();   // (the order of the names, which is the order of their hashes: Deep-Aa and Gallery-Bb sort before index-Zz)
  const { boot, later } = orderFiles(files, (f: string) => BUILT[f]!);
  assert.equal(boot[0], 'index.html', 'the page first');
  assert.deepEqual([...boot].sort(), ['anatomy/organs.bin', 'assets/engine-Qq.js', 'assets/index-Cc.css', 'assets/index-Zz.js', 'assets/mark-Mm.png', 'assets/react-Aa.js', 'assets/worker-Ww.js',
    'fonts/fonts.css', 'fonts/inter-latin.woff2', 'index.html', 'manifest.webmanifest']);
  assert.deepEqual(later, ['assets/Deep-Aa.js', 'assets/Gallery-Bb.js', 'brand/icon-512.png'], 'a dynamic import and what only it needs come later');
  assert.ok(boot.indexOf('assets/index-Zz.js') < boot.indexOf('assets/worker-Ww.js'));
  assert.equal(boot.length + later.length, files.length, 'every file is in one list, once');
  const sw = buildSw({ build: 'b1', files, boot, later });
  assert.ok(sw.indexOf('"index.html"') < sw.indexOf('"assets/Gallery-Bb.js"'));
  assert.match(sw, /addEventListener\('install'[^\n]*holdAll\(BOOT, true\)/, 'install is the boot list, and a failure there fails it');
  assert.match(sw, /'pps:fill'\) e\.waitUntil\(holdAll\(LATER, false\)/, 'the rest is filled when the page asks, a failure left for the next time');
  assert.match(sw, /if \(await c\.match\(url\)\) return;/, 'a file already held is not fetched again: an install cut short goes on');
  assert.doesNotMatch(sw, /addAll/, 'never all or nothing');
  assert.doesNotThrow(() => new Function(sw));
});

/** Runs the written worker against a fake cache store and returns its listeners. */
function runSw(sw: string, names: string[]) {
  const store = new Map<string, Map<string, unknown>>(names.map((n) => [n, new Map()]));
  const caches = {
    keys: async () => [...store.keys()],
    open: async (n: string) => { if (!store.has(n)) store.set(n, new Map()); const m = store.get(n)!; return { match: async (u: string) => m.get(u), put: async (u: string, r: unknown) => { m.set(u, r); } }; },
    delete: async (n: string) => store.delete(n),
  };
  const on: Record<string, (e: { waitUntil(p: Promise<unknown>): void; [k: string]: unknown }) => void> = {};
  const self = { registration: { scope: 'https://x.test/app/' }, addEventListener: (t: string, f: (typeof on)[string]) => { on[t] = f; }, skipWaiting: async () => undefined, clients: { claim: async () => undefined } };
  const fetched: string[] = [];
  const fetch = async (u: string) => { fetched.push(String(u)); return { status: 200, type: 'basic', clone() { return this; } }; };
  new Function('self', 'caches', 'fetch', sw)(self, caches, fetch);
  const fire = async (type: string, extra: Record<string, unknown> = {}) => { const waits: Promise<unknown>[] = []; on[type]!({ waitUntil: (p) => { waits.push(p); }, ...extra }); await Promise.all(waits); };
  return { store, fire, fetched };
}

test('an update keeps the build before it by the order the caches were made in, not by the order of the commit hashes', async () => {
  const pre = 'pps3d@/app/@';
  // three builds deployed in this order; their hashes sort the other way round (f… a… 5…), and another copy's and another app's caches are on the same origin
  const sw = buildSw({ build: '5555555', files: ['index.html'], boot: ['index.html'], later: [] });
  const w = runSw(sw, [`${pre}fffffff`, 'pps3d@/app/preview/@0000000', `${pre}aaaaaaa`, 'pps@/portal-pressure-simulator/@x']);
  await w.fire('install');
  await w.fire('activate');
  assert.deepEqual([...w.store.keys()].sort(), ['pps3d@/app/preview/@0000000', `${pre}5555555`, `${pre}aaaaaaa`, 'pps@/portal-pressure-simulator/@x'].sort(),
    'the build before this one (aaaaaaa, made last) is kept; the oldest goes; other copies and other apps are untouched');
  assert.doesNotMatch(sw, /\.sort\(\)/, 'cache names are never sorted');
});

test('install holds the boot files in order and skips what an earlier attempt already holds; the fill holds the rest', async () => {
  const sw = buildSw({ build: 'b2', files: [], boot: ['index.html', 'assets/a.js', 'assets/b.js'], later: ['assets/late.js'] });
  const w = runSw(sw, []);
  (await (async () => { w.store.set('pps3d@/app/@b2', new Map([['https://x.test/app/assets/a.js', {}]])); })());
  await w.fire('install');
  assert.deepEqual(w.fetched, ['https://x.test/app/index.html', 'https://x.test/app/assets/b.js']);
  await w.fire('message', { data: 'pps:fill', ports: [] });
  assert.equal(w.fetched.at(-1), 'https://x.test/app/assets/late.js');
  assert.equal(w.store.get('pps3d@/app/@b2')!.size, 4);
});

test('the worker is registered: main.tsx calls registerPwa after the app is rendered, and only a built page outside a frame or an embed installs it', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.ok(main.indexOf('registerPwa();') > main.indexOf('<App />'), 'registerPwa() is called, after the first render');
  const ok = { prod: true, hasWorker: true, protocol: 'https:', search: '', framed: false };
  assert.equal(mayRegister(ok), true);
  assert.equal(mayRegister({ ...ok, prod: false }), false);
  assert.equal(mayRegister({ ...ok, hasWorker: false }), false);
  assert.equal(mayRegister({ ...ok, protocol: 'file:' }), false);
  assert.equal(mayRegister({ ...ok, framed: true }), false);
  assert.equal(mayRegister({ ...ok, search: '?embed' }), false);
  const reg = readFileSync(new URL('../src/pwa/register.ts', import.meta.url), 'utf8');
  assert.match(reg, /register\('\.\/sw\.js'\)/);
  assert.match(reg, /readyState === 'complete'/, 'not before the page has loaded');
});

test('an update is offered only when the worker that took over holds other files than this page runs', () => {
  assert.equal(isUpdate(['assets/index-A.js', 'assets/index-A.css'], ['index.html', 'assets/index-A.js', 'assets/index-A.css']), false, 'a page opened after the deploy is already on it');
  assert.equal(isUpdate(['assets/index-A.js'], ['index.html', 'assets/index-B.js']), true);
  assert.equal(isUpdate(['assets/index-A.js'], null), true, 'a worker that does not answer is taken as new');
});

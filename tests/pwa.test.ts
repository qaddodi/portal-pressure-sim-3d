// Offline: the worker the build writes names its cache as the build pill expects, holds every built file, and the page falls back to its cache; no WebGL 2 shows the 2D link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildSw, listFiles, orderFiles, isLate, stampBootBytes, wireBytes } from '../scripts/pwa.mjs';
import { isUpdate, mayRegister, takesOverNow, persistOnce, PERSIST_KEY, CHECK_MS, CHECK_GAP_MS } from '../src/pwa/register.ts';
import { lowData } from '../src/boot/data-saver.ts';
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
  assert.match(sw, /'pps:fill' && !lowData\(\)\) e\.waitUntil\(holdAll\(LATER, false\)/, 'the rest is filled when the page asks, a failure left for the next time');
  assert.match(sw, /if \(await c\.match\(url\)\) return;/, 'a file already held is not fetched again: an install cut short goes on');
  assert.doesNotMatch(sw, /addAll/, 'never all or nothing');
  assert.doesNotThrow(() => new Function(sw));
});

/** Runs the written worker against a fake cache store and returns its listeners. */
function runSw(sw: string, names: string[], o: { navigator?: unknown; fetch?: (u: string, init?: RequestInit) => Promise<unknown>; setTimeout?: (fn: () => void, ms: number) => unknown } = {}) {
  const store = new Map<string, Map<string, unknown>>(names.map((n) => [n, new Map()]));
  const caches = {
    keys: async () => [...store.keys()],
    open: async (n: string) => { if (!store.has(n)) store.set(n, new Map()); const m = store.get(n)!; return { match: async (u: string) => m.get(u), put: async (u: string, r: unknown) => { m.set(u, r); } }; },
    delete: async (n: string) => store.delete(n),
  };
  const on: Record<string, (e: { waitUntil(p: Promise<unknown>): void; [k: string]: unknown }) => void> = {};
  const self = { navigator: o.navigator, registration: { scope: 'https://x.test/app/' }, addEventListener: (t: string, f: (typeof on)[string]) => { on[t] = f; }, skipWaiting: async () => undefined, clients: { claim: async () => undefined } };
  const fetched: string[] = [], inits: (RequestInit | undefined)[] = [];
  const fetch = async (u: string, init?: RequestInit) => { fetched.push(String(u)); inits.push(init); return o.fetch ? o.fetch(u, init) : { status: 200, type: 'basic', clone() { return this; } }; };
  new Function('self', 'caches', 'fetch', 'setTimeout', sw)(self, caches, fetch, o.setTimeout ?? setTimeout);
  const fire = async (type: string, extra: Record<string, unknown> = {}) => { const waits: Promise<unknown>[] = []; on[type]!({ waitUntil: (p) => { waits.push(p); }, ...extra }); await Promise.all(waits); };
  return { store, fire, fetched, inits, on };
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

test('a page is asked past the HTTP cache, in the worker and when it is held at install (the host lets a browser keep it ten minutes: a deploy was not seen for ten minutes)', async () => {
  const sw = buildSw({ build: 'n1', files: [], boot: ['index.html', 'assets/a-1.js', 'manifest.webmanifest'], later: [] });
  const w = runSw(sw, []);
  await w.fire('install');
  const at = (f: string) => w.inits[w.fetched.indexOf(`https://x.test/app/${f}`)];
  assert.deepEqual(at('index.html'), { cache: 'no-cache' }, 'the page held at install is the newest');
  assert.deepEqual(at('manifest.webmanifest'), { cache: 'no-cache' }, 'so is any file whose name has no hash');
  assert.equal(at('assets/a-1.js'), undefined, 'a hashed file may come from the HTTP cache');
  let answered: unknown;
  w.on.fetch!({ request: { method: 'GET', url: 'https://x.test/app/', mode: 'navigate' }, respondWith: (p: Promise<unknown>) => { answered = p; }, waitUntil() {} } as never);
  await answered;
  assert.equal(w.fetched.at(-1), 'https://x.test/app/');
  assert.deepEqual(w.inits.at(-1), { cache: 'no-cache', credentials: 'same-origin' }, 'a navigation is revalidated, as 2D\'s worker does');
});

test('a tab that stays open asks for a newer build itself and takes it up out of sight, never mid-talk', () => {
  assert.equal(takesOverNow({ pending: true, hidden: true, mode: 'figure' }), true);
  assert.equal(takesOverNow({ pending: true, hidden: false, mode: 'figure' }), false, 'in front it is offered, not forced');
  assert.equal(takesOverNow({ pending: false, hidden: true, mode: 'figure' }), false, 'nothing waits');
  assert.equal(takesOverNow({ pending: true, hidden: true, mode: 'deck' }), false, 'not while a talk plays');
  assert.ok(CHECK_MS >= 60_000 && CHECK_MS <= 10 * 60_000 && CHECK_GAP_MS < CHECK_MS);
  const reg = readFileSync(new URL('../src/pwa/register.ts', import.meta.url), 'utf8');
  assert.match(reg, /reg\.update\(\)/, 'the page asks the host for a newer worker');
  assert.match(reg, /addEventListener\('visibilitychange', ask\)/, 'when the tab comes to the front');
  assert.match(reg, /clock.every\(ask, CHECK_MS\)/, 'and while it stays open');
  assert.match(reg, /reloadKeepingState\(/, 'the reload keeps what is on the screen');
  assert.match(readFileSync(new URL('../src/boot/reload.ts', import.meta.url), 'utf8'), /reloadUrl\(/, 'the shared reload keeps what is on the screen');
});

// ---- what the first install leaves out (production review 21 Nov, P1-6) --------------------------------------------------------------------------------------------
test('the Lobule\'s baked weld plan, its planner worker and the fonts\' other alphabets are filled later, not held at install, even when a boot script names them', () => {
  const built: Record<string, string> = {
    'index.html': '<script type="module" src="./assets/index-Zz.js"></script>',
    'assets/index-Zz.js': 'fetch(`lobule/welds.bin`);new Worker(new URL(`weld-worker-Ww.js`,import.meta.url));fetch(`anatomy/organs.bin`);',
    'assets/weld-worker-Ww.js': 'import"./only-for-worker-Oo.js";',
    'assets/only-for-worker-Oo.js': '',
    'lobule/welds.bin': '', 'anatomy/organs.bin': '',
    'fonts/inter-latin.woff2': '', 'fonts/inter-latin-ext.woff2': '', 'fonts/inter-greek.woff2': '', 'fonts/source-serif-4-latin-ext.woff2': '',
    'index.css': '', 'fonts/fonts.css': '@font-face{src:url(inter-latin.woff2)} @font-face{src:url(inter-latin-ext.woff2)} @font-face{src:url(inter-greek.woff2)}',
  };
  built['index.html'] += '<link rel="stylesheet" href="./fonts/fonts.css">';
  const { boot, later } = orderFiles(Object.keys(built).sort(), (f: string) => built[f] ?? '');
  for (const f of ['lobule/welds.bin', 'assets/weld-worker-Ww.js', 'fonts/inter-latin-ext.woff2', 'fonts/inter-greek.woff2', 'fonts/source-serif-4-latin-ext.woff2']) {
    assert.ok(!boot.includes(f), `${f} must not be held at install`);
    assert.ok(later.includes(f), `${f} is filled when quiet`);
  }
  for (const f of ['index.html', 'assets/index-Zz.js', 'anatomy/organs.bin', 'fonts/inter-latin.woff2']) assert.ok(boot.includes(f), `${f} stays in the install list`);
  assert.ok(isLate('lobule/welds.bin') && !isLate('anatomy/skins.bin') && !isLate('fonts/inter-latin.woff2'));
});

test('the page asks for the weld plan after the first picture, not in the Lobule\'s constructor', () => {
  const l = readFileSync('src/scene/micro3d/lobule3d.ts', 'utf8');
  assert.match(l, /clock.after\(\(\) => this\.askWelds\(\), WELDS_ASK_MS\)/);
  assert.match(l, /if \(!this\.weldsAsked && on && this\.flat\.isVisible\) this\.askWelds\(\)/, 'a Lobule that is wanted before the timer asks at once');
});


// ---- loading plan L5/L6: the boot byte total, the quicker offline launch, the polite fill ------------------------------------------------------------------------------
const navigate = (w: ReturnType<typeof runSw>) => { let answered: Promise<unknown> | undefined; w.on.fetch!({ request: { method: 'GET', url: 'https://x.test/app/', mode: 'navigate' }, respondWith: (p: Promise<unknown>) => { answered = p; }, waitUntil() {} } as never); return answered!; };

test('the build writes the install list\'s wire bytes into the page\'s meta, and a page without the meta fails the build', () => {
  const html = '<head><meta name="pps-boot-bytes" content="0"></head>';
  assert.equal(stampBootBytes(html, 4_912_345.4), '<head><meta name="pps-boot-bytes" content="4912345"></head>');
  assert.equal(stampBootBytes(stampBootBytes(html, 5), 7), '<head><meta name="pps-boot-bytes" content="7"></head>', 'stamping again replaces, never doubles');
  assert.throws(() => stampBootBytes('<head></head>', 5), /pps-boot-bytes/);
  assert.match(readFileSync('index.html', 'utf8'), /<meta name="pps-boot-bytes" content="0">/, 'the source page carries the placeholder');
  const big = Buffer.alloc(10_000, 'a');
  assert.equal(wireBytes(['a.bin'], () => big), 10_000, 'data goes as it is');
  assert.ok(wireBytes(['a.js'], () => big) < 200, 'text goes gzipped');
});

test('the build run on a built folder stamps index.html before the worker lists it', async () => {
  const { spawnSync } = await import('node:child_process');
  const d = mkdtempSync(join(tmpdir(), 'pwa-cli-'));
  mkdirSync(join(d, 'assets'));
  writeFileSync(join(d, 'index.html'), '<meta name="pps-boot-bytes" content="0"><script type="module" src="./assets/a-1.js"></script>');
  writeFileSync(join(d, 'assets/a-1.js'), 'export const a = 1;');
  const r = spawnSync(process.execPath, ['scripts/pwa.mjs', d, 'abc'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const page = readFileSync(join(d, 'index.html'), 'utf8');
  const n = Number(/content="(\d+)"/.exec(page)![1]);
  assert.ok(n > 40, `a byte total was written (${n})`);
});

test('a page with a held copy waits 1.5 s for the network, not 4; with none held it waits for the network alone; offline it is the copy at once', async () => {
  const sw = buildSw({ build: 'n2', files: [], boot: ['index.html'], later: [] });
  assert.match(sw, /NAV_WAIT_MS = 1500/);
  assert.doesNotMatch(sw, /4000/);
  const waits: number[] = [];
  const never = new Promise(() => undefined);
  // a network that never answers; the timeout is the fake one, fired by hand
  let fire!: () => void;
  const hung = runSw(sw, [], { fetch: (u) => (u.endsWith('index.html') ? Promise.resolve({ status: 200, type: 'basic', clone() { return this; }, tag: 'held' }) : never), setTimeout: (fn, ms) => { waits.push(ms); fire = fn; } });
  await hung.fire('install');   // (the install holds the page: a copy exists)
  const p = navigate(hung);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(waits, [1500]);
  fire();
  assert.equal(((await p) as { tag: string }).tag, 'held', 'the held copy is shown when the network says nothing for 1.5 s');
  const off = runSw(sw, [], { fetch: (u) => (u.endsWith('index.html') ? Promise.resolve({ status: 200, type: 'basic', clone() { return this; }, tag: 'held' }) : Promise.reject(new Error('offline'))) });
  await off.fire('install');
  assert.equal(((await navigate(off)) as { tag: string }).tag, 'held', 'offline: no wait at all');
  const first = runSw(sw, [], { fetch: () => Promise.resolve({ status: 200, type: 'basic', clone() { return this; }, tag: 'net' }) });
  assert.equal(((await navigate(first)) as { tag: string }).tag, 'net', 'no copy held: the network\'s answer');
});

test('the worker does not use navigation preload (its request obeys the HTTP cache: the stale-build bug), and says why', () => {
  const sw = buildSw({ build: 'n3', files: [], boot: ['index.html'], later: [] });
  assert.doesNotMatch(sw, /navigationPreload|preloadResponse/);
  assert.match(readFileSync('scripts/pwa.mjs', 'utf8'), /Navigation preload is NOT used/);
});

test('Save-Data or a 2g link: the fill of the parts opened later is skipped, in the page and in the worker; everything else fills', async () => {
  assert.equal(lowData({ saveData: true }), true);
  assert.equal(lowData({ effectiveType: '2g' }), true);
  assert.equal(lowData({ effectiveType: 'slow-2g' }), true);
  assert.equal(lowData({ effectiveType: '3g' }), false);
  assert.equal(lowData({ effectiveType: '4g', saveData: false }), false);
  assert.equal(lowData(undefined), false, 'Safari has no such API: nothing is skipped');
  const sw = buildSw({ build: 'n4', files: [], boot: ['index.html'], later: ['assets/late.js'] });
  for (const [conn, filled] of [[{ saveData: true }, false], [{ effectiveType: '2g' }, false], [{ effectiveType: '4g' }, true], [undefined, true]] as const) {
    const w = runSw(sw, [], { navigator: { connection: conn } });
    await w.fire('message', { data: 'pps:fill', ports: [] });
    assert.equal(w.fetched.includes('https://x.test/app/assets/late.js'), filled, JSON.stringify(conn));
  }
  assert.match(readFileSync('src/pwa/register.ts', 'utf8'), /if \(!lowData\(\)\) whenQuietOnce\(\(\) => askFill\(r\.active\)/, 'the page does not even ask');
});

test('storage.persist() is asked once per device, after the install, and a refusal or a missing API is harmless', async () => {
  const mem = new Map<string, string>(); const flag = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  let asked = 0; const storage = { persist: async () => { asked++; return true; } };
  assert.equal(await persistOnce(storage, flag), true); assert.equal(asked, 1); assert.equal(mem.get(PERSIST_KEY), '1');
  assert.equal(await persistOnce(storage, flag), false); assert.equal(asked, 1, 'not asked again');
  assert.equal(await persistOnce({ persist: async () => false }, { getItem: () => null, setItem: () => undefined }), false, 'a refusal');
  assert.equal(await persistOnce({ persist: async () => { throw new Error('no'); } }, null), false, 'a throw, and no place to remember');
  assert.equal(await persistOnce(undefined, flag), false, 'no API');
  assert.equal(await persistOnce(storage, { getItem: () => { throw new Error('blocked'); }, setItem: () => undefined }), true, 'blocked storage still asks, once per visit');
  assert.match(readFileSync('src/pwa/register.ts', 'utf8'), /return sw\.ready; \}\)\.then\(\(r\) => \{ void persistOnce\(/, 'after the worker is ready (the install list is held)');
});

test('a file with no hash in its name is never served from the build before it (the baked meshes were: a phone kept the old ones across a deploy); a hashed file still is, for a tab that runs it', async () => {
  const pre = 'pps3d@/app/@', bin = 'https://x.test/app/anatomy/skins.bin', js = 'https://x.test/app/assets/a-old.js';
  const sw = buildSw({ build: 'new', files: [], boot: ['index.html'], later: ['anatomy/skins.bin'] });
  const ask = async (w: ReturnType<typeof runSw>, url: string) => { let out: unknown; await w.fire('fetch', { request: { method: 'GET', url, mode: 'cors' }, respondWith: (p: Promise<unknown>) => { out = p; } }); return out as Promise<{ tag: string }>; };
  const net = (tag: string) => ({ status: 200, type: 'basic', clone() { return this; }, tag });
  const w = runSw(sw, [`${pre}old`], { fetch: () => Promise.resolve(net('network')) });
  w.store.get(`${pre}old`)!.set(bin, { tag: 'old build' }); w.store.get(`${pre}old`)!.set(js, { tag: 'old build' });
  assert.equal((await (await ask(w, bin))).tag, 'network', 'the new build\'s page gets the file the host serves now, not the build before\'s copy');
  assert.equal(w.inits.at(-1)?.cache, 'no-cache', 'past the HTTP cache');
  assert.equal(w.store.get(`${pre}new`)?.get(bin) !== undefined, true, 'and the build keeps it');
  assert.equal((await (await ask(w, bin))).tag, 'network', 'asked again: this build\'s own copy');
  assert.equal((await (await ask(w, js))).tag, 'old build', 'a hashed file the build before holds is still given to the tab that runs it');
  const off = runSw(sw, [`${pre}old`], { fetch: () => Promise.reject(new Error('offline')) });
  off.store.get(`${pre}old`)!.set(bin, { tag: 'old build' });
  assert.equal((await (await ask(off, bin))).tag, 'old build', 'offline, with nothing of this build\'s, the build before still answers');
});

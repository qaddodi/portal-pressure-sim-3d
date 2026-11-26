// What a normal load downloads before its first picture: everything src/main.tsx reaches through static imports (a dynamic `import()` is a part fetched when asked for).
// The debug pages (?debug, ?watch, ?gl), the charts gallery (?charts), the parity page (?parity) and every chart family's code are not in it. Until 19 Nov 2026 the decks'
// hook tables imported the chart registry to ask "is this chart done" (every family's gallery specimens), and the card layer imported every chart family's card through
// the talk's ToolCard: about 900 kB of chart source in the boot entry. The charts are now one chunk a talk waits for (ui/talk/ToolCard.tsx, ui/shell/talk.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHART_KINDS } from '../src/ui/charts/kinds.ts';
import { CHARTS } from '../src/ui/charts/registry.ts';
import { bootBytes, kindOf, readBudget, report, within } from '../scripts/boot-bytes.mjs';
import { BOOT_PRELOAD } from '../scripts/hash-data.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
// (an import or re-export statement at the start of a line; comments are not stripped: a "/*" inside a path in a comment, like styles/*.css, would swallow the imports after it)
const STATIC = /^[ \t]*(?:import|export)\s+(?!type\b)(?:[^'"()]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;

/** Every source file reached from `entry` by static imports, with the file that first imported it. */
function staticGraph(entry: string): Map<string, string | null> {
  const seen = new Map<string, string | null>();
  const walk = (file: string, from: string | null) => {
    if (seen.has(file)) return;
    seen.set(file, from);
    if (!/\.(tsx?|jsx?|mjs)$/.test(file)) return;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(STATIC)) {
      const spec = m[1]!;
      if (!spec.startsWith('.')) continue;
      const p = resolve(dirname(file), spec.split('?')[0]!);
      if (existsSync(p) && statSync(p).isFile()) walk(p, file);
    }
  };
  walk(resolve(root, entry), null);
  return seen;
}
const graph = staticGraph('src/main.tsx');
const BOOT_FILES_CEILING = 1010;   // (24 Nov 2026: 966 files, a little room. The code's weight is no longer a ceiling on its source bytes (7700 kB, the owner's rule until 25 Nov: it counted source with its comments and no geometry at all): the budget is the wire bytes before usable, geometry included, below)
const files = [...graph.keys()].map((f) => relative(root, f).split('\\').join('/'));
const chain = (f: string) => { const out: string[] = []; let c: string | null | undefined = resolve(root, f); while (c) { out.push(relative(root, c)); c = graph.get(c); } return out.join(' <- '); };

test('the walk sees the app (it is not vacuous)', () => {
  for (const f of ['src/App.tsx', 'src/scene/Stage.tsx', 'src/ui/shell/Shell.tsx', 'src/engine/boot.ts', 'src/pwa/register.ts', 'src/ui/shell/DeckUiSlot.tsx', 'src/ui/shell/talk.ts', 'src/ui/shell/Sheets.tsx']) assert.ok(files.includes(f), `${f} is in the boot entry`);
});

test('the boot entry does not statically import the debug pages, the charts gallery, the parity page or the chart registry', () => {
  // the few lines of each that decide whether to fetch the rest stay in the entry
  const stubs = new Set(['src/ui/debug/mount.ts', 'src/ui/debug/flags.ts', 'src/ui/debug/gate.ts', 'src/ui/debug/caught.ts', 'src/ui/debug/frame/request.ts', 'src/ui/charts/gallery/mount.tsx',
    'src/debug/shader-guard.ts', 'src/debug/shader-fail.ts', 'src/debug/gl-ref.ts',
    'src/ui/debug/packet/state.ts', 'src/debug/look-hook.ts']);   // (the state link's pure cleaning, which the share link uses: 139 lines, imports only a type)
  const limit = (s: string) => (s === 'src/ui/debug/packet/state.ts' || s === 'src/ui/debug/flags.ts' ? 13000 : 8000);   // (flags.ts is the table of every ?flag and what it means: it grows a row at a time, and imports nothing)
  const heavy = (f: string) => f.startsWith('src/parity/') || f === 'src/ui/charts/registry.ts' || f.startsWith('src/ui/charts/gallery/') || f.startsWith('src/debug/')
    || (f.startsWith('src/ui/debug/') && !f.startsWith('src/ui/debug/core/'));   // (debug/core: the short report text Send feedback puts in its mail)
  const found = files.filter((f) => heavy(f) && !stubs.has(f));
  assert.deepEqual(found.map(chain), [], 'a debug, gallery or parity module is statically imported by the boot entry (use a dynamic import)');
  for (const s of stubs) if (files.includes(s)) assert.ok(statSync(resolve(root, s)).size < limit(s), `${s} is a stub of a few lines`);
});

test('no chart family is in the boot entry through the registry: only what a card on the first screen draws with', () => {
  // each chart family's registry entry (its gallery specimens) and the families only a slide or a lazy pane opens
  const families = readdirSync(resolve(root, 'src/ui/charts'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const entries = files.filter((f) => /^src\/ui\/charts\/[^/]+\/entry\.ts$/.test(f));
  assert.deepEqual(entries.map(chain), [], 'a chart family\'s registry entry is in the boot entry');
  // The pure models and data tables a card on the first screen reads for its title and numbers (tool-title.ts, the decks' numbers) are small and not chart code: what stays out
  // is every chart family's component (a .tsx under src/ui/charts) and its registry entry.
  const heavy = (f: string) => /\.tsx$/.test(f) || /\/entry\.ts$/.test(f);   // (a chart's component or registry entry; its pure model and data files are not)
  const inFam = (d: string) => files.filter((f) => f.startsWith(`src/ui/charts/${d}/`) && heavy(f));
  const inBoot = families.filter((d) => inFam(d).length > 0);
  assert.deepEqual(inBoot.filter((d) => !['looks2d', 'gallery'].includes(d)).map((d) => chain(inFam(d)[0]!)), [],
    'a chart family is statically imported by the boot entry');
});

test('the light list of chart kinds (what the decks\' hooks read) says what the registry says', () => {
  assert.deepEqual(CHART_KINDS, Object.fromEntries(CHARTS.map((c) => [c.kind, c.status])));
  for (const f of ['src/decks/hp/hooks.ts']) {
    assert.doesNotMatch(readFileSync(resolve(root, f), 'utf8'), /^import[^\n]*charts\/registry/m,`${f} asks kinds.ts, not the registry`);
  }
  const kinds = readFileSync(resolve(root, 'src/ui/charts/kinds.ts'), 'utf8');
  assert.doesNotMatch(kinds, /^import /m, 'kinds.ts imports nothing');
});

test('a talk\'s charts are a chunk of their own: the card layer mounts a shell, the talk waits for the chunk, and the page reads it in when idle', async () => {
  assert.ok(!files.includes('src/ui/talk/ToolCardBody.tsx'), chain('src/ui/talk/ToolCardBody.tsx'));
  const shell = readFileSync(resolve(root, 'src/ui/talk/tool-card-load.ts'), 'utf8') + readFileSync(resolve(root, 'src/ui/talk/ToolCard.tsx'), 'utf8');
  assert.match(shell, /import\('\.\/ToolCardBody\.tsx'\)/);
  assert.doesNotMatch(shell, /^import[^\n]*charts\//m);
  const talk = readFileSync(resolve(root, 'src/ui/shell/talk.ts'), 'utf8');
  assert.ok(talk.indexOf('loadToolCard().then(() => show(deck, at))') > 0 && talk.indexOf('loadToolCard()') < talk.indexOf('openDeck(deck, at)'), 'the talk opens after its charts are in');
  assert.match(readFileSync(resolve(root, 'src/boot/warm.ts'), 'utf8'), /loadToolCard\(\)/);
  assert.match(readFileSync(resolve(root, 'src/main.tsx'), 'utf8'), /warmLater\(\);/);
  // the loader: one read however often it is asked, never a rejection, and a failed read is tried again
  const { loadToolCard, toolCardReady } = await import('../src/ui/talk/tool-card-load.ts');
  let reads = 0;
  const Fake = () => null;
  assert.equal(await loadToolCard(() => { reads++; return Promise.reject(new Error('offline')); }), false);
  assert.equal(toolCardReady(), false);
  const [a, b] = await Promise.all([loadToolCard(() => { reads++; return Promise.resolve({ ToolCard: Fake }); }), loadToolCard(() => { reads++; return Promise.resolve({ ToolCard: Fake }); })]);
  assert.deepEqual([a, b, reads, toolCardReady()], [true, true, 2, true]);
});

test('the talk\'s own UI (DeckUi: the cards, the wallet, the presenter pill) is a chunk of its own: not in the boot entry, read in when idle, and a talk opens once it is in', async () => {
  for (const f of ['src/ui/DeckUi.tsx', 'src/ui/cards/CardLayer.tsx', 'src/ui/talk/ToolCard.tsx']) assert.ok(!files.includes(f), `${f} is in the boot entry: ${chain(f)}`);
  const load = readFileSync(resolve(root, 'src/ui/shell/deck-ui-load.ts'), 'utf8');
  assert.match(load, /import\('\.\.\/DeckUi\.tsx'\)/);
  assert.doesNotMatch(load, /^import[^\n]*DeckUi/m);
  const talk = readFileSync(resolve(root, 'src/ui/shell/talk.ts'), 'utf8');
  assert.ok(talk.indexOf('loadDeckUi()') > 0 && talk.indexOf('loadDeckUi()') < talk.indexOf('openDeck(deck, at)'), 'the talk opens after its UI is in');
  assert.match(readFileSync(resolve(root, 'src/boot/warm.ts'), 'utf8'), /loadDeckUi\(\)/);
  const loader = await import('../src/ui/shell/deck-ui-load.ts');
  loader.resetDeckUi();
  let reads = 0;
  const Fake = () => null;
  assert.equal(await loader.loadDeckUi(() => { reads++; return Promise.reject(new Error('offline')); }), false, 'a read that fails never rejects');
  assert.equal(loader.deckUiReady(), false);
  const [a, b] = await Promise.all([loader.loadDeckUi(() => { reads++; return Promise.resolve({ DeckUi: Fake }); }), loader.loadDeckUi(() => { reads++; return Promise.resolve({ DeckUi: Fake }); })]);
  assert.deepEqual([a, b, loader.deckUiReady(), loader.deckUi() === Fake], [true, true, true, true]);
  assert.ok(reads >= 2 && reads <= 5, `one read once it is in (${reads})`);
  loader.resetDeckUi();
});

test('the boot entry stays within its file budget (what a normal load parses and runs before the first picture)', () => {
  // A change that makes this fail has pulled something in that the first picture does not draw: load it with a dynamic import (ui/shell/deck-ui-load.ts is the pattern).
  assert.ok(files.length < BOOT_FILES_CEILING, `${files.length} files in the boot entry (ceiling ${BOOT_FILES_CEILING})`);
});

// ---- the wire-byte budget before usable (25 Nov, review D3 and W2; replaces the source-byte ceiling) -----------------------------------------------------------------------------
// What counts is what a first visit DOWNLOADS before the app can be used, geometry included (it was 80% of the 10,071 kB the review measured, and no guard saw it). The whole figure needs the built site (scripts/boot-bytes.mjs, which the
// build runs and writes to build-info.txt: over the budget fails main and is named on a branch); this file holds what a node test can measure without a build: the baked geometry, byte for byte, and the accounting itself.
const wire = (f: string): number => statSync(resolve(root, f)).size;
const gz = (f: string): number => gzipSync(readFileSync(resolve(root, f))).length;
const baked = ['public/anatomy/organs-baked.bin', 'public/anatomy/skins.bin'].every((f) => existsSync(resolve(root, f)));

test('the baked geometry the first picture waits for stays within its wire-byte budget (organs, skins, organ art: the files go as they are, gzipped at build time)', { skip: !baked && 'the baked files are made by the bakes (npm test bakes them first)' }, () => {
  const kb = (wire('public/anatomy/organs-baked.bin') + wire('public/anatomy/skins.bin') + gz('public/anatomy/organ-art.json')) / 1024;
  const { geometryKb } = readBudget();
  assert.ok(kb <= geometryKb, `the baked geometry is ${kb.toFixed(0)} kB on the wire (budget ${geometryKb} kB): thin or pack what grew (src/scene/bake-pack.ts), or lower the budget when it shrinks`);
  assert.ok(kb > 500, 'the files are the baked ones, not stubs');
});

test('the Lobule\'s weld plan is not downloaded before the app is usable', () => {
  // (the page reads it in the quiet ladder after the cover, or when the Lobule is first asked for: lobule/weld-want.ts, boot/warm.ts)
  assert.ok(!files.some((f) => /\.bin$/.test(f) && /welds/.test(f)), 'no weld file is imported by the boot entry');
  // (the page's preload tags are made from this list, scripts/hash-data.mjs)
  assert.deepEqual(BOOT_PRELOAD, ['anatomy/organs-baked.bin', 'anatomy/skins.bin', 'anatomy/organ-art.json'], 'the preload list is the figure\'s own files, no weld plan');
});

test('the boot-byte accounting: the install list on the wire by kind, text gzipped, data as it is, late files left out, a total over the budget refused', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'bootbytes-'));
  const put = (f: string, b: Buffer | string) => { const p = resolve(dir, f); mkdirSync(resolve(p, '..'), { recursive: true }); writeFileSync(p, b); };
  const js = 'const a = "' + 'x'.repeat(40_000) + '";';
  put('index.html', '<link rel="apple-touch-startup-image" media="x" href="./brand/launch/1x.png"><link rel="stylesheet" href="./assets/a.css"><script type="module" src="./assets/index-Zz.js"></script><link rel="preload" as="fetch" href="./assets/organs-baked-Aa11Bb22.bin">');
  put('assets/index-Zz.js', js + 'fetch(`assets/skins-Cc33Dd44.bin`);');
  put('assets/a.css', 'a{color:red}');
  put('assets/organs-baked-Aa11Bb22.bin', Buffer.alloc(100_000, 7)); put('assets/skins-Cc33Dd44.bin', Buffer.alloc(50_000, 9));
  put('brand/launch/1x.png', Buffer.alloc(40_000, 5));   // (an iOS launch picture: a device is sent one, from the home screen: never counted)
  put('lobule/welds.bin', Buffer.alloc(200_000, 1));   // (late: never counted)
  put('assets/organs-Ee55Ff66.bin', Buffer.alloc(80_000, 3));   // (the fallback: never counted)
  const files = ['index.html', 'assets/index-Zz.js', 'assets/a.css', 'assets/organs-baked-Aa11Bb22.bin', 'assets/skins-Cc33Dd44.bin', 'brand/launch/1x.png', 'lobule/welds.bin', 'assets/organs-Ee55Ff66.bin'];
  const r = bootBytes(files, (f: string) => readFileSync(resolve(dir, f)));
  assert.deepEqual(Object.keys(r.kinds).sort(), ['css', 'geometry (baked)', 'javascript', 'json and html']);
  assert.equal(r.kinds['geometry (baked)']!.bytes, 150_000, 'the baked files go as they are');
  assert.ok(r.kinds.javascript!.bytes < 1000, 'text goes gzipped');
  assert.ok(!r.files.some((f: { file: string }) => /welds|organs-Ee|launch/.test(f.file)), 'the weld plan, the fallback organs and the launch pictures are not before usable');
  assert.equal(r.total, r.files.reduce((n: number, f: { bytes: number }) => n + f.bytes, 0));
  const head = report(r, { targetKb: 4000, budgetKb: 5000 }).split('\n')[0];
  assert.equal(head, `before usable: 5 files, ${Math.round(r.total / 1024)} kB on the wire (budget 5,000 kB, target 4,000 kB)`);
  assert.ok(within(r, { targetKb: 1, budgetKb: 200 }) && !within(r, { targetKb: 1, budgetKb: 100 }), 'a total over the budget is refused');
  assert.equal(kindOf('assets/organ-art-Aa11Bb22.json'), 'geometry (organ art)');
});

test('the budget file: the target is the review\'s 4,000 kB, the budget is at or above it and only comes down to it', () => {
  const b = readBudget();
  assert.equal(b.targetKb, 4000);
  assert.ok(b.budgetKb >= b.targetKb && b.geometryKb <= b.budgetKb, JSON.stringify(b));
});

test('the libraries are chunks of their own, so the boot entry is the app and their files keep their names across deploys', async () => {
  const cfg = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
  assert.match(cfg, /manualChunks: vendorChunk/);
  const pick = new Function('id', cfg.slice(cfg.indexOf('const m = /node_modules'), cfg.indexOf('// `base:')).replace(/\}\s*$/, '')) as (id: string) => string | undefined;
  assert.equal(pick('/x/node_modules/three/build/three.module.js'), 'three');
  assert.equal(pick('/x/node_modules/react-dom/client.js'), 'react');
  assert.equal(pick('/x/node_modules/@react-three/fiber/dist/index.js'), undefined);
  assert.equal(pick('/x/src/scene/Stage.tsx'), undefined);
});

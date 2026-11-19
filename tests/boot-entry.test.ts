// What a normal load downloads before its first picture: everything src/main.tsx reaches through static imports (a dynamic `import()` is a part fetched when asked for).
// The debug pages (?debug, ?watch, ?gl), the charts gallery (?charts), the parity page (?parity) and every chart family's code are not in it. Until 19 Nov 2026 the decks'
// hook tables imported the chart registry to ask "is this chart done" (every family's gallery specimens), and the card layer imported every chart family's card through
// the talk's ToolCard: about 900 kB of chart source in the boot entry. The charts are now one chunk a talk waits for (ui/talk/ToolCard.tsx, ui/shell/talk.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHART_KINDS } from '../src/ui/charts/kinds.ts';
import { CHARTS } from '../src/ui/charts/registry.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
// (an import or re-export statement at the start of a line; comments are not stripped: a "/*" inside a path in a comment, like css2d/*.css, would swallow the imports after it)
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
const files = [...graph.keys()].map((f) => relative(root, f).split('\\').join('/'));
const chain = (f: string) => { const out: string[] = []; let c: string | null | undefined = resolve(root, f); while (c) { out.push(relative(root, c)); c = graph.get(c); } return out.join(' <- '); };

test('the walk sees the app (it is not vacuous)', () => {
  for (const f of ['src/App.tsx', 'src/scene/Stage.tsx', 'src/ui/shell/Shell.tsx', 'src/engine/boot.ts', 'src/pwa/register.ts', 'src/ui/cards/CardLayer.tsx', 'src/ui/talk/ToolCard.tsx', 'src/ui/shell/talk.ts']) assert.ok(files.includes(f), `${f} is in the boot entry`);
});

test('the boot entry does not statically import the debug pages, the charts gallery, the parity page or the chart registry', () => {
  // the few lines of each that decide whether to fetch the rest stay in the entry
  const stubs = new Set(['src/ui/debug/mount.ts', 'src/ui/debug/flags.ts', 'src/ui/debug/gate.ts', 'src/ui/debug/caught.ts', 'src/ui/debug/frame/request.ts', 'src/ui/charts/gallery/mount.tsx',
    'src/debug/shader-guard.ts', 'src/debug/shader-fail.ts', 'src/debug/gl-ref.ts']);
  const heavy = (f: string) => f.startsWith('src/parity/') || f === 'src/ui/charts/registry.ts' || f.startsWith('src/ui/charts/gallery/') || f.startsWith('src/debug/')
    || (f.startsWith('src/ui/debug/') && !f.startsWith('src/ui/debug/core/'));   // (debug/core: the short report text Send feedback puts in its mail)
  const found = files.filter((f) => heavy(f) && !stubs.has(f));
  assert.deepEqual(found.map(chain), [], 'a debug, gallery or parity module is statically imported by the boot entry (use a dynamic import)');
  for (const s of stubs) if (files.includes(s)) assert.ok(statSync(resolve(root, s)).size < 8000, `${s} is a stub of a few lines`);
});

test('no chart family is in the boot entry through the registry: only what a card on the first screen draws with', () => {
  // each chart family's registry entry (its gallery specimens) and the families only a slide or a lazy pane opens
  const families = readdirSync(resolve(root, 'src/ui/charts'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const entries = files.filter((f) => /^src\/ui\/charts\/[^/]+\/entry\.ts$/.test(f));
  assert.deepEqual(entries.map(chain), [], 'a chart family\'s registry entry is in the boot entry');
  const inBoot = families.filter((d) => files.some((f) => f.startsWith(`src/ui/charts/${d}/`)));
  assert.deepEqual(inBoot.filter((d) => !['looks2d', 'gallery'].includes(d)).map((d) => chain(files.find((f) => f.startsWith(`src/ui/charts/${d}/`))!)), [],
    'a chart family is statically imported by the boot entry');
});

test('the light list of chart kinds (what the decks\' hooks read) says what the registry says', () => {
  assert.deepEqual(CHART_KINDS, Object.fromEntries(CHARTS.map((c) => [c.kind, c.status])));
  for (const f of ['src/decks/hp/hooks.ts', 'src/decks/ag/needs.ts', 'src/decks/rw/hooks-builtin.ts']) {
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
  assert.ok(talk.indexOf('loadToolCard().then(() => startTalk(deckId, at))') > 0 && talk.indexOf('loadToolCard()') < talk.indexOf('openDeck(deck, at)'), 'the talk opens after its charts are in');
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

test('the libraries are chunks of their own, so the boot entry is the app and their files keep their names across deploys', async () => {
  const cfg = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
  assert.match(cfg, /manualChunks: vendorChunk/);
  const pick = new Function('id', cfg.slice(cfg.indexOf('const m = /node_modules'), cfg.indexOf('// `base:')).replace(/\}\s*$/, '')) as (id: string) => string | undefined;
  assert.equal(pick('/x/node_modules/three/build/three.module.js'), 'three');
  assert.equal(pick('/x/node_modules/react-dom/client.js'), 'react');
  assert.equal(pick('/x/node_modules/@react-three/fiber/dist/index.js'), undefined);
  assert.equal(pick('/x/src/scene/Stage.tsx'), undefined);
});

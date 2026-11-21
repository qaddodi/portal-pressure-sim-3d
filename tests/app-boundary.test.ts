// The app never blanks (P0-1): two boundary layers (the figure's, the whole app's) and the lazy-pane boundary. A node test cannot mount React into a page, so the three classes are bundled with esbuild (CSS dropped),
// put into the state a caught error leaves them in (getDerivedStateFromError, the same call React makes), and their render() output is checked as markup; the wiring is checked in the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';

mkdirSync('node_modules/.cache', { recursive: true });
const entry = resolve('node_modules/.cache/boundary-entry.ts');
writeFileSync(entry, `export { AppBoundary, CrashCard, crashDetails } from '${resolve('src/ui/shell/AppBoundary.tsx')}'; export { LazyBoundary } from '${resolve('src/ui/shell/LazyBoundary.tsx')}'; export { ChunkError } from '${resolve('src/boot/lazy-retry.ts')}';`);
const outfile = resolve('node_modules/.cache/boundary-test.mjs');
const res = await build({
  configFile: false, logLevel: 'silent', root: process.cwd(), plugins: [], define: { 'import.meta.env.VITE_BUILD': '"test@abc1234"' },
  build: { ssr: entry, write: false, minify: false, emptyOutDir: false, rollupOptions: { output: { format: 'esm' } } },
});
const first = (Array.isArray(res) ? res[0]! : res) as unknown as { output: { code?: string }[] };
const out = first.output.find((o) => typeof o.code === 'string') as { code: string };
writeFileSync(outfile, out.code);
const m = await import(pathToFileURL(outfile).href) as typeof import('../src/ui/shell/AppBoundary.tsx') & typeof import('../src/ui/shell/LazyBoundary.tsx') & { ChunkError: typeof import('../src/boot/lazy-retry.ts').ChunkError };   // (the bundle's own ChunkError: instanceof needs the same class)

/** A boundary in the state React leaves it in after a child threw `err`. */
function caught(B: unknown, props: unknown, err: unknown): { state: unknown; render(): unknown } {
  const C = B as { new (p: unknown): { state: unknown; render(): unknown }; getDerivedStateFromError(e: unknown): unknown };
  const b = new C(props);
  b.state = C.getDerivedStateFromError(err);
  return b;
}
const html = (n: unknown) => renderToStaticMarkup(n as never);

test('figure layer: the fallback says the figure stopped, with Reload, Copy details and the 2D link', () => {
  const b = caught(m.AppBoundary, { layer: 'figure', children: 'KID' }, new Error('three exploded'));
  const h = html(b.render());
  assert.match(h, /role="alert"/); assert.match(h, /The 3D figure stopped/); assert.match(h, /three exploded/);
  assert.match(h, />Reload</); assert.match(h, />Copy details</); assert.match(h, /href="https:\/\/qaddodi\.github\.io\/portal-pressure-simulator\/"/);
  assert.ok(!/KID/.test(h), 'the failed child is gone');
});
test('root layer: a full card with Reload, Copy details and the 2D link', () => {
  const h = html(caught(m.AppBoundary, { layer: 'root', children: 'KID' }, new Error('shell threw')).render());
  assert.match(h, /Something went wrong/); assert.match(h, /sh-crash-root/); assert.match(h, />Reload</); assert.match(h, />Copy details</); assert.match(h, /2D simulator/);
});
test('with no error a boundary renders its children untouched', () => {
  const b = new (m.AppBoundary as never as new (p: unknown) => { render(): unknown })({ layer: 'figure', children: 'KID' });
  assert.equal(b.render(), 'KID');
});
test('a thrown non-Error and an empty message still give words', () => {
  const s = (m.AppBoundary as unknown as { getDerivedStateFromError(e: unknown): { failed: string } });
  assert.equal(s.getDerivedStateFromError('plain string').failed, 'plain string');
  assert.equal(s.getDerivedStateFromError(new Error('')).failed, 'Error');
});
test('Copy details carries the message, the build and the browser', () => {
  assert.equal(m.crashDetails('boom', 'main@abc', 'UA/1'), 'boom\nBuild: main@abc\nBrowser: UA/1');
});
test('the lazy boundary: offline says it needs a connection with Try again; a newer build says Reload', async () => {
  const { ChunkError } = m;
  const off = html(caught(m.LazyBoundary, { children: 'KID' }, new ChunkError('x', true, false)).render());
  assert.match(off, /This part needs a connection/); assert.match(off, />Try again</); assert.ok(!/>Reload</.test(off));
  const stale = html(caught(m.LazyBoundary, { children: 'KID' }, new ChunkError('x', false, true)).render());
  assert.match(stale, /newer version is out/); assert.match(stale, />Reload</);
});

test('wiring: App wraps only the Stage in the figure layer (the shell stays outside it), and main renders App only inside the root layer', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /<AppBoundary layer="figure"><Stage \/><\/AppBoundary>/);
  const figure = app.indexOf('</AppBoundary>');
  assert.ok(app.indexOf('<Shell />') > figure, 'the Shell is outside the figure boundary');
  assert.match(app, /<CardBoundary[^>]*>\s*<LabelLayer \/>[\s\S]*<ProteinLegend \/>\s*<\/CardBoundary>/, 'the overlay layers have their own quiet boundary');
  const main = readFileSync('src/main.tsx', 'utf8');
  const apps = main.match(/<App\s*\/>/g) ?? [];
  assert.equal(apps.length, 1);
  assert.match(main, /<AppBoundary layer="root"><App \/><\/AppBoundary>/);
});
test('the fallbacks fade in (never pop) and respect reduced motion', () => {
  const css = readFileSync('src/ui/shell/shell.css', 'utf8');
  assert.match(css, /\.sh-crash, \.sh-lazyfail \{ animation: sh-fade-in/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.sh-crash, \.sh-lazyfail \{ animation: none/);
});

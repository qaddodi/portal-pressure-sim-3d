// The app's stylesheets (about 780 kB, 140 kB gzipped) are not in front of the first paint (24 Nov 2026, "the splash takes long"): the build's links start as media="print", an inline script turns each on as it loads, and the
// app puts nothing on screen until all are on. This pins the three halves: the tags and their script (scripts/app-css.mjs), the wait (src/boot/styles.ts, main.tsx, entry.ts), and the cover that needs none of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCssTags, APP_CSS_SCRIPT } from '../scripts/app-css.mjs';
import { inlineScriptHashes, withCsp } from '../scripts/csp.mjs';
import { appStylesReady } from '../src/boot/styles.ts';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

/** A document with `n` stylesheet links that the test loads by hand. */
function fakePage(links: { sheet?: object | null }[]) {
  type L = { media: string; sheet: object | null; fire: (e: string) => void; addEventListener: (e: string, f: () => void) => void };
  const ls: L[] = links.map((l) => { const h: Record<string, (() => void)[]> = {}; return { media: 'print', sheet: l.sheet ?? null, addEventListener: (e, f) => { (h[e] ??= []).push(f); }, fire: (e) => { (h[e] ?? []).forEach((f) => f()); } }; });
  const win: { ppsStyles?: Promise<void> } = {};
  const doc = { querySelectorAll: (sel: string) => { assert.equal(sel, 'link[data-app-css]'); return ls; } };
  new Function('window', 'document', APP_CSS_SCRIPT)(win, doc);
  return { ls, win };
}
const settled = async (p: Promise<void>): Promise<boolean> => Promise.race([p.then(() => true), new Promise<boolean>((r) => setImmediate(() => r(false)))]);

test('the build\'s stylesheet links hold no first paint: media print, high priority, and the script that turns them on', () => {
  const tags = appCssTags(['assets/main-a.css', 'assets/global-b.css']);
  assert.equal(tags.length, 3);
  for (const t of tags.slice(0, 2)) {
    assert.match(t, /^<link rel="stylesheet" crossorigin href="\.\/assets\/[\w.-]+\.css" media="print" fetchpriority="high" data-app-css>$/);
  }
  assert.match(tags[2]!, /^<script>.*<\/script>$/s);
  assert.deepEqual(appCssTags([]), [], 'a build with no stylesheets writes nothing');
  // the inline script is allowed by the page's policy (by hash), and that hash is the script's own
  const html = withCsp(`<html><head><meta charset="utf-8">${tags.join('\n')}</head></html>`);
  assert.ok(html.includes(inlineScriptHashes(`<script>${APP_CSS_SCRIPT}</script>`)[0]!), 'the policy names the script\'s hash');
  assert.doesNotMatch(APP_CSS_SCRIPT, /=>|\blet\b|\bconst\b|`/, 'ES5: an old browser still runs it');
});

test('the vite build writes them through appCssTags, never as a plain render-blocking link', () => {
  const cfg = read('vite.config.ts');
  assert.match(cfg, /appCssTags\(\[\.\.\.css\]\)/);
  assert.doesNotMatch(cfg, /rel="stylesheet" crossorigin href=/);
});

test('the script resolves ppsStyles only when every sheet has loaded (or failed), turning each on as it does', async () => {
  const none = fakePage([]);
  assert.equal(await settled(none.win.ppsStyles!), true, 'no sheets: ready at once');
  const p = fakePage([{}, {}, {}]);
  assert.equal(await settled(p.win.ppsStyles!), false, 'nothing loaded: not ready');
  p.ls[0]!.fire('load');
  assert.deepEqual(p.ls.map((l) => l.media), ['all', 'print', 'print'], 'a sheet is applied as it arrives');
  assert.equal(await settled(p.win.ppsStyles!), false, 'one of three: not ready');
  p.ls[1]!.fire('error');   // (a sheet that failed counts as done: the page shows what it can, it never waits for ever)
  p.ls[1]!.fire('load');    // (a second event for it changes nothing)
  assert.equal(await settled(p.win.ppsStyles!), false, 'two of three: not ready');
  p.ls[2]!.fire('load');
  assert.equal(await settled(p.win.ppsStyles!), true, 'all three: ready');
  const early = fakePage([{ sheet: {} }, {}]);   // (one had loaded before the script ran)
  assert.equal(early.ls[0]!.media, 'all');
  early.ls[1]!.fire('load');
  assert.equal(await settled(early.win.ppsStyles!), true);
});

test('appStylesReady is the page\'s promise, or ready at once where there is none (the dev server)', async () => {
  assert.equal(await settled(appStylesReady({})), true);
  let done!: () => void;
  const p = new Promise<void>((r) => { done = r; });
  assert.equal(await settled(appStylesReady({ ppsStyles: p })), false);
  done();
  assert.equal(await settled(appStylesReady({ ppsStyles: p })), true);
});

test('the app draws nothing until its styles are on: main.tsx and every plain page wait for them before they mount', () => {
  const main = read('src/main.tsx');
  const start = main.slice(main.indexOf('async function start()'));
  const roots = [...start.matchAll(/createRoot\(/g)].map((m) => m.index!);
  assert.equal(roots.length, 3, 'three places mount: no WebGL note, boot crash note, the app');
  assert.ok(start.indexOf('const styles = appStylesReady()') >= 0 && start.indexOf('const styles = appStylesReady()') < roots[0]!);
  assert.match(start, /if \(!hasWebGL2\(\)\) \{ await styles; createRoot\(/, 'the no-WebGL note waits too');
  const all = start.indexOf('await Promise.all([');
  assert.ok(all > 0 && all < roots[1]! && /await Promise\.all\(\[[^\]]*\bstyles\b[^\]]*\]\)/.test(start), 'the crash note and the app mount only after the styles are in the wait');
  const entry = read('src/entry.ts');
  const plain = entry.slice(entry.indexOf('async function plain()'), entry.indexOf('async function route()'));
  assert.match(plain, /const styles = appStylesReady\(\);/);
  for (const mount of ['createRoot(document', 'run();', 'plainPage();\n    bootFrame', 'plainPage();\n    bootOuter', 'plainPage();\n    bootLookBoard']) {
    const at = plain.indexOf(mount); assert.ok(at > 0, mount);
    assert.ok(plain.lastIndexOf('await styles;', at) > plain.lastIndexOf('if (', at), `${mount} comes after "await styles" in its branch`);
  }
  assert.equal([...plain.matchAll(/await styles;/g)].length, 5, 'one wait in each of the five plain pages');
});

test('the cover needs none of the app\'s stylesheets: its style is inline, and the only blocking link is the small font sheet', () => {
  const html = read('index.html');
  assert.deepEqual([...html.matchAll(/<link rel="stylesheet"[^>]*>/g)].map((m) => m[0]), ['<link rel="stylesheet" href="/fonts/fonts.css">']);
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  for (const rule of ['#boot {', '#boot .boot-bar', '#boot .boot-name', '#boot.done', 'html, body { margin: 0; background']) assert.ok(style.includes(rule), `the inline style has ${rule}`);
  // the app's own sheets must not restyle the cover: no #boot rule in them (chrome-3d.css names .boot-mark in a comment only)
  for (const f of ['src/ui/shell/global.css', 'src/ui/css2d/index.css', 'src/ui/glass.css', 'src/ui/humanized.css']) assert.doesNotMatch(read(f), /^\s*#boot\b/m, `${f} has no #boot rule`);
});

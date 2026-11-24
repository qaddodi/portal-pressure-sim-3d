// The page's entry (src/entry.ts) decides which page this is BEFORE the app is fetched: a page that is not the app (the self-test's outer page, the device frame, the look board, the build's progress page,
// a talk's notes window) never downloads, parses or runs the app, whose scene is built when its module first runs (22 Nov: "?audit keeps loading and never starts", "the app takes forever to load").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = readFileSync('src/entry.ts', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');
const html = readFileSync('index.html', 'utf8');
const vite = readFileSync('vite.config.ts', 'utf8');

test('index.html loads the entry, not the app', () => {
  assert.match(html, /<script type="module" src="\.\/src\/entry\.ts"><\/script>/);
});

test('the entry statically imports only the started flag, the styles wait (boot/styles.ts: a few lines) and the light gate and flag tables', () => {
  const statics = [...entry.matchAll(/^import\s+(?:[^'"]*from\s+)?'([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(statics.sort(), ['./boot/started.ts', './boot/styles.ts', './ui/debug/flags.ts', './ui/debug/frame/request.ts', './ui/debug/gate.ts']);
});

test('every page that is not the app lifts the cover (plainPage) before it opens, and the app is fetched only after all of them', () => {
  const app = entry.lastIndexOf("import('./main.tsx')");
  assert.ok(app > 0);
  for (const call of ['bootFrame()', 'bootOuter()', 'bootLookBoard()']) {
    const at = entry.search(new RegExp(`plainPage\\(\\);\\s*${call.replace(/[()]/g, '\\$&')}`));
    assert.ok(at > 0 && at < app, `${call}: plainPage() first, before the app`);
  }
  for (const page of ['ParityPage', 'presenter-window', 'debug/frame/frame', 'debug/audit/outer', 'debug/look-board']) assert.ok(entry.indexOf(page) > 0 && entry.indexOf(page) < app, `${page} is opened before the app is fetched`);
});

test('a part that cannot be fetched says so with Reload, never a page that waits for ever', () => {
  assert.match(entry, /route\(\)\.catch\([\s\S]*ppsBootFail/);
});

test('main.tsx no longer decides any page that is not the app', () => {
  for (const gone of ['bootOuter', 'bootFrame', 'bootLookBoard', 'presenter-window', 'ParityPage', 'plainPage']) assert.equal(main.includes(gone), false, `${gone} is the entry's now`);
});

test('the build names the app chunk and its CSS in the page, so they load beside the entry (and the offline install list reads them from the page)', () => {
  assert.match(vite, /function appPreload\(\)/);
  assert.match(vite, /plugins: \[[^\]]*appPreload\(\)/);
  assert.match(vite, /modulepreload/);
});

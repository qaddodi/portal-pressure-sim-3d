// The build's reference check (scripts/dist-refs.mjs): a name a page, style sheet or script gives that is not a file in the build is a 404 for everyone. The capture of 414a0ce2 reported
// `assets/icons-r-BTePkLq1.png` missing on MASLD 3; the file was served (the capture's own wait ran in page time), but the build had no way to say so. Now every deck and every file is checked the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { danglingRefs, refsOf } from '../scripts/dist-refs.mjs';

function dist(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'refs-'));
  for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), t); }
  return d;
}
const GOOD = {
  'index.html': '<link rel="stylesheet" href="./assets/main-AbC12345.css"><script type="module" src="./assets/entry-Zy98x7Wv.js"></script><link rel="icon" href="brand/icon.png">',
  'assets/main-AbC12345.css': '.ic{-webkit-mask-image:url(./icons-r-BTePkLq1.png)} .x{background:url("data:image/svg+xml,%3Csvg/%3E")} .y{background:url(https://example.test/a.png)}',
  'assets/icons-r-BTePkLq1.png': 'png', 'brand/icon.png': 'png',
  'assets/entry-Zy98x7Wv.js': 'import { a } from "./util-Qw3Er4Ty.js"; const w = new URL("worker-Hh1Jj2Kk.js", import.meta.url); const s = "icons-r-BTePkLq1.png";',
  'assets/util-Qw3Er4Ty.js': 'export const a = 1; const src = "import { x } from \'../gl-compile.shim.js\'";', 'assets/worker-Hh1Jj2Kk.js': '1',
};

test('a build whose names all point at files is clean (data: and https: urls, and a source sample inside a string, are not names)', () => {
  assert.deepEqual(danglingRefs(dist(GOOD)), []);
});

test('the icons file the capture named: a style sheet that names an icons picture the build did not write is caught', () => {
  const g: Record<string, string> = { ...GOOD }; delete g['assets/icons-r-BTePkLq1.png'];
  assert.deepEqual(danglingRefs(dist(g)), [
    { file: 'assets/entry-Zy98x7Wv.js', ref: 'icons-r-BTePkLq1.png' },
    { file: 'assets/main-AbC12345.css', ref: './icons-r-BTePkLq1.png' },
  ].sort((a, b) => a.file.localeCompare(b.file)));
});

test('every kind of name is checked: a page tag, a style sheet url, a chunk import, a worker url, a hashed name in a script', () => {
  const cases: Array<[string, string]> = [
    ['index.html', '<script src="./assets/gone-AbC12345.js"></script>'],
    ['assets/a.css', '.a{background:url(../brand/gone.png)}'],
    ['assets/a.js', 'import("./gone-AbC12345.js")'],
    ['assets/a.js', 'new URL("gone-worker.js", import.meta.url)'],
    ['assets/a.js', 'fetch("assets/skins-Ab3Cd4Ef.bin")'],
  ];
  for (const [file, text] of cases) assert.equal(danglingRefs(dist({ [file]: text })).length, 1, `${file}: ${text}`);
});

test('a name in one deck\'s own style sheet is read like any other (nothing is exempt by where it is named)', () => {
  const r = refsOf('assets/deck-masld-Ab3Cd4Ef.css', '.slide3 .pic{background-image:url(./masld3-Zz9Yy8Xx.png)}');
  assert.deepEqual(r, [{ ref: './masld3-Zz9Yy8Xx.png', path: 'assets/masld3-Zz9Yy8Xx.png' }]);
});

test('the build runs the check after the bundler and the data rename, and a failure stops it on a branch too', () => {
  const b = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  const at = b.indexOf('dist-refs.mjs');
  assert.ok(at > b.indexOf('hash-data.mjs') && at > b.indexOf('vite.js'), 'after both: it sees the final names');
  assert.match(b.slice(at, at + 400), /if \(dr\.status !== 0\) process\.exit/, 'not only on main');
});

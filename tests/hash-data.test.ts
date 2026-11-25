// The figure's data files carry their content's hash in the built names (22 Nov splash review, item 10): the chunks are pointed at the new names, nothing names an old one, and the worker's install list sees them as the
// never-changing assets they now are (a deploy that does not touch the figure downloads none of them).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashData, DATA_FILES } from '../scripts/hash-data.mjs';
import { isLate } from '../scripts/pwa.mjs';

function fakeDist(chunk: string, data: Record<string, string> = {}) {
  const dist = mkdtempSync(join(tmpdir(), 'dist-'));
  mkdirSync(join(dist, 'assets')); mkdirSync(join(dist, 'anatomy'));
  writeFileSync(join(dist, 'assets/main-abc.js'), chunk); writeFileSync(join(dist, "index.html"), "<html><head></head></html>");
  for (const n of DATA_FILES) if (n in data) writeFileSync(join(dist, n), data[n]!);
  return dist;
}

test('each data file moves to assets/<stem>-<hash>, the chunks name the new file, and nothing names the old one', () => {
  const dist = fakeDist('a("anatomy/skins-placed.bin");b(`${u}anatomy/organs-baked-placed.bin`);c("anatomy/skins-placed.bin")', { 'anatomy/skins-placed.bin': 'S', 'anatomy/organs-baked-placed.bin': 'O' });
  const r = hashData(dist);
  assert.match(r['anatomy/skins-placed.bin']!, /^assets\/skins-placed-[\w-]{8}\.bin$/);
  assert.match(r['anatomy/organs-baked-placed.bin']!, /^assets\/organs-baked-placed-[\w-]{8}\.bin$/);
  const js = readFileSync(join(dist, 'assets/main-abc.js'), 'utf8');
  assert.ok(js.includes(r['anatomy/skins-placed.bin']!) && js.includes(r['anatomy/organs-baked-placed.bin']!));
  assert.ok(!js.includes('anatomy/'), 'both mentions of a name are rewritten, none is left');
  assert.ok(!existsSync(join(dist, 'anatomy/skins-placed.bin')) && existsSync(join(dist, r['anatomy/skins-placed.bin']!)));
  assert.equal(readFileSync(join(dist, r['anatomy/skins-placed.bin']!), 'utf8'), 'S');
});

test('the name is the content\'s: the same bytes give the same name, other bytes another', () => {
  const a = hashData(fakeDist('"anatomy/skins-placed.bin"', { 'anatomy/skins-placed.bin': 'same' })), b = hashData(fakeDist('"anatomy/skins-placed.bin"', { 'anatomy/skins-placed.bin': 'same' })), c = hashData(fakeDist('"anatomy/skins-placed.bin"', { 'anatomy/skins-placed.bin': 'other' }));
  assert.equal(a['anatomy/skins-placed.bin'], b['anatomy/skins-placed.bin']); assert.notEqual(a['anatomy/skins-placed.bin'], c['anatomy/skins-placed.bin']);
});

test('a file the build lacks is skipped; a file no chunk names stops the build', () => {
  assert.deepEqual(hashData(fakeDist('x', {})), {});
  assert.throws(() => hashData(fakeDist('nothing names it', { 'anatomy/organs.bin': 'R' })), /no chunk names anatomy\/organs\.bin/);
});

test('the install list: the raw organs file and the Circuit\'s skins are late, the boot files are not, and a hashed name matches what hashData writes', () => {
  const r = hashData(fakeDist('"anatomy/organs.bin";"anatomy/circuit-skins-placed.bin";"anatomy/skins-placed.bin";"anatomy/organs-baked-placed.bin"', { 'anatomy/organs.bin': '1', 'anatomy/circuit-skins-placed.bin': '2', 'anatomy/skins-placed.bin': '3', 'anatomy/organs-baked-placed.bin': '4' }));
  assert.equal(isLate(r['anatomy/organs.bin']!), true); assert.equal(isLate(r['anatomy/circuit-skins-placed.bin']!), true);
  assert.equal(isLate(r['anatomy/skins-placed.bin']!), false); assert.equal(isLate(r['anatomy/organs-baked-placed.bin']!), false);
});

test('the build runs it after the bundler and before the worker is written', () => {
  const b = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.ok(b.indexOf('hash-data.mjs') > b.indexOf('vite.js') && b.indexOf('hash-data.mjs') < b.indexOf('pwa.mjs'));
  assert.ok(readdirSync(new URL('../scripts/', import.meta.url)).includes('hash-data.mjs'));
});

test('the page\'s head preloads the boot data (organs, skins, art) by their hashed names, low priority, and only the files this build has', () => {
  const dist = fakeDist('"anatomy/skins-placed.bin";"anatomy/organs-baked-placed.bin";"anatomy/circuit-skins-placed.bin"', { 'anatomy/skins-placed.bin': 'S', 'anatomy/organs-baked-placed.bin': 'O', 'anatomy/circuit-skins-placed.bin': 'C' });
  const r = hashData(dist), page = readFileSync(join(dist, 'index.html'), 'utf8');
  for (const n of ['anatomy/skins-placed.bin', 'anatomy/organs-baked-placed.bin']) assert.ok(page.includes(`<link rel="preload" as="fetch" crossorigin fetchpriority="low" href="./${r[n]}">`), `${n} is preloaded`);
  assert.ok(!page.includes(r['anatomy/circuit-skins-placed.bin']!), 'the Circuit\'s skins are not on the boot path: not preloaded');
  assert.ok(!page.includes('organ-art'), 'a file the build lacks has no tag');
  assert.ok(page.indexOf('preload') < page.indexOf('</head>'));
});

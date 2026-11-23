// Plan 50: the pre-push picks the tests that IMPORT what changed (not a substring of its name), always runs a changed test, keeps the wide net for the shared shader files, and starts the longest first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const { selectTests, longestFirst, importPattern, SECONDS_UNKNOWN } = await import('../scripts/pre-push-select.mjs');

const texts: Record<string, string> = {
  'plate.test.ts': "import { x } from '../src/scene/lobule/plate.ts';",
  'plate-worker.test.ts': "import { y } from '../src/scene/lobule/plate-worker.ts';",
  'plate-client.test.ts': 'readFileSync(`src/scene/lobule/plate-client.ts`)',
  'shader.test.ts': "assert.match(readFileSync('src/scene/vessels/shaders.ts', 'utf8'), /x/);",
  'shader-words.test.ts': "// the text of src/scene/vessels/shaders is checked in the lint",
  'other.test.ts': "import { z } from '../src/scene/organs/prepare.ts';",
};
const names = Object.keys(texts), read = (n: string): string => texts[n]!;

test('a change to plate.ts selects the plate tests and not the plate-worker or plate-client ones', () => {
  assert.deepEqual(selectTests(['src/scene/lobule/plate.ts'], names, read), ['plate.test.ts']);
  assert.deepEqual(selectTests(['src/scene/lobule/plate-worker.ts'], names, read), ['plate-worker.test.ts']);
  assert.deepEqual(selectTests(['src/scene/lobule/plate-client.ts'], names, read), ['plate-client.test.ts']);
});

test('a changed test file always runs, even when it imports nothing that changed', () => {
  assert.deepEqual(selectTests(['tests/other.test.ts'], names, read), ['other.test.ts']);
  assert.deepEqual(selectTests(['tests/other.test.ts', 'src/scene/lobule/plate.ts'], names, read), ['other.test.ts', 'plate.test.ts']);
  assert.deepEqual(selectTests(['tests/not-a-test-here.test.ts'], names, read), [], 'a deleted or renamed test is not run');
});

test('the shared shader files keep the wide net: any test that mentions the path, import or not', () => {
  assert.deepEqual(selectTests(['src/scene/vessels/shaders.ts'], names, read), ['shader-words.test.ts', 'shader.test.ts']);
});

test('a file in no test\'s imports selects nothing, and scripts count like src', () => {
  assert.deepEqual(selectTests(['src/scene/lobule/never-imported.ts'], names, read), []);
  assert.deepEqual(selectTests(['docs/readme.md', 'public/x.bin'], names, read), []);
  assert.deepEqual(selectTests(['scripts/pre-push-select.mjs'], ['pre-push-select.test.ts'], () => "await import('../scripts/pre-push-select.mjs')"), ['pre-push-select.test.ts']);
});

test('the import pattern wants an extension and a closing quote: plate.ts is not plate-worker.ts, a quote of any kind closes it', () => {
  const re = importPattern('src/a/plate.tsx');
  for (const ok of ["'../src/a/plate.ts'", '"../src/a/plate.js"', '`src/a/plate.mjs`']) assert.ok(re.test(ok), ok);
  for (const no of ["'../src/a/plate-worker.ts'", "'../src/a/plates.ts'", "'../src/a/plate'"]) assert.ok(!re.test(no), no);
});

test('the longest-first order follows tests/timings.json, unknown files sit at the default, ties by name', () => {
  const t = { 'b.test.ts': 40, 'a.test.ts': 2, 'c.test.ts': 40 };
  assert.deepEqual(longestFirst(['a.test.ts', 'b.test.ts', 'c.test.ts', 'new.test.ts'], t), ['b.test.ts', 'c.test.ts', 'new.test.ts', 'a.test.ts']);
  assert.equal(SECONDS_UNKNOWN, 5);
  const real = JSON.parse(readFileSync('tests/timings.json', 'utf8')) as Record<string, number>, files = new Set(readdirSync('tests'));
  for (const [f, s] of Object.entries(real)) { assert.ok(files.has(f), `timings.json names a test that is gone: ${f}`); assert.ok(s > 0); }
});

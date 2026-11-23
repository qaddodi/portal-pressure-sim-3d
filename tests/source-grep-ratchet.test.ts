// The source-grep ratchet (scripts/source-grep-ratchet.mjs, Plan 42): a test may not add a regex against raw source text. Each rule has a passing and a failing source, and the repo stays inside tests/source-grep-allow.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countAll, countGreps, readAllowance } from '../scripts/source-grep-ratchet.mjs';

test('a regex on a source file or a raw shader string is counted; the same on the assembled text, on a plain value or in a file that reads no source is not', () => {
  const read = "const src = readFileSync(new URL('../src/scene/x.ts', import.meta.url), 'utf8');\nassert.match(src, /foo/);\nassert.doesNotMatch(src, /bar/);";
  assert.equal(countGreps(read), 2, 'a file read from src/ is raw source');
  assert.equal(countGreps("import { VESSEL_FS } from '../src/x.ts';\nassert.match(VESSEL_FS, /discard/);"), 1, 'a shader string as written is raw source');
  assert.equal(countGreps("import { VESSEL_FS } from '../src/x.ts';\nassert.match(shaderText(VESSEL_FS), /discard/);\nassert.match(block(shaderText(VESSEL_FS), 'if (a)'), /b/);"), 0, 'the assembled text (tests/shader-text.ts) is not');
  assert.equal(countGreps("assert.match(label.text, /Portal/);"), 0, 'a file that reads no source and imports no shader is not');
  assert.equal(countGreps("const s = readFileSync('../src/a.ts', 'utf8');\n// assert.match(s, /commented/);\nconst t = `assert.match(s, /in a string, not stripped/)`;"), 1, 'a comment is not a grep');
});

test('the repo stays inside the allowance (tests/source-grep-allow.json only goes down; a listed-nowhere test file has none)', () => {
  const now = countAll() as Record<string, number>, was = readAllowance() as Record<string, number>;
  const over = Object.keys(now).filter((f) => now[f]! > (was[f] ?? 0)).map((f) => `${f}: ${now[f]} > ${was[f] ?? 0}`);
  assert.deepEqual(over, [], 'a new regex on raw source: read the assembled text through tests/shader-text.ts, check the behaviour or its twin, or add a lint rule; `node scripts/source-grep-ratchet.mjs --update` only lowers');
});

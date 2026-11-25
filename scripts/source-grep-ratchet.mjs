// The source-grep ratchet (Plan 42, after the 23 stale greps of 22 Nov). A test that matches a regex against SOURCE text (a file read from src/ or scripts/, or a shader string imported as it is written) breaks whenever the text moves into a
// chunk or a macro, and says nothing about behaviour. This counts, per test file, the `assert.match` / `assert.doesNotMatch` calls whose subject is such raw text, and compares them with tests/source-grep-allow.json: a count may fall, never rise,
// and a test file that is not listed may have none. Subjects that are read through tests/shader-text.ts (shaderText, driverText, block) are not raw and are not counted. Prefer a twin or a behaviour check; a lint rule beats a grep.
//   node scripts/source-grep-ratchet.mjs            prints the files above their allowance (exit 1) and the ones below it
//   node scripts/source-grep-ratchet.mjs --update   writes the allowance down to today's counts (it never writes one up)
// Re-baselined once on 25 Nov 2026 (full-suite review, F6): threads had added 559 greps over the allowance in 100 test files since 23 Nov, so the allowance was written up to that day's counts by hand (--update never does). From there it only goes down again; convert greps to behaviour checks and run --update.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ALLOW = join(ROOT, 'tests', 'source-grep-allow.json');

const SHADER_NAME = /\b[A-Z][A-Z0-9_]*_(?:FS|VS|GLSL)\b/;
const READS_SOURCE = /readFileSync\([^)]*(?:\.\.\/|\/)?(?:src|scripts)\//;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** The raw-source greps of one test file's text: 0 unless the file reads source text or imports a shader string. */
export function countGreps(text) {
  const src = strip(text);
  if (!READS_SOURCE.test(src) && !SHADER_NAME.test(src)) return 0;
  let n = 0;
  for (const m of src.matchAll(/assert\.(?:match|doesNotMatch)\(\s*([^,]+?)\s*,\s*\//g)) if (!/^(?:shaderText|driverText|block)\(/.test(m[1])) n++;
  return n;
}

/** The tests that hold sample sources as strings to prove the rule (and the helper's own): their quoted greps are fixtures, not greps. */
const FIXTURES = new Set(['source-grep-ratchet.test.ts', 'shader-text.test.ts', 'lint-rules.test.ts']);

/** { 'tests/x.test.ts': count } for every test file with at least one. */
export function countAll(root = ROOT) {
  const out = {};
  for (const f of readdirSync(join(root, 'tests')).filter((n) => n.endsWith('.test.ts') && !FIXTURES.has(n)).sort()) {
    const n = countGreps(readFileSync(join(root, 'tests', f), 'utf8'));
    if (n) out[`tests/${f}`] = n;
  }
  return out;
}
export const readAllowance = () => JSON.parse(readFileSync(ALLOW, 'utf8'));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const now = countAll();
  if (process.argv.includes('--update')) {
    let was = {}; try { was = readAllowance(); } catch { /* (first run: today's counts are the allowance) */ }
    const next = {};
    for (const f of Object.keys(now).sort()) next[f] = Math.min(now[f], was[f] ?? now[f]);
    writeFileSync(ALLOW, JSON.stringify(next, null, 2) + '\n');
    console.log(`wrote ${Object.keys(next).length} files, ${Object.values(next).reduce((a, b) => a + b, 0)} greps`);
  } else {
    const was = readAllowance(), over = [], under = [];
    for (const f of new Set([...Object.keys(now), ...Object.keys(was)])) { const a = was[f] ?? 0, n = now[f] ?? 0; if (n > a) over.push(`${f}: ${n} > ${a}`); else if (n < a) under.push(`${f}: ${n} < ${a}`); }
    for (const u of under) console.log(`below its allowance (run --update to lower it): ${u}`);
    for (const o of over) console.log(`ABOVE its allowance: ${o}`);
    process.exit(over.length ? 1 : 0);
  }
}

#!/usr/bin/env node
// The local pre-push check (no GitHub workflow, no Actions minutes): the typecheck, the lint, and ONLY the tests that name a folder or file you changed.
//   npm run pre-push            checks against origin/claude/project-thread-ge1swr (or main when that is not fetched)
//   npm run pre-push -- --all   also the whole suite (slow: not in the cloud)
//   npm run hooks               installs it as the repo's git pre-push hook (git config core.hooksPath .githooks)
// A test is "about" a changed src file when its text mentions that file's path (the way every test imports what it checks); a changed test file always runs.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };
const run = (label, args) => { const t = Date.now(); const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' }); console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} ${label} (${((Date.now() - t) / 1000).toFixed(1)} s)`); return r.status === 0; };

const base = ['origin/claude/project-thread-ge1swr', 'origin/main'].find((b) => git('rev-parse', '--verify', '-q', b));
const changed = base ? [...new Set([...git('diff', '--name-only', `${git('merge-base', base, 'HEAD') || base}`, 'HEAD').split('\n'), ...git('diff', '--name-only').split('\n')])].filter(Boolean) : [];
const tests = readdirSync(`${root}tests`).filter((f) => f.endsWith('.test.ts'));
const mine = new Set(changed.filter((f) => /^tests\/.+\.test\.ts$/.test(f) && tests.includes(f.slice(6))).map((f) => f.slice(6)));
const srcs = changed.filter((f) => /^(src|scripts)\//.test(f)).map((f) => f.replace(/\.(tsx?|mjs)$/, ''));
if (srcs.length) for (const t of tests) { if (mine.has(t)) continue; const text = readFileSync(`${root}tests/${t}`, 'utf8'); if (srcs.some((s) => text.includes(s))) mine.add(t); }

const all = process.argv.includes('--all');
console.log(`pre-push: ${changed.length} changed file(s) against ${base ?? '(no base fetched)'}; ${all ? 'the whole suite' : `${mine.size} test file(s) about them`}`);
let ok = run('typecheck', ['node_modules/typescript/lib/tsc.js', '--noEmit']);
ok = run('lint', ['scripts/lint.mjs']) && ok;
if (all) ok = run('all tests', ['--test', '--test-concurrency=4', 'tests/**/*.test.ts']) && ok;
else if (mine.size) ok = run(`tests (${mine.size})`, ['--test', '--test-concurrency=4', ...[...mine].sort().map((t) => `tests/${t}`)]) && ok;
if (!ok) { console.error('pre-push: something failed; fix it, or push with --no-verify when the preview cannot wait (the deploy stamps the result on the pill anyway)'); process.exit(1); }
console.log('pre-push: ok');

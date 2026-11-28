#!/usr/bin/env node
// The local pre-push check (no GitHub workflow, no Actions minutes): the typecheck, the lint, and ONLY the tests about what you changed. Under 2 minutes (Plan 50).
//   npm run pre-push            checks against origin/claude/project-thread-ge1swr (or main when that is not fetched)
//   npm run pre-push -- --deep  also the tests that reach a change through many files, past the time budget (slow: not in the cloud)
//   npm run pre-push -- --all   also the whole suite (slow: not in the cloud)
//   npm run test:time <files>   times those test files alone and records the seconds in tests/timings.json (the order below follows it)
//   npm run hooks               installs it as the repo's git pre-push hook (git config core.hooksPath .githooks)
// A test is "about" a changed file when it IMPORTS it, at any depth (scripts/import-graph.mjs, scripts/pre-push-select.mjs); a changed test file always runs. The tests run on every core, the longest first, and each file's seconds are printed:
// a file over 30 s is named in a warning, because a test that slow is itself the bug (fix it: build once, share the scene, lay in the baked plan).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DEEP_BUDGET_SECONDS, SLOW_WARN_SECONDS, longestFirst, selectWithDepth, withinBudget } from './pre-push-select.mjs';
import { buildGraph } from './import-graph.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };
const step = (label, args) => new Promise((done) => { const t = Date.now(); const c = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' }); c.once('close', (code) => { console.log(`${code === 0 ? 'ok  ' : 'FAIL'} ${label} (${((Date.now() - t) / 1000).toFixed(1)} s)`); done(code === 0); }); });

const base = ['origin/claude/project-thread-ge1swr', 'origin/main'].find((b) => git('rev-parse', '--verify', '-q', b));
const changed = base ? [...new Set([...git('diff', '--name-only', `${git('merge-base', base, 'HEAD') || base}`, 'HEAD').split('\n'), ...git('diff', '--name-only').split('\n')])].filter(Boolean) : [];
const tests = readdirSync(`${root}tests`).filter((f) => f.endsWith('.test.ts'));
const all = process.argv.includes('--all');
// the import graph over every tracked or new file: a test runs when anything it names, at any depth, changed (C1)
const files = git('ls-files', '-co', '--exclude-standard').split('\n').filter(Boolean);
const graph = all ? null : buildGraph(files, (f) => { try { return readFileSync(`${root}${f}`, 'utf8'); } catch { return ''; } });
const timings = existsSync(`${root}tests/timings.json`) ? JSON.parse(readFileSync(`${root}tests/timings.json`, 'utf8')) : {};
const depths = all ? new Map(tests.map((t) => [t, 0])) : selectWithDepth(changed, tests, (t) => readFileSync(`${root}tests/${t}`, 'utf8'), graph);
// the near tests always run; the deeper ones nearest first while they fit the time budget (`--deep` lifts it); what is left over is named below, never dropped quietly
const plan = process.argv.includes('--deep') || all ? { run: [...depths.keys()], left: [] } : withinBudget(depths, timings, cpus().length, DEEP_BUDGET_SECONDS);
const mine = plan.run;

const reach = [...depths.values()].filter((d) => d > 1).length;
console.log(`pre-push: ${changed.length} changed file(s) against ${base ?? '(no base fetched)'}; ${all ? 'the whole suite' : `${mine.length} test file(s) about them (${reach} reach a changed file through other files)`}`);
if (plan.left.length) console.log(`pre-push: NOT RUN here, ${plan.left.length} test file(s) that reach the change deeper than the ${DEEP_BUDGET_SECONDS} s budget allows (the daily full run names any that fail); \`npm run pre-push -- --deep\` runs them: ${plan.left.slice(0, 8).join(', ')}${plan.left.length > 8 ? ', ...' : ''}`);
const t0 = Date.now();
// the typecheck and the lint start with the tests: they are a few seconds and use one core each
const checks = Promise.all([step('typecheck', ['node_modules/typescript/lib/tsc.js', '--noEmit']), step('lint', ['scripts/lint.mjs'])]);

/** Runs the test files, the longest first, on every core but one's worth of headroom; prints each file's seconds and the output of a failing one. */
async function runTests(files) {
  const queue = longestFirst(files, timings), lanes = Math.max(1, cpus().length), failed = [], slow = [];
  const one = (f) => new Promise((done) => {
    const t = Date.now(); let out = '';
    const c = spawn(process.execPath, ['--test', '--test-force-exit', `tests/${f}`], { cwd: root });
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    c.once('close', (code) => {
      const s = (Date.now() - t) / 1000;
      console.log(`${code === 0 ? 'ok  ' : 'FAIL'} ${f} (${s.toFixed(1)} s)`);
      if (code !== 0) { failed.push(f); console.log(out.split('\n').slice(-60).join('\n')); }
      if (s > SLOW_WARN_SECONDS) slow.push(`${f} ${s.toFixed(0)} s`);
      done();
    });
  });
  await Promise.all(Array.from({ length: Math.min(lanes, queue.length) }, async () => { for (let f = queue.shift(); f; f = queue.shift()) await one(f); }));
  if (slow.length) console.warn(`WARNING: a test file over ${SLOW_WARN_SECONDS} s is a test to fix (build once, share the scene, lay in the baked plan): ${slow.join(', ')}`);
  return failed.length === 0;
}
// The tests build a CelScene, which lays the baked skins in (and the weld plan, the organs) instead of meshing them live: without the files one `new CelScene()` is 30 s of CPU and micro-slices alone took 347 s.
// Each bake skips itself when its signature says nothing it is made from changed, so this is 0 s except the first time in a fresh container (about 35 s, beside the typecheck and the lint).
// (The charts' bake, 3 minutes cold, is the deploy's job and not needed here: the tests that read it bake what they need.)
if (mine.length) await Promise.all(['bake-skins', 'bake-welds', 'bake-organs'].map((b) => step(b, [`scripts/${b}.mjs`])));
const testsOk = mine.length ? await runTests(mine) : true;
if (mine.length) console.log(`${testsOk ? 'ok  ' : 'FAIL'} tests (${mine.length}, ${((Date.now() - t0) / 1000).toFixed(1)} s wall)`);
const ok = (await checks).every(Boolean) && testsOk;
if (!ok) { console.error('pre-push: something failed; fix it, or push with --no-verify when the preview cannot wait (the deploy stamps the result on the pill anyway)'); process.exit(1); }
console.log(`pre-push: ok (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

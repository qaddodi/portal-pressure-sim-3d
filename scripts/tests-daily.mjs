#!/usr/bin/env node
// The one full test run a day (W6, 25 Nov review). The `tests` job in .github/workflows/pages.yml runs it (owner allowed Actions for this run only, 25 Nov); the count is in the job's log;
// by hand, run it where the suite has room: a Mac, or one scheduled cloud thread.
//
//   node scripts/tests-daily.mjs            run every test file, write tests-status.json (commit, day, total, failing, minutes)
//   node scripts/tests-daily.mjs --push     the same, then commit that one file and push it to the branch you are on
//
// The result is a plain file at the repo root (the build does not read it; the preview pill never shows it). Typecheck and lint are not repeated here (the build runs both on every deploy).
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseTapSummary, testsNote } from './tests-status.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const started = Date.now();
await new Promise((done) => spawn(process.execPath, [fileURLToPath(new URL('./ensure-baked.mjs', import.meta.url))], { cwd: root, stdio: 'inherit' }).once('close', done));
let out = '';
const run = spawn(process.execPath, ['--test', '--test-force-exit', '--test-reporter=tap', `--test-concurrency=${Math.max(2, cpus().length)}`, 'tests/**/*.test.ts'], { cwd: root });
run.stdout.on('data', (d) => { out += d; });
run.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((done) => run.once('close', done));
const counts = parseTapSummary(out);
if (!counts) { console.error('the run printed no summary (killed?); tests-status.json is left as it was'); process.exit(1); }
const status = { commit: git('rev-parse', '--short=8', 'HEAD'), date: new Date().toISOString(), total: counts.total, failing: counts.failing, minutes: Math.round((Date.now() - started) / 60000) };
writeFileSync(`${root}tests-status.json`, `${JSON.stringify(status, null, 2)}\n`);
console.log(`${testsNote(status)} of ${status.total} (${status.minutes} min) at ${status.commit}`);
if (process.argv.includes('--push')) {
  git('add', 'tests-status.json');
  git('commit', '-m', `Full suite: ${status.failing} failing of ${status.total} at ${status.commit}`, '--', 'tests-status.json');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  try { git('pull', '--rebase', 'origin', branch); } catch { /* (a new branch has nothing to pull) */ }
  git('push', 'origin', branch);
}

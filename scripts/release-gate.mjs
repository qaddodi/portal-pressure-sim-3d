// The release gate (production review P-01, owner 28 Nov: "Both"). `main` ships only a commit whose full test run is on record: tests-status.json, written by
// scripts/tests-daily.mjs, committed by `npm run release:check`, naming the commit it ran on and a count of failing tests of 0. The build on main (scripts/build.mjs) refuses
// to ship without it. The file's own commit is the one commit allowed after the run (it cannot name itself), so the gate accepts HEAD when nothing but tests-status.json changed since.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/** Why this status does not allow a release, or '' when it does. `changed` is the list of files that differ between status.commit and HEAD, or null when git cannot say. */
export function gateProblem(status, head, changed) {
  if (!status || typeof status !== 'object') return 'tests-status.json is missing: run `npm run release:check` and commit its result';
  if (!Number.isInteger(status.failing) || !Number.isInteger(status.total) || typeof status.commit !== 'string') return 'tests-status.json is not a full-suite result';
  if (status.failing !== 0) return `the full suite had ${status.failing} failing at ${status.commit}`;
  if (status.total < 1) return 'tests-status.json records no tests';
  if (head.startsWith(status.commit) || status.commit.startsWith(head)) return '';
  if (changed === null) return `tests-status.json names ${status.commit}, which this checkout cannot compare with ${head} (a shallow clone?)`;
  const other = changed.filter((f) => f !== 'tests-status.json');
  return other.length ? `the full suite ran at ${status.commit}, and ${other.length} file(s) changed since (first: ${other[0]}): run \`npm run release:check\` again` : '';
}

/** Reads the status file and git in `root`; returns the problem or ''. */
export function checkRoot(root) {
  const file = `${root}tests-status.json`;
  let status = null;
  if (existsSync(file)) { try { status = JSON.parse(readFileSync(file, 'utf8')); } catch { status = {}; } }
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let head = '', changed = null;
  try { head = git('rev-parse', '--short=8', 'HEAD'); } catch { head = ''; }
  if (status?.commit) { try { changed = git('diff', '--name-only', status.commit, 'HEAD').split('\n').filter(Boolean); } catch { changed = null; } }
  return gateProblem(status, head, changed);
}

#!/usr/bin/env node
// `npm run release:check` (production review P-01): the one command before a release. It runs the whole suite (scripts/tests-daily.mjs, on a Mac or one scheduled thread, never in a push
// thread), refuses unless the failing count is 0, and commits tests-status.json for that commit. The build on main reads that file (scripts/release-gate.mjs).
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkRoot } from './release-gate.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
if (git('status', '--porcelain', '--', '.', ':!tests-status.json')) { console.error('release:check needs a clean tree (commit or stash your changes first): the record names a commit.'); process.exit(1); }
const run = spawnSync(process.execPath, [fileURLToPath(new URL('./tests-daily.mjs', import.meta.url))], { cwd: root, stdio: 'inherit' });
if (run.status !== 0) { console.error('the full run did not finish; nothing recorded'); process.exit(1); }
const status = JSON.parse(readFileSync(`${root}tests-status.json`, 'utf8'));
if (status.failing !== 0) { console.error(`NOT RELEASABLE: ${status.failing} failing at ${status.commit} (tests-status.json holds the names; it is not committed)`); process.exit(1); }
git('add', 'tests-status.json');
git('commit', '-m', `Release check: 0 failing of ${status.total} at ${status.commit}`, '--', 'tests-status.json');
const problem = checkRoot(root);
if (problem) { console.error(`recorded, but the gate says: ${problem}`); process.exit(1); }
console.log(`releasable: 0 failing of ${status.total} at ${status.commit}; commit the record with the merge`);
